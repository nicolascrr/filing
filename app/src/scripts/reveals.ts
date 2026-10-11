/**
 * Reveal contract (SSR content is never hidden by CSS):
 * data-reveal-group: one sequence for a composition (optional).
 * data-reveal-picto / data-reveal-title / data-reveal-description: group parts.
 * data-reveal and data-split remain supported, including both legacy text styles.
 * data-reveal-start="top 80%", data-reveal-y and data-reveal-delay override defaults.
 * Timeline owns its pin and is never enrolled here. Linked text is not split,
 * preserving its interactive semantics. Call the returned cleanup before swap.
 */
import { gsap, SplitText } from './gsap';

export const REVEAL_SELECTOR = '[data-reveal], [data-split], [data-reveal-group]';
export interface RevealOptions {
  suppressCurrentViewport?: boolean;
}

function numberAttribute(el: HTMLElement, name: string, fallback: number): number {
  const value = Number.parseFloat(el.getAttribute(name) ?? '');
  return Number.isFinite(value) ? value : fallback;
}

export function initReveals(selector = REVEAL_SELECTOR, options: RevealOptions = {}): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => undefined;
  const splits: SplitText[] = [];
  const context = gsap.context(() => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const roots = candidates.filter(
      (el) =>
        !el.closest('[data-timeline]') &&
        !candidates.some((parent) => parent !== el && parent.contains(el)),
    );
    for (const root of roots) {
      if (options.suppressCurrentViewport && root.getBoundingClientRect().top < window.innerHeight)
        continue;
      const sequence = gsap.timeline({
        defaults: { ease: 'power3.out' },
        delay: Math.max(0, numberAttribute(root, 'data-reveal-delay', 0)),
        scrollTrigger: {
          trigger: root,
          start: root.dataset.revealStart || 'top 78%',
          once: true,
        },
      });
      const parts = Array.from(
        root.querySelectorAll<HTMLElement>(
          '[data-reveal-picto], [data-reveal-title], [data-reveal-description], [data-reveal], [data-split]',
        ),
      ).filter((part, _, all) => !all.some((parent) => parent !== part && parent.contains(part)));
      const targets = parts.length ? parts : [root];
      targets.forEach((el) => {
        const picto = el.hasAttribute('data-reveal-picto');
        const title =
          el.hasAttribute('data-reveal-title') ||
          el.hasAttribute('data-split') ||
          /^H[1-6]$/.test(el.tagName);
        const text =
          el.hasAttribute('data-reveal-description') ||
          el.dataset.revealStyle === 'atelier-lines' ||
          el.dataset.revealStyle === 'embroidered-words' ||
          el.tagName === 'P';
        const offset = picto ? 0 : title ? 0.1 : 0.2;
        if (text && !el.querySelector('a, button, input')) {
          const split = SplitText.create(el, {
            type: 'lines',
            mask: 'lines',
            autoSplit: true,
            linesClass: 'reveal-line',
            aria: 'none',
            onSplit(self) {
              const tween = gsap.from(self.lines, {
                yPercent: 110,
                opacity: 0,
                duration: 1.2,
                ease: 'power3.out',
                stagger: Math.min(0.08, 0.4 / Math.max(1, self.lines.length - 1)),
              });
              sequence.add(tween, offset);
              return tween;
            },
          });
          splits.push(split);
        } else {
          sequence.from(
            el,
            {
              opacity: 0,
              y: Math.min(120, Math.max(40, numberAttribute(el, 'data-reveal-y', title ? 56 : 40))),
              rotation: picto ? -3 : 0,
              duration: picto ? 0.9 : title ? 1.1 : 1.2,
            },
            offset,
          );
        }
      });
    }
  });
  return () => {
    context.revert();
    splits.forEach((split) => split.revert());
  };
}
