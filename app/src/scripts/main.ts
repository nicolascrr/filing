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
 * double motion; the language silk wipe opts out through its document state.
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
import { initSplitText } from './splittext';

/** Active GSAP context for global animations (reveals + SplitText). */
let ctx: gsap.Context | null = null;

/** Restores headings changed by SplitText after GSAP has reverted its tweens. */
let revertSplitText: (() => void) | null = null;
let revertReveals: (() => void) | null = null;
let routeCtx: gsap.Context | null = null;

function shouldSkipRouteChoreography(): boolean {
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.dataset.languageSwitching === 'true' ||
    document.documentElement.dataset.suppressArrival === 'true'
  );
}

function cleanupRouteChoreography(): void {
  routeCtx?.revert();
  routeCtx = null;
}

function animateRouteOut(): Promise<void> {
  const main = document.querySelector<HTMLElement>('main');
  if (!main || shouldSkipRouteChoreography()) return Promise.resolve();

  cleanupRouteChoreography();
  return new Promise((resolve) => {
    routeCtx = gsap.context(() => {
      gsap.to(main, {
        autoAlpha: 0,
        y: -32,
        duration: 0.6,
        ease: 'power2.inOut',
        onComplete: resolve,
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
      { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out', clearProps: 'opacity,visibility,transform' },
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

  const datasetSuppressArrival = document.documentElement.dataset.suppressArrival === 'true';
  const languageSwitchState = consumeLanguageSwitchState();
  if (languageSwitchState) {
    restoreLanguageSwitchScroll();
  }

  const suppressArrival = languageSwitchState?.shouldSuppressArrival === true || datasetSuppressArrival;

  ctx = gsap.context(() => {
    revertReveals = initReveals(undefined, { suppressCurrentViewport: suppressArrival });
    revertSplitText = initSplitText(undefined, { suppressCurrentViewport: suppressArrival });
  });

  // Recalculate ScrollTrigger positions for the freshly swapped DOM.
  // A microtask delay lets the new layout settle before measuring.
  ScrollTrigger.refresh();

  if (languageSwitchState) {
    restoreLanguageSwitchScroll();
    requestAnimationFrame(() => {
      restoreLanguageSwitchScroll();
      ScrollTrigger.refresh();
      restoreLanguageSwitchScroll();
      requestAnimationFrame(restoreLanguageSwitchScroll);
    });
  }
}

/** Clean up global animations before a view-transition swap. */
function cleanup(): void {
  if (ctx) {
    ctx.revert();
    ctx = null;
  }

  if (revertSplitText) {
    revertSplitText();
    revertSplitText = null;
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
