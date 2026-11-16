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
 * Route changes await hero decoding before ClientRouter's swap; GSAP animates
 * only the non-hero content so an already-ready background never fades out.
 * Native view-transition pseudo-element animation is disabled in CSS to avoid
 * double motion; locale-only transactions opt out through document state.
 */
import { gsap, ScrollTrigger } from './gsap';
import type {
  TransitionBeforePreparationEvent,
  TransitionBeforeSwapEvent,
} from 'astro:transitions/client';
import { gateInitialHero, prepareHero, type PreparedHero } from './heroMediaReady';
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
let preparedHero: PreparedHero | null = null;
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
  routeCtx = null;
  context?.revert();
}

function onBeforePreparation(event: TransitionBeforePreparationEvent): void {
  preparedHero?.dispose();
  preparedHero = null;
  const originalLoader = event.loader;
  event.loader = async (): Promise<void> => {
    await originalLoader();
    if (event.signal.aborted) return;
    const prepared = await prepareHero(event.newDocument, event.signal);
    if (event.signal.aborted) prepared.dispose();
    else preparedHero = prepared;
  };
}

function commitHero(event: TransitionBeforeSwapEvent): void {
  const prepared = preparedHero;
  preparedHero = null;
  const swap = event.swap;
  event.swap = (): void => {
    try {
      swap();
      prepared?.commit();
      document.documentElement.dataset.heroGate = prepared?.ready === false ? 'fallback' : 'ready';
      document.dispatchEvent(new Event('filing:hero-gate-open'));
    } finally {
      prepared?.dispose();
    }
  };
}

function animateRouteIn(): void {
  cleanupRouteChoreography();
  const main = document.querySelector<HTMLElement>('main');
  if (!main || shouldSkipRouteChoreography()) return;
  const content = Array.from(main.children).filter(
    (child) =>
      !child.matches('.hero, .page-hero, script, style') &&
      !child.querySelector('[data-hero-media]') &&
      !child.matches('[data-gallery-root]') &&
      !child.querySelector('[data-atelier-presentation]'),
  );
  if (!content.length) return;

  routeCtx = gsap.context(() => {
    gsap.fromTo(
      content,
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
document.addEventListener('astro:before-swap', commitHero);
document.addEventListener('astro:before-swap', preserveLanguageSwitchViewportLock);
document.addEventListener('astro:after-swap', doubleRestoreLanguageSwitchScroll);
document.addEventListener('astro:after-swap', animateRouteIn);
document.addEventListener('astro:before-swap', cleanup);
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
  cleanupRouteChoreography();
  init();
});

gateInitialHero();
