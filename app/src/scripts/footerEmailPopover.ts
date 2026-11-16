function initFooterEmail(): () => void {
  const trigger = document.querySelector<HTMLAnchorElement>('[data-footer-email-trigger]');
  const popup = document.querySelector<HTMLElement>('#footer-email-popover');
  const copy = popup?.querySelector<HTMLButtonElement>('[data-email-copy]');
  const manual = popup?.querySelector<HTMLElement>('[data-email-manual]');
  const address = manual?.querySelector<HTMLInputElement>('input');
  const status = popup?.querySelector<HTMLElement>('[data-email-status]');
  if (
    !trigger ||
    !popup ||
    !copy ||
    !manual ||
    !address ||
    !status ||
    typeof popup.showPopover !== 'function' ||
    typeof popup.hidePopover !== 'function'
  ) {
    return () => undefined;
  }

  const controller = new AbortController();
  const { signal } = controller;
  let generation = 0;
  let disposed = false;
  let copying = false;
  const isOpen = (): boolean => popup.matches(':popover-open');
  const position = (): void => {
    if (!isOpen()) return;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    popup.style.maxWidth = `${Math.max(0, width - 16)}px`;
    popup.style.maxHeight = `${Math.max(0, height - 16)}px`;
    const anchor = trigger.getBoundingClientRect();
    const bounds = popup.getBoundingClientRect();
    const x = Math.max(left + 8, Math.min(anchor.left, left + width - bounds.width - 8));
    const preferredY = anchor.top - bounds.height - 12;
    const above = preferredY >= top + 8;
    const y = Math.max(
      top + 8,
      Math.min(
        above ? preferredY : anchor.bottom + 12,
        top + height - bounds.height - 8,
      ),
    );
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
    popup.dataset.placement = above ? 'above' : 'below';
    popup.style.setProperty(
      '--email-arrow-x',
      `${x + Math.max(12, Math.min(anchor.left + anchor.width / 2 - x, bounds.width - 12))}px`,
    );
    popup.style.setProperty('--email-arrow-y', `${above ? y + bounds.height - 1 : y + 1}px`);
  };
  const resetFeedback = (): void => {
    delete copy.dataset.copied;
    status.textContent = '';
    status.classList.add('sr-only');
    manual.hidden = true;
  };
  const close = (restore = false): void => {
    generation++;
    copying = false;
    const focusInside = popup.contains(document.activeElement);
    resetFeedback();
    if (!isOpen()) return;
    popup.hidePopover();
    trigger.setAttribute('aria-expanded', 'false');
    if (restore && focusInside && trigger.isConnected) trigger.focus({ preventScroll: true });
  };
  const showManual = (): void => {
    manual.hidden = false;
    status.classList.remove('sr-only');
    status.textContent = popup.dataset.copyManual ?? '';
    position();
    if (popup.contains(document.activeElement)) {
      address.focus({ preventScroll: true });
      address.select();
    }
  };
  trigger.addEventListener(
    'click',
    (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      if (isOpen()) {
        event.preventDefault();
        close();
        return;
      }
      resetFeedback();
      try {
        popup.showPopover();
      } catch {
        // Keep the real mailto navigation when native enhancement cannot open.
        return;
      }
      event.preventDefault();
      trigger.setAttribute('aria-expanded', 'true');
      position();
      copy.focus({ preventScroll: true });
    },
    { signal },
  );
  copy.addEventListener(
    'click',
    async () => {
      if (copying) return;
      const run = ++generation;
      resetFeedback();
      position();
      if (!navigator.clipboard?.writeText) {
        showManual();
        return;
      }
      copying = true;
      try {
        await navigator.clipboard.writeText(address.value);
        if (disposed || run !== generation || !isOpen()) return;
        copy.dataset.copied = 'true';
        status.textContent = popup.dataset.copySuccess ?? '';
        position();
      } catch {
        if (disposed || run !== generation || !isOpen()) return;
        showManual();
      } finally {
        if (!disposed && run === generation) copying = false;
      }
    },
    { signal },
  );
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!isOpen() || !(event.target instanceof Node)) return;
      if (!popup.contains(event.target) && !trigger.contains(event.target)) close();
    },
    { signal, capture: true },
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !isOpen()) return;
      event.preventDefault();
      close(true);
    },
    { signal },
  );
  popup
    .querySelector<HTMLAnchorElement>('a')
    ?.addEventListener('click', () => close(true), { signal });
  window.addEventListener('resize', position, { signal });
  window.addEventListener('scroll', position, { signal, capture: true, passive: true });
  window.visualViewport?.addEventListener('resize', position, { signal });
  window.visualViewport?.addEventListener('scroll', position, { signal });
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', popup.id);
  trigger.setAttribute('aria-expanded', 'false');
  popup.hidden = false;
  return () => {
    disposed = true;
    close();
    controller.abort();
    popup.hidden = true;
    trigger.removeAttribute('aria-haspopup');
    trigger.removeAttribute('aria-controls');
    trigger.removeAttribute('aria-expanded');
  };
}

let cleanup: (() => void) | undefined;
document.addEventListener('astro:page-load', () => {
  cleanup?.();
  cleanup = initFooterEmail();
});
document.addEventListener('astro:before-swap', () => {
  cleanup?.();
  cleanup = undefined;
});
