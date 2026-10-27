// WebAudio로 합성하는 짧은 효과음 (외부 파일 없음)
let ctx = null;
let master = null;
let noiseBuf = null;
let volume = 0.55; // 설정의 효과음 볼륨(0..1)을 반영한 마스터 음량

// v: 0..1 (설정 화면)
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v)) * 0.7;
  if (master) master.gain.value = volume;
}

// 오디오가 처음 켜질 때(첫 클릭·키 입력 뒤) 실행할 일 — 배경음악이 여기서 시작한다
const readyFns = [];
export function onAudioReady(fn) {
  if (ctx) fn(); else readyFns.push(fn);
}
export function getAudio() {
  return { ctx };
}

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  readyFns.splice(0).forEach((f) => f());
}

// 소리를 낼 수 있는 상태인지 (사용자 입력 전에는 브라우저가 막아 둔다. 그때 예약한 소리는 나중에 한꺼번에 터지므로 건너뛴다)
export function audioReady() {
  return !!ctx && ctx.state === 'running';
}

function env(g, t, vol, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone(freq, dur, { type = 'sine', vol = 0.2, slide = null, delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  env(g, t, vol, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noise(dur, { vol = 0.2, freq = 1200, q = 1, delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, vol, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.3);
  src.stop(t + dur + 0.03);
}

export const sfx = {
  pickup() { tone(520, 0.12, { type: 'triangle', vol: 0.16, slide: 820 }); },
  drop() { tone(440, 0.12, { type: 'triangle', vol: 0.12, slide: 260 }); },
  throw() { noise(0.2, { vol: 0.14, freq: 900, q: 0.7 }); tone(620, 0.16, { type: 'triangle', vol: 0.07, slide: 300 }); },
  tick() { tone(900, 0.05, { type: 'triangle', vol: 0.06 }); },
  place() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.28, { vol: 0.14, delay: i * 0.065 }));
  },
  trash() {
    noise(0.22, { vol: 0.22, freq: 500, q: 0.7 });
    tone(320, 0.2, { vol: 0.18, slide: 90 });
    tone(880, 0.16, { vol: 0.09, delay: 0.12, slide: 1400 });
  },
  wrong() {
    tone(440, 0.12, { type: 'square', vol: 0.05 });
    tone(330, 0.2, { type: 'square', vol: 0.05, delay: 0.12 });
  },
  impact(speed) {
    const v = Math.min(1, speed / 6);
    tone(150 + Math.random() * 120, 0.08, { vol: 0.03 + 0.16 * v, slide: 80 });
    noise(0.05, { vol: 0.03 + 0.08 * v, freq: 1600, q: 1.4 });
  },
  step() { noise(0.07, { vol: 0.045, freq: 300 + Math.random() * 120, q: 1.2 }); },
  jump() { tone(300, 0.12, { type: 'triangle', vol: 0.05, slide: 480 }); },
  land() { noise(0.1, { vol: 0.1, freq: 220, q: 0.8 }); },
  // 고무 오리 삑삑: 음이 휙 올라갔다 내려오는 두 번의 삑 (strength 0..1 = 세게 눌릴수록 크고 높게)
  squeak(strength = 1) {
    const s = Math.max(0.3, Math.min(1, strength));
    const base = 900 + s * 500;
    tone(base, 0.11, { type: 'square', vol: 0.05 * s + 0.02, slide: base * 1.6 });
    tone(base * 1.45, 0.16, { type: 'triangle', vol: 0.08 * s + 0.03, delay: 0.1, slide: base * 0.9 });
  },
  // 쨍그랑: 깨지는 순간의 날카로운 소리 + 흩어지는 조각들의 짤랑임
  shatter() {
    noise(0.35, { vol: 0.32, freq: 3800, q: 0.7 });
    noise(0.2, { vol: 0.2, freq: 1400, q: 0.9 });
    for (let i = 0; i < 7; i++) {
      tone(2200 + Math.random() * 2600, 0.12, { vol: 0.05, delay: 0.04 + i * 0.05 + Math.random() * 0.04 });
    }
  },
  // 서랍 드르륵 + 끝에 톡
  drawer(open) {
    noise(0.2, { vol: 0.12, freq: open ? 750 : 620, q: 0.9 });
    tone(open ? 210 : 170, 0.09, { type: 'triangle', vol: 0.12, delay: 0.32, slide: 110 });
  },
  // 의자 끄는 소리
  slide() {
    noise(0.45, { vol: 0.09, freq: 360, q: 0.6 });
    tone(130, 0.08, { vol: 0.08, delay: 0.5, slide: 90 });
  },
  combo(n) {
    const base = 660 * Math.pow(1.12, n);
    tone(base, 0.12, { type: 'triangle', vol: 0.1, delay: 0.25 });
    tone(base * 1.5, 0.16, { type: 'triangle', vol: 0.09, delay: 0.32 });
  },
  bonus() {
    tone(500, 0.25, { type: 'triangle', vol: 0.1, slide: 1500 });
    tone(1500, 0.2, { vol: 0.08, delay: 0.22 });
  },
  countdown() { tone(990, 0.09, { type: 'square', vol: 0.05 }); },
  timeUp() {
    tone(660, 0.18, { type: 'square', vol: 0.07 });
    tone(520, 0.18, { type: 'square', vol: 0.07, delay: 0.18 });
    tone(390, 0.4, { type: 'square', vol: 0.07, delay: 0.36, slide: 300 });
  },
  finish() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.13, delay: i * 0.11 }));
  },

  // ── 오프닝 컷신 ──
  knock() { tone(180, 0.06, { vol: 0.12, slide: 110 }); noise(0.05, { vol: 0.08, freq: 500, q: 1 }); },
  door() { noise(0.3, { vol: 0.3, freq: 260, q: 0.6 }); tone(120, 0.28, { vol: 0.26, slide: 50 }); },
  bark() {
    tone(640, 0.08, { type: 'sawtooth', vol: 0.06, slide: 360 });
    tone(600, 0.09, { type: 'sawtooth', vol: 0.055, delay: 0.15, slide: 330 });
  },
  boing() { tone(200, 0.4, { type: 'triangle', vol: 0.15, slide: 700 }); },
  crash() { noise(0.35, { vol: 0.25, freq: 900, q: 0.5 }); tone(170, 0.22, { vol: 0.13, slide: 65 }); },
  poof() { noise(0.55, { vol: 0.22, freq: 480, q: 0.4 }); },
  scuffle() { noise(0.1, { vol: 0.09, freq: 600 + Math.random() * 1000, q: 1.1 }); },
  stamp() {
    tone(130, 0.2, { vol: 0.26, slide: 55 });
    noise(0.12, { vol: 0.2, freq: 420, q: 0.8 });
    [783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.11, delay: 0.14 + i * 0.08 }));
  },
};
