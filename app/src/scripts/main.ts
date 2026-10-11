/**
 * main.ts — global client entry island (US-22 / US-23 / US-24)
 *
 * Loaded ONCE in `BaseLayout.astro` as a bundled `<script>`. With Astro
 * ClientRouter view transitions, this module script persists across swaps
 * (it is not re-executed), so its `astro:page-load` / `astro:before-swap`
 * listeners drive the full animation lifecycle:
 *
 *   - `astro:page-load`  → (re)initialise reveals + SplitText inside a
 *                          fresh `gsap.context()`, then refresh
 *                          ScrollTrigger so positions match the new DOM.
 *   - `astro:before-swap` → revert the GSAP context and SplitText source DOM
 *                            before the old page is torn down.
 *
 * Component-specific GSAP islands (Timeline, Menu, Galerie) manage their
 * own contexts and lifecycle independently — this module only owns the
 * global reveals + SplitText. GSAP dedupes plugin registration, so the
 * shared `gsap.ts` import here and the per-island imports coexist safely.
 *
 * Route changes are choreographed here with GSAP around ClientRouter's swap.
 * Native view-transition pseudo-element animation is disabled in CSS to avoid
 * double motion; locale-only transactions opt out through document state.
 */
import { gsap, ScrollTrigger } from './gsap';
import type { TransitionBeforePreparationEvent } from 'astro:transitions/client';
import {
  consumeLanguageSwitchState,
  doubleRestoreLanguageSwitchScroll,
  preserveLanguageSwitchViewportLock,
  restoreLanguageSwitchScroll,
} from './languageSwitchState';
import { initReveals } from './reveals';

/** Active GSAP context for global animations (reveals + SplitText). */
let ctx: gsap.Context | null = null;

/** Restores grouped text DOM after GSAP has reverted its tweens. */
let revertReveals: (() => void) | null = null;
let routeCtx: gsap.Context | null = null;
let settleRouteOut: (() => void) | null = null;
let pageGeneration = 0;
let restoreFrame = 0;

function shouldSkipRouteChoreography(): boolean {
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.dataset.languageSwitching === 'true' ||
    document.documentElement.dataset.suppressArrival === 'true'
  );
}

function cleanupRouteChoreography(): void {
  const context = routeCtx;
  const settle = settleRouteOut;
  routeCtx = null;
  settleRouteOut = null;
  try {
    context?.revert();
  } finally {
    // revert() may suppress tween callbacks; always release the loader gate.
    settle?.();
  }
}

function animateRouteOut(): Promise<void> {
  const main = document.querySelector<HTMLElement>('main');
  if (!main || shouldSkipRouteChoreography()) return Promise.resolve();

  cleanupRouteChoreography();
  return new Promise((resolve) => {
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      if (settleRouteOut === settle) settleRouteOut = null;
      resolve();
    };
    settleRouteOut = settle;
    routeCtx = gsap.context(() => {
      gsap.to(main, {
        autoAlpha: 0,
        y: -32,
        duration: 0.6,
        ease: 'power2.inOut',
        onComplete: settle,
        onInterrupt: settle,
      });
    }, main);
  });
}

function onBeforePreparation(event: TransitionBeforePreparationEvent): void {
  if (shouldSkipRouteChoreography()) return;
  const originalLoader = event.loader;
  event.loader = async (): Promise<void> => {
    try {
      await Promise.all([originalLoader(), animateRouteOut()]);
    } catch (error) {
      cleanupRouteChoreography();
      throw error;
    }
  };
}

function animateRouteIn(): void {
  cleanupRouteChoreography();
  const main = document.querySelector<HTMLElement>('main');
  if (!main || shouldSkipRouteChoreography()) return;

  routeCtx = gsap.context(() => {
    gsap.fromTo(
      main,
      { autoAlpha: 0, y: 48 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.9,
        ease: 'power3.out',
        clearProps: 'opacity,visibility,transform',
      },
    );
  }, main);
}

/**
 * (Re)initialise global animations for the current page.
 * Called on initial load and after every ClientRouter swap.
 */
function init(): void {
  // Tear down any previous context first (defensive — `astro:before-swap`
  // already does this, but a double init must never stack contexts).
  cleanup();
  const run = pageGeneration;

  const datasetSuppressArrival = document.documentElement.dataset.suppressArrival === 'true';
  const languageSwitchState = consumeLanguageSwitchState();
  if (languageSwitchState) {
    restoreLanguageSwitchScroll();
  }

  const suppressArrival =
    languageSwitchState?.shouldSuppressArrival === true || datasetSuppressArrival;

  ctx = gsap.context(() => {
    revertReveals = initReveals(undefined, { suppressCurrentViewport: suppressArrival });
  });

  // Recalculate ScrollTrigger positions for the freshly swapped DOM.
  // A microtask delay lets the new layout settle before measuring.
  ScrollTrigger.refresh();
  void document.fonts.ready.then(() => {
    if (run === pageGeneration) ScrollTrigger.refresh();
  });

  if (languageSwitchState) {
    restoreLanguageSwitchScroll();
    restoreFrame = requestAnimationFrame(() => {
      if (run !== pageGeneration) return;
      restoreLanguageSwitchScroll();
      ScrollTrigger.refresh();
      restoreLanguageSwitchScroll();
      restoreFrame = requestAnimationFrame(() => {
        if (run === pageGeneration) restoreLanguageSwitchScroll();
      });
    });
  }
}

/** Clean up global animations before a view-transition swap. */
function cleanup(): void {
  pageGeneration++;
  cancelAnimationFrame(restoreFrame);
  if (ctx) {
    ctx.revert();
    ctx = null;
  }

  if (revertReveals) {
    revertReveals();
    revertReveals = null;
  }
}

document.addEventListener('astro:page-load', init);
document.addEventListener('astro:before-preparation', onBeforePreparation);
document.addEventListener('astro:before-swap', preserveLanguageSwitchViewportLock);
document.addEventListener('astro:after-swap', doubleRestoreLanguageSwitchScroll);
document.addEventListener('astro:after-swap', animateRouteIn);
document.addEventListener('astro:before-swap', cleanup);
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
  cleanupRouteChoreography();
  init();
});
