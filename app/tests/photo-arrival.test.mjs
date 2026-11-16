import test from 'node:test';
import assert from 'node:assert/strict';
import { photoArrival } from '../src/scripts/photoArrival.ts';

const movementCycle = [
  { x: 20, y: 12, duration: 1.6, scale: 0.98 },
  { x: 12, y: -22, duration: 1.5, scale: 0.987 },
  { x: 24, y: 16, duration: 1.4, scale: 0.975 },
];

test('historical arrival gesture is preserved across six indices and both breakpoints', () => {
  for (const desktop of [true, false]) {
    for (let index = 0; index < 6; index++) {
      const movement = movementCycle[index % movementCycle.length];
      const direction = index % 2 === 0 ? 1 : -1;
      const { from, to } = photoArrival(index, desktop);
      const xScale = desktop ? 1 : 0.6;
      const yScale = desktop ? 1 : 0.7;

      assert.equal(from.autoAlpha, 0, `index ${index}, desktop ${desktop}: starts hidden`);
      assert.equal(from.x(0), direction * xScale * movement.x);
      assert.equal(from.x(1), -direction * xScale * movement.x);
      assert.equal(from.y(0), movement.y * yScale);
      assert.ok(Math.abs(from.y(1) - -0.65 * movement.y * yScale) < 1e-10);
      assert.equal(from.scale(0), movement.scale);
      assert.equal(from.scale(1), movement.scale + 0.006);

      assert.equal(to.autoAlpha, 1);
      assert.equal(to.x, 0);
      assert.equal(to.y, 0);
      assert.equal(to.scale, 1);
      assert.equal(to.duration, movement.duration);
      assert.deepEqual(to.stagger, { each: 0.11, from: index % 2 === 0 ? 'start' : 'end' });
      assert.equal(to.ease, 'power2.out');
      assert.equal(to.clearProps, 'opacity,visibility,transform');
    }
  }
});
