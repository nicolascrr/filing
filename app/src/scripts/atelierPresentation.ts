import { gsap } from './gsap';
import { getLanguageSwitchState } from './languageSwitchState';
import { photoArrival } from './photoArrival';

let dispose: (() => void) | undefined;
let activeRoots: HTMLElement[] = [];

function initAtelierPresentations(): void {
  const roots = Array.from(document.querySelectorAll<HTMLElement>('[data-atelier-presentation]'));
  if (
    dispose &&
    roots.length === activeRoots.length &&
    roots.every((root, index) => root === activeRoots[index])
  )
    return;
  dispose?.();
  dispose = undefined;
  if (!roots.length) return;

  const cleanups: (() => void)[] = [];
  const frames = roots.flatMap((root) =>
    Array.from(root.querySelectorAll<HTMLElement>('[data-atelier-frame]')),
  );
  const mobile = window.matchMedia('(max-width: 639px)');
  const languageSwitch = getLanguageSwitchState();
  const suppressArrival =
    languageSwitch?.path ===
      `${window.location.pathname}${window.location.search}${window.location.hash}` ||
    document.documentElement.dataset.suppressArrival === 'true';

  // A single body-level native modal is shared by both Production mosaics.
  // Native modality supplies background inertness and keyboard focus containment.
  const dialog = document.createElement('dialog');
  dialog.className = 'atelier-viewer';
  dialog.setAttribute('aria-modal', 'true');
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'atelier-viewer__close';
  closeButton.textContent = '×';
  closeButton.autofocus = true;
  const enlarged = document.createElement('img');
  enlarged.className = 'atelier-viewer__image';
  enlarged.alt = '';
  dialog.append(closeButton, enlarged);
  document.body.append(dialog);

  const html = document.documentElement;
  const body = document.body;
  let opener: HTMLElement | null = null;
  let releaseLock: (() => void) | undefined;
  const publish = (open: boolean): void => {
    document.dispatchEvent(new CustomEvent('site:lightbox-state', { detail: { open } }));
  };
  const finishClose = (restoreFocus: boolean): void => {
    const previous = opener;
    opener = null;
    if (dialog.open) dialog.close();
    releaseLock?.();
    releaseLock = undefined;
    enlarged.removeAttribute('src');
    if (restoreFocus && mobile.matches && previous?.isConnected) {
      previous.focus({ preventScroll: true });
    }
  };
  const open = (frame: HTMLElement, root: HTMLElement): void => {
    if (
      !mobile.matches ||
      typeof dialog.showModal !== 'function' ||
      dialog.open ||
      html.hasAttribute('data-lightbox-open') ||
      document.querySelector('dialog[open]')
    )
      return;
    const src = frame.dataset.fullSrc;
    if (!src) return;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const bodyOverflow = body.style.overflow;
    const rootOverflow = html.style.overflow;
    const oldLightboxState = html.getAttribute('data-lightbox-open');
    opener = frame;
    enlarged.src = src;
    dialog.setAttribute('aria-label', root.dataset.dialogLabel ?? '');
    closeButton.setAttribute('aria-label', root.dataset.closeLabel ?? '');
    try {
      dialog.showModal();
    } catch (error) {
      opener = null;
      enlarged.removeAttribute('src');
      console.error('Unable to open the atelier photograph.', error);
      return;
    }
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    html.dataset.lightboxOpen = 'true';
    // Only release state acquired here; never dismiss an unrelated lightbox.
    releaseLock = () => {
      if (body.style.overflow === 'hidden') body.style.overflow = bodyOverflow;
      if (html.style.overflow === 'hidden') html.style.overflow = rootOverflow;
      if (html.dataset.lightboxOpen === 'true') {
        if (oldLightboxState === null) delete html.dataset.lightboxOpen;
        else html.setAttribute('data-lightbox-open', oldLightboxState);
        publish(oldLightboxState === 'true');
      }
      const behavior = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      window.scrollTo(scrollX, scrollY);
      html.style.scrollBehavior = behavior;
    };
    publish(true);
    closeButton.focus({ preventScroll: true });
  };
  const onClose = (): void => finishClose(true);
  const onCancel = (event: Event): void => {
    event.preventDefault();
    finishClose(true);
  };
  const onBackdrop = (event: MouseEvent): void => {
    if (event.target === dialog) finishClose(true);
  };
  closeButton.addEventListener('click', onClose);
  dialog.addEventListener('cancel', onCancel);
  dialog.addEventListener('click', onBackdrop);

  const updateInteraction = (): void => {
    if (!mobile.matches) finishClose(false);
    for (const root of roots) {
      for (const frame of root.querySelectorAll<HTMLElement>('[data-atelier-frame]')) {
        if (mobile.matches && typeof dialog.showModal === 'function') {
          frame.setAttribute('role', 'button');
          frame.tabIndex = 0;
          frame.setAttribute('aria-haspopup', 'dialog');
          frame.setAttribute('aria-label', root.dataset.openLabel ?? '');
        } else {
          if (document.activeElement === frame) frame.blur();
          frame.removeAttribute('role');
          frame.removeAttribute('tabindex');
          frame.removeAttribute('aria-haspopup');
          frame.removeAttribute('aria-label');
        }
      }
    }
  };
  updateInteraction();
  mobile.addEventListener('change', updateInteraction);
  for (const root of roots) {
    const findFrame = (target: EventTarget | null): HTMLElement | null =>
      target instanceof Element ? target.closest<HTMLElement>('[data-atelier-frame]') : null;
    const onClick = (event: MouseEvent): void => {
      const frame = findFrame(event.target);
      if (frame) open(frame, root);
    };
    const onKeydown = (event: KeyboardEvent): void => {
      if (!mobile.matches || (event.key !== 'Enter' && event.key !== ' ')) return;
      const frame = findFrame(event.target);
      if (!frame || frame.getAttribute('role') !== 'button') return;
      event.preventDefault();
      open(frame, root);
    };
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeydown);
    cleanups.push(() => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeydown);
    });
  }
  cleanups.push(() => {
    mobile.removeEventListener('change', updateInteraction);
    finishClose(false);
    closeButton.removeEventListener('click', onClose);
    dialog.removeEventListener('cancel', onCancel);
    dialog.removeEventListener('click', onBackdrop);
    dialog.remove();
    for (const frame of frames) {
      frame.removeAttribute('role');
      frame.removeAttribute('tabindex');
      frame.removeAttribute('aria-haspopup');
      frame.removeAttribute('aria-label');
    }
  });

  for (const root of roots) {
    const localFrames = Array.from(root.querySelectorAll<HTMLElement>('[data-atelier-frame]'));
    const motionTargets = localFrames.map((frame) =>
      frame.querySelector<HTMLElement>('[data-atelier-motion]')!,
    );
    const presented = new WeakSet<HTMLElement>();
    const media = gsap.matchMedia();
    let firstSetup = true;
    const restore = (): void => {
      gsap.set(motionTargets, { clearProps: 'opacity,visibility,transform' });
    };
    cleanups.push(() => {
      media.revert();
      restore();
    });
    try {
      media.add(
        {
          desktop: '(min-width: 1024px)',
          compact: '(max-width: 1023px)',
          reduced: '(prefers-reduced-motion: reduce)',
        },
        (context) => {
          const { desktop, reduced } = context.conditions!;
          const groups = new Map<string, HTMLElement[]>();
          for (const frame of localFrames) {
            const row = (desktop ? frame.dataset.rowDesktop : frame.dataset.rowCompact) ?? '';
            const group = groups.get(row) ?? [];
            group.push(frame);
            groups.set(row, group);
          }
          // Collect geometry before any fromTo writes, once per media setup.
          const viewportHeight = window.innerHeight;
          const measuredGroups = Array.from(groups.values(), (group) => {
            const bounds = group.map((frame) => frame.getBoundingClientRect());
            return {
              group,
              visible: bounds.some((rect) => rect.top < viewportHeight && rect.bottom > 0),
              alreadyPassed: bounds.every((rect) => rect.bottom <= 0),
            };
          });
          const tweens: gsap.core.Tween[] = [];
          for (const [index, { group, visible, alreadyPassed }] of measuredGroups.entries()) {
            if (
              reduced ||
              alreadyPassed ||
              group.every((frame) => presented.has(frame)) ||
              (visible && (!firstSetup || suppressArrival))
            ) {
              group.forEach((frame) => presented.add(frame));
              continue;
            }
            const targets = group.map((frame) =>
              frame.querySelector<HTMLElement>('[data-atelier-motion]')!,
            );
            const arrival = photoArrival(index, desktop);
            tweens.push(
              gsap.fromTo(targets, arrival.from, {
                ...arrival.to,
                onStart: () => {
                  group.forEach((frame) => presented.add(frame));
                },
                scrollTrigger: { trigger: group[0], start: 'top 80%', once: true },
              }),
            );
          }
          firstSetup = false;
          // Only this mosaic's triggers are refreshed when decoded images change layout.
          const resize = new ResizeObserver(() => {
            tweens.forEach((tween) => tween.scrollTrigger?.refresh());
          });
          resize.observe(root);
          return () => resize.disconnect();
        },
        root,
      );
    } catch (error) {
      media.revert();
      restore();
      console.error('Unable to animate the atelier photographs.', error);
    }
  }

  activeRoots = roots;
  dispose = () => {
    cleanups.forEach((cleanup) => cleanup());
    activeRoots = [];
    dispose = undefined;
  };
}

document.addEventListener('astro:page-load', initAtelierPresentations);
document.addEventListener('astro:before-swap', () => dispose?.());
