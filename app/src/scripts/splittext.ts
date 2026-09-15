/**
 * splittext.ts — SplitText heading reveals (US-23)
 *
 * Finds elements carrying the `data-split` attribute and splits their text
 * into chars/words, then reveals them with a subtle staggered tween.
 *
 * Opt-in attributes (all optional):
 *   - `data-split`         — opt the heading into the SplitText reveal.
 *   - `data-split-stagger` — per-char stagger in seconds (default 0.04,
 *                             clamped to a restrained 0.03–0.06s range).
 *   - `data-split-y`       — initial translateY in px (default 40, clamped
 *                             to the V2-02 40–120px range).
 *
 * Design rules (per AGENTS.md / V2-02):
 *   - Elegant & clearly visible: chars rise + fade in with a smooth
 *     stagger, `expo.out` ease, ~1.3s duration, generous distance
 *     (40px). The user must SEE the motion and feel the craftsmanship.
 *   - Anti-FOUC: headings are fully visible in the SSR HTML. The initial
 *     hidden state is applied via `gsap.set` on the split chars at init
 *     time ONLY, so no-JS / reduced-motion users always see the heading.
 *   - Above-the-fold headings (e.g. hero titles) play immediately on init;
 *     below-the-fold headings are gated on a ScrollTrigger so they reveal
 *     when scrolled into view.
 *   - `prefers-reduced-motion`: skipped entirely — headings stay visible.
 *
 * Cleanup: like `initReveals`, this is meant to run inside a
 * `gsap.context()` (see `main.ts`). The context tracks the tweens and
 * ScrollTriggers; the returned cleanup explicitly reverts SplitText
 * instances so their original heading DOM is restored before a route swap.
 */
import { gsap, ScrollTrigger, SplitText } from './gsap';

/** Default CSS selector for SplitText targets. */
export const SPLIT_SELECTOR = '[data-split]';

/** Default per-char stagger (s) — smooth & visible (V2-02: 0.03–0.05). */
const DEFAULT_STAGGER = 0.04;

/** Default initial translateY (px) — generous distance (V2-02). */
const DEFAULT_Y = 40;

/** Default reveal duration (s) — slow & premium (V2-02: 1.0–1.6s). */
const DEFAULT_DURATION = 1.3;

/** V2-02 bounds for custom SplitText motion. */
const MIN_Y = 40;
const MAX_Y = 120;
const MIN_STAGGER = 0.03;
const MAX_STAGGER = 0.06;

/** Trigger slightly before the heading reaches the vertical centre. */
const START = 'top 60%';

interface SplitTextOptions {
  /** Keep already-visible headings untouched during locale-only swaps. */
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

/** Keeps opt-in values within the visible but restrained V2-02 range. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Initialises SplitText reveals for every `[data-split]` element in the
 * current document. Safe to call repeatedly (e.g. on every
 * `astro:page-load`); `main.ts` reverts both the wrapping GSAP context and
 * this function's returned SplitText cleanup before a subsequent init.
 */
export function initSplitText(selector: string = SPLIT_SELECTOR, options: SplitTextOptions = {}): () => void {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (elements.length === 0) return () => undefined;

  // Reduced motion: leave headings visible, no splitting, no tweens.
  if (prefersReducedMotion()) return () => undefined;

  const splits: SplitText[] = [];

  for (const el of elements) {
    if (options.suppressCurrentViewport) {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.6) continue;
    }

    const stagger = clamp(
      parseFloatAttr(el, 'data-split-stagger', DEFAULT_STAGGER),
      MIN_STAGGER,
      MAX_STAGGER,
    );
    const y = clamp(parseFloatAttr(el, 'data-split-y', DEFAULT_Y), MIN_Y, MAX_Y);

    // Split into chars (kept inside word wrappers so spacing is preserved).
    // SplitText honours the element's existing markup/whitespace.
    const split = new SplitText(el, {
      type: 'chars,words',
      wordsClass: 'split-word',
      charsClass: 'split-char',
    });
    splits.push(split);
    const chars = split.chars;

    // Anti-FOUC: hide the split chars via JS only. The original heading
    // was visible in SSR; only the freshly-created char spans are hidden.
    gsap.set(chars, { opacity: 0, y });

    const play = (): void => {
      gsap.to(chars, {
        opacity: 1,
        y: 0,
        duration: DEFAULT_DURATION,
        ease: 'expo.out',
        stagger,
      });
    };

    // Above-the-fold headings play immediately; below-the-fold headings
    // are gated on scroll for a refined reveal as the reader descends.
    const rect = el.getBoundingClientRect();
    const inView = rect.top < window.innerHeight * 0.6 && rect.bottom > 0;
    if (inView) {
      play();
    } else {
      ScrollTrigger.create({
        trigger: el,
        start: START,
        once: true,
        onEnter: play,
      });
    }
  }

  return () => {
    // SplitText owns generated character/word wrappers. GSAP contexts revert
    // tweens and triggers, but SplitText itself must restore the source DOM.
    splits.forEach((split) => split.revert());
  };
}
