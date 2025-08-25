import { clamp, clamp01, gaussianRange } from './utils.js';

function mulberry32(seed){
  let t = seed >>> 0;
  return function(){
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// 正規分布系は utils に集約

export function generateFluorescentTimeline({
  version = 1,
  duration = 2.0,
  controlPoints,
  seed = 42,
  params = {}
}){
  const rnd = mulberry32(seed);
  const p = {
    baseGain: 0.85,
    spread: 0.20,
    gainPow: 1.25,
    midRange: [0.25, 0.65],
    peakRange: [0.95, 1.0],
    zeroRange: [0.00, 0.06],
    dtRangeMs: [50, 85],
    decayRate: 0.018,
    noise: 0.015,
    startTimeAbsRange: [0.96, 1.06],
    settleTimeRangeRel: [0.15, 0.35],
    pulseCountRange: [3, 8],
    pulseIntervalRange: [40, 120],
    pulseIntervalStdDev: 35,
    burstIntervalRange: [80, 180],
    burstIntervalStdDev: 50,
    pulseRiseMsRange: [8, 12],
    pulseHoldMsRange: [2, 4],
    pulseFallMsRange: [35, 45],
    pulseInterGapMsRange: [24, 70],
    pulsesPerBurstRange: [1, 3],
    burstGapMsRange: [60, 140],
    stableTimeAfterSettle: 0.5,
    settleBufferMs: 100,
    useSampleIdProfiles: true,
    rareLongTameProb: 0.06,
    rareLongTameMsRange: [600, 1800]
  };
  Object.assign(p, params);
  const gain = (x) => clamp01(p.baseGain + p.spread * Math.pow(1 - x, p.gainPow));
  const rBetween = (a,b)=> a + (b-a) * rnd();
  const ms = (m)=> m/1000;

  const peakWeights = new Map([[101, 0.90/0.95],[102,1.0],[103,0.88/0.95],[104,0.82/0.95]]);
  const midWeights  = new Map([[101, 0.24/0.36],[102,1.0],[103,0.12/0.36],[104,0.05/0.36]]);
  const zeroWeights = new Map([[101, 0.03/0.06],[102,1.0],[103,0.02/0.06],[104,0.01/0.06]]);
  function idWeight(id, phase){
    if (!p.useSampleIdProfiles) return 1.0;
    if (phase === 'peak') return peakWeights.get(id) ?? 1.0;
    if (phase === 'mid')  return midWeights.get(id)  ?? 1.0;
    if (phase === 'zero') return zeroWeights.get(id) ?? 1.0;
    return 1.0;
  }

  function energyShapeFactor(x, baseAmp){
    if (baseAmp < 0.28){
      const k = Math.min(1, Math.max(0, x / 0.5));
      return 1 - 0.75 * k;
    }
    return 1.0;
  }
  function liftHighTempFloor(y, baseAmp){
    if (baseAmp > 0.82) return Math.max(y, 0.62);
    if (baseAmp > 0.70) return Math.max(y, 0.50);
    return y;
  }

  const keyframesGen = [];
  keyframesGen.push({ t: 0.0, points: controlPoints.map(cp=>({ id: cp.id, y: 0.0 })) });

  const tStart = clamp(rBetween(p.startTimeAbsRange[0], p.startTimeAbsRange[1]), 0.05, Math.max(0.2, duration - 0.2));
  const settleTime = duration * rBetween(p.settleTimeRangeRel[0], p.settleTimeRangeRel[1]);
  const targetPulseCount = Math.floor(rBetween(p.pulseCountRange[0], p.pulseCountRange[1] + 1));

  let t = tStart;
  let cycle = 0;
  const settleBuffer = ms(p.settleBufferMs);
  const jitter = ()=> ms(rBetween(-10, 10));

  function addPulseAt(timeBase, baseAmp, cycleScale, isLast){
    const rise = ms(rBetween(p.pulseRiseMsRange[0], p.pulseRiseMsRange[1]));
    const hold = ms(rBetween(p.pulseHoldMsRange[0], p.pulseHoldMsRange[1]));
    const fall = ms(rBetween(p.pulseFallMsRange[0], p.pulseFallMsRange[1]));
    const t0 = timeBase; const t1 = t0 + rise; const t2 = t1 + hold; const t3 = t2 + fall;
    // 時間制約でこれ以降パルスを入れられない場合も「最後」として扱う。
    // ここでは「次パルスを最短で入れるのに必要な時間」を考慮して判定する。
    const minNextPulseCoreMs = (p.pulseRiseMsRange[0] + p.pulseHoldMsRange[0] + p.pulseFallMsRange[0]);
    const minNextIntervalMs  = (p.pulseIntervalRange ? p.pulseIntervalRange[0] : 0);
    const maxJitterMs = 10; // jitter() は ±10ms
    const minNextTotal = ms(minNextPulseCoreMs + minNextIntervalMs + maxJitterMs);
    const isTimeBoundLast = (t3 + minNextTotal + settleBuffer) >= duration;
    const treatAsLast = isLast || isTimeBoundLast;
    const yMid = clamp01(baseAmp * (0.35 + 0.25 * rnd()));
    const mkPoints = (amp, phase)=> controlPoints.map(cp=>{
      const wId = idWeight(cp.id, phase);
      const shaped = (amp) * cycleScale * wId * gain(cp.x) * energyShapeFactor(cp.x, amp);
      let y = clamp01(shaped);
      y = liftHighTempFloor(y, amp);
      return { id: cp.id, y };
    });
    keyframesGen.push({ t: t1, points: mkPoints(yMid, 'mid') });
    if (treatAsLast){
      // 最後のパルスはピーク1.0固定、かつその後も暗くしない
      const ones = controlPoints.map(cp=>({ id: cp.id, y: 1.0 }));
      keyframesGen.push({ t: t2, points: ones });
      keyframesGen.push({ t: t3, points: ones });
    } else {
      keyframesGen.push({ t: t2, points: mkPoints(baseAmp, 'peak') });
      const yZeroBase = rBetween(p.zeroRange[0], p.zeroRange[1]);
      const zeroPts = controlPoints.map(cp=>{
        const zMul = idWeight(cp.id, 'zero');
        const shaped = yZeroBase * cycleScale * zMul * energyShapeFactor(cp.x, yZeroBase);
        let y = clamp01(shaped);
        return { id: cp.id, y };
      });
      keyframesGen.push({ t: t3, points: zeroPts });
    }
    return t3;
  }

  let pulseCount = 0;
  while (pulseCount < targetPulseCount && t + settleBuffer < duration){
    const decay = Math.max(0.6, 1 - 0.018 * cycle);
    const cycleScale = 0.90 + 0.20 * rnd();
    const nPulses = Math.max(1, Math.floor(rBetween(1, 3 + 1)));
    for (let i=0;i<nPulses;i++){
      const isLastPulse = (pulseCount + i + 1) >= targetPulseCount;
      const peakAmp = isLastPulse ? 1.0 : (rBetween(0.95, 1.0) * decay);
      const tEnd = addPulseAt(t, peakAmp, cycleScale, isLastPulse);
      const pulseInterval = gaussianRange(80, 35, 40, 120, rnd);
      t = tEnd + ms(pulseInterval) + jitter();
      if (t + settleBuffer >= duration) break;
      pulseCount++;
    }
    const burstInterval = gaussianRange(120, 50, 80, 180, rnd);
    t += ms(burstInterval) + jitter();
    cycle++;
  }

  const finalDuration = t + p.stableTimeAfterSettle;
  const onesTail = controlPoints.map(cp=>({ id: cp.id, y: 1.0 }));
  keyframesGen.push({ t: finalDuration, points: onesTail });
  return { version, duration: finalDuration, controlPoints, keyframes: keyframesGen };
}


