// 배경음악: 파일 없이 WebAudio 로 즉석에서 연주하는 8비트(칩튠) 곡 (92 BPM, 4마디 반복)
// 펄스파 멜로디 + 펄스파 아르페지오 + 삼각파 베이스 + 노이즈 드럼. 분위기 3가지 —
// menu(드럼 없이 잔잔) · play(경쾌한 비트) · tense(타임 어택 마지막 10초, 빨라진 박동)
import { getAudio, onAudioReady, initAudio } from './audio.js';

const BPM = 92; // 느긋한 속도
const STEP = 60 / BPM / 4; // 16분음표 하나의 길이(초)
// C → Am → F → G  (MIDI 음 번호: 루트, 3도, 5도, 옥타브)
const CHORDS = [
  [48, 52, 55, 60],
  [45, 48, 52, 57],
  [41, 45, 48, 53],
  [43, 47, 50, 55],
];
// 마디마다 16분음표 16칸짜리 멜로디 (0 = 쉼표). 마디마다 코드에 맞는 음으로 짠 한 소절
const LEAD = [
  [76, 0, 0, 79, 0, 76, 0, 72, 0, 0, 74, 0, 76, 0, 0, 0],
  [81, 0, 0, 79, 0, 76, 0, 72, 0, 0, 76, 0, 74, 0, 0, 0],
  [81, 0, 79, 0, 77, 0, 72, 0, 77, 0, 79, 0, 81, 0, 0, 0],
  [83, 0, 79, 0, 74, 0, 79, 0, 83, 0, 86, 0, 83, 0, 79, 0],
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3]; // 코드 음 순서 (16분음표 8개마다 반복)

let ctx = null, bus = null, send = null;
let timer = 0, nextTime = 0, step = 0;
let mode = 'menu';
let userVol = 0.5, duck = 1, muted = false;
let noise = null;
let meter = null;
let held = false; // true 인 동안 소리를 내지 않는다 (오프닝 영상)
const waves = {}; // 듀티비별 펄스파 캐시

const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

function applyVolume() {
  if (!bus) return;
  // 오프닝 영상이 나오는 동안(held)에는 조용히 두었다가, 끝나면 서서히 커진다
  bus.gain.setTargetAtTime(muted || held ? 0 : userVol * duck * 1.0, ctx.currentTime, held ? 0.05 : 0.6);
}

// 듀티비 d 의 펄스파 (0.5 = 네모파, 0.25 · 0.125 = 가늘고 코맹맹이 같은 소리)
function pulse(d) {
  if (waves[d]) return waves[d];
  const n = 48, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * d);
    im[k] = (2 / (k * Math.PI)) * (1 - Math.cos(k * Math.PI * d));
  }
  return (waves[d] = ctx.createPeriodicWave(re, im));
}

// 칩튠 음 하나: 펄스파(또는 삼각파) → 짧은 엔벨로프 → 합주 버스 (+ 아주 약한 메아리)
function note(m, t, dur, { wave = 0.5, vol = 0.05, echo = 0.12 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  if (wave === 'tri') o.type = 'triangle'; else o.setPeriodicWave(pulse(wave));
  o.frequency.value = freq(m);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.setValueAtTime(vol, t + dur * 0.55); // 끊어 치는 느낌: 잠깐 유지했다가 뚝 줄어듦
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(bus);
  if (echo) { const s = ctx.createGain(); s.gain.value = echo; g.connect(s).connect(send); }
  o.start(t);
  o.stop(t + dur + 0.02);
}

// 노이즈 드럼 (짧을수록 하이햇, 낮은 필터일수록 스네어 느낌)
function hit(t, { freq: fq = 7000, q = 1, dur = 0.05, vol = 0.03, type = 'bandpass' } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = fq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.3);
  s.stop(t + dur + 0.02);
}

// 킥: 삼각파가 뚝 떨어지는 소리
function kick(t, vol = 0.2) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + 0.2);
}

// 한 박(16분음표 하나)을 연주
function playStep(i, t) {
  const bar = Math.floor(i / 16) % 4, s = i % 16;
  const chord = CHORDS[bar];
  const calm = mode === 'menu';
  const tense = mode === 'tense';

  // 멜로디: 25% 펄스파. 다음 음이 나올 때까지 이어지게 길이를 정한다
  const lead = LEAD[bar][s];
  if (lead) {
    let len = 1;
    while (s + len < 16 && !LEAD[bar][s + len] && len < 6) len++;
    note(lead, t, STEP * (len - 0.1), { wave: 0.25, vol: calm ? 0.034 : 0.04, echo: 0.3 });
  }

  // 아르페지오: 12.5% 펄스파로 은은하게 (두 박에 한 번)
  if (s % 2 === 0) {
    const m = chord[ARP[s % 8]] + 12;
    note(m, t, STEP * 0.9, { wave: 0.125, vol: calm ? 0.012 : 0.016, echo: 0.2 });
  }

  // 베이스: 삼각파로 뿌리음을 길게 (네 박에 한 번, 마지막 칸은 5도)
  if (s % 4 === 0) {
    const m = chord[0] - 12 + (s === 12 ? 7 : 0);
    note(m, t, STEP * 3.6, { wave: 'tri', vol: 0.1, echo: 0 });
  }

  // 드럼 (잔잔한 모드에선 없음): 킥 · 스네어 · 하이햇
  if (!calm) {
    if (s === 0 || s === 8 || (tense && (s === 4 || s === 12))) kick(t, tense ? 0.2 : 0.09);
    if (s === 12 || (tense && s === 4)) hit(t, { freq: 2200, q: 0.8, dur: 0.07, vol: tense ? 0.04 : 0.018 });
    if (s % 4 === 2 || tense) hit(t, { freq: 9000, q: 0.7, dur: 0.02, vol: tense ? 0.026 : 0.009, type: 'highpass' });
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
  // 아주 약한 메아리: 칩튠 특유의 또렷함은 지키면서 살짝만 울리게
  const delay = ctx.createDelay(1);
  delay.delayTime.value = STEP * 3;
  const fb = ctx.createGain(); fb.gain.value = 0.28;
  const wet = ctx.createGain(); wet.gain.value = 0.5;
  send = ctx.createGain();
  send.connect(delay);
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(bus);
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


