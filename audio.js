// Audio controller module for fluorescent simulator
// Exports a factory that encapsulates WebAudio/HTMLAudio handling and
// derives dynamics from a provided getCurrentCurveValue callback.

class HumController {
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
    this.gain = null;
    this.osc1 = null;
    this.osc2 = null;
    this.isRunning = false;
    this.stopTimeout = null;
    this.baseGain = 0.025;
    this.avgEma = 0.0;
    this.emaAlpha = 0.2;
  }

  async start() {
    if (this.isRunning) {
      this.stop();
      await this._wait(100);
    }

    this._clearStopTimeout();
    this._cleanup();

    try {
      this.gain = this.audioCtx.createGain();
      this.gain.gain.value = this.baseGain;
      this.gain.connect(this.audioCtx.destination);

      this.osc1 = this._createOscillator(100);
      this.osc2 = this._createOscillator(200);

      const startTime = this.audioCtx.currentTime + 0.1;
      this.osc1.start(startTime);
      this.osc2.start(startTime);

      this.isRunning = true;
    } catch (error) {
      this._cleanup();
      this.isRunning = false;
      throw error;
    }
  }

  stop() {
    if (!this.isRunning) return;

    this._clearStopTimeout();
    
    try {
      const now = this.audioCtx.currentTime;
      this.gain.gain.setTargetAtTime(0.0, now, 0.15);
    } catch (error) {}

    this.stopTimeout = setTimeout(() => {
      this._cleanup();
      this.isRunning = false;
      this.stopTimeout = null;
    }, 400);
  }

  updateDynamics(getCurrentCurveValue) {
    if (!this.isRunning || !this.gain) return;

    const avg = this._computeAvgCurveValue(getCurrentCurveValue);
    this.avgEma = this.emaAlpha * avg + (1 - this.emaAlpha) * this.avgEma;
    const target = Math.max(0, Math.min(1, 1 - this.avgEma)) * this.baseGain;
    
    try {
      this.gain.gain.setTargetAtTime(target, this.audioCtx.currentTime, 0.05);
    } catch (error) {}
  }

  _createOscillator(frequency) {
    const osc = this.audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    osc.connect(this.gain);
    return osc;
  }

  _computeAvgCurveValue(getCurrentCurveValue) {
    let sumY = 0;
    const S = 32;
    for (let i = 0; i < S; i++) {
      const x = i / (S - 1);
      sumY += getCurrentCurveValue(x);
    }
    return sumY / S;
  }

  _cleanup() {
    try {
      if (this.gain) {
        this.gain.disconnect();
        this.gain = null;
      }
      if (this.osc1) {
        try { this.osc1.stop(); } catch (e) {}
        this.osc1 = null;
      }
      if (this.osc2) {
        try { this.osc2.stop(); } catch (e) {}
        this.osc2 = null;
      }
    } catch (error) {}
  }

  _clearStopTimeout() {
    if (this.stopTimeout) {
      clearTimeout(this.stopTimeout);
      this.stopTimeout = null;
    }
  }

  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getDebugInfo() {
    return {
      isRunning: this.isRunning,
      gain: !!this.gain,
      osc1: !!this.osc1,
      osc2: !!this.osc2,
      stopTimeout: !!this.stopTimeout
    };
  }
}

class FlashController {
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
    this.buffer = null;
    this.htmlAudio = null;
    this.isLoaded = false;
    this.wasAboveThreshold = false;
    this.threshold = 0.7;
  }

  async load() {
    if (this.isLoaded) return true;

    try {
      const isFile = location.protocol === 'file:';
      if (!isFile) {
        const response = await fetch('flash.wav');
        if (!response.ok) throw new Error('fetch failed');
        const arrayBuffer = await response.arrayBuffer();
        this.buffer = await this.audioCtx.decodeAudioData(arrayBuffer);
        this.isLoaded = true;
        return true;
      }
    } catch (error) {}

    if (!this.htmlAudio) {
      this.htmlAudio = new Audio('flash.wav');
      this.htmlAudio.preload = 'auto';
    }
    return true;
  }

  async play() {
    const rate = 0.9 + Math.random() * 0.20;
    const offset = Math.random() * 0.02;

    if (this.audioCtx && this.buffer) {
      this._playWebAudio(rate, offset);
    } else if (this.htmlAudio) {
      this._playHTMLAudio(rate, offset);
    }
  }

  _playWebAudio(rate, offset) {
    try {
      const source = this.audioCtx.createBufferSource();
      source.buffer = this.buffer;
      source.detune.value = (Math.random() * 200 - 100);
      source.playbackRate.value = rate;
      source.connect(this.audioCtx.destination);
      source.start(0, offset);
    } catch (error) {}
  }

  _playHTMLAudio(rate, offset) {
    try {
      const audio = this.htmlAudio.cloneNode(true);
      audio.preservesPitch = false;
      audio.mozPreservesPitch = false;
      audio.webkitPreservesPitch = false;
      audio.playbackRate = rate;
      audio.currentTime = offset;
      audio.play().catch(error => {});
    } catch (error) {}
  }

  async checkAndPlay(getCurrentCurveValue) {
    const maxY = this._computeMaxCurveValue(getCurrentCurveValue);
    const above = maxY > this.threshold;
    
    if (!this.wasAboveThreshold && above) {
      await this.play();
    }
    this.wasAboveThreshold = above;
  }

  _computeMaxCurveValue(getCurrentCurveValue) {
    let maxY = 0;
    const S = 32;
    for (let i = 0; i < S; i++) {
      const x = i / (S - 1);
      const y = getCurrentCurveValue(x);
      if (y > maxY) maxY = y;
    }
    return maxY;
  }

  getDebugInfo() {
    return {
      isLoaded: this.isLoaded,
      buffer: !!this.buffer,
      htmlAudio: !!this.htmlAudio,
      wasAboveThreshold: this.wasAboveThreshold
    };
  }
}

class AudioContextManager {
  constructor() {
    this.context = null;
    this.isInitialized = false;
  }

  async ensureContext() {
    try {
      if (!this.context || this.context.state === 'closed') {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
      }

      if (this.context.state === 'suspended') {
        await this.context.resume();
      }

      if (this.context.state !== 'running') {
        try {
          await this.context.resume();
          if (this.context.state !== 'running') {
            return false;
          }
        } catch (error) {
          return false;
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  getContext() {
    return this.context;
  }

  getDebugInfo() {
    return {
      contextExists: !!this.context,
      contextState: this.context?.state,
      isInitialized: this.isInitialized
    };
  }
}

export function createAudioController({ getCurrentCurveValue }) {
  const contextManager = new AudioContextManager();
  let humController = null;
  let flashController = null;

  async function ensureAudio() {
    const success = await contextManager.ensureContext();
    if (success && !flashController) {
      flashController = new FlashController(contextManager.getContext());
      await flashController.load();
    }
    return success;
  }

  async function startHum() {
    const audioReady = await ensureAudio();
    if (!audioReady) {
      return;
    }

    if (!humController) {
      humController = new HumController(contextManager.getContext());
    }

    await humController.start();
  }

  function stopHum() {
    if (humController) {
      humController.stop();
    }
  }

  function updateHumDynamics() {
    if (humController) {
      humController.updateDynamics(getCurrentCurveValue);
    }
  }

  async function checkFlash() {
    if (flashController) {
      await flashController.checkAndPlay(getCurrentCurveValue);
    }
  }

  function initAudioOnGesture() {
    if (contextManager.isInitialized) return;
    contextManager.isInitialized = true;
    ensureAudio();
  }

  return {
    ensureAudio,
    startHum,
    stopHum,
    updateHumDynamics,
    checkFlash,
    initAudioOnGesture,
    getDebugInfo: () => ({
      ...contextManager.getDebugInfo(),
      ...(humController ? humController.getDebugInfo() : { humController: false }),
      ...(flashController ? flashController.getDebugInfo() : { flashController: false })
    })
  };
}


