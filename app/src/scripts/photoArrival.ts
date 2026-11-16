// Historical atelier gesture. Controllers own grouping, triggering and cleanup.
export function photoArrival(
  index: number,
  desktop: boolean,
): {
  from: gsap.TweenVars;
  to: gsap.TweenVars;
} {
  const direction = index % 2 === 0 ? 1 : -1;
  const movement = [
    { x: 20, y: 12, duration: 1.6, scale: 0.98 },
    { x: 12, y: -22, duration: 1.5, scale: 0.987 },
    { x: 24, y: 16, duration: 1.4, scale: 0.975 },
  ][index % 3];
  return {
    from: {
      autoAlpha: 0,
      x: (frameIndex: number) =>
        direction * (frameIndex % 2 === 0 ? 1 : -1) * (desktop ? movement.x : movement.x * 0.6),
      y: (frameIndex: number) =>
        (frameIndex % 2 === 0 ? 1 : -0.65) * (desktop ? movement.y : movement.y * 0.7),
      scale: (frameIndex: number) => movement.scale + (frameIndex % 2) * 0.006,
    },
    to: {
      autoAlpha: 1,
      x: 0,
      y: 0,
      scale: 1,
      duration: movement.duration,
      stagger: { each: 0.11, from: index % 2 === 0 ? 'start' : 'end' },
      ease: 'power2.out',
      clearProps: 'opacity,visibility,transform',
    },
  };
}
