// Audio controller module for fluorescent simulator
// Exports a factory that encapsulates WebAudio/HTMLAudio handling and
// derives dynamics from a provided getCurrentCurveValue callback.

export function createAudioController({ getCurrentCurveValue }){
  // WebAudio state
  let audioCtx = null;
  let flashBuffer = null;
  let audioLoaded = false;
  let htmlAudio = null; // fallback
  let audioInitialized = false;

  // Hum nodes/state
  let humGain = null;
  let humOsc1 = null;
  let humOsc2 = null;
  let isHumRunning = false;

  const HUM_BASE_GAIN = 0.025;
  let humAvgEma = 0.0;
  const HUM_EMA_ALPHA = 0.2;

  async function ensureAudio(){
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      if (!audioLoaded){
        const isFile = location.protocol === 'file:';
        if (!isFile){
          try {
            const res = await fetch('flash.wav');
            if (!res.ok) throw new Error('fetch failed');
            const arr = await res.arrayBuffer();
            flashBuffer = await audioCtx.decodeAudioData(arr);
            audioLoaded = true;
          } catch {}
        }
        if (!audioLoaded){
          if (!htmlAudio){
            htmlAudio = new Audio('flash.wav');
            htmlAudio.preload = 'auto';
          }
        }
      }
    } catch {}
  }

  function playFlash(){
    const rate = 0.9 + Math.random()*0.20;
    const offset = Math.random() * 0.02;
    if (audioCtx && flashBuffer){
      const src = audioCtx.createBufferSource();
      src.buffer = flashBuffer;
      try { src.detune.value = (Math.random()*200 - 100); } catch {}
      try { src.playbackRate.value = rate; } catch {}
      src.connect(audioCtx.destination);
      try { src.start(0, offset); } catch {}
      return;
    }
    if (htmlAudio){
      try {
        const a = htmlAudio.cloneNode(true);
        try { a.preservesPitch = false; } catch {}
        try { a.mozPreservesPitch = false; } catch {}
        try { a.webkitPreservesPitch = false; } catch {}
        a.playbackRate = rate;
        try { a.currentTime = offset; } catch {}
        a.play().catch(()=>{});
      } catch {}
    }
  }

  function computeMaxCurveValue(){
    let maxY = 0;
    const S = 32;
    for (let i=0;i<S;i++){
      const x = i/(S-1);
      const y = getCurrentCurveValue(x);
      if (y > maxY) maxY = y;
    }
    return maxY;
  }
  function computeAvgCurveValue(){
    let sumY = 0;
    const S = 32;
    for (let i=0;i<S;i++){
      const x = i/(S-1);
      sumY += getCurrentCurveValue(x);
    }
    return sumY / S;
  }

  function updateHumDynamics(){
    if (!audioCtx || !humGain) return;
    const avg = computeAvgCurveValue();
    humAvgEma = HUM_EMA_ALPHA * avg + (1 - HUM_EMA_ALPHA) * humAvgEma;
    const target = Math.max(0, Math.min(1, 1 - humAvgEma)) * HUM_BASE_GAIN;
    try { humGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.05); } catch {}
  }

  let wasAboveFlash = false;
  async function checkFlash(){
    const maxY = computeMaxCurveValue();
    const above = maxY > 0.7;
    if (!wasAboveFlash && above){
      await ensureAudio();
      playFlash();
    }
    wasAboveFlash = above;
  }

  async function startHum(){
    await ensureAudio();
    if (!audioCtx) return;
    if (isHumRunning) return;
    humGain = audioCtx.createGain();
    humGain.gain.value = HUM_BASE_GAIN;
    humGain.connect(audioCtx.destination);
    humOsc1 = audioCtx.createOscillator();
    humOsc1.type = 'sine';
    humOsc1.frequency.value = 100;
    humOsc1.connect(humGain);
    humOsc2 = audioCtx.createOscillator();
    humOsc2.type = 'sine';
    humOsc2.frequency.value = 200;
    humOsc2.connect(humGain);
    try { humOsc1.start(); } catch {}
    try { humOsc2.start(); } catch {}
    isHumRunning = true;
  }
  function stopHum(){
    if (!audioCtx) return;
    if (!isHumRunning) return;
    try {
      const now = audioCtx.currentTime;
      humGain.gain.setTargetAtTime(0.0, now, 0.15);
    } catch {}
    const toStop = [humOsc1, humOsc2];
    setTimeout(()=>{
      for (const n of toStop){ try { n && n.stop(); } catch {} }
      humOsc1 = humOsc2 = null;
      if (humGain){ try { humGain.disconnect(); } catch {} humGain = null; }
      isHumRunning = false;
    }, 400);
  }

  function initAudioOnGesture(){
    if (audioInitialized) return;
    audioInitialized = true;
    ensureAudio();
  }

  return {
    ensureAudio,
    playFlash,
    updateHumDynamics,
    checkFlash,
    startHum,
    stopHum,
    initAudioOnGesture,
  };
}


