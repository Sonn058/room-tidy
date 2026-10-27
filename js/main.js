// 말랑말랑 방 정리 — 진입점 · 렌더러 · 물리 월드 · 게임 루프
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { spawnItems, BREAK_SPEED } from './items.js';
import kids from './maps/kids.js';
import study from './maps/study.js';
import living from './maps/living.js';
import { Player } from './player.js';
import { Interaction } from './interaction.js';
import { Tidy } from './tidy.js';
import { Effects } from './effects.js';
import { UI, formatTime } from './ui.js';
import { initAudio, sfx, setVolume } from './audio.js';
import { setupGraphics } from './graphics.js';
import { CameraDirector, setupTitle } from './title.js';
import { playOpening } from './opening.js';
import { setupLobby, setupMultiplayer } from './multiplayer.js';
import { music } from './music.js';
import { loadSettings, saveSettings, recordKey, readNumber, writeValue } from './settings.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');

// ── 맵 · 모드 선택 (?map=study&mode=timed) ──────────────────────────────
const MAPS = [kids, study, living];
const params = new URLSearchParams(location.search);
// 주소에 방이 없으면 타이틀 화면부터 (배경은 마지막으로 고른 방)
const fromTitle = !params.has('map');
let lastMapId = '';
try { lastMapId = localStorage.getItem(recordKey.lastMap) || ''; } catch { /* 무시 */ }
const map = MAPS.find((m) => m.id === (params.get('map') || lastMapId)) || kids;
if (!fromTitle) writeValue(recordKey.lastMap, map.id);
let mode = params.get('mode') === 'timed' ? 'timed' : 'free'; // free: 자유 모드, timed: 타임 어택
const goToMap = (id) => navigateSmooth(`?map=${id}&mode=${mode}`);

// 기록 (맵별, 이 브라우저에만 저장)
const loadBest = () => readNumber(recordKey.best(map.id));
const saveBest = (v) => writeValue(recordKey.best(map.id), v);
const loadBestTime = () => readNumber(recordKey.bestTime(map.id));
const saveBestTime = (sec) => writeValue(recordKey.bestTime(map.id), Math.floor(sec));

// ── 깜빡임 없는 화면 전환 ──────────────────────────────
// 지금 화면을 작은 스냅샷으로 남겨 두고 살짝 흐리게 덮은 뒤 이동 → 새 페이지는 같은 스냅샷에서 시작해
// 새 방이 다 그려지면 서서히 걷어낸다 (index.html 의 #curtain)
const curtain = $('curtain');
let revealed = false;
let navigating = false;

function navigateSmooth(url) {
  if (navigating) return;
  navigating = true;
  try {
    gfx.render(0); // 같은 작업 안에서 바로 읽어야 WebGL 화면이 비지 않는다
    const w = 480, h = Math.max(1, Math.round((w * canvas.height) / canvas.width));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(canvas, 0, 0, w, h);
    const snap = c.toDataURL('image/jpeg', 0.72);
    sessionStorage.setItem('room-tidy:snap', snap);
    curtain.style.transition = 'none';
    curtain.style.backgroundImage = `url(${snap})`;
    curtain.classList.remove('gone');
    void curtain.offsetWidth;
    curtain.style.transition = '';
    curtain.classList.add('leaving');
  } catch { /* 스냅샷을 못 남겨도 이동은 한다 */ }
  setTimeout(() => { location.href = url; }, 230);
}

// ── 렌더러 · 씬 · 카메라 ──────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;

const scene = new THREE.Scene();
scene.background = new THREE.Color(map.background);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 60);
camera.rotation.order = 'YXZ';
scene.add(camera);

const gfx = setupGraphics(renderer, scene, camera);

// ── 조명: 따뜻한 실내광 + 위에서 내리는 부드러운 그림자 + 창문 햇살 + 펜던트 조명 ──
scene.add(new THREE.HemisphereLight('#fff0dc', '#c99a70', 0.55));
const sun = new THREE.DirectionalLight('#ffe4bf', 1.5);
sun.position.set(1.5, 7, -3.2);
sun.target.position.set(-0.3, 0, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 20 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// 창밖에서 비스듬히 들어오는 햇살 (창틀·커튼 그림자가 바닥에 드리움)
const wl = map.windowLight;
const sunbeam = new THREE.SpotLight('#ffdca8', 60, 0, 0.3, 0.6, 2);
sunbeam.position.set(...wl.pos);
sunbeam.target.position.set(...wl.target);
sunbeam.castShadow = true;
sunbeam.shadow.mapSize.set(1024, 1024);
sunbeam.shadow.bias = -0.0008;
sunbeam.shadow.normalBias = 0.03;
scene.add(sunbeam, sunbeam.target);

const lamp = new THREE.PointLight('#ffc98a', 3.2, 0, 1.6);
lamp.position.set(...map.lamp);
scene.add(lamp);

// ── 물리 월드 ──────────────────────────────
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.solver.iterations = 12;

const mats = {
  static: new CANNON.Material('static'),
  item: new CANNON.Material('item'),
  ball: new CANNON.Material('ball'),
  player: new CANNON.Material('player'),
  furniture: new CANNON.Material('furniture'), // 서랍·의자: 안의 물건이 미끄러지지 않고 함께 움직이도록 마찰을 높게
};
const cm = (a, b, friction, restitution) => world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution }));
cm(mats.item, mats.static, 0.45, 0.15);
cm(mats.item, mats.item, 0.4, 0.1);
cm(mats.ball, mats.static, 0.3, 0.62);
cm(mats.ball, mats.item, 0.3, 0.45);
cm(mats.ball, mats.ball, 0.3, 0.7);
cm(mats.player, mats.static, 0, 0);
cm(mats.item, mats.furniture, 1.0, 0.05);
cm(mats.ball, mats.furniture, 0.9, 0.2);
cm(mats.player, mats.furniture, 0, 0);

// ── 게임 객체 ──────────────────────────────
const ctx = { scene, world, mats };
const layout = map.build(ctx);
const items = spawnItems(ctx, layout, map.items, map.spawn);
// 서랍·의자: 물리 서브스텝마다 목표 자세로 이동
world.addEventListener('preStep', () => {
  for (const m of ctx.movables) m.preStep(world.dt);
});
const ui = new UI();
const effects = new Effects(scene);
const player = new Player(camera, world, mats, map.spawn);

let state = fromTitle ? 'title' : 'start'; // title | start | play | pause | done

// 카메라: 타이틀에서는 방을 천천히 돌고, 방 선택·게임에서는 1인칭
const director = new CameraDirector(camera, player);
if (fromTitle) director.setMode('orbit', 0);

// 설정 적용 (감도·볼륨·화면 흔들림)
const settings = loadSettings();
function applySettings() {
  player.sensitivity = 0.0021 * settings.sensitivity;
  player.bobScale = settings.headBob ? 1 : 0;
  setVolume(settings.volume);
  music.setVolume(settings.musicVolume);
  saveSettings(settings);
}
applySettings();
let playTime = 0;
let started = false;

// ── 타임 어택 점수 ──────────────────────────────
const COMBO_WINDOW = 6; // 이 시간(초) 안에 연달아 정리하면 콤보
const ZONE_BONUS_TIME = 5; // 한 구역을 다 정리하면 추가 시간
let timeLeft = map.timeLimit;
let score = 0, combo = 0, maxCombo = 0, lastPlaceAt = -99, lastTick = null;

function onPlace(it, zone) {
  if (mode !== 'timed' || state !== 'play' || it.scored) return; // 같은 물건으로 점수를 두 번 받지 않는다
  it.scored = true;
  combo = playTime - lastPlaceAt <= COMBO_WINDOW ? combo + 1 : 1;
  maxCombo = Math.max(maxCombo, combo);
  lastPlaceAt = playTime;
  const mult = Math.min(combo, 5);
  const pts = (it.hinted ? 50 : 100) * mult; // 힌트를 본 물건은 절반
  score += pts;
  ui.setScore(score, combo);
  ui.popScore(`+${pts}`, [mult > 1 ? `콤보 x${mult}` : '', it.hinted ? '힌트 사용' : ''].filter(Boolean).join(' · '));
  if (mult > 1) sfx.combo(mult);
  if (zone.done === zone.total && !zone.bonusGiven) {
    zone.bonusGiven = true;
    timeLeft += ZONE_BONUS_TIME;
    ui.popTime(`+${ZONE_BONUS_TIME}초`);
    sfx.bonus();
  }
}

// 2인 대전이면 setupMultiplayer 가 채워 넣는다 (아니면 null)
let mp = null;
const mpMode = params.get('mp'); // 'host' | 'join' | null

const tidy = new Tidy({
  scene, world, items, zones: layout.zones, effects, ui,
  onComplete: () => (mp ? mp.onAllTidied() : finish('complete')),
  onPlace,
});
const interaction = new Interaction({
  camera, world, items, occluders: ctx.occluders, movables: ctx.movables, player, tidy, ui,
  // 대전 중에는 시작 신호 후, 마우스가 잠겨 있을 때만 (메뉴를 누르다 물건을 집지 않게)
  isActive: () => state === 'play' && (!mp || (mp.active && !!document.pointerLockElement)),
});

// 충돌 소리 (물건별로 잦은 재생 방지)
for (const it of items) {
  it.body.addEventListener('collide', (e) => {
    if (state !== 'play') return;
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    // 도자기·유리는 세게 부딪히면 깨진다 (손에 들고 있을 땐 안 깨짐). 실제 처리는 물리 스텝이 끝난 뒤에
    if (it.fragile && !it.held && v >= BREAK_SPEED) it.breakPending = true;
    const now = performance.now();
    if (it.squeaky && v > 2.2 && now - it.lastImpact > 220) {
      // 고무 오리는 부딪힐 때마다 삑!
      it.lastImpact = now;
      sfx.squeak(v / 5);
    } else if (!it.squeaky && v > 0.8 && now - it.lastImpact > 90) {
      it.lastImpact = now;
      sfx.impact(v);
    }
  });
}

// 시작 화면 뒤에서 미리 시뮬레이션해서 물건이 바닥에 자연스럽게 놓이게 한다
for (let i = 0; i < 150; i++) world.step(1 / 60);
for (const it of items) {
  it.body.interpolatedPosition.copy(it.body.position);
  it.body.interpolatedQuaternion.copy(it.body.quaternion);
}
player.body.interpolatedPosition.copy(player.body.position);

// ── 화면 전환 ──────────────────────────────
// ESC 직후에는 브라우저가 잠시(약 1초) 마우스 잠금을 막기 때문에 실패 안내를 띄운다
function lockFailed() {
  if (state === 'pause') $('pause-msg').textContent = '조금만 기다렸다가 다시 눌러 주세요';
  else ui.toast('다시 한 번 클릭해 주세요', 'warn');
}
function lock() {
  initAudio();
  const p = canvas.requestPointerLock();
  if (p && p.catch) p.catch(lockFailed);
}
document.addEventListener('pointerlockerror', lockFailed);

// 시작 화면(맵·모드 선택)으로 — 현재 맵과 모드는 그대로 선택된 채로 돌아간다
const goHome = () => navigateSmooth(`?map=${map.id}&mode=${mode}`);

$('start-btn').addEventListener('click', lock);
$('resume-btn').addEventListener('click', lock);
$('restart-btn').addEventListener('click', () => navigateSmooth(location.href));
$('finish-home-btn').addEventListener('click', goHome);

// ── 일시정지 메뉴 (ESC) ──────────────────────────────
let confirmAction = null;

function showPause() {
  const chips = [
    map.name,
    mode === 'timed' ? '타임 어택' : '자유 모드',
    `정리 ${tidy.done} / ${tidy.total}`,
    mode === 'timed' ? `남은 시간 ${formatTime(Math.ceil(Math.max(0, timeLeft)))}` : formatTime(playTime),
    ...(mode === 'timed' ? [`${score.toLocaleString()}점`] : []),
  ];
  $('pause-info').innerHTML = chips.map((c) => `<span>${c}</span>`).join('');
  $('pause-msg').textContent = '';
  $('pause').classList.remove('hidden');
  closeConfirm(); // 보이는 상태에서 '계속하기'에 포커스
}

// 진행한 게 있으면 한 번 더 물어본다
function askConfirm(text, yesLabel, action) {
  if (tidy.done === 0 && playTime < 5) return action();
  confirmAction = action;
  $('confirm-text').innerHTML = text;
  $('confirm-yes').textContent = yesLabel;
  $('pause-menu').classList.add('hidden');
  $('confirm').classList.remove('hidden', 'pop-in');
  void $('confirm').offsetWidth;
  $('confirm').classList.add('pop-in');
  $('confirm-yes').focus();
}

function closeConfirm() {
  confirmAction = null;
  $('confirm').classList.add('hidden');
  $('pause-menu').classList.remove('hidden');
  $('resume-btn').focus();
}

$('retry-btn').addEventListener('click', () =>
  askConfirm('처음부터 다시 할까요?<br>지금까지 정리한 내용은 사라져요.', '다시 하기', () => navigateSmooth(location.href)));
$('home-btn').addEventListener('click', () =>
  askConfirm('홈 화면으로 나갈까요?<br>지금까지 정리한 내용은 사라져요.', '나가기', goHome));
$('confirm-yes').addEventListener('click', () => confirmAction && confirmAction());
$('confirm-no').addEventListener('click', closeConfirm);

addEventListener('keydown', (e) => {
  if (state !== 'pause' || e.repeat) return;
  const confirming = !$('confirm').classList.contains('hidden');
  if (confirming) {
    if (e.code === 'Escape') closeConfirm();
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); confirmAction && confirmAction(); }
    return;
  }
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); lock(); }
  else if (e.code === 'KeyR') $('retry-btn').click();
  else if (e.code === 'KeyQ') $('home-btn').click();
});

// 시작 화면의 맵 카드: 다른 맵을 고르면 그 맵으로 다시 불러온다 (배경도 미리보기로 바뀜)
// 견본 색 = 그 방의 줄무늬 벽지 + 나무색
for (const m of MAPS) {
  const card = document.createElement('button');
  card.className = `map-card${m.id === map.id ? ' selected' : ''}`;
  // 방의 특징을 보여 주는 이모티콘 (아이 방 🧸 · 서재 📚 · 거실 🛋️)
  card.innerHTML = `<span class="map-swatch">${m.emoji}</span>` +
    `<span class="map-text"><span class="map-name">${m.name}</span><span class="map-desc">${m.desc}</span></span>` +
    '<span class="map-check"></span>';
  card.addEventListener('click', () => {
    if (m.id === map.id) return;
    // 누르자마자 선택 표시가 옮겨 가도록
    document.querySelectorAll('.map-card').forEach((el) => el.classList.toggle('selected', el === card));
    goToMap(m.id);
  });
  $('maps').appendChild(card);
}
const other = MAPS[(MAPS.indexOf(map) + 1) % MAPS.length];
$('other-btn').textContent = `${other.name} 정리하러 가기`;
$('other-btn').addEventListener('click', () => goToMap(other.id));
$('map-label').textContent = map.name.toUpperCase();

// 시작 화면의 모드 선택 (다시 불러올 필요 없이 바로 바뀜)
const MODES = [
  { id: 'free', name: '자유 모드', desc: '시간 제한 없이 느긋하게' },
  { id: 'timed', name: '타임 어택', desc: `${map.timeLimit}초 안에 최대한 많이` },
];
const modeButtons = MODES.map((m) => {
  const btn = document.createElement('button');
  btn.className = 'mode-card';
  const best = m.id === 'timed' && loadBest();
  btn.innerHTML = `<span class="mode-name">${m.name}</span><span class="mode-desc">${m.desc}</span>` +
    (best ? `<span class="mode-best">최고 기록 ${best.toLocaleString()}점</span>` : '');
  btn.addEventListener('click', () => setMode(m.id));
  $('modes').appendChild(btn);
  return btn;
});
function setMode(id) {
  mode = id;
  modeButtons.forEach((b, i) => b.classList.toggle('selected', MODES[i].id === id));
  $('start-btn').textContent = id === 'timed' ? '타임 어택 시작!' : '정리 시작하기';
  if (state !== 'title' && !mpMode) history.replaceState(null, '', `?map=${map.id}&mode=${id}`);
}
setMode(mode);

// ── 타이틀 ↔ 방 선택 (페이지를 다시 불러오지 않고 카메라가 미끄러지듯 이동) ──
const title = setupTitle({ maps: MAPS, settings, onSettingsChange: applySettings, onPlay: enterSelect });

function enterSelect() {
  if (state !== 'title') return;
  state = 'start';
  title.hide();
  const start = $('start');
  start.classList.remove('hidden');
  director.setMode('player', 1.6);
  history.replaceState(null, '', `?map=${map.id}&mode=${mode}`);
  writeValue(recordKey.lastMap, map.id);
  $('start-btn').focus({ preventScroll: true });
}

function enterTitle() {
  if (state !== 'start') return;
  state = 'title';
  $('start').classList.add('hidden');
  title.show();
  director.setMode('orbit', 1.6);
  history.replaceState(null, '', location.pathname);
}

$('back-title').addEventListener('click', enterTitle);
setupLobby(MAPS, map.id);

// 2인 대전으로 들어온 경우: 타이틀·방 선택·오프닝을 건너뛰고 바로 대기 화면
if (mpMode) {
  $('start').classList.add('hidden');
  $('title').classList.add('hidden');
  mp = setupMultiplayer({
    params, map, items, movables: ctx.movables, tidy, ui, interaction, player, camera, effects,
    scene, occluders: ctx.occluders,
    lock, isPlaying: () => state === 'play', setState: (s) => { state = s; },
    goTitle: () => navigateSmooth(location.pathname),
  });
} else if (fromTitle) {
  $('start').classList.add('hidden');
  // 처음 들어왔을 때만 오프닝 (방 전환으로 다시 불러온 경우는 바로 타이틀)
  if (document.documentElement.classList.contains('switching')) title.show();
  else playOpening().then(() => title.show());
}

function beginPlay() {
  state = 'play';
  $('title').classList.add('hidden');
  director.setMode('player', 0);
  $('start').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (!started && mp) {
    started = true; // 대전 안내는 대기·카운트다운 화면이 맡는다
  } else if (!started) {
    started = true;
    const timed = mode === 'timed';
    $('hud').classList.toggle('timed', timed);
    if (timed) {
      ui.setScore(0, 0);
      ui.toast(`${map.timeLimit}초 안에 최대한 많이 정리하세요! 연달아 정리하면 콤보!`, 'great');
    }
    ui.toast(`물건의 제자리는 직접 찾아보세요. 막히면 F로 힌트${timed ? ' (점수 절반)' : ''}`, 'good');
  }
}

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked && state !== 'done') {
    beginPlay();
  } else if (!locked && state === 'play' && mp) {
    // 대전은 멈추지 않는다: 시작 전이면 대기 화면으로, 경기 중이면 일시정지 메뉴만 띄운다 (상대는 계속 진행)
    player.keys = {};
    if (mp.running && !mp.ended) showPause();
    else state = 'start';
  } else if (!locked && state === 'play') {
    state = 'pause';
    if (interaction.held) interaction.release(false);
    player.keys = {};
    showPause();
  }
});

addEventListener('keydown', (e) => {
  if (state === 'title') return title.onKey(e);
  if (state === 'start' && e.code === 'Escape' && !mp) return enterTitle();
  if (e.code === 'KeyM' && !e.repeat && document.activeElement?.tagName !== 'INPUT') {
    const off = music.toggleMute();
    if (state === 'play') ui.toast(off ? '배경음악 끔 (M)' : '배경음악 켬 (M)', 'good');
  }
  if (e.code === 'KeyH' && state === 'play') $('keys').classList.toggle('hidden');
});

// reason: 'complete'(모두 정리) | 'timeup'(타임 어택 시간 종료)
function finish(reason) {
  if (state === 'done') return;
  state = 'done';
  if (interaction.held) interaction.release(false);
  document.exitPointerLock();
  effects.confetti(camera.position.clone().add(new THREE.Vector3(0, -0.5, 0)));

  let stars, heading, msg, lines;
  const hints = interaction.hintCount;
  const hintLine = ['힌트 사용', hints ? `${hints}회` : '<b class="new">없음 — 스스로 다 찾았어요!</b>'];
  const broken = tidy.broken;
  const brokenLine = ['깨진 물건', broken ? `<b class="bad">${broken}개 — 100% 정리 실패</b>` : '<b class="new">없음</b>'];
  if (mode === 'timed') {
    const bonus = reason === 'complete' ? Math.ceil(Math.max(0, timeLeft)) * 10 : 0;
    score += bonus;
    const best = loadBest();
    const isBest = score > best;
    if (isBest) saveBest(score);
    const ratio = tidy.done / tidy.total;
    stars = ratio >= 1 ? 3 : ratio >= 0.6 ? 2 : 1;
    heading = reason !== 'complete' ? '시간 종료!' : broken ? '정리는 끝! …하지만 깨진 게 있어요' : '시간 안에 전부 정리했어요!';
    msg = ['', '조금만 더 빨리 움직여 볼까요?', '거의 다 했어요! 콤보를 노려 보세요!', '완벽해요! 정리의 달인!'][stars];
    lines = [
      ['정리한 물건', `${tidy.done} / ${tidy.total}`],
      ['최대 콤보', `x${Math.min(maxCombo, 5)}`],
      hintLine,
      brokenLine,
      ...(bonus ? [['남은 시간 보너스', `+${bonus.toLocaleString()}`]] : []),
      ['점수', `<b class="big">${score.toLocaleString()}점</b>`],
      ['최고 기록', isBest ? '<b class="new">NEW! 신기록</b>' : `${best.toLocaleString()}점`],
    ];
    reason === 'complete' ? sfx.finish() : sfx.timeUp();
  } else {
    const t = playTime;
    stars = Math.min(t < 150 ? 3 : t < 300 ? 2 : 1, broken ? 2 : 3);
    heading = broken ? '정리는 끝! …하지만 깨진 게 있어요' : '방이 반짝반짝해졌어요!';
    msg = broken
      ? '다음엔 컵과 찻잔을 살살 다뤄 볼까요? 깨지면 100% 정리를 할 수 없어요.'
      : ['', '깨끗해졌어요! 조금 더 빨리 해볼까요?', '와, 정리 솜씨가 좋아요!', '정리왕 등극! 반짝반짝한 방이에요!'][stars];
    // 최단 기록은 하나도 안 깨뜨리고 100% 정리했을 때만
    const bestTime = loadBestTime();
    const isBestTime = !broken && (!bestTime || t < bestTime);
    if (isBestTime) saveBestTime(t);
    lines = [
      ['걸린 시간', formatTime(t)],
      hintLine,
      brokenLine,
      ['최단 기록', isBestTime ? '<b class="new">NEW! 신기록</b>' : bestTime ? formatTime(bestTime) : '—'],
    ];
    sfx.finish();
  }
  $('result-title').textContent = heading;
  $('result-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('result-msg').textContent = msg;
  $('result-lines').innerHTML = lines.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('');
  setTimeout(() => $('finish').classList.remove('hidden'), reason === 'timeup' ? 1600 : 1200);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  gfx.resize();
});

function updateCountdown(dt) {
  timeLeft -= dt;
  const sec = Math.ceil(timeLeft);
  if (sec >= 1 && sec <= 5 && sec !== lastTick) {
    lastTick = sec;
    sfx.countdown();
  }
  // 콤보 유지 시간이 지나면 콤보 초기화
  if (combo > 0 && playTime - lastPlaceAt > COMBO_WINDOW) {
    combo = 0;
    ui.setScore(score, 0);
  }
  ui.setComboTime(combo > 1 ? 1 - (playTime - lastPlaceAt) / COMBO_WINDOW : 0);
  ui.setTimer(Math.max(0, timeLeft), { countdown: true, urgent: timeLeft <= 10 });
  if (timeLeft <= 0) finish('timeup');
}

// ── 게임 루프 ──────────────────────────────
const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);
  tick(Math.min(clock.getDelta(), 0.05));
}

function tick(dt) {
  elapsed += dt;
  const playing = state === 'play';
  // 배경음악 분위기: 플레이 중엔 비트, 타임 어택 마지막 10초는 빨라지고, 메뉴·결과·일시정지는 잔잔하게
  const paused = !!document.querySelector('#pause:not(.hidden)');
  music.setMode(!playing || (mp && !mp.active) ? 'menu' : mode === 'timed' && !mp && timeLeft <= 10 && timeLeft > 0 ? 'tense' : 'play');
  music.setDuck(paused);

  if (playing) {
    player.update(dt);
    interaction.driveHeld(); // 스텝 전에: 충돌 계산이 뒤따라 적용돼 가구를 뚫지 않음
    if (mp) mp.beforeStep(dt); // 대전: 참가자가 든 물건 끌기 / 참가자 화면의 위치 보정
    world.step(1 / 60, dt, 4);
    // 세게 부딪힌 도자기·유리 물건은 여기서 깨뜨린다 (물리 스텝 도중엔 바디를 지울 수 없어서)
    for (const it of items) {
      if (it.breakPending) {
        it.breakPending = false;
        it.mesh.position.copy(it.body.position);
        tidy.shatter(it);
      }
    }
    playTime += dt;
    if (mp) { /* 대전은 mp.frame 이 시간을 표시 */ }
    else if (mode === 'timed') updateCountdown(dt);
    else ui.setTimer(playTime);
  } else if (state === 'done') {
    world.step(1 / 60, dt, 4);
  }

  for (const it of items) {
    if (it.removing || it.removed) continue;
    it.mesh.position.copy(it.body.interpolatedPosition);
    it.mesh.quaternion.copy(it.body.interpolatedQuaternion);
  }
  for (const m of ctx.movables) m.sync(dt);

  director.update(dt);
  if (playing) interaction.update(dt);
  if (mp) mp.frame(dt);
  // 정리 판정은 방장만 계산 (참가자는 방장이 보내 준 상태를 따른다)
  tidy.update(dt, elapsed, playing && (!mp || mp.isHost));
  effects.update(dt);
  gfx.render(dt);
  // 첫 화면이 그려지면 전환 커튼을 서서히 걷는다 (셰이더 준비 시간을 위해 두 프레임 뒤)
  if (!revealed) {
    revealed = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      curtain.classList.add('gone');
      // 전환이 끝나면 '등장 애니메이션 생략' 표시도 해제 (이후 타이틀↔방 선택 이동은 애니메이션 재생)
      setTimeout(() => document.documentElement.classList.remove('switching'), 800);
    }));
  }
}
frame();

// 디버그/검증용 핸들
window.__game = {
  scene, world, items, player, tidy, interaction, camera, gfx, movables: ctx.movables,
  get state() { return state; },
  get mode() { return mode; },
  get score() { return score; },
  get timeLeft() { return timeLeft; },
  set timeLeft(v) { timeLeft = v; },
  get playTime() { return playTime; },
  // 포인터 락 없이 플레이 상태로 전환 (자동화 테스트용)
  debugStart: beginPlay,
  tick,
  get mp() { return mp; },
  enterSelect,
  enterTitle,
  director,
  settings,
  // ESC로 마우스 잠금이 풀린 상황 흉내 (자동화 테스트용)
  debugPause() {
    state = 'pause';
    showPause();
  },
  updateCountdown,
};
