import type { GalleryCard, GalleryManifest, GalleryPhoto } from '../data/galleryTypes';
import { gsap } from './gsap';
import { galleryZoom } from './galleryZoom';
import { getLanguageSwitchState } from './languageSwitchState';
import { photoArrival } from './photoArrival';

let cleanup: (() => void) | undefined;

function initGallery(): void {
  cleanup?.();
  cleanup = undefined;
  const candidate = document.querySelector<HTMLElement>('[data-gallery-root]');
  if (!candidate) return;
  const root: HTMLElement = candidate;
  const initial = JSON.parse(
    root.querySelector('[data-gallery-manifest]')!.textContent!,
  ) as GalleryManifest;
  const strings = JSON.parse(root.querySelector('[data-gallery-strings]')!.textContent!) as Record<
    string,
    string
  >;
  const find = <T extends HTMLElement>(selector: string): T => root.querySelector<T>(selector)!;
  const masonry = find<HTMLDivElement>('[data-gallery-masonry]');
  const heading = find<HTMLElement>('[data-gallery-heading]');
  const status = find<HTMLElement>('[data-gallery-status]');
  const retryButton = find<HTMLButtonElement>('[data-gallery-retry]');
  const lifetime = new AbortController();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const catalogueMotion = gsap.context(() => {}, root);
  const photoMotion = gsap.context(() => {});
  const interfaceMotion = gsap.context(() => {});
  const categoryMotion = gsap.context(() => {}, root);
  const languageSwitch = getLanguageSwitchState();
  const suppressArrival =
    languageSwitch?.path === `${location.pathname}${location.search}${location.hash}` ||
    document.documentElement.dataset.suppressArrival === 'true';
  const media = gsap.matchMedia();
  const viewerMotion = new Map<HTMLElement, gsap.core.Tween>();
  let photoReady: AbortController | undefined;
  const cache = new Map<string, GalleryManifest>();
  let request: AbortController | undefined;
  let generation = 0;
  let disposed = false;
  let overview = initial;
  let selected: string | undefined = initial.category;
  let viewer: HTMLElement | undefined;
  let viewerData: GalleryManifest | undefined;
  let pendingViewer: { category: string; type: string; image?: string } | undefined;
  let returnFocus: HTMLElement | undefined;
  let bodyOverflow = '';
  let bodyPadding = '';
  let background: { node: HTMLElement; inert: boolean }[] = [];
  let zoom: ReturnType<typeof galleryZoom> | undefined;
  let hdRequested = false;
  let zoomIntent = false;
  let hdReady: AbortController | undefined;
  let retry: (() => void) | undefined;
  let viewerRetry: (() => void) | undefined;
  const sessionKey = `filing-gallery:${initial.version}`;
  let seed = initial.seed;
  try {
    const stored = sessionStorage.getItem(sessionKey);
    if (stored && /^\d{1,10}$/.test(stored) && Number(stored) <= 4294967295) seed = stored;
    else sessionStorage.setItem(sessionKey, seed);
  } catch {
    /* Storage is optional (private browsing / embedded environments). */
  }

  const on = (
    node: EventTarget,
    event: string,
    handler: EventListener,
    options: AddEventListenerOptions = {},
  ) => node.addEventListener(event, handler, { ...options, signal: lifetime.signal });
  const viewerFind = <T extends HTMLElement>(selector: string): T =>
    viewer!.querySelector<T>(selector)!;

  const categoryArrivals = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      categoryArrivals.disconnect();
      const nav = find<HTMLElement>('.catalogue-nav');
      if (reducedMotion.matches || suppressArrival || nav.contains(document.activeElement)) return;
      categoryMotion.add(() => {
        gsap.fromTo(
          nav.querySelectorAll('[data-category-arrival]'),
          { autoAlpha: 0.3, y: 12 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.9,
            stagger: { amount: 0.24 },
            ease: 'power3.out',
            overwrite: 'auto',
            clearProps: 'opacity,visibility,transform',
          },
        );
      });
    },
    { threshold: 0.05 },
  );
  const finishCategoryArrival = (): void => {
    categoryArrivals.disconnect();
    categoryMotion.revert();
  };
  const nav = find<HTMLElement>('.catalogue-nav');
  categoryArrivals.observe(nav);
  // Focusing/clicking finishes the entrance without touching button click motion.
  on(nav, 'focusin', finishCategoryArrival);
  on(nav, 'pointerdown', finishCategoryArrival);
  on(nav, 'click', finishCategoryArrival);

  function releaseViewerMotion(node: HTMLElement, revert = true): void {
    const tween = viewerMotion.get(node);
    viewerMotion.delete(node);
    if (revert) tween?.revert();
    else tween?.kill();
  }

  function resetViewerMotion(): void {
    for (const node of viewerMotion.keys()) {
      releaseViewerMotion(node);
      if (node !== viewer) node.remove();
    }
  }

  function resetPhotoMotion(): void {
    photoReady?.abort();
    photoReady = undefined;
    photoMotion.revert();
  }

  function revealPhoto(): void {
    photoReady?.abort();
    photoReady = undefined;
    fitViewer();
    if (!viewer || reducedMotion.matches) return;
    photoMotion.revert();
    photoMotion.add(() => {
      gsap.fromTo(
        viewerFind<HTMLElement>('[data-viewer-stage]'),
        { autoAlpha: 0.4 },
        {
          autoAlpha: 1,
          duration: 0.65,
          ease: 'power2.out',
          overwrite: 'auto',
          clearProps: 'opacity,visibility',
        },
      );
    });
  }

  media.add('(prefers-reduced-motion: reduce)', () => {
    finishCategoryArrival();
    catalogueMotion.revert();
    interfaceMotion.revert();
    resetPhotoMotion();
    resetViewerMotion();
  });

  // Size the scene to the painted photo, not a full-height contain box. Reserve
  // actual feedback space, including wrapped errors and the retry target.
  function fitViewer(): void {
    if (!viewer) return;
    const stage = viewerFind<HTMLElement>('[data-viewer-stage]');
    const photo = viewerFind<HTMLImageElement>('[data-viewer-photo]');
    const panel = viewerFind<HTMLElement>('.catalogue-viewer__panel');
    const close = viewerFind<HTMLElement>('[data-viewer-close]');
    const controls = viewerFind<HTMLElement>('.catalogue-viewer__controls');
    const feedback = viewerFind<HTMLElement>('.catalogue-viewer__feedback');
    const viewport = window.visualViewport?.height ?? window.innerHeight;
    const available =
      viewport - 16 - close.offsetHeight - controls.offsetHeight - 12 - feedback.offsetHeight;
    const width = Number(photo.getAttribute('width'));
    const height = Number(photo.getAttribute('height'));
    const ratio = width && height ? width / height : 1.5;
    if (window.innerWidth >= 1024) stage.style.removeProperty('height');
    else stage.style.height = `${Math.max(0, Math.min(panel.clientWidth / ratio, available))}px`;
    // Source/decode changes must not resize the transformed image underneath a gesture.
    const containedWidth = Math.min(stage.clientWidth, stage.clientHeight * ratio);
    photo.style.width = `${containedWidth}px`;
    photo.style.height = `${containedWidth / ratio}px`;
  }
  const viewerResize = new ResizeObserver(fitViewer);
  on(window, 'resize', fitViewer);
  if (window.visualViewport) on(window.visualViewport, 'resize', fitViewer);

  async function load(params: Record<string, string>): Promise<GalleryManifest | undefined> {
    request?.abort();
    const token = ++generation;
    const url = new URL(location.pathname, location.origin);
    url.search = new URLSearchParams({ seed, ...params }).toString();
    const key = `${initial.version}:${initial.locale}:${url.search}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const controller = new AbortController();
    request = controller;
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Gallery HTTP ${response.status}`);
      const text = await response.text();
      // Never parse fetched HTML into a document: that could activate media/resources.
      const matches = [
        ...text.matchAll(
          /<script\b(?=[^>]*\btype="application\/json")(?=[^>]*\bdata-gallery-manifest)[^>]*>([\s\S]*?)<\/script>/g,
        ),
      ];
      if (matches.length !== 1) throw new Error('Invalid gallery manifest');
      const data = JSON.parse(matches[0][1]) as GalleryManifest;
      if (
        data.version !== initial.version ||
        data.locale !== initial.locale ||
        !Array.isArray(data.cards)
      )
        throw new Error('Stale gallery manifest');
      if (disposed || token !== generation) return undefined;
      if (cache.size >= 24) cache.delete(cache.keys().next().value!);
      cache.set(key, data);
      return data;
    } catch (error) {
      if (controller.signal.aborted || disposed || token !== generation) return undefined;
      throw error;
    }
  }

  function setPhoto(image: HTMLImageElement, photo: GalleryPhoto): void {
    image.alt = photo.alt;
    image.width = photo.width;
    image.height = photo.height;
    image.sizes = photo.sizes;
    image.srcset = photo.srcset;
    image.src = photo.src;
  }

  function makeCard(card: GalleryCard): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalogue-card';
    button.setAttribute('aria-label', `${card.categoryLabel} · ${card.label}`);
    button.dataset.galleryCard = '';
    button.dataset.category = card.category;
    button.dataset.type = card.type;
    button.dataset.image = card.image;
    const image = document.createElement('img');
    image.loading = 'lazy';
    image.decoding = 'async';
    image.draggable = false;
    setPhoto(image, card.photo);
    const motion = document.createElement('span');
    motion.dataset.cardMotion = '';
    motion.append(image);
    button.append(motion);
    return button;
  }

  function render(data: GalleryManifest, suppressVisibleArrival = false): void {
    catalogueMotion.revert();
    root.removeAttribute('aria-busy');
    const target = masonry;
    target.replaceChildren(...data.cards.map(makeCard));
    const category = data.categories.find((c) => c.key === selected);
    heading.textContent = category?.label ?? '';
    heading.parentElement!.hidden = !category;
    status.textContent = category?.typeCount === 0 ? strings.empty : '';
    retryButton.hidden = true;
    root
      .querySelectorAll<HTMLButtonElement>('[data-gallery-category]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.galleryCategory === selected)),
      );
    root
      .querySelector<HTMLButtonElement>('.catalogue-nav [data-gallery-reset]')
      ?.setAttribute('aria-pressed', String(!selected));
    observeCards(suppressVisibleArrival);
    if (category && !reducedMotion.matches) {
      catalogueMotion.add(() => {
        gsap.fromTo(
          heading,
          { autoAlpha: 0.4, y: 14 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.65,
            ease: 'power2.out',
            overwrite: 'auto',
            clearProps: 'opacity,visibility,transform',
          },
        );
      });
    }
  }

  const resize = new ResizeObserver(() => layoutMasonry());
  const suppressedCards = new WeakSet<Element>();
  const presentedCards = new WeakSet<Element>();
  const arrivals = new IntersectionObserver(
    (entries) => {
      const cards = [...masonry.querySelectorAll<HTMLElement>('.catalogue-card')];
      const columns = Number(getComputedStyle(masonry).getPropertyValue('--catalogue-columns'));
      const groups = new Set<number>();
      for (const entry of entries) {
        const index = cards.indexOf(entry.target as HTMLElement);
        if (entry.isIntersecting && index >= 0) groups.add(Math.floor(index / columns));
      }
      for (const index of groups) {
        const group = cards.slice(index * columns, (index + 1) * columns);
        const targets: HTMLElement[] = [];
        for (const card of group) {
          arrivals.unobserve(card);
          if (presentedCards.has(card)) continue;
          // Record skips before any fromTo can hide a locale-restored photograph.
          presentedCards.add(card);
          if (!reducedMotion.matches && !suppressedCards.has(card)) {
            targets.push(card.querySelector<HTMLElement>('[data-card-motion]')!);
          }
        }
        if (!targets.length) continue;
        const arrival = photoArrival(index, window.innerWidth >= 1024);
        catalogueMotion.add(() => {
          gsap.fromTo(targets, arrival.from, arrival.to);
        });
      }
    },
    { threshold: 0.05 },
  );
  function layoutMasonry(): void {
    if (masonry.hidden) return;
    masonry.dataset.layout = '';
    const gap = parseFloat(getComputedStyle(masonry).columnGap);
    const columns = Number(getComputedStyle(masonry).getPropertyValue('--catalogue-columns'));
    // One small, deterministic phase per column, never repeated per row.
    const phases = columns === 4 ? [7, 18, 0, 12] : columns === 3 ? [9, 0, 16] : [0, 8];
    const bottoms = phases.slice();
    const cards = [...masonry.querySelectorAll<HTMLElement>('.catalogue-card')];
    // Old desktop placements must not create implicit columns after shrinking.
    for (const button of cards) {
      if (Number(button.style.gridColumn) > columns) button.style.gridColumn = '1';
    }
    // Batch measurements after removing stale columns and before final placement.
    const spans = cards.map((button) => {
      const image = button.querySelector<HTMLImageElement>('img')!;
      // Computed used height retains subpixels but excludes ancestor arrival scales.
      // Read the painted image's layout, not its rounded intrinsic metadata ratio.
      const height = parseFloat(getComputedStyle(image).height);
      // Gapless 1px rows keep the visible gutter within one pixel of the column gap.
      return { button, span: Math.ceil(height + gap) };
    });
    for (const [index, { button, span }] of spans.entries()) {
      // Seed every column in reading order before filling the shortest stack.
      const column = index < columns ? index : bottoms.indexOf(Math.min(...bottoms));
      button.style.gridColumn = String(column + 1);
      button.style.gridRow = `${bottoms[column] + 1} / span ${span}`;
      bottoms[column] += span;
    }
  }
  function observeCards(suppressVisibleArrival = false): void {
    resize.disconnect();
    resize.observe(masonry);
    masonry.querySelectorAll('img').forEach((image) => resize.observe(image));
    layoutMasonry();
    arrivals.disconnect();
    masonry.querySelectorAll('.catalogue-card').forEach((card) => {
      if (suppressVisibleArrival) {
        const bounds = card.getBoundingClientRect();
        if (bounds.top < window.innerHeight && bounds.bottom > 0) suppressedCards.add(card);
      }
      arrivals.observe(card);
    });
  }

  async function selectCategory(key?: string, suppressVisibleArrival = false): Promise<void> {
    closeViewer();
    request?.abort();
    ++generation;
    selected = key;
    root.querySelectorAll<HTMLButtonElement>('.catalogue-nav button').forEach((button) => {
      button.setAttribute(
        'aria-pressed',
        String(
          key ? button.dataset.galleryCategory === key : button.hasAttribute('data-gallery-reset'),
        ),
      );
    });
    if (!reducedMotion.matches) {
      interfaceMotion.add(() =>
        gsap.fromTo(
          root.querySelector('.catalogue-nav [aria-pressed="true"] [data-category-click]'),
          { y: 4 },
          { y: 0, duration: 0.5, ease: 'power2.out', overwrite: true, clearProps: 'transform' },
        ),
      );
    }
    catalogueMotion.revert();
    retry = () => void selectCategory(key, suppressVisibleArrival);
    if (!key && overview.mode === 'overview' && overview.seed === seed) {
      render(overview, suppressVisibleArrival);
      return;
    }
    status.textContent = strings.loading;
    retryButton.hidden = true;
    masonry.replaceChildren();
    root.setAttribute('aria-busy', 'true');
    let token = generation;
    try {
      const result = load(key ? { category: key } : {});
      token = generation;
      const data = await result;
      if (!data || disposed || token !== generation) return;
      if (!key) overview = data;
      render(data, suppressVisibleArrival);
    } catch {
      if (disposed || token !== generation) return;
      status.textContent = strings.error;
      retryButton.hidden = false;
    } finally {
      if (!disposed && token === generation) root.removeAttribute('aria-busy');
    }
  }

  function lightboxState(open: boolean): void {
    if (open) document.documentElement.dataset.lightboxOpen = 'true';
    else delete document.documentElement.dataset.lightboxOpen;
    document.dispatchEvent(new CustomEvent('site:lightbox-state', { detail: { open } }));
  }
  function resetZoom(): void {
    hdReady?.abort();
    hdReady = undefined;
    zoom?.reset();
    hdRequested = false;
    zoomIntent = false;
  }

  function closeViewer(restore = true): void {
    if (!viewer) return;
    resetPhotoMotion();
    request?.abort();
    ++generation;
    hdReady?.abort();
    hdReady = undefined;
    zoom?.destroy();
    zoom = undefined;
    viewerResize.disconnect();
    const outgoing = viewer;
    releaseViewerMotion(outgoing, false);
    if (restore && !disposed && !reducedMotion.matches) {
      outgoing.inert = true;
      outgoing.setAttribute('aria-hidden', 'true');
      outgoing.style.pointerEvents = 'none';
      // These per-instance tweens must never enter a page-lifetime context.
      interfaceMotion.ignore(() => {
        viewerMotion.set(
          outgoing,
          gsap.to(outgoing, {
            autoAlpha: 0,
            duration: 0.3,
            overwrite: true,
            onComplete: () => {
              releaseViewerMotion(outgoing);
              outgoing.remove();
            },
          }),
        );
      });
    } else outgoing.remove();
    viewer = undefined;
    viewerData = undefined;
    pendingViewer = undefined;
    background.forEach(({ node, inert }) => {
      node.inert = inert;
    });
    background = [];
    document.body.style.overflow = bodyOverflow;
    document.body.style.paddingRight = bodyPadding;
    lightboxState(false);
    if (restore && returnFocus?.isConnected && !disposed)
      returnFocus.focus({ preventScroll: true });
    returnFocus = undefined;
  }

  function mountViewer(trigger: HTMLElement): void {
    returnFocus = trigger;
    const template = find<HTMLTemplateElement>('[data-gallery-viewer-template]');
    viewer = (template.content.cloneNode(true) as DocumentFragment)
      .firstElementChild as HTMLElement;
    bodyOverflow = document.body.style.overflow;
    bodyPadding = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbar)
      document.body.style.paddingRight = `${scrollbar + parseFloat(getComputedStyle(document.body).paddingRight)}px`;
    background = [...document.body.children]
      .filter(
        (node): node is HTMLElement =>
          node instanceof HTMLElement && !node.hasAttribute('data-gallery-viewer'),
      )
      .map((node) => ({ node, inert: node.inert }));
    background.forEach(({ node }) => {
      node.inert = true;
    });
    document.body.append(viewer);
    const thumbnail = trigger.querySelector<HTMLImageElement>('img');
    if (thumbnail) {
      const photo = viewerFind<HTMLImageElement>('[data-viewer-photo]');
      photo.width = Number(thumbnail.getAttribute('width')) || thumbnail.width;
      photo.height = Number(thumbnail.getAttribute('height')) || thumbnail.height;
    }
    viewerResize.observe(viewerFind('.catalogue-viewer__feedback'));
    fitViewer();
    if (!reducedMotion.matches) {
      const incoming = viewer;
      interfaceMotion.ignore(() => {
        viewerMotion.set(
          incoming,
          gsap.fromTo(
            incoming,
            { autoAlpha: 0.2 },
            {
              autoAlpha: 1,
              duration: 0.5,
              clearProps: 'opacity,visibility',
              onComplete: () => releaseViewerMotion(incoming),
            },
          ),
        );
      });
    }
    lightboxState(true);
    viewerFind<HTMLButtonElement>('[data-viewer-close]').focus({ preventScroll: true });
    zoom = galleryZoom(viewerFind('[data-viewer-stage]'), () => void zoomIn(), navigateImage);
    resetZoom();
  }

  function updateViewer(data: GalleryManifest): void {
    if (!viewer || !data.active) return;
    viewerData = data;
    pendingViewer = { category: data.category!, type: data.type!, image: data.active.id };
    const photo = viewerFind<HTMLImageElement>('[data-viewer-photo]');
    setPhoto(photo, data.active);
    const category = data.categories.find((c) => c.key === data.category)!;
    const type = data.types?.find((s) => s.id === data.type);
    viewerFind<HTMLElement>('[data-viewer-title]').textContent =
      `${category.label} · ${type?.label ?? ''}`;
    const index = data.images?.findIndex((image) => image.id === data.active!.id) ?? 0;
    viewerFind<HTMLButtonElement>('[data-viewer-prev]').disabled = index <= 0;
    viewerFind<HTMLButtonElement>('[data-viewer-next]').disabled =
      index >= (data.images?.length ?? 1) - 1;
    viewerFind<HTMLElement>('[data-viewer-status]').textContent = '';
    viewerFind<HTMLButtonElement>('[data-viewer-retry]').hidden = true;
    viewer.removeAttribute('aria-busy');
    fitViewer();
    // Keep the scene visible while loading; animate only the ready, current photo.
    if (photo.complete && photo.naturalWidth) revealPhoto();
    else {
      photoReady = new AbortController();
      photo.addEventListener('load', revealPhoto, { once: true, signal: photoReady.signal });
    }
    if (zoomIntent && viewerFind('[data-viewer-stage]').hasAttribute('data-zoomed')) void zoomIn();
  }

  async function showImage(category: string, type: string, image?: string): Promise<void> {
    if (!viewer) return;
    resetPhotoMotion();
    pendingViewer = { category, type, image };
    resetZoom();
    viewer.setAttribute('aria-busy', 'true');
    viewerFind<HTMLElement>('[data-viewer-status]').textContent = strings.loading;
    viewerFind<HTMLButtonElement>('[data-viewer-retry]').hidden = true;
    viewerRetry = () => void showImage(category, type, image);
    let token = generation;
    try {
      const result = load({ category, type, ...(image ? { image } : {}) });
      token = generation;
      const data = await result;
      if (data && !disposed && token === generation) updateViewer(data);
    } catch {
      if (!viewer || disposed || token !== generation) return;
      viewer.removeAttribute('aria-busy');
      viewerFind<HTMLElement>('[data-viewer-status]').textContent = strings.error;
      viewerFind<HTMLButtonElement>('[data-viewer-retry]').hidden = false;
    }
  }
  function navigateImage(delta: number): void {
    const data = viewerData;
    if (!data?.active || !data.images) return;
    const index = data.images.findIndex(
      (image) => image.id === (pendingViewer?.image ?? data.active!.id),
    );
    const next = data.images[index + delta];
    if (next) void showImage(data.category!, data.type!, next.id);
  }
  async function zoomIn(): Promise<void> {
    zoomIntent = true;
    const data = viewerData;
    if (!data?.active || !viewer) return;
    if (viewer.hasAttribute('aria-busy')) return;
    if (hdRequested) return;
    hdRequested = true;
    const ready = new AbortController();
    hdReady = ready;
    viewerRetry = () => void zoomIn();
    try {
      const result = load({
        category: data.category!,
        type: data.type!,
        image: data.active.id,
        zoom: '1',
      });
      const token = generation;
      const high = await result;
      if (!high?.active || ready.signal.aborted || token !== generation) return;
      const decoded = new Image();
      const cancel = () => {
        decoded.removeAttribute('srcset');
        decoded.removeAttribute('src');
      };
      ready.signal.addEventListener('abort', cancel, { once: true });
      try {
        setPhoto(decoded, high.active);
        await decoded.decode();
      } finally {
        ready.signal.removeEventListener('abort', cancel);
      }
      if (viewer && viewerData === data && !ready.signal.aborted && token === generation) {
        const photo = viewerFind<HTMLImageElement>('[data-viewer-photo]');
        // Retain the base dimensions/ratio and pan; HD is only a source upgrade.
        photo.sizes = high.active.sizes;
        photo.srcset = high.active.srcset;
        photo.src = high.active.src;
        viewerFind<HTMLElement>('[data-viewer-status]').textContent = '';
        viewerFind<HTMLButtonElement>('[data-viewer-retry]').hidden = true;
      }
    } catch {
      if (viewer && viewerData === data && !ready.signal.aborted) {
        hdRequested = false;
        viewerFind<HTMLElement>('[data-viewer-status]').textContent = strings.error;
        viewerFind<HTMLButtonElement>('[data-viewer-retry]').hidden = false;
      }
    } finally {
      if (hdReady === ready) hdReady = undefined;
    }
  }

  on(root, 'click', ((event: MouseEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.hasAttribute('data-gallery-category'))
      void selectCategory(button.dataset.galleryCategory);
    else if (button.hasAttribute('data-gallery-reset')) void selectCategory();
    else if (button.hasAttribute('data-gallery-retry')) retry?.();
    else if (button.hasAttribute('data-gallery-card')) {
      closeViewer(false);
      mountViewer(button);
      void showImage(button.dataset.category!, button.dataset.type!, button.dataset.image!);
    }
  }) as EventListener);
  on(document, 'click', ((event: MouseEvent) => {
    if (!viewer) return;
    if (event.target === viewer) {
      closeViewer();
      return;
    }
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || !viewer.contains(button)) return;
    if (button.hasAttribute('data-viewer-close')) closeViewer();
    else if (button.hasAttribute('data-viewer-prev')) navigateImage(-1);
    else if (button.hasAttribute('data-viewer-next')) navigateImage(1);
    else if (button.hasAttribute('data-viewer-retry')) viewerRetry?.();
  }) as EventListener);
  on(
    document,
    'keydown',
    ((event: KeyboardEvent) => {
      if (!viewer) {
        if (event.key === 'Escape' && selected) {
          event.preventDefault();
          void selectCategory();
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeViewer();
      } else if (event.key === 'Tab') {
        const targets = [
          ...viewer.querySelectorAll<HTMLElement>('button:not(:disabled),select'),
        ].filter((node) => !node.hidden && node.getClientRects().length);
        const first = targets[0],
          last = targets[targets.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || !viewer.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !viewer.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      } else if (zoom?.key(event.key)) {
        event.preventDefault();
      } else {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          navigateImage(-1);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          navigateImage(1);
        }
      }
    }) as EventListener,
    { capture: true },
  );
  on(
    document,
    'load',
    ((event: Event) => {
      if (viewer && event.target === viewer.querySelector('[data-viewer-photo]')) fitViewer();
    }) as EventListener,
    { capture: true },
  );
  on(
    document,
    'error',
    ((event: Event) => {
      if (viewer && event.target === viewer.querySelector('[data-viewer-photo]')) {
        resetPhotoMotion();
        const photo = event.target as HTMLImageElement;
        const base = viewerData?.active;
        // A browser can refetch after predecode (for example with cache disabled).
        if (hdRequested && base && photo.srcset !== base.srcset) {
          setPhoto(photo, base);
          fitViewer();
        }
        hdRequested = false;
        viewerFind<HTMLElement>('[data-viewer-status]').textContent = strings.error;
        viewerFind<HTMLButtonElement>('[data-viewer-retry]').hidden = false;
      }
    }) as EventListener,
    { capture: true },
  );

  observeCards(suppressArrival);
  cleanup = () => {
    disposed = true;
    request?.abort();
    ++generation;
    lifetime.abort();
    resize.disconnect();
    arrivals.disconnect();
    finishCategoryArrival();
    viewerResize.disconnect();
    media.revert();
    interfaceMotion.revert();
    resetViewerMotion();
    catalogueMotion.revert();
    resetPhotoMotion();
    closeViewer(false);
    cache.clear();
  };
  // Only initial synchronization inherits locale-arrival suppression, never user filters.
  if (initial.mode !== 'overview' || seed !== initial.seed)
    void selectCategory(initial.category, suppressArrival);
}

initGallery();
document.addEventListener('astro:page-load', initGallery);
document.addEventListener('astro:before-swap', () => {
  cleanup?.();
  cleanup = undefined;
});
