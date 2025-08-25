import { createAudioController } from './audio.js';
import { clamp, deepCopyPoints, clamp01 } from './utils.js';
import { colorTemperature } from './colormap.js';
import { generateFluorescentTimeline } from './generator.js';
import { createPlayer } from './player.js';
// helpers moved to utils.js

// colormap は colormap.js に分離

const lamp = document.getElementById('lamp'); 
const panel = document.querySelector('.panel');
const powerSwitch = document.getElementById('powerSwitch');
const ratioSlider = document.getElementById('ratioSlider');
const ratioLabel = document.getElementById('ratioLabel');
const peakSlider = document.getElementById('peakSlider');
const peakLabel = document.getElementById('peakLabel');
 

// ===== Curve model（左半分のみ：0..0.5 → 0..1） =====
let points = [ { id: 1, x: 0.0, y: 0.0 }, { id: 2, x: 0.5, y: 0.0 } ];

// ===== Timeline / Keyframes =====
const player = createPlayer();
// ループ機能は廃止

let keyframes = [];
// 旧UI依存の選択状態は廃止
function initDefaultKeyframes(){
  const dur = 2.0;
  const spec = [
    { t: 0.0, pts: deepCopyPoints(points) },
    { t: dur, pts: deepCopyPoints(points) },
  ];
  player.setKeyframesFromSpec(spec, dur);
  syncTimeUI();
}

function getCurrentCurveValue(x){
  return player.getCurveValueAt(x);
}


// ===== Canvas sizing helpers =====
function fitCanvasToElement(canvas){
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  // アスペクト比が設定されていれば、それを優先して高さを計算
  const ratioAttr = canvas.getAttribute('data-aspect');
  const targetRatio = ratioAttr ? parseFloat(ratioAttr) : 16; // width:height → width/height
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(cssW / targetRatio));
  const needResize = canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr);
  if (needResize){
    canvas.width  = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
  }
  return { dpr, cssW, cssH };
}

// ===== Render: lamp =====
function renderLamp(){
  const { dpr } = fitCanvasToElement(lamp);
  const ctx = lamp.getContext('2d');
  const w = lamp.width, h = lamp.height;
  ctx.clearRect(0,0,w,h);

  ctx.fillStyle = '#000'; ctx.fillRect(0,0,w,h);

  // パディング・角丸などの複雑な余白処理を省略し、キャンバス全面を使用
  const adjustedX = 0;
  const adjustedY = 0;
  const adjustedWidth = w;
  const adjustedHeight = h;

  // オフスクリーンで描画
  const off = document.createElement('canvas');
  off.width = adjustedWidth; off.height = adjustedHeight;
  const octx = off.getContext('2d');
  const inner = octx.createImageData(adjustedWidth, adjustedHeight);
  const data = inner.data;

  for (let x = 0; x < adjustedWidth; x++) {
    const xNorm = x / (adjustedWidth - 1); // 0..1 左→右
    // 時間補完された値を使用（再生中でなくても）
    const tt = getCurrentCurveValue(xNorm);
    const [r0,g0,b0,a0] = colorTemperature(tt);
    const r = Math.round(clamp(r0, 0, 255));
    const g = Math.round(clamp(g0, 0, 255));
    const b = Math.round(clamp(b0, 0, 255));
    const a = Math.round(clamp(a0 * 255, 0, 255));
    for (let y = 0; y < adjustedHeight; y++){
      const idx = (y * adjustedWidth + x) * 4;
      data[idx+0]=r; data[idx+1]=g; data[idx+2]=b; data[idx+3]=a;
    }
  }
  octx.putImageData(inner, 0, 0);

  // そのまま描画（角丸クリップ等は省略）
  ctx.drawImage(off, adjustedX, adjustedY);
}


// ===== Audio (modular) =====
const audio = createAudioController({ getCurrentCurveValue });
// Initialize audio on first user gesture to satisfy autoplay policies
window.addEventListener('pointerdown', audio.initAudioOnGesture, { once: true });
window.addEventListener('keydown', (e)=>{ if (e.code === 'Space' || e.key === 'Enter') audio.initAudioOnGesture(); }, { once: true });

// ===== Time controls =====
function syncTimeUI(){
  // 最小UIのため表示更新は不要
  // 簡略UI: ランプのみ更新
  renderLamp();
  audio.checkFlash();
  audio.updateHumDynamics();
}

// Play/Pause
function setPlaying(v){
  if (v) {
    // 旧UIの選択解除は不要
    audio.startHum();
    player.play(()=>{ syncTimeUI(); });
  } else {
    player.pause();
    audio.stopHum();
  }
}


function setKeyframesFromSpec(spec, setDuration){
  player.setKeyframesFromSpec(spec, setDuration);
  points = deepCopyPoints(spec[0]?.pts ?? points);
  syncTimeUI();
  renderLamp();
}

// ===== Power switch behavior =====
function powerOn(){
  // 既存のジェネレータを利用して自動生成→読み込み→再生
  const cps = [
    { id: 101, x: 0.02 },
    { id: 102, x: 0.10 },
    { id: 103, x: 0.20 },
    { id: 104, x: 0.50 },
  ];
  const seed = (Date.now() & 0xffffffff) >>> 0;
  const timelineGen = generateFluorescentTimeline({ duration: player.getDuration(), controlPoints: cps, seed });
  const spec = timelineGen.keyframes.map(kf=>{
    const map = new Map(kf.points.map(p=>[p.id, p.y]));
    const pts = cps.map(cp=>({ id: cp.id, x: cp.x, y: clamp01(map.get(cp.id) ?? 0) }));
    return { t: kf.t, pts };
  });
  setKeyframesFromSpec(spec, timelineGen.duration);
  setPlaying(true);
}

function powerOff(){
  setPlaying(false);
  player.reset();
  syncTimeUI();
}

(function init(){
  initDefaultKeyframes();
  renderLamp();
  syncTimeUI();
  // リサイズに追従
  if (window.ResizeObserver){
    const ro = new ResizeObserver(()=>{ renderLamp(); });
    ro.observe(lamp);
    if (panel) ro.observe(panel);
  } else {
    window.addEventListener('resize', ()=>{ renderLamp(); });
  }
  // 縦横比スライダー
  if (ratioSlider && ratioLabel){
    const applyRatio = (v)=>{
      const ratio = Math.max(10, Math.min(32, Number(v)||16));
      ratioLabel.textContent = ratio+':1';
      // CSSのaspect-ratioは維持しつつ、描画のピクセル解像度も合わせるためdata属性で指示
      lamp.setAttribute('data-aspect', String(ratio));
      lamp.style.aspectRatio = ratio + ' / 1';
      renderLamp();
    };
    applyRatio(ratioSlider.value);
    ratioSlider.addEventListener('input', (e)=> applyRatio(e.target.value));
  }
  // 端ピーク位置スライダー（0.25〜4.0）
  if (peakSlider && peakLabel){
    const applyPeak = (v)=>{
      const k = Math.max(0.1, Math.min(1.0, Number(v)||1.0));
      // peakScale>1 で端寄り、<1 で中央寄りにしたいという要望に合わせて反転
      // s_eff = s0 / k  とする（k大→s小→端寄り）
      player.setPeakScale(1 / k);
      peakLabel.textContent = k.toFixed(2) + 'x';
      renderLamp();
    };
    applyPeak(peakSlider.value);
    peakSlider.addEventListener('input', (e)=> applyPeak(e.target.value));
  }
  if (powerSwitch){
    powerSwitch.addEventListener('change', ()=>{
      if (powerSwitch.checked) powerOn(); else powerOff();
    });
  }
})();


