/**
 * One-shot state for locale-only navigations.
 *
 * The language switcher can use Astro soft navigation or fall back to a full
 * reload. sessionStorage lets the next document know that this is not a normal
 * route arrival, so global arrival animations and root drift can be suppressed
 * only for this transition.
 */

const STORAGE_KEY = 'filing:language-switch';
const TTL_MS = 60000;
const SCROLL_RESTORE_DATASET = 'languageScrollRestoring';

export interface LanguageSwitchState {
  path: string;
  scrollX: number;
  scrollY: number;
  timestamp: number;
  /** Restore the closed menu trigger after a locale-triggered full reload. */
  focusInMenu?: boolean;
}

export interface ConsumedLanguageSwitchState extends LanguageSwitchState {
  shouldSuppressArrival: boolean;
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function isStorageAvailable(): boolean {
  try {
    window.sessionStorage.getItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function readStoredState(): LanguageSwitchState | null {
  if (!isStorageAvailable()) return null;

  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<LanguageSwitchState>;
    if (
      typeof parsed.path !== 'string' ||
      typeof parsed.scrollX !== 'number' ||
      typeof parsed.scrollY !== 'number' ||
      typeof parsed.timestamp !== 'number'
    ) {
      return null;
    }

    return parsed as LanguageSwitchState;
  } catch {
    return null;
  }
}

function isFresh(state: LanguageSwitchState): boolean {
  return Date.now() - state.timestamp <= TTL_MS;
}

function applyRootLockState(
  scrollX: number,
  scrollY: number,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.languageSwitching = 'true';
  root.dataset.suppressArrival = 'true';
  root.dataset.languageViewportLocked = 'true';
  root.dataset[SCROLL_RESTORE_DATASET] = 'true';
  root.style.setProperty('--language-lock-scroll-x', `${scrollX}px`);
  root.style.setProperty('--language-lock-scroll-y', `${scrollY}px`);
}

function instantScrollTo(scrollX: number, scrollY: number): void {
  const root = document.documentElement;
  const body = document.body;
  const previousRootBehavior = root.style.scrollBehavior;
  const previousBodyBehavior = body.style.scrollBehavior;

  root.dataset[SCROLL_RESTORE_DATASET] = 'true';
  root.style.scrollBehavior = 'auto';
  body.style.scrollBehavior = 'auto';
  window.scrollTo({ left: scrollX, top: scrollY, behavior: 'auto' });

  requestAnimationFrame(() => {
    root.style.scrollBehavior = previousRootBehavior;
    body.style.scrollBehavior = previousBodyBehavior;
    if (root.dataset.languageSwitching !== 'true') delete root.dataset[SCROLL_RESTORE_DATASET];
  });
}

function applyBodyLock(scrollX: number, scrollY: number, body: HTMLElement = document.body): void {
  body.dataset.languageViewportLocked = 'true';
  body.style.position = 'fixed';
  body.style.inset = '0 auto auto 0';
  body.style.width = '100%';
  body.style.minHeight = '100%';
  body.style.overflow = 'hidden';
  body.style.top = `${-scrollY}px`;
  body.style.left = `${-scrollX}px`;
  body.style.right = '0';
}

function clearBodyLock(body: HTMLElement = document.body): void {
  delete body.dataset.languageViewportLocked;
  body.style.position = '';
  body.style.inset = '';
  body.style.width = '';
  body.style.minHeight = '';
  body.style.overflow = '';
  body.style.top = '';
  body.style.left = '';
  body.style.right = '';
}

function readLockedScroll(): Pick<LanguageSwitchState, 'scrollX' | 'scrollY'> {
  const state = getLanguageSwitchState();
  if (state) return { scrollX: state.scrollX, scrollY: state.scrollY };

  const root = document.documentElement;
  const scrollX =
    Number.parseFloat(root.style.getPropertyValue('--language-lock-scroll-x')) || window.scrollX;
  const scrollY =
    Number.parseFloat(root.style.getPropertyValue('--language-lock-scroll-y')) || window.scrollY;
  return { scrollX, scrollY };
}

function shouldPreventScrollKey(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;

  return [
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'End',
    'Home',
    'PageDown',
    'PageUp',
    ' ',
    'Spacebar',
  ].includes(event.key);
}

function preventIfLanguageLocked(event: Event): void {
  if (document.documentElement.dataset.languageViewportLocked !== 'true') return;
  event.preventDefault();
}

function preventKeyIfLanguageLocked(event: KeyboardEvent): void {
  if (document.documentElement.dataset.languageViewportLocked !== 'true') return;
  if (!shouldPreventScrollKey(event)) return;
  event.preventDefault();
}

function ensureViewportBlockers(): void {
  if (document.documentElement.dataset.languageViewportBlockersBound === 'true') return;
  document.documentElement.dataset.languageViewportBlockersBound = 'true';
  document.addEventListener('wheel', preventIfLanguageLocked, { capture: true, passive: false });
  document.addEventListener('touchmove', preventIfLanguageLocked, {
    capture: true,
    passive: false,
  });
  document.addEventListener('keydown', preventKeyIfLanguageLocked, { capture: true });
}

export function clearLanguageSwitchState(): void {
  if (isStorageAvailable()) window.sessionStorage.removeItem(STORAGE_KEY);
  delete document.documentElement.dataset.languageSwitching;
  delete document.documentElement.dataset.suppressArrival;
  delete document.documentElement.dataset.languageViewportLocked;
  delete document.documentElement.dataset[SCROLL_RESTORE_DATASET];
  document.documentElement.style.removeProperty('--language-lock-scroll-x');
  document.documentElement.style.removeProperty('--language-lock-scroll-y');
  document.documentElement.style.scrollBehavior = '';
  document.body.style.scrollBehavior = '';
  clearBodyLock();
}

export function markLanguageSwitchNavigation(
  targetPath: string = currentPath(),
  focusInMenu = false,
): void {
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

  const state: LanguageSwitchState = {
    path: targetPath,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    timestamp: Date.now(),
    focusInMenu,
  };

  if (isStorageAvailable()) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  document.documentElement.dataset.languageSwitching = 'true';
  document.documentElement.dataset.suppressArrival = 'true';
}

// Keep content usable during fetch and carry its latest viewport into the swap.
window.addEventListener(
  'scroll',
  () => {
    if (
      document.documentElement.dataset.languageSwitching !== 'true' ||
      document.documentElement.dataset.languageViewportLocked === 'true'
    )
      return;
    const state = getLanguageSwitchState();
    if (state && isStorageAvailable()) {
      state.scrollX = window.scrollX;
      state.scrollY = window.scrollY;
      state.timestamp = Date.now();
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  },
  { passive: true },
);

export function lockLanguageSwitchViewport(
  scrollX: number = window.scrollX,
  scrollY: number = window.scrollY,
): void {
  ensureViewportBlockers();
  applyRootLockState(scrollX, scrollY);
  applyBodyLock(scrollX, scrollY);
  instantScrollTo(scrollX, scrollY);
}

export function restoreLanguageSwitchScroll(): void {
  if (document.documentElement.dataset.languageSwitching !== 'true' && !getLanguageSwitchState())
    return;

  const { scrollX, scrollY } = readLockedScroll();
  applyRootLockState(scrollX, scrollY);
  applyBodyLock(scrollX, scrollY);
  instantScrollTo(scrollX, scrollY);
}

export function doubleRestoreLanguageSwitchScroll(): void {
  restoreLanguageSwitchScroll();
  requestAnimationFrame(() => {
    restoreLanguageSwitchScroll();
    requestAnimationFrame(restoreLanguageSwitchScroll);
  });
}

export function completeLanguageSwitchTransition(): void {
  if (document.documentElement.dataset.languageSwitching !== 'true' && !getLanguageSwitchState())
    return;

  const { scrollX, scrollY } = readLockedScroll();
  applyRootLockState(scrollX, scrollY);
  applyBodyLock(scrollX, scrollY);
  instantScrollTo(scrollX, scrollY);
  clearLanguageSwitchState();
  instantScrollTo(scrollX, scrollY);
  requestAnimationFrame(() => {
    instantScrollTo(scrollX, scrollY);
    requestAnimationFrame(() => instantScrollTo(scrollX, scrollY));
  });
}

export function preserveLanguageSwitchViewportLock(event: Event): void {
  if (document.documentElement.dataset.languageSwitching !== 'true') return;

  const { scrollX, scrollY } = readLockedScroll();
  const swapEvent = event as Event & { newDocument?: Document };
  const newDocument = swapEvent.newDocument;
  const newRoot = newDocument?.documentElement;
  const newBody = newDocument?.body;
  if (!newRoot || !newBody) return;

  applyRootLockState(scrollX, scrollY, newRoot);
  applyBodyLock(scrollX, scrollY, newBody);
}

export function getLanguageSwitchState(): LanguageSwitchState | null {
  const state = readStoredState();
  if (!state) return null;

  if (!isFresh(state)) {
    clearLanguageSwitchState();
    return null;
  }

  return state;
}

export function consumeLanguageSwitchState(): ConsumedLanguageSwitchState | null {
  const state = getLanguageSwitchState();
  if (!state) return null;

  const samePath = state.path === currentPath();
  if (!samePath) {
    clearLanguageSwitchState();
    return null;
  }

  lockLanguageSwitchViewport(state.scrollX, state.scrollY);

  return {
    ...state,
    shouldSuppressArrival: true,
  };
}
