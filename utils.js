// Utility helpers shared across modules

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const lerp  = (a, b, t)   => a + (b - a) * t;

export function smoothstep(edge0, edge1, x){
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function deepCopyPoints(arr){
  return arr.map(p=>({id:p.id, x:p.x, y:p.y}));
}

export function getMargins(dpr){
  return { l: Math.floor(42*dpr), r: Math.floor(42*dpr), t: Math.floor(12*dpr), b: Math.floor(24*dpr) };
}

export function clamp01(v){
  return Math.max(0, Math.min(1, v));
}

// ガウス分布（正規分布）の乱数生成（Box-Muller変換）
export function gaussianRandom(mean, stdDev, rndFunc){
  let u1, u2;
  do {
    u1 = rndFunc();
    u2 = rndFunc();
  } while (u1 === 0); // u1が0の場合は再生成
  
  // Box-Muller変換
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z0 * stdDev;
}
 
// ガウス分布で範囲制限された乱数生成
export function gaussianRange(mean, stdDev, min, max, rndFunc){
  let result;
  do {
    result = gaussianRandom(mean, stdDev, rndFunc);
  } while (result < min || result > max);
  return result;
}