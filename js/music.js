// 배경음악: 파일 없이 WebAudio 로 즉석에서 연주하는 아늑한 로파이 곡 (78 BPM, 4마디 반복)
// 분위기 3가지 — menu(잔잔) · play(가벼운 비트) · tense(타임 어택 마지막 10초, 빨라진 박동)
import { getAudio, onAudioReady, initAudio } from './audio.js';

const BPM = 78;
const STEP = 60 / BPM / 2; // 8분음표 하나의 길이(초)
// Cmaj7 → Am7 → Fmaj7 → G7  (MIDI 음 번호)
const CHORDS = [
  [48, 52, 55, 59],
  [45, 48, 52, 55],
  [41, 45, 48, 52],
  [43, 47, 50, 53],
];
const ARP = [0, 2, 1, 3, 2, 3, 1, 2]; // 코드 음 순서 (8분음표 8개 = 한 마디)
const SCALE = [72, 74, 76, 79, 81, 84]; // 멜로디용 도 레 미 솔 라 도 (5음 음계: 무슨 음을 눌러도 어울림)
// 두 마디짜리 오르골 멜로디 [마디 안 8분음표 번호, 음계 번호] — 매번 같은 모양으로 반복되어 귀에 남는다
const MOTIF = [[0, 2], [3, 4], [5, 3], [8, 4], [11, 2], [13, 1], [14, 0]];

let ctx = null, bus = null, send = null;
let timer = 0, nextTime = 0, step = 0;
let mode = 'menu';
let userVol = 0.5, duck = 1, muted = false;
let noise = null;
let meter = null;
let held = false; // true 인 동안 소리를 내지 않는다 (오프닝 영상)

const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

function applyVolume() {
  if (!bus) return;
  // 오프닝 영상이 나오는 동안(held)에는 조용히 두었다가, 끝나면 서서히 커진다
  bus.gain.setTargetAtTime(muted || held ? 0 : userVol * duck * 1.0, ctx.currentTime, held ? 0.05 : 0.6);
}

// 음 하나: 오실레이터 → 엔벨로프 → 로우패스 → 합주 버스 (+ 메아리 보내기)
function note(m, t, dur, { type = 'sine', vol = 0.06, attack = 0.01, cut = 2400, echo = 0.5, detune = 0 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  o.type = type;
  o.frequency.value = freq(m);
  o.detune.value = detune;
  f.type = 'lowpass';
  f.frequency.value = cut;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g);
  g.connect(bus);
  if (echo) { const s = ctx.createGain(); s.gain.value = echo; g.connect(s).connect(send); }
  o.start(t);
  o.stop(t + dur + 0.05);
}

function hit(t, { freq: fq = 7000, q = 1, dur = 0.05, vol = 0.03 } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = fq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.3);
  s.stop(t + dur + 0.02);
}

function kick(t, vol = 0.2) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + 0.25);
}

// 한 박(8분음표 하나)을 연주
function playStep(i, t) {
  const bar = Math.floor(i / 8) % 4, s = i % 8;
  const chord = CHORDS[bar];
  const calm = mode === 'menu';
  const tense = mode === 'tense';

  // 패드: 마디 첫 박에 코드를 길게 깔아 준다
  if (s === 0) chord.forEach((m, k) => note(m + 12, t, STEP * 8 * 0.95, { type: 'triangle', vol: 0.028, attack: 0.35, cut: 1300, detune: (k - 1.5) * 6 }));

  // 전자 피아노 아르페지오 (잔잔한 모드에서는 한 박 건너 한 번)
  if (!calm || s % 2 === 0) {
    const m = chord[ARP[s]] + 12;
    note(m, t, STEP * 2.2, { type: 'triangle', vol: calm ? 0.05 : 0.058, attack: 0.012, cut: 2100 });
    note(m, t, STEP * 1.2, { type: 'sine', vol: 0.03, attack: 0.008, cut: 3200 });
  }

  // 베이스
  if (s === 0 || (!calm && s === 4)) note(chord[0] - 12, t, STEP * 3.2, { type: 'sine', vol: 0.15, attack: 0.02, cut: 500, echo: 0 });

  // 오르골 멜로디 (두 마디 모티프 + 가끔 장식음)
  const pos = (bar % 2) * 8 + s;
  const hitMotif = MOTIF.find(([p]) => p === pos);
  if (hitMotif) {
    const m = SCALE[hitMotif[1]];
    note(m, t, 1.4, { type: 'sine', vol: calm ? 0.055 : 0.05, attack: 0.004, cut: 5000, echo: 0.7 });
    note(m + 12, t, 0.6, { type: 'sine', vol: 0.012, attack: 0.004, cut: 6500, echo: 0.6 });
  } else if (!calm && Math.random() < 0.12) {
    note(SCALE[Math.floor(Math.random() * SCALE.length)], t, 0.9, { type: 'sine', vol: 0.03, attack: 0.004, cut: 5000, echo: 0.7 });
  }

  // 드럼: 부드러운 킥, 가는 하이햇(솔질), 가벼운 림샷
  if (!calm) {
    if (s === 0 || s === 4 || (tense && s % 2 === 0)) kick(t, tense ? 0.22 : 0.17);
    if (s % 2 === 1 || tense) hit(t, { freq: 7500, dur: 0.045, vol: tense ? 0.034 : 0.022 });
    if (s === 2 || s === 6) hit(t, { freq: 1900, q: 1.4, dur: 0.07, vol: 0.03 });
  }
}

function schedule() {
  while (nextTime < ctx.currentTime + 0.25) {
    playStep(step, nextTime);
    // 마지막 10초에는 박자가 살짝 빨라진다
    nextTime += mode === 'tense' ? STEP * 0.84 : STEP;
    step++;
  }
}

function start() {
  if (timer) return;
  ({ ctx } = getAudio());
  bus = ctx.createGain();
  bus.gain.value = 0;
  bus.connect(ctx.destination);
  meter = ctx.createAnalyser(); // 음량 확인용 (자동 테스트에서 소리가 실제로 나오는지 볼 때 사용)
  meter.fftSize = 1024;
  bus.connect(meter);
  // 메아리: 살짝 어두운 소리가 반복되며 공간감을 만든다
  const delay = ctx.createDelay(1);
  delay.delayTime.value = STEP * 1.5;
  const fb = ctx.createGain(); fb.gain.value = 0.34;
  const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2200;
  const wet = ctx.createGain(); wet.gain.value = 0.5;
  send = ctx.createGain();
  send.connect(delay);
  delay.connect(damp).connect(fb).connect(delay);
  damp.connect(wet).connect(bus);
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  nextTime = ctx.currentTime + 0.15;
  step = 0;
  applyVolume();
  timer = setInterval(schedule, 40);
}
onAudioReady(start);

// 처음 누르는 키·클릭에서 오디오가 켜지고 음악이 시작된다 (브라우저 자동재생 규칙)
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => initAudio(), { once: true, capture: true });

export const music = {
  setMode(m) { if (m !== mode) mode = m; },
  setVolume(v) { userVol = Math.max(0, Math.min(1, v)); applyVolume(); },
  // 일시정지·메뉴를 열었을 때 작게
  setDuck(on) { duck = on ? 0.35 : 1; applyVolume(); },
  hold(on) { held = on; applyVolume(); },
  toggleMute() { muted = !muted; applyVolume(); return muted; },
  get muted() { return muted; },
  get mode() { return mode; },
  get playing() { return !!timer; },
  // 지금 나오는 소리 크기 (0..1, RMS)
  level() {
    if (!meter) return 0;
    const a = new Float32Array(meter.fftSize);
    meter.getFloatTimeDomainData(a);
    return Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  },
  get state() { return ctx ? ctx.state : 'none'; },
};
