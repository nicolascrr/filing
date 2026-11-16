/** Only the above-fold hero participates; neither full MP4 nor below-fold assets. */
type HeroMedia = HTMLImageElement | HTMLVideoElement;

export interface PreparedHero {
  readonly ready: boolean;
  commit(): void;
  dispose(): void;
}

function showFallback(root: ParentNode): void {
  const image = root.querySelector<HTMLImageElement>('[data-hero-fallback]');
  if (image?.dataset.src) image.src = image.dataset.src;
  root
    .querySelector<HTMLVideoElement>('video[data-hero-media]')
    ?.setAttribute('data-media-failed', 'true');
}

/** A detached navigation document is inert: decode in the active document. */
export async function prepareHero(
  incoming: Document,
  signal: AbortSignal,
): Promise<PreparedHero> {
  const original = incoming.querySelector<HeroMedia>('[data-hero-media]');
  if (!original || signal.aborted) return { ready: !signal.aborted, commit() {}, dispose() {} };
  const staged = incoming !== document;
  const media = staged ? document.importNode(original, true) : original;
  let committed = false;
  let disposed = false;
  let firstFrame: HTMLCanvasElement | null = null;
  let cancelWait = (): void => {};
  const release = (): void => {
    if (disposed) return;
    disposed = true;
    cancelWait();
    signal.removeEventListener('abort', release);
    if (staged && !committed) {
      firstFrame?.remove();
      firstFrame = null;
      media.remove();
      if (media instanceof HTMLVideoElement) {
        media.pause();
        media.removeAttribute('src');
        media.querySelectorAll('source').forEach((source) => source.remove());
        media.load();
      } else {
        media.removeAttribute('srcset');
        media.removeAttribute('src');
      }
    }
  };
  signal.addEventListener('abort', release, { once: true });

  if (staged && media instanceof HTMLVideoElement) {
    // Stay in the active document until swap. Reuse this *same* decoded node,
    // rather than priming a URL and starting a second decoder after navigation.
    media.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;opacity:0.001;z-index:-1;pointer-events:none';
    document.body.append(media);
  }

  const ready = await new Promise<boolean>((resolve) => {
    let finished = false;
    let videoFrame = 0;
    let paintTimer = 0;
    const listeners = new AbortController();
    const finish = (success: boolean): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      clearTimeout(paintTimer);
      if (media instanceof HTMLVideoElement && videoFrame) {
        media.cancelVideoFrameCallback(videoFrame);
      }
      listeners.abort();
      resolve(success);
    };
    const timeout = window.setTimeout(() => finish(false), 8000);
    cancelWait = () => finish(false);
    media.addEventListener('error', () => finish(false), { signal: listeners.signal });

    if (media instanceof HTMLImageElement) {
      // importNode into the live document resolves responsive currentSrc against
      // the actual viewport/DPR. decode() includes image load and pixel decode.
      void media.decode().then(() => finish(media.naturalWidth > 0), () => finish(false));
      return;
    }

    media.muted = true;
    media.pause();
    media.preload = 'auto';
    let checking = false;
    const check = (): void => {
      if (
        checking ||
        media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        !media.videoWidth ||
        !media.videoHeight ||
        media.seeking
      ) {
        return;
      }
      if (media.currentTime !== 0) {
        media.currentTime = 0;
        return;
      }
      checking = true;
      // Materialise the actual decoded first frame, not a photograph or an
      // assumption that two RAFs prove video composition. This bitmap is the
      // first presented visual even when the paused video isn't composited yet.
      const canvas = document.createElement('canvas');
      canvas.width = media.videoWidth;
      canvas.height = media.videoHeight;
      canvas.className = 'hero__first-frame';
      canvas.setAttribute('aria-hidden', 'true');
      const context = canvas.getContext('2d');
      if (!context) {
        finish(false);
        return;
      }
      try {
        context.drawImage(media, 0, 0);
      } catch {
        // An unavailable decoded bitmap is an explicit media failure.
        finish(false);
        return;
      }
      firstFrame = canvas;
      const painted = (method: string): void => {
        media.dataset.frameReadiness = method;
        finish(true);
      };
      // rVFC is additional compositor evidence, never a dependency for paused
      // or initially hidden video. The canvas above supplies the visible frame.
      if (typeof media.requestVideoFrameCallback === 'function') {
        videoFrame = media.requestVideoFrameCallback(() => painted('video-frame-callback'));
        paintTimer = window.setTimeout(() => painted('decoded-first-frame-canvas'), 200);
      } else painted('decoded-first-frame-canvas');
    };
    media.addEventListener('loadeddata', check, { signal: listeners.signal });
    media.addEventListener('canplay', check, { signal: listeners.signal });
    media.addEventListener('seeked', check, { signal: listeners.signal });
    check();
    if (media.readyState === HTMLMediaElement.HAVE_NOTHING) media.load();
  });

  if (!disposed && !signal.aborted) {
    if (ready) {
      media.dataset.mediaReady = 'true';
      media.removeAttribute('data-media-failed');
    } else {
      media.dataset.mediaFailed = 'true';
      showFallback(incoming);
    }
  }

  return {
    ready,
    commit(): void {
      if (disposed || signal.aborted) return;
      committed = true;
      if (staged) {
        // Called synchronously just after Astro swaps. Never adopt the decoded
        // video into an inert document, which can reset its media state.
        media.style.cssText = original.style.cssText;
        document.querySelector('[data-hero-media]')?.replaceWith(media);
      }
      if (ready && firstFrame) media.after(firstFrame);
      if (ready) document.dispatchEvent(new Event('filing:hero-ready'));
      release();
    },
    dispose: release,
  };
}

/** Runs at module evaluation, not window.load (which can wait on other media). */
export function gateInitialHero(): void {
  if (document.documentElement.dataset.heroGate !== 'pending') return;
  const controller = new AbortController();
  const cancel = (): void => controller.abort();
  document.addEventListener('astro:before-preparation', cancel, { once: true });
  void prepareHero(document, controller.signal).then((prepared) => {
    document.removeEventListener('astro:before-preparation', cancel);
    if (!controller.signal.aborted) {
      prepared.commit();
      document.documentElement.dataset.heroGate = prepared.ready ? 'ready' : 'fallback';
      document.dispatchEvent(new Event('filing:hero-gate-open'));
    }
  });
}
