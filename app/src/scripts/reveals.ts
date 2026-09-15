/**
 * reveals.ts — reusable scroll-reveal system (US-22)
 *
 * Finds elements carrying the `data-reveal` attribute and sets up a
 * visible fade + translateY reveal driven by ScrollTrigger.
 *
 * Opt-in attributes (all optional):
 *   - `data-reveal`        — opt the element into the reveal system.
 *   - `data-reveal-delay`  — seconds (float) to wait before the reveal tween.
 *   - `data-reveal-y`      — pixels (float) of initial translateY (default 60,
 *                             clamped to the V2-02 40–120px range).
 *
 * Design rules (per AGENTS.md / V2-02):
 *   - Elegant & clearly visible: opacity + transform only (no layout
 *     thrash), ~1.2s duration, `power3.out` ease, generous distance
 *     (40–120px). The user must SEE the motion and feel the craftsmanship.
 *   - Anti-FOUC: elements are visible by default in the SSR HTML. The
 *     initial `opacity: 0` / `y` state is applied via `gsap.set` at init
 *     time ONLY, so no-JS and reduced-motion users always see the content.
 *   - `prefers-reduced-motion`: when preferred, the system is skipped
 *     entirely — no inline styles, no ScrollTriggers, content stays visible.
 *   - Reveal runs once per element (`once: true`).
 *
 * Cleanup: this function is meant to be called inside a `gsap.context()`
 * (see `main.ts`). The context tracks the `gsap.set` / `gsap.to` tweens
 * and the ScrollTriggers created here, so `ctx.revert()` on
 * `astro:before-swap` cleans everything up.
 */
import { gsap, ScrollTrigger, SplitText } from './gsap';

/** Default CSS selector for reveal targets. */
export const REVEAL_SELECTOR = '[data-reveal]';

/** Default initial translateY (px) — generous distance (V2-02: 40–120px). */
const DEFAULT_Y = 60;

/** Default reveal duration (s) — slow & premium (V2-02: 0.8–1.6s). */
const DEFAULT_DURATION = 1.2;

/** V2-02 bounds for custom reveal distances (px). */
const MIN_Y = 40;
const MAX_Y = 120;

/** Trigger slightly before the element reaches the vertical centre. */
const START = 'top 60%';

interface RevealOptions {
  /** Leave current/previous viewport content visible during locale-only swaps. */
  suppressCurrentViewport?: boolean;
}

/** Returns `true` when the user prefers reduced motion. */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Parses a float attribute, falling back to `fallback` when invalid/empty. */
function parseFloatAttr(el: HTMLElement, attr: string, fallback: number): number {
  const raw = el.getAttribute(attr);
  if (raw === null || raw === '') return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** Keeps opt-in distances within the V2-02 visible-motion range. */
function clampRevealY(value: number): number {
  return Math.min(Math.max(value, MIN_Y), MAX_Y);
}

/**
 * Initialises scroll reveals for every `[data-reveal]` element in the
 * current document. Safe to call repeatedly (e.g. on every
 * `astro:page-load`); previous instances are cleaned up by the wrapping
 * `gsap.context()` in `main.ts`.
 */
export function initReveals(selector: string = REVEAL_SELECTOR, options: RevealOptions = {}): () => void {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (elements.length === 0) return () => undefined;

  // Reduced motion: leave everything visible, no ScrollTriggers created.
  if (prefersReducedMotion()) return () => undefined;

  const splitInstances: SplitText[] = [];
  const standardElements: HTMLElement[] = [];

  for (const el of elements) {
    if (options.suppressCurrentViewport) {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.6) continue;
    }

    const delay = parseFloatAttr(el, 'data-reveal-delay', 0);
    const y = clampRevealY(parseFloatAttr(el, 'data-reveal-y', DEFAULT_Y));
    const style = el.dataset.revealStyle;

    if (style === 'atelier-lines' || style === 'embroidered-words') {
      const type = style === 'atelier-lines' ? 'lines' : 'words';
      const split = new SplitText(el, {
        type,
        linesClass: 'reveal-mask-line',
        wordsClass: 'reveal-mask-word',
      });
      splitInstances.push(split);

      const targets = style === 'atelier-lines' ? split.lines : split.words;
      gsap.set(targets, {
        opacity: 0,
        yPercent: style === 'atelier-lines' ? 115 : 70,
        rotateX: style === 'atelier-lines' ? 12 : 0,
        clipPath: 'inset(0 0 100% 0)',
        transformOrigin: '50% 100%',
        willChange: 'transform, opacity',
      });
      gsap.set(targets, { overflow: 'hidden', display: style === 'atelier-lines' ? 'block' : 'inline-block' });

      ScrollTrigger.create({
        trigger: el,
        start: START,
        once: true,
        onEnter: () => {
          gsap.to(targets, {
            opacity: 1,
            yPercent: 0,
            rotateX: 0,
            clipPath: 'inset(0 0 0% 0)',
            duration: style === 'atelier-lines' ? 1.35 : 1.15,
            delay,
            ease: 'expo.out',
            stagger: style === 'atelier-lines' ? 0.16 : { each: 0.035, from: 'start' },
            clearProps: 'willChange',
          });
        },
      });
      continue;
    }

    // Anti-FOUC: hide via JS only (no SSR-hidden state). No-JS / reduced
    // motion users keep seeing the content.
    gsap.set(el, { opacity: 0, y });
    standardElements.push(el);
  }

  ScrollTrigger.batch(standardElements, {
    start: START,
    once: true,
    batchMax: 6,
    onEnter: (batch) => {
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: DEFAULT_DURATION,
        delay: (index, target) => parseFloatAttr(target as HTMLElement, 'data-reveal-delay', 0) + index * 0.045,
        ease: 'expo.out',
        stagger: 0.08,
      });
    },
  });

  return () => {
    splitInstances.forEach((split) => {
      split.revert();
    });
  };
}
