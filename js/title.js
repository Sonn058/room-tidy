// 타이틀(메인) 화면: 방 안을 천천히 도는 카메라 + 메뉴(게임 시작·조작법·설정·기록)
import * as THREE from 'three';
import { initAudio, sfx } from './audio.js';
import { formatTime } from './ui.js';
import { DEFAULTS, recordKey, readNumber } from './settings.js';

const $ = (id) => document.getElementById(id);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// 카메라 연출: 'orbit'(타이틀) ↔ 'player'(1인칭). 모드가 바뀌면 이전 시점에서 부드럽게 미끄러진다
export class CameraDirector {
  constructor(camera, player, center = new THREE.Vector3(0, 0.9, 0.3)) {
    Object.assign(this, { camera, player, center });
    this.mode = 'player';
    this.glide = null;
    this.orbitTime = 0;
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
  }

  setMode(mode, duration = 1.6) {
    if (mode === this.mode) return;
    const cam = this.camera;
    this.glide = duration > 0
      ? { t: 0, duration, pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov }
      : null;
    this.mode = mode;
  }

  update(dt) {
    const cam = this.camera;
    if (this.mode === 'orbit') {
      // 방 가운데를 바라보며 아주 천천히 한 바퀴 (살짝 오르내림)
      this.orbitTime += dt;
      const a = this.orbitTime * 0.06 + 0.6;
      const r = 2.4;
      cam.position.set(
        this.center.x + Math.sin(a) * r,
        1.8 + Math.sin(this.orbitTime * 0.25) * 0.08,
        this.center.z + Math.cos(a) * r,
      );
      cam.lookAt(this.center);
      cam.fov = 58;
    } else {
      this.player.updateCamera(dt);
    }
    if (this.glide) {
      const g = this.glide;
      g.t = Math.min(1, g.t + dt / g.duration);
      const e = ease(g.t);
      this._pos.copy(cam.position);
      this._quat.copy(cam.quaternion);
      const fov = cam.fov;
      cam.position.lerpVectors(g.pos, this._pos, e);
      cam.quaternion.slerpQuaternions(g.quat, this._quat, e);
      cam.fov = g.fov + (fov - g.fov) * e;
      if (g.t >= 1) this.glide = null;
    }
    cam.updateProjectionMatrix();
  }
}

// 타이틀 메뉴. settings 는 main.js 가 가진 설정 객체(바뀌면 onSettingsChange 로 적용·저장)
export function setupTitle({ maps, settings, onSettingsChange, onPlay }) {
  const root = $('title');
  const sheetEl = $('title-sheet');
  const buttons = [...root.querySelectorAll('#title-menu button')];
  const SHEETS = {
    help: { kicker: 'HOW TO PLAY', title: '조작법' },
    settings: { kicker: 'SETTINGS', title: '설정' },
    records: { kicker: 'RECORDS', title: '기록' },
    mp: { kicker: 'MULTIPLAYER', title: '2인 대전' },
  };
  let open = null;

  for (const b of buttons) {
    b.addEventListener('click', () => {
      initAudio();
      if (b.dataset.act === 'play') {
        closeSheet();
        onPlay();
      } else toggleSheet(b.dataset.act);
    });
    // 마우스를 올리면 키보드 선택도 함께 옮겨 간다
    b.addEventListener('mouseenter', () => b.focus({ preventScroll: true }));
    b.addEventListener('focus', () => sfx.tick());
  }
  $('sheet-close').addEventListener('click', closeSheet);

  function toggleSheet(name) {
    if (open === name) return closeSheet();
    open = name;
    sheetEl.classList.remove('hidden');
    sheetEl.style.animation = 'none';
    void sheetEl.offsetWidth;
    sheetEl.style.animation = '';
    $('sheet-kicker').textContent = SHEETS[name].kicker;
    $('sheet-title').textContent = SHEETS[name].title;
    for (const n of Object.keys(SHEETS)) $(`sheet-${n}`).classList.toggle('hidden', n !== name);
    for (const b of buttons) b.classList.toggle('open', b.dataset.act === name);
    if (name === 'settings') syncSettings();
    if (name === 'records') renderRecords();
  }

  function closeSheet() {
    if (!open) return;
    open = null;
    sheetEl.classList.add('hidden');
    for (const b of buttons) b.classList.remove('open');
  }

  // ── 설정 ──
  const sens = $('set-sens'), vol = $('set-vol'), mus = $('set-music');
  function syncSettings() {
    sens.value = settings.sensitivity;
    vol.value = settings.volume;
    mus.value = settings.musicVolume;
    $('set-music-v').textContent = `${Math.round(settings.musicVolume * 100)}%`;
    $('set-sens-v').textContent = `${Number(settings.sensitivity).toFixed(2)}x`;
    $('set-vol-v').textContent = `${Math.round(settings.volume * 100)}%`;
    for (const b of $('set-bob').children) b.classList.toggle('on', (b.dataset.v === 'on') === settings.headBob);
  }
  const changed = () => { syncSettings(); onSettingsChange(); };
  sens.addEventListener('input', () => { settings.sensitivity = Number(sens.value); changed(); });
  vol.addEventListener('input', () => { settings.volume = Number(vol.value); changed(); });
  mus.addEventListener('input', () => { settings.musicVolume = Number(mus.value); changed(); });
  vol.addEventListener('change', () => { initAudio(); sfx.place(); }); // 놓으면 들어 보기
  for (const b of $('set-bob').children) b.addEventListener('click', () => { settings.headBob = b.dataset.v === 'on'; changed(); });
  $('set-reset').addEventListener('click', () => { Object.assign(settings, DEFAULTS); changed(); });

  // ── 기록 ──
  function renderRecords() {
    const rows = maps.map((m) => {
      const best = readNumber(recordKey.best(m.id));
      const time = readNumber(recordKey.bestTime(m.id));
      return `<tr><td>${m.name}</td>` +
        `<td class="${best ? '' : 'none'}">${best ? `${best.toLocaleString()}점` : '—'}</td>` +
        `<td class="${time ? '' : 'none'}">${time ? formatTime(time) : '—'}</td></tr>`;
    }).join('');
    $('sheet-records').innerHTML =
      `<table class="records"><thead><tr><th>방</th><th>타임 어택 최고</th><th>자유 모드 최단</th></tr></thead><tbody>${rows}</tbody></table>` +
      '<p class="sheet-note">기록은 이 브라우저에만 저장돼요.</p>';
  }

  return {
    get sheetOpen() { return !!open; },
    show() {
      root.classList.remove('hidden', 'leaving');
      // 등장 애니메이션 다시 재생
      root.querySelectorAll('.title-logo, .title-menu button').forEach((el) => {
        el.style.animation = 'none';
        void el.offsetWidth;
        el.style.animation = '';
      });
      buttons[0].focus({ preventScroll: true });
    },
    hide() {
      closeSheet();
      root.classList.add('leaving');
      setTimeout(() => root.classList.add('hidden'), 450);
    },
    // ↑↓ 로 메뉴 이동, Esc 로 열린 창 닫기, (메뉴 밖에서) Enter 로 시작
    onKey(e) {
      const i = buttons.indexOf(document.activeElement);
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault();
        const n = buttons.length, d = e.code === 'ArrowDown' ? 1 : -1;
        buttons[i < 0 ? 0 : (i + d + n) % n].focus({ preventScroll: true });
      } else if (e.code === 'Escape') {
        closeSheet();
      } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && i < 0 && !sheetEl.contains(document.activeElement)) {
        e.preventDefault();
        buttons[0].click();
      }
    },
  };
}
