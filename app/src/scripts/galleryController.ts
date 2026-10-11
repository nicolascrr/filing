import type { GalleryCard, GalleryManifest, GalleryPhoto } from '../data/galleryTypes';

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
  const rail = find<HTMLDivElement>('[data-gallery-rail]');
  const heading = find<HTMLElement>('[data-gallery-heading]');
  const status = find<HTMLElement>('[data-gallery-status]');
  const retryButton = find<HTMLButtonElement>('[data-gallery-retry]');
  const lifetime = new AbortController();
  const cache = new Map<string, GalleryManifest>();
  let request: AbortController | undefined;
  let generation = 0;
  let disposed = false;
  let overview = initial;
  let current = initial;
  let selected: string | undefined = initial.category;
  let viewer: HTMLElement | undefined;
  let viewerData: GalleryManifest | undefined;
  let pendingViewer: { category: string; type: string; image?: string } | undefined;
  let overviewViewer = false;
  let returnFocus: HTMLElement | undefined;
  let bodyOverflow = '';
  let bodyPadding = '';
  let background: { node: HTMLElement; inert: boolean }[] = [];
  let scale = 1;
  let panX = 0;
  let panY = 0;
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
  const countText = (template: string, count: number) => template.replace('{count}', String(count));

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
    button.dataset.galleryCard = '';
    button.dataset.category = card.category;
    button.dataset.type = card.type;
    button.dataset.image = card.image;
    const image = document.createElement('img');
    image.loading = 'lazy';
    image.decoding = 'async';
    image.draggable = false;
    setPhoto(image, card.photo);
    const caption = document.createElement('span');
    caption.className = 'catalogue-card__caption';
    const label = document.createElement('span');
    label.textContent = `${card.categoryLabel} · ${card.label}`;
    const count = document.createElement('span');
    count.textContent = countText(strings.imageCount, card.imageCount);
    caption.append(label, count);
    button.append(image, caption);
    return button;
  }

  function render(data: GalleryManifest): void {
    current = data;
    const isMasonry = data.mode === 'overview' || data.cards.length >= 11;
    masonry.hidden = !isMasonry;
    rail.hidden = isMasonry;
    const target = isMasonry ? masonry : rail;
    (isMasonry ? rail : masonry).replaceChildren();
    target.replaceChildren(...data.cards.map(makeCard));
    const category = data.categories.find((c) => c.key === selected);
    heading.textContent = category?.label ?? strings.overviewHeading;
    status.textContent = category
      ? category.typeCount
        ? countText(strings.sampleCount, category.typeCount)
        : strings.emptyCoiling
      : '';
    retryButton.hidden = true;
    root
      .querySelectorAll<HTMLButtonElement>('[data-gallery-category]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.galleryCategory === selected)),
      );
    root
      .querySelector<HTMLButtonElement>('.catalogue-nav [data-gallery-reset]')
      ?.setAttribute('aria-pressed', String(!selected));
    observeCards();
  }

  const resize = new ResizeObserver(() => layoutMasonry());
  function layoutMasonry(): void {
    if (masonry.hidden) return;
    masonry.dataset.layout = '';
    for (const button of masonry.querySelectorAll<HTMLElement>('.catalogue-card')) {
      const image = button.querySelector<HTMLImageElement>('img')!;
      const caption = button.querySelector<HTMLElement>('.catalogue-card__caption')!;
      const height = (button.clientWidth * image.height) / image.width + caption.offsetHeight;
      button.style.gridRowEnd = `span ${Math.ceil((height + 20) / 30)}`;
    }
  }
  function observeCards(): void {
    resize.disconnect();
    resize.observe(masonry);
    masonry
      .querySelectorAll<HTMLElement>('.catalogue-card__caption')
      .forEach((node) => resize.observe(node));
    layoutMasonry();
  }

  async function selectCategory(key?: string): Promise<void> {
    closeViewer();
    request?.abort();
    ++generation;
    selected = key;
    retry = () => void selectCategory(key);
    if (!key && overview.mode === 'overview' && overview.seed === seed) {
      render(overview);
      return;
    }
    status.textContent = strings.loading;
    retryButton.hidden = true;
    masonry.replaceChildren();
    rail.replaceChildren();
    root.setAttribute('aria-busy', 'true');
    try {
      const data = await load(key ? { category: key } : {});
      if (!data) return;
      if (!key) overview = data;
      render(data);
    } catch {
      status.textContent = strings.error;
      retryButton.hidden = false;
    } finally {
      if (!disposed) root.removeAttribute('aria-busy');
    }
  }

  function lightboxState(open: boolean): void {
    if (open) document.documentElement.dataset.lightboxOpen = 'true';
    else delete document.documentElement.dataset.lightboxOpen;
    document.dispatchEvent(new CustomEvent('site:lightbox-state', { detail: { open } }));
  }
  function transform(): void {
    if (!viewer) return;
    viewerFind<HTMLImageElement>('[data-viewer-photo]').style.transform =
      `translate(${panX}px,${panY}px) scale(${scale})`;
  }
  function resetZoom(): void {
    scale = 1;
    panX = panY = 0;
    transform();
  }

  function closeViewer(restore = true): void {
    if (!viewer) return;
    request?.abort();
    ++generation;
    viewer.remove();
    viewer = undefined;
    viewerData = undefined;
    pendingViewer = undefined;
    pointer = undefined;
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
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .map((node) => ({ node, inert: node.inert }));
    background.forEach(({ node }) => {
      node.inert = true;
    });
    document.body.append(viewer);
    lightboxState(true);
    viewerFind<HTMLButtonElement>('[data-viewer-close]').focus({ preventScroll: true });
    resetZoom();
  }

  function updateViewer(data: GalleryManifest): void {
    if (!viewer || !data.active) return;
    viewerData = data;
    pendingViewer = { category: data.category!, type: data.type!, image: data.active.id };
    resetZoom();
    setPhoto(viewerFind<HTMLImageElement>('[data-viewer-photo]'), data.active);
    const category = data.categories.find((c) => c.key === data.category)!;
    const type = data.types?.find((s) => s.id === data.type);
    viewerFind<HTMLElement>('[data-viewer-title]').textContent =
      `${category.label} · ${type?.label ?? ''}`;
    const index = data.images?.findIndex((image) => image.id === data.active!.id) ?? 0;
    viewerFind<HTMLElement>('[data-viewer-count]').textContent =
      `${index + 1} / ${data.images?.length ?? 1}`;
    viewerFind<HTMLButtonElement>('[data-viewer-prev]').disabled = index <= 0;
    viewerFind<HTMLButtonElement>('[data-viewer-next]').disabled =
      index >= (data.images?.length ?? 1) - 1;
    viewerFind<HTMLElement>('[data-viewer-thumbnails]').replaceChildren(
      ...(data.thumbnails ?? []).slice(0, 5).map((photo) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.viewerImage = photo.id;
        button.setAttribute('aria-current', String(photo.id === data.active!.id));
        const image = document.createElement('img');
        image.loading = 'lazy';
        image.decoding = 'async';
        setPhoto(image, photo);
        button.append(image);
        return button;
      }),
    );
    const select = viewerFind<HTMLSelectElement>('[data-viewer-types]');
    select.replaceChildren(
      ...(data.types ?? []).map((sample) => {
        const option = document.createElement('option');
        option.value = sample.id;
        option.textContent = sample.label;
        option.selected = sample.id === data.type;
        return option;
      }),
    );
    const typeIndex = data.types?.findIndex((sample) => sample.id === data.type) ?? 0;
    viewerFind<HTMLButtonElement>('[data-viewer-type-prev]').disabled = typeIndex <= 0;
    viewerFind<HTMLButtonElement>('[data-viewer-type-next]').disabled =
      typeIndex >= (data.types?.length ?? 1) - 1;
    const cta = viewerFind<HTMLButtonElement>('[data-viewer-category]');
    cta.hidden = !overviewViewer;
    cta.textContent = strings.viewCategory.replace('{category}', category.label);
    viewerFind<HTMLElement>('[data-viewer-status]').textContent = '';
    viewerFind<HTMLButtonElement>('[data-viewer-retry]').hidden = true;
    viewer.removeAttribute('aria-busy');
  }

  async function showImage(category: string, type: string, image?: string): Promise<void> {
    if (!viewer) return;
    pendingViewer = { category, type, image };
    resetZoom();
    viewer.setAttribute('aria-busy', 'true');
    viewerFind<HTMLElement>('[data-viewer-status]').textContent = strings.loading;
    viewerFind<HTMLButtonElement>('[data-viewer-retry]').hidden = true;
    viewerRetry = () => void showImage(category, type, image);
    try {
      const data = await load({ category, type, ...(image ? { image } : {}) });
      if (data) updateViewer(data);
    } catch {
      if (!viewer) return;
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
  function navigateType(delta: number): void {
    const data = viewerData;
    if (!data?.types) return;
    const index = data.types.findIndex(
      (sample) => sample.id === (pendingViewer?.type ?? data.type),
    );
    const next = data.types[index + delta];
    if (next) void showImage(data.category!, next.id);
  }
  async function zoomIn(): Promise<void> {
    const data = viewerData;
    if (!data?.active || !viewer) return;
    if (viewer.hasAttribute('aria-busy')) return;
    scale = Math.min(4, scale + 0.5);
    transform();
    viewerRetry = () => void zoomIn();
    try {
      const high = await load({
        category: data.category!,
        type: data.type!,
        image: data.active.id,
        zoom: '1',
      });
      if (high?.active && viewer && viewerData === data)
        setPhoto(viewerFind<HTMLImageElement>('[data-viewer-photo]'), high.active);
    } catch {
      if (viewer) {
        viewerFind<HTMLElement>('[data-viewer-status]').textContent = strings.error;
        viewerFind<HTMLButtonElement>('[data-viewer-retry]').hidden = false;
      }
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
      overviewViewer = current.mode === 'overview';
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
    else if (button.hasAttribute('data-viewer-image') && viewerData)
      void showImage(viewerData.category!, viewerData.type!, button.dataset.viewerImage);
    else if (button.hasAttribute('data-viewer-prev')) navigateImage(-1);
    else if (button.hasAttribute('data-viewer-next')) navigateImage(1);
    else if (button.hasAttribute('data-viewer-type-prev')) navigateType(-1);
    else if (button.hasAttribute('data-viewer-type-next')) navigateType(1);
    else if (button.hasAttribute('data-viewer-zoom-in')) void zoomIn();
    else if (button.hasAttribute('data-viewer-zoom-out')) {
      scale = Math.max(1, scale - 0.5);
      if (scale === 1) panX = panY = 0;
      transform();
    } else if (button.hasAttribute('data-viewer-zoom-reset')) resetZoom();
    else if (button.hasAttribute('data-viewer-retry')) viewerRetry?.();
    else if (button.hasAttribute('data-viewer-category')) {
      const key = viewerData?.category;
      void selectCategory(key);
      root
        .querySelector<HTMLButtonElement>(`[data-gallery-category="${key}"]`)
        ?.focus({ preventScroll: true });
    }
  }) as EventListener);
  on(document, 'change', ((event: Event) => {
    if (
      viewer &&
      event.target instanceof HTMLSelectElement &&
      event.target.hasAttribute('data-viewer-types') &&
      viewerData
    )
      void showImage(viewerData.category!, event.target.value);
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
      } else if (!(event.target instanceof HTMLSelectElement)) {
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
    rail,
    'wheel',
    ((event: WheelEvent) => {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.ctrlKey) return;
      const canMove =
        event.deltaY > 0
          ? rail.scrollLeft < rail.scrollWidth - rail.clientWidth - 1
          : rail.scrollLeft > 1;
      if (canMove) {
        event.preventDefault();
        rail.scrollLeft += event.deltaY;
      }
    }) as EventListener,
    { passive: false },
  );
  on(rail, 'keydown', ((event: KeyboardEvent) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      rail.scrollBy({
        left: (event.key === 'ArrowRight' ? 1 : -1) * rail.clientWidth * 0.8,
        behavior: 'auto',
      });
    }
  }) as EventListener);
  let pointer: { id: number; x: number; y: number; panX: number; panY: number } | undefined;
  on(document, 'pointerdown', ((event: PointerEvent) => {
    if (!viewer || !(event.target as Element).closest('[data-viewer-stage]')) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, panX, panY };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }) as EventListener);
  on(document, 'pointermove', ((event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId || scale === 1) return;
    const stage = viewer?.querySelector<HTMLElement>('[data-viewer-stage]');
    if (!stage) return;
    panX = Math.max(
      -stage.clientWidth,
      Math.min(stage.clientWidth, pointer.panX + event.clientX - pointer.x),
    );
    panY = Math.max(
      -stage.clientHeight,
      Math.min(stage.clientHeight, pointer.panY + event.clientY - pointer.y),
    );
    transform();
  }) as EventListener);
  on(document, 'pointerup', ((event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (
      scale === 1 &&
      Math.abs(event.clientX - pointer.x) > 60 &&
      Math.abs(event.clientY - pointer.y) < 80
    )
      navigateImage(event.clientX < pointer.x ? 1 : -1);
    pointer = undefined;
  }) as EventListener);
  on(document, 'pointercancel', () => {
    pointer = undefined;
  });
  on(
    document,
    'error',
    ((event: Event) => {
      if (viewer && event.target === viewer.querySelector('[data-viewer-photo]')) {
        viewerFind<HTMLElement>('[data-viewer-status]').textContent = strings.error;
        viewerFind<HTMLButtonElement>('[data-viewer-retry]').hidden = false;
      }
    }) as EventListener,
    { capture: true },
  );

  observeCards();
  cleanup = () => {
    disposed = true;
    request?.abort();
    ++generation;
    lifetime.abort();
    resize.disconnect();
    closeViewer(false);
    cache.clear();
  };
  if (initial.mode !== 'overview' || seed !== initial.seed) void selectCategory(initial.category);
}

initGallery();
document.addEventListener('astro:page-load', initGallery);
document.addEventListener('astro:before-swap', () => {
  cleanup?.();
  cleanup = undefined;
});
