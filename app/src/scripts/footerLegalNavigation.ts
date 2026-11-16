import type {
  TransitionBeforePreparationEvent,
  TransitionBeforeSwapEvent,
} from 'astro:transitions/client';
import { gsap } from './gsap';

interface LegalArrival {
  href: string;
  signal?: AbortSignal;
  finished?: Promise<unknown>;
  cleanup?: () => void;
}

let arrival: LegalArrival | undefined;
let frame = 0;
let links: AbortController | undefined;

function cancelArrival(): void {
  arrival?.cleanup?.();
  arrival = undefined;
  cancelAnimationFrame(frame);
}

function resetTop(intent: LegalArrival): void {
  if (arrival === intent && !intent.signal?.aborted && location.href === intent.href) {
    window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
  }
}

function finishArrival(intent: LegalArrival): void {
  resetTop(intent);
  // Astro's swap is not the end of page-load/transition/font-driven scroll work.
  void Promise.allSettled([document.fonts.ready, intent.finished]).then(() => {
    if (arrival !== intent || intent.signal?.aborted) return;
    const settle = (): void => {
      if (arrival !== intent || intent.signal?.aborted) return;
      resetTop(intent);
      // The route's article translateY tween can still move the scroll anchor
      // after page-load. Wait for that existing tween, without changing it.
      const article = document.querySelector('.legal-notice');
      if (article && gsap.getTweensOf(article, true).length) {
        frame = requestAnimationFrame(settle);
        return;
      }
      frame = requestAnimationFrame(() => {
        resetTop(intent);
        if (arrival === intent) cancelArrival();
      });
    };
    frame = requestAnimationFrame(settle);
  });
}

document.addEventListener('astro:before-preparation', (event: TransitionBeforePreparationEvent) => {
  cancelArrival();
  if (
    event.navigationType !== 'traverse' &&
    event.sourceElement?.matches('.footer__legal-link') &&
    event.to.pathname === '/mentions_legales' &&
    !event.to.hash
  ) {
    const intent: LegalArrival = { href: event.to.href, signal: event.signal };
    arrival = intent;
    const onAbort = (): void => {
      if (arrival === intent) cancelArrival();
    };
    event.signal.addEventListener('abort', onAbort, { once: true });
    intent.cleanup = () => event.signal.removeEventListener('abort', onAbort);
  }
});

document.addEventListener('astro:before-swap', (event: TransitionBeforeSwapEvent) => {
  links?.abort();
  links = undefined;
  if (arrival?.signal === event.signal) {
    arrival.finished = Promise.allSettled([event.viewTransition.finished]);
  }
});
document.addEventListener('astro:after-swap', () => {
  if (arrival) resetTop(arrival);
});
document.addEventListener('astro:page-load', () => {
  if (arrival) finishArrival(arrival);
  links?.abort();
  links = new AbortController();
  const link = document.querySelector<HTMLAnchorElement>('.footer__legal-link');
  link?.addEventListener(
    'click',
    (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        (link.target && link.target !== '_self') ||
        link.hasAttribute('download') ||
        link.href !== location.href
      )
        return;

      event.preventDefault();
      cancelArrival();
      arrival = { href: link.href };
      finishArrival(arrival);
    },
    { signal: links.signal },
  );
});

// Never fight a user scroll while a navigation's final reset is pending.
document.addEventListener('wheel', cancelArrival, { passive: true });
document.addEventListener('touchstart', cancelArrival, { passive: true });
document.addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
    cancelArrival();
  }
});
