import { clamp, lerp, deepCopyPoints } from './utils.js';

export function createPlayer(){
  let duration = 2.0;
  let time = 0.0;
  let playing = false;
  let lastTS = 0;
  let keyframes = [];
  let peakScale = 1.0; // 1.0=デフォルト（左半分xのスケール）

  // ===== LUT support (left half only) =====
  const N_SAMPLES = 256;
  function evalHalfWithPoints(P, s){
    // s: 0..0.5
    s = clamp(s, 0, 0.5);
    if (!P || P.length === 0) return 0;
    if (P.length === 1) return clamp(P[0].y, 0, 1);
    const PP = P.map(p=>({x:p.x/0.5, y:p.y})).slice().sort((a,b)=>a.x-b.x);
    const u = (s / 0.5);
    let i = 0; while (i < PP.length - 1 && u > PP[i+1].x) i++; i = Math.max(0, Math.min(i, PP.length - 2));
    const p0 = PP[Math.max(0, i-1)], p1 = PP[i], p2 = PP[i+1], p3 = PP[Math.min(PP.length-1, i+2)];
    const span = (p2.x - p1.x) || 1e-6; const t = (u - p1.x) / span;
    const y0=p0.y,y1=p1.y,y2=p2.y,y3=p3.y;
    const a0 = -0.5*y0 + 1.5*y1 - 1.5*y2 + 0.5*y3;
    const a1 =  y0    - 2.5*y1 + 2.0*y2 - 0.5*y3;
    const a2 = -0.5*y0 + 0.5*y2;
    const a3 =  y1;
    const y = ((a0*t + a1)*t + a2)*t + a3;
    return clamp(y, 0, 1);
  }
  function makeLUT(P){
    const lut = new Float32Array(N_SAMPLES);
    for (let i=0;i<N_SAMPLES;i++){
      const s = (i/(N_SAMPLES-1))*0.5; // 左半分の距離
      lut[i] = evalHalfWithPoints(P, s);
    }
    return lut;
  }

  function sortKeyframes(){ keyframes.sort((a,b)=>a.t-b.t); }

  function findSpan(t){
    sortKeyframes();
    if (keyframes.length === 0) return { a:null, b:null, alpha:0 };
    if (t <= keyframes[0].t) return { a: keyframes[0], b: keyframes[0], alpha: 0 };
    if (t >= keyframes[keyframes.length-1].t) return { a: keyframes[keyframes.length-1], b: keyframes[keyframes.length-1], alpha: 0 };
    for (let i=0;i<keyframes.length-1;i++){
      const A = keyframes[i], B = keyframes[i+1];
      if (t >= A.t && t <= B.t){
        const alpha = (t - A.t) / Math.max(1e-6, (B.t - A.t));
        return { a: A, b: B, alpha };
      }
    }
    return { a: keyframes[0], b: keyframes[0], alpha: 0 };
  }

  function sampleLUT(lut, s){
    const N_SAMPLES = lut.length;
    const u = Math.max(0, Math.min(1, (s / 0.5))) * (N_SAMPLES-1);
    const i0 = Math.floor(u), i1 = Math.min(N_SAMPLES-1, i0+1);
    const a = u - i0;
    return lerp(lut[i0], lut[i1], a);
  }

  function getCurveValueAt(x){
    const s0 = x <= 0.5 ? x : 1 - x;
    const s = Math.max(0, Math.min(0.5, s0 * peakScale));
    if (keyframes.length === 0) return 0;
    if (keyframes.length === 1) return sampleLUT(keyframes[0].lut, s);
    const { a, b, alpha } = findSpan(time);
    if (a.id === b.id) return sampleLUT(a.lut, s);
    const ya = sampleLUT(a.lut, s);
    const yb = sampleLUT(b.lut, s);
    return lerp(ya, yb, alpha);
  }

  function tick(ts, onUpdate){
    if (!playing){ lastTS = ts; return; }
    const dt = (ts - lastTS) / 1000; lastTS = ts;
    time += dt;
    if (time > duration){ time = duration; playing = false; }
    onUpdate && onUpdate(time);
    requestAnimationFrame((t)=>tick(t, onUpdate));
  }

  return {
    setKeyframes(newKeyframes, newDuration){
      keyframes = newKeyframes;
      duration = newDuration ?? duration;
      time = 0;
    },
    setKeyframesFromSpec(spec, newDuration){
      // spec: Array<{t:number, pts:Array<{id:number, x:number, y:number}>}>
      const kfs = [];
      for (const { t, pts } of spec){
        const P = deepCopyPoints(pts);
        kfs.push({ id: t, t, points: P, lut: makeLUT(P) });
      }
      keyframes = kfs.sort((a,b)=>a.t-b.t);
      duration = newDuration ?? duration;
      time = 0;
    },
    setTime(t){ time = clamp(t, 0, duration); },
    getTime(){ return time; },
    getDuration(){ return duration; },
    reset(){ time = 0; },
    setPeakScale(k){ peakScale = k; },
    getCurveValueAt,
    play(onUpdate){ if (playing) return; playing = true; requestAnimationFrame((ts)=>{ lastTS = ts; requestAnimationFrame((t)=>tick(t, onUpdate)); }); },
    pause(){ playing = false; },
    isPlaying(){ return playing; }
  };
}


