import test from 'node:test';
import assert from 'node:assert/strict';
import { galleryZoom } from '../src/scripts/galleryZoom.ts';

class FakeElement {
  listeners = new Map();
  attributes = new Set();
  style = {};
  captures = new Set();
  clientWidth = 400;
  clientHeight = 300;
  offsetWidth = 400;
  offsetHeight = 300;

  constructor(image) {
    this.image = image;
  }
  querySelector() {
    return this.image;
  }
  addEventListener(type, callback, options = {}) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({ callback, signal: options.signal });
  }
  dispatch(type, properties = {}) {
    const event = {
      type,
      button: 0,
      pointerId: 1,
      pointerType: 'touch',
      clientX: 200,
      clientY: 150,
      deltaY: 0,
      deltaMode: 0,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...properties,
    };
    for (const { callback, signal } of this.listeners.get(type) ?? []) {
      if (!signal?.aborted) callback(event);
    }
    return event;
  }
  setPointerCapture(id) {
    this.captures.add(id);
  }
  hasPointerCapture(id) {
    return this.captures.has(id);
  }
  releasePointerCapture(id) {
    this.captures.delete(id);
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 400, height: 300 };
  }
  toggleAttribute(name, enabled) {
    if (enabled) this.attributes.add(name);
    else this.attributes.delete(name);
  }
  hasAttribute(name) {
    return this.attributes.has(name);
  }
}

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

function harness() {
  globalThis.ResizeObserver = FakeResizeObserver;
  let now = 100;
  const originalNow = performance.now;
  performance.now = () => now;
  const image = new FakeElement();
  const stage = new FakeElement(image);
  const intents = [];
  const swipes = [];
  const zoom = galleryZoom(
    stage,
    () => intents.push('hd-intent'),
    (delta) => swipes.push(delta),
  );
  return {
    image,
    stage,
    zoom,
    intents,
    swipes,
    setTime(value) {
      now = value;
    },
    restore() {
      performance.now = originalNow;
      zoom.destroy();
    },
    pointer(type, id, x, y, pointerType = 'touch') {
      return stage.dispatch(type, { pointerId: id, clientX: x, clientY: y, pointerType });
    },
  };
}

test('mouse click toggles between 1× and 2.5×', (t) => {
  const h = harness();
  t.after(h.restore);
  h.pointer('pointerdown', 1, 200, 150, 'mouse');
  h.pointer('pointerup', 1, 200, 150, 'mouse');
  assert.match(h.image.style.transform, /scale\(2\.5\)/);
  assert.deepEqual(h.intents, ['hd-intent']);
  h.setTime(200);
  h.pointer('pointerdown', 1, 200, 150, 'mouse');
  h.pointer('pointerup', 1, 200, 150, 'mouse');
  assert.match(h.image.style.transform, /scale\(1\)/);
  assert.match(h.image.style.transform, /translate\(0px, 0px\)/);
  assert.equal(h.stage.hasAttribute('data-zoomed'), false);
  assert.equal(h.intents.length, 1);
});

test('7px movement remains a click; 8px excursion is a drag, and pan never advances click zoom', (t) => {
  const h = harness();
  t.after(h.restore);
  h.pointer('pointerdown', 1, 200, 150, 'mouse');
  h.pointer('pointermove', 1, 207, 150, 'mouse');
  h.pointer('pointerup', 1, 207, 150, 'mouse');
  assert.match(h.image.style.transform, /scale\(2\.5\)/, '7px remains below drag threshold');

  h.pointer('pointerdown', 1, 200, 150, 'mouse');
  h.pointer('pointermove', 1, 208, 150, 'mouse');
  h.pointer('pointerup', 1, 208, 150, 'mouse');
  assert.match(h.image.style.transform, /scale\(2\.5\)/, '8px is a drag, not a click-cycle step');
  h.zoom.reset();
  h.pointer('pointerdown', 1, 200, 150, 'mouse');
  h.pointer('pointerup', 1, 200, 150, 'mouse');

  h.pointer('pointerdown', 2, 200, 150, 'mouse');
  h.pointer('pointermove', 2, 220, 165, 'mouse');
  h.pointer('pointermove', 2, 200, 150, 'mouse');
  h.pointer('pointerup', 2, 200, 150, 'mouse');
  assert.match(h.image.style.transform, /translate\(0px, 0px\) scale\(2\.5\)/);
  h.pointer('pointerdown', 3, 200, 150, 'mouse');
  h.pointer('pointerup', 3, 200, 150, 'mouse');
  assert.match(
    h.image.style.transform,
    /scale\(1\)/,
    'pan does not change the two-level click cycle',
  );

  h.pointer('pointerdown', 4, 200, 150, 'mouse');
  h.pointer('pointermove', 4, 220, 165, 'mouse');
  h.pointer('pointermove', 4, 200, 150, 'mouse');
  h.pointer('pointerup', 4, 200, 150, 'mouse');
  assert.match(h.image.style.transform, /translate\(0px, 0px\) scale\(1\)/);
});

test('wheel zoom clamps at both bounds and only crossing initial zoom requests HD', (t) => {
  const h = harness();
  t.after(h.restore);
  const event = h.stage.dispatch('wheel', { deltaY: -10000, clientX: 350, clientY: 150 });
  assert.equal(event.defaultPrevented, true);
  assert.match(h.image.style.transform, /scale\(2\.5\)/);
  assert.deepEqual(h.intents, ['hd-intent']);
  h.stage.dispatch('wheel', { deltaY: 10000, clientX: 200, clientY: 150 });
  assert.match(h.image.style.transform, /scale\(1\)/);
  assert.equal(h.stage.hasAttribute('data-zoomed'), false);
  assert.equal(h.intents.length, 1);
});

test('pinch then pan and release never becomes a slide swipe', (t) => {
  const h = harness();
  t.after(h.restore);
  h.pointer('pointerdown', 1, 150, 150);
  h.pointer('pointerdown', 2, 250, 150);
  h.pointer('pointermove', 2, 350, 150);
  assert.match(h.image.style.transform, /scale\(2\)/);
  h.pointer('pointerup', 2, 350, 150);
  h.pointer('pointermove', 1, 180, 150);
  h.pointer('pointerup', 1, 180, 150);
  assert.deepEqual(h.swipes, []);
  assert.equal(h.intents.length, 1);
});

test('pinch clamps to the shared 2.5× maximum and requests HD only on first zoom-in', (t) => {
  const h = harness();
  t.after(h.restore);
  h.pointer('pointerdown', 1, 150, 150);
  h.pointer('pointerdown', 2, 250, 150);
  h.pointer('pointermove', 2, 850, 150);
  assert.match(h.image.style.transform, /scale\(2\.5\)/);
  h.pointer('pointermove', 2, 1050, 150);
  assert.match(h.image.style.transform, /scale\(2\.5\)/, 'pinch cannot exceed 2.5×');
  assert.deepEqual(h.intents, ['hd-intent']);
  h.pointer('pointerup', 2, 1050, 150);
  h.pointer('pointerup', 1, 150, 150);
  assert.deepEqual(h.swipes, [], 'pinch completion is never a slide swipe');
});

test('touch double-tap zooms while a single tap does not', (t) => {
  const h = harness();
  t.after(h.restore);
  h.pointer('pointerdown', 1, 200, 150);
  h.pointer('pointerup', 1, 200, 150);
  assert.match(h.image.style.transform, /scale\(1\)/);
  h.setTime(200);
  h.pointer('pointerdown', 1, 200, 150);
  h.pointer('pointerup', 1, 200, 150);
  assert.match(h.image.style.transform, /scale\(2\.5\)/);
  assert.equal(h.intents.length, 1);
});

test('pointercancel and lost capture clear gesture state; later initial-scale swipe still works', (t) => {
  const h = harness();
  t.after(h.restore);
  h.pointer('pointerdown', 1, 200, 150);
  h.pointer('pointercancel', 1);
  h.pointer('pointerup', 1, 100, 150);
  assert.deepEqual(h.swipes, []);
  h.pointer('pointerdown', 2, 200, 150);
  h.pointer('lostpointercapture', 2);
  h.pointer('pointerup', 2, 100, 150);
  assert.deepEqual(h.swipes, []);
  h.pointer('pointerdown', 3, 250, 150);
  h.pointer('pointermove', 3, 150, 150);
  h.pointer('pointerup', 3, 150, 150);
  assert.deepEqual(h.swipes, [1]);
});

test('cancel, lost capture, and reset clear tap history and pointer state', (t) => {
  const h = harness();
  t.after(h.restore);
  h.pointer('pointerdown', 1, 200, 150);
  h.pointer('pointerup', 1, 200, 150); // First tap only.
  h.setTime(150);
  h.pointer('pointerdown', 2, 200, 150);
  h.pointer('pointercancel', 2);
  h.setTime(160);
  h.pointer('pointerdown', 3, 200, 150);
  h.pointer('pointerup', 3, 200, 150);
  assert.match(h.image.style.transform, /scale\(1\)/, 'cancel breaks the double-tap pair');

  h.zoom.reset();
  h.setTime(180);
  h.pointer('pointerdown', 4, 200, 150);
  h.pointer('pointerup', 4, 200, 150);
  h.setTime(190);
  h.pointer('pointerdown', 5, 200, 150);
  h.pointer('lostpointercapture', 5);
  h.setTime(200);
  h.pointer('pointerdown', 6, 200, 150);
  h.pointer('pointerup', 6, 200, 150);
  assert.match(h.image.style.transform, /scale\(1\)/, 'lost capture breaks the double-tap pair');

  h.zoom.reset();
  h.setTime(220);
  h.pointer('pointerdown', 7, 200, 150);
  h.pointer('pointerup', 7, 200, 150);
  assert.match(
    h.image.style.transform,
    /scale\(1\)/,
    'explicit reset clears previous tap timestamp',
  );
});

test('explicit reset clears transform and keyboard zoom respects bounds', (t) => {
  const h = harness();
  t.after(h.restore);
  for (let i = 0; i < 10; i++) h.zoom.key('+');
  assert.match(h.image.style.transform, /scale\(2\.5\)/);
  assert.equal(h.zoom.key('ArrowLeft'), true);
  h.zoom.reset(); // Same reset operation used when the viewer navigates to another image.
  assert.match(h.image.style.transform, /translate\(0px, 0px\) scale\(1\)/);
  assert.equal(h.stage.hasAttribute('data-zoomed'), false);
  assert.equal(h.zoom.key('ArrowLeft'), false);
});
