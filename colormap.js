import { lerp, smoothstep } from './utils.js';

export function colorTemperature(t) {
  const phase1 = smoothstep(0.0, 0.3, t);
  const phase2 = smoothstep(0.3, 0.6, t);
  const phase3 = smoothstep(0.6, 0.8, t);
  const phase4 = smoothstep(0.8, 1.0, t);
  const red   = lerp(30, 80, phase1) + lerp(0, 175, phase2) + lerp(0, 0, phase3) + lerp(0, 0, phase4);
  const green = lerp(30, 20, phase1) + lerp(0, 100, phase2) + lerp(0, 135, phase3) + lerp(0, 255, phase4);
  const blue  = lerp(30, 20, phase1) + lerp(0, 0, phase2) + lerp(0, 0, phase3) + lerp(0, 255, phase4);
  return [red, green, blue, 1.0];
}


