/** One gesture session per viewer. Pinch/pan can never turn into a slide swipe. */
export function galleryZoom(
  stage: HTMLElement,
  intent: () => void,
  swipe: (delta: number) => void,
) {
  const image = stage.querySelector<HTMLImageElement>('img')!;
  const controller = new AbortController();
  const clickScale = 2.5;
  const maxScale = clickScale;
  const points = new Map<number, { x: number; y: number }>();
  let scale = 1,
    x = 0,
    y = 0;
  let start: { x: number; y: number; time: number } | undefined;
  let blocked = false;
  let multi = false;
  let dragged = false;
  let lastTap: number | undefined;
  let pinch:
    | { distance: number; scale: number; x: number; y: number; panX: number; panY: number }
    | undefined;
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
  function draw() {
    // offsetWidth/Height are the untransformed, contained image bounds.
    x = clamp(x, Math.max(0, (image.offsetWidth * scale - stage.clientWidth) / 2));
    y = clamp(y, Math.max(0, (image.offsetHeight * scale - stage.clientHeight) / 2));
    image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    stage.toggleAttribute('data-zoomed', scale > 1);
  }
  function zoom(next: number, clientX?: number, clientY?: number) {
    const previous = scale;
    scale = Math.max(1, Math.min(maxScale, next));
    if (scale > 1 && points.size) blocked = true;
    if (clientX !== undefined && clientY !== undefined) {
      const rect = stage.getBoundingClientRect();
      const px = clientX - rect.left - rect.width / 2;
      const py = clientY - rect.top - rect.height / 2;
      x = px - ((px - x) * scale) / previous;
      y = py - ((py - y) * scale) / previous;
    }
    if (scale === 1) x = y = 0;
    draw();
    if (scale > 1 && previous === 1) intent();
  }
  function clear() {
    const ids = [...points.keys()];
    points.clear();
    for (const id of ids) {
      if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
    }
    pinch = undefined;
    start = undefined;
    blocked = false;
    multi = false;
    dragged = false;
  }
  const options = { signal: controller.signal };
  stage.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0) return;
      stage.setPointerCapture(event.pointerId);
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (points.size === 1) {
        start = { x: event.clientX, y: event.clientY, time: performance.now() };
        blocked = scale > 1;
      } else {
        blocked = true;
        multi = true;
        lastTap = undefined;
        const [a, b] = [...points.values()];
        pinch = {
          distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
          scale,
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          panX: x,
          panY: y,
        };
      }
    },
    options,
  );
  stage.addEventListener(
    'pointermove',
    (event) => {
      const previous = points.get(event.pointerId);
      if (!previous) return;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 8)
        dragged = true;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (points.size >= 2 && pinch) {
        const [a, b] = [...points.values()];
        const midX = (a.x + b.x) / 2,
          midY = (a.y + b.y) / 2;
        const rect = stage.getBoundingClientRect();
        const next = Math.max(
          1,
          Math.min(maxScale, (pinch.scale * Math.hypot(b.x - a.x, b.y - a.y)) / pinch.distance),
        );
        x =
          midX -
          rect.left -
          rect.width / 2 -
          ((pinch.x - rect.left - rect.width / 2 - pinch.panX) * next) / pinch.scale;
        y =
          midY -
          rect.top -
          rect.height / 2 -
          ((pinch.y - rect.top - rect.height / 2 - pinch.panY) * next) / pinch.scale;
        zoom(next);
      } else if (scale > 1) {
        x += event.clientX - previous.x;
        y += event.clientY - previous.y;
        draw();
      }
    },
    options,
  );
  stage.addEventListener(
    'pointerup',
    (event) => {
      if (!points.has(event.pointerId)) return;
      points.delete(event.pointerId);
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      if (points.size) {
        pinch = undefined;
        return;
      }
      if (start) {
        const dx = event.clientX - start.x,
          dy = event.clientY - start.y;
        const tap = Math.hypot(dx, dy) < 8 && performance.now() - start.time < 350;
        if (tap && !multi && !dragged) {
          if (
            event.pointerType === 'mouse' ||
            (lastTap !== undefined && performance.now() - lastTap < 300)
          ) {
            const next = scale > 1 ? 1 : clickScale;
            zoom(next, event.clientX, event.clientY);
            lastTap = undefined;
          } else lastTap = performance.now();
        } else if (!blocked && scale === 1 && Math.abs(dx) > 60 && Math.abs(dy) < 80) {
          swipe(dx < 0 ? 1 : -1);
        }
      }
      clear();
    },
    options,
  );
  stage.addEventListener(
    'pointercancel',
    () => {
      clear();
      lastTap = undefined;
    },
    options,
  );
  stage.addEventListener(
    'lostpointercapture',
    (event) => {
      if (points.has(event.pointerId)) {
        clear();
        lastTap = undefined;
      }
    },
    options,
  );
  stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
      zoom(scale * Math.exp(-delta * 0.002), event.clientX, event.clientY);
    },
    { ...options, passive: false },
  );
  const resize = new ResizeObserver(draw);
  resize.observe(stage);
  image.addEventListener('load', draw, options);
  draw();
  return {
    reset() {
      clear();
      lastTap = undefined;
      zoom(1);
    },
    key(key: string) {
      if (key === '+' || key === '=') zoom(scale + 0.5);
      else if (key === '-') zoom(scale - 0.5);
      else if (key === '0') {
        lastTap = undefined;
        zoom(1);
      } else if (scale > 1 && key.startsWith('Arrow')) {
        x += key === 'ArrowLeft' ? 50 : key === 'ArrowRight' ? -50 : 0;
        y += key === 'ArrowUp' ? 50 : key === 'ArrowDown' ? -50 : 0;
        draw();
      } else return false;
      return true;
    },
    destroy() {
      clear();
      controller.abort();
      resize.disconnect();
    },
  };
}
