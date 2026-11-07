export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
// Interpolasi eksponensial yang tidak tergantung frame rate.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}
export const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;
export const dampAngle = (a, b, lambda, dt) => lerpAngle(a, b, 1 - Math.exp(-lambda * dt));
