// 2인 대전: 한 명은 정리 담당, 한 명은 방해꾼.
// 방장(host)의 컴퓨터가 물리를 계산하고, 참가자(guest)는 자기 움직임·행동을 보내고 방 상태를 받아서 그린다.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Net, peekRoom } from './net.js';
import { sfx, initAudio } from './audio.js';
import { josa } from './tidy.js';

const $ = (id) => document.getElementById(id);

export const MATCH = { time: 150, goal: 0.7 }; // 150초 · 정리율 70%
// 방해꾼 밸런스: 에너지(액션 포인트)와 쿨다운
const SAB = {
  maxEnergy: 100, startEnergy: 60, regen: 7, // 초당 회복
  shove: 20, spill: 50, furniture: 10, // 행동별 에너지
  itemCd: 10, zoneCd: 25, movCd: 6, // 같은 물건 · 같은 구역 · 같은 가구를 다시 건드릴 수 있을 때까지(초)
};
const SEND_HZ = 20;
const ROLE_NAME = { tidy: '정리 담당', mess: '방해꾼' };
const other = (r) => (r === 'tidy' ? 'mess' : 'tidy');
const r3 = (v) => Math.round(v * 1000) / 1000;

// ── 타이틀의 2인 대전 로비 ──────────────────────────────
export function setupLobby(maps, firstMap) {
  let mapId = firstMap || maps[0].id;
  const mapSeg = $('mp-map');
  mapSeg.innerHTML = maps.map((m) => `<button data-v="${m.id}">${m.emoji} ${m.name}</button>`).join('');
  const sync = () => { for (const b of mapSeg.children) b.classList.toggle('on', b.dataset.v === mapId); };
  for (const b of mapSeg.children) b.addEventListener('click', () => { mapId = b.dataset.v; sync(); });
  sync();

  // 방 만들기: 고른 방으로 불러온 뒤 대기 화면에서 코드를 받고 역할을 정한다
  $('mp-create').addEventListener('click', () => { location.href = `?map=${mapId}&mp=host`; });
  const msg = $('mp-lobby-msg');
  const join = async () => {
    const code = $('mp-code').value.trim().toUpperCase();
    if (code.length !== 4) { msg.textContent = '4자리 코드를 입력해 주세요'; return; }
    msg.textContent = '방을 찾는 중…';
    try {
      const info = await peekRoom(code);
      if (!info.ok) { msg.textContent = info.missing ? '그런 코드의 방이 없어요' : '이미 두 명이 들어가 있어요'; return; }
      location.href = `?map=${info.map}&mp=join&code=${code}`;
    } catch {
      msg.textContent = '게임 서버에 연결할 수 없어요';
    }
  };
  $('mp-join').addEventListener('click', join);
  // 코드 입력 중에는 게임 키(이동·메뉴)가 반응하지 않게
  $('mp-code').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Enter') join(); });
}

// 상대 플레이어 모습: 몸통 + 머리 + 역할 이름표
function makeAvatar(role) {
  const g = new THREE.Group();
  const color = role === 'tidy' ? '#6fb6ff' : '#ff7a6b';
  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...extra });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.62, 6, 16), mat(color));
  body.position.y = 0.6;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 14), mat('#ffd9bd'));
  head.position.y = 1.32;
  const eyeGeo = new THREE.SphereGeometry(0.025, 8, 6);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, mat('#2a2230'));
    eye.position.set(s * 0.07, 1.36, -0.17);
    g.add(eye);
  }
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(color));
  cap.position.y = 1.36;
  [body, head, cap].forEach((m) => { m.castShadow = true; g.add(m); });
  // 이름표
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(24,18,15,0.8)';
  c.beginPath(); c.roundRect(8, 8, 240, 48, 24); c.fill();
  c.fillStyle = color; c.font = "900 28px 'Nunito','Noto Sans KR',sans-serif"; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(ROLE_NAME[role], 128, 34);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
  tag.scale.set(0.6, 0.15, 1);
  tag.position.y = 1.75;
  tag.renderOrder = 20;
  g.add(tag);
  g.visible = false;
  return g;
}

// g: main.js 가 넘겨주는 게임 객체들
export function setupMultiplayer(g) {
  const { params, map, items, movables, tidy, ui, interaction, player, camera, effects } = g;
  const isHost = params.get('mp') === 'host';
  const net = new Net();
  let hostRole = params.get('role') === 'mess' ? 'mess' : 'tidy';
  const mp = {
    isHost, myRole: null, active: false, running: false, ended: false,
    get canAct() { return this.active && !this.ended; },
  };

  let myReady = false, peerReady = false, started = false;
  let matchLeft = MATCH.time;
  let energy = SAB.startEnergy;
  const itemCd = new Map(), zoneCd = new Map(), movCd = new Map(); // (방장) 남은 쿨다운
  let cdView = { i: [], z: [], m: [] }; // (참가자) 방장이 알려준 쿨다운
  const stats = { shove: 0, spill: 0, furniture: 0 };
  let remote = null; // 상대의 최근 상태 {p, yaw, pitch, cam, dir, hd, hr}
  let remoteHeld = null; // (방장) 참가자가 들고 있는 물건
  let sendT = 0;
  let aimZone = null;
  const idxOf = (it) => items.indexOf(it);
  const movIdx = (m) => movables.indexOf(m);

  // ── 안내창 ──
  const ov = $('mp-overlay');
  function overlay({ kicker = '2인 대전', title, code = null, text = '', ready = false, lines = null, leave = '나가기', roles = false }) {
    ov.classList.remove('hidden');
    $('mp-role-pick').classList.toggle('hidden', !roles);
    if (roles && mp.myRole) for (const b of $('mp-role-pick').querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === mp.myRole);
    $('mp-kicker').textContent = kicker;
    $('mp-title').textContent = title;
    $('mp-code-big').classList.toggle('hidden', !code);
    if (code) $('mp-code-big').textContent = code;
    $('mp-text').innerHTML = text;
    $('mp-ready').classList.toggle('hidden', !ready);
    $('mp-lines').classList.toggle('hidden', !lines);
    if (lines) $('mp-lines').innerHTML = lines.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('');
    $('mp-leave').textContent = leave;
  }
  const hideOverlay = () => ov.classList.add('hidden');
  $('mp-leave').addEventListener('click', () => { mp.ended = true; net.close(); g.goTitle(); });
  $('mp-ready').addEventListener('click', () => {
    initAudio();
    g.lock();
    hideOverlay();
    if (!myReady) { myReady = true; net.send({ t: 'ready' }); maybeStart(); }
    if (!started) ui.toast('상대가 준비하면 시작해요', 'good');
  });
  $('retry-btn').classList.add('hidden'); // 대전 중엔 '처음부터 다시'(새 방이 생김) 대신 나가기만

  const ROLE_HELP = {
    tidy: '물건을 제자리에 정리해요. <b>150초 뒤 정리율 70% 이상</b>이면 승리! 100%를 채우면 바로 승리예요.',
    mess: `<b>클릭</b> 툭 치기(에너지 ${SAB.shove}) · <b>우클릭</b> 정리된 구역 와르르 쏟기(${SAB.spill}) · <b>E</b> 서랍·의자 조작(${SAB.furniture})
에너지는 시간이 지나면 다시 차요. 같은 물건은 ${SAB.itemCd}초, 같은 구역은 ${SAB.zoneCd}초 동안 다시 어지를 수 없어요.
<b>정리율 70%를 못 넘게 막으면</b> 승리!`,
  };
  // 대기 화면: 코드(방장) · 상대 입장 여부 · 역할 고르기
  let peerHere = false;
  function showWaiting() {
    const urls = (lobbyUrls || []).join('\n') || location.origin;
    if (isHost && !peerHere) {
      overlay({
        title: '친구를 기다리는 중', code: roomCode, roles: true,
        text: `친구가 타이틀의 <b>2인 대전 → 코드로 참가</b>에 이 코드를 입력하면 돼요.\n친구의 접속 주소 (같은 와이파이):\n<b>${urls}</b>\n내 역할: <b>${ROLE_NAME[mp.myRole]}</b>`,
      });
    } else {
      overlay({
        title: '둘 다 모였어요!', roles: true, ready: true,
        text: `내 역할은 <b>${ROLE_NAME[mp.myRole]}</b>이에요. (위에서 바꿀 수 있어요)\n${ROLE_HELP[mp.myRole]}`,
      });
    }
  }
  const showReady = () => { peerHere = true; showWaiting(); };
  let roomCode = '', lobbyUrls = [];

  // 역할 고르기: 내가 고르면 상대는 자동으로 반대 역할
  for (const b of $('mp-role-pick').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      if (started || b.dataset.v === mp.myRole) return;
      const hr = isHost ? b.dataset.v : other(b.dataset.v);
      setRoles(hr);
      net.send({ t: 'role', hr });
      sfx.tick();
      showWaiting();
    });
  }

  // ── 역할에 따라 화면·조작이 바뀐다 (여러 번 불려도 안전) ──
  function setRoles(hr) {
    hostRole = hr;
    mp.myRole = isHost ? hr : other(hr);
    myReady = false; peerReady = false;
    const badge = $('mp-role-badge');
    badge.textContent = `나: ${ROLE_NAME[mp.myRole]}`;
    badge.className = `glass ${mp.myRole}`;
    $('mp-energy').classList.toggle('hidden', mp.myRole !== 'mess');
    if (avatar) g.scene.remove(avatar);
    avatar = makeAvatar(other(mp.myRole));
    g.scene.add(avatar);
  }

  // 조작 덮어쓰기는 한 번만 설치하고, 실행할 때마다 지금 역할을 보고 동작을 정한다
  const orig = {
    grab: interaction.grab.bind(interaction),
    release: interaction.release.bind(interaction),
    useFurniture: interaction.useFurniture.bind(interaction),
    refreshPrompt: interaction.refreshPrompt.bind(interaction),
  };
  const UP = new CANNON.Vec3(0, 1, 0);
  interaction.grab = (item) => {
    if (!mp.canAct) return;
    if (mp.myRole === 'mess') return act({ k: 'shove', i: idxOf(item) }); // 방해꾼: 클릭 = 툭 치기
    if (isHost) return orig.grab(item);
    // 참가자인 정리 담당: 요청만 보내고 실제 물리는 방장이 계산
    if (item.held) return;
    const yawQ = new CANNON.Quaternion().setFromAxisAngle(UP, player.yaw);
    const q = new CANNON.Quaternion(item.mesh.quaternion.x, item.mesh.quaternion.y, item.mesh.quaternion.z, item.mesh.quaternion.w);
    interaction.holdRel = yawQ.conjugate().mult(q);
    interaction.holdDist = 1.2;
    const hr = interaction.holdRel;
    net.send({ t: 'a', k: 'grab', i: idxOf(item), hr: [hr.x, hr.y, hr.z, hr.w] });
    sfx.pickup();
  };
  interaction.release = (throwIt) => {
    if (mp.myRole === 'mess' || isHost) return orig.release(throwIt);
    const it = interaction.held;
    if (!it) return;
    const d = interaction.dir;
    net.send({ t: 'a', k: 'rel', th: !!throwIt, d: [d.x, d.y, d.z] });
    it.held = false;
    interaction.held = null;
    ui.setHolding(null);
    orig.refreshPrompt();
    if (throwIt) { sfx.throw(); if (it.squeaky) sfx.squeak(1); } else sfx.drop();
  };
  interaction.useFurniture = (m) => {
    if (!mp.canAct) return;
    if (mp.myRole === 'mess') return act({ k: 'furn', m: movIdx(m) });
    if (isHost) return orig.useFurniture(m);
    net.send({ t: 'a', k: 'furn', m: movIdx(m) });
  };
  interaction.refreshPrompt = () => { if (mp.myRole !== 'mess') orig.refreshPrompt(); };
  addEventListener('mousedown', (e) => { // 방해꾼의 우클릭 = 정리된 구역 쏟기
    if (e.button === 2 && mp.myRole === 'mess' && mp.canAct && g.isPlaying() && aimZone) act({ k: 'spill', z: aimZone.id });
  });

  // ── 연결 ──
  overlay({ title: '연결 중…' });
  net.ready.then(() => {
    if (isHost) net.send({ t: 'create', map: map.id, role: hostRole });
    else net.send({ t: 'join', code: params.get('code') });
  }).catch(() => overlay({ title: '서버에 연결할 수 없어요', text: '게임 서버(start.bat)가 켜져 있는지 확인해 주세요.', leave: '타이틀로' }));

  net.on('created', (m) => {
    roomCode = m.code; lobbyUrls = m.urls;
    setRoles(hostRole);
    showWaiting();
  });
  net.on('joined', (m) => { setRoles(m.hostRole); showReady(); });
  // 상대가 역할을 바꿨다: 준비가 풀리고 대기 화면을 다시 보여 준다
  net.on('role', (m) => {
    if (started) return;
    if (document.pointerLockElement) document.exitPointerLock();
    setRoles(m.hr);
    ui.toast(`역할이 바뀌었어요: 나는 ${ROLE_NAME[mp.myRole]}`, 'good');
    showWaiting();
  });
  net.on('join-failed', (m) => overlay({
    title: '참가할 수 없어요', text: m.reason === 'full' ? '이미 두 명이 들어가 있어요.' : '방이 사라졌어요. 코드를 다시 확인해 주세요.', leave: '타이틀로',
  }));
  net.on('peer-joined', () => { sfx.place(); showReady(); });
  net.on('peer-left', () => {
    if (mp.ended) return;
    mp.ended = true; mp.active = false; mp.running = false;
    g.setState('done');
    document.exitPointerLock();
    overlay({ title: '상대가 나갔어요', text: '경기가 끝났어요.', leave: '타이틀로' });
  });
  net.on('closed', () => {
    if (mp.ended) return;
    mp.ended = true; mp.active = false; mp.running = false;
    g.setState('done');
    document.exitPointerLock();
    overlay({ title: '연결이 끊겼어요', text: '게임 서버와의 연결이 끊어졌어요.', leave: '타이틀로' });
  });
  net.on('ready', () => { peerReady = true; maybeStart(); });
  net.on('go', () => startCountdown());
  net.on('msg', (m) => ui.toast(m.text, m.type || 'warn'));
  net.on('fx', (m) => fx(m.kind, m.arg));
  net.on('end', (m) => showEnd(m));
  net.on('a', (m) => { if (isHost) hostAction(m, 'guest'); });
  net.on('st', (m) => { remote = m; });
  net.on('s', (s) => { if (!isHost) applySnapshot(s); });

  function maybeStart() {
    if (!isHost || started || !myReady || !peerReady) return;
    net.send({ t: 'go' });
    startCountdown();
  }

  function startCountdown() {
    if (started) return;
    started = true;
    mp.running = true;
    $('mp-hud').classList.remove('hidden');
    const cd = $('mp-countdown');
    [3, 2, 1].forEach((n, i) => setTimeout(() => { cd.textContent = n; sfx.countdown(); }, i * 1000));
    setTimeout(() => {
      cd.textContent = '시작!';
      sfx.bonus();
      mp.active = true;
      ui.toast(mp.myRole === 'tidy' ? '정리 시작! 70%를 넘겨요' : '방해 시작! 70%를 못 넘게 막아요', 'great');
    }, 3000);
    setTimeout(() => { cd.textContent = ''; }, 3800);
  }

  // ── 방장: 행동 처리 (방장 자신 또는 참가자가 요청) ──
  const tell = (who, text, type = 'warn') => (who === 'host' ? ui.toast(text, type) : net.send({ t: 'msg', text, type }));
  function act(cmd) {
    if (!mp.canAct) return;
    if (isHost) hostAction(cmd, 'host');
    else net.send({ t: 'a', ...cmd });
  }

  function hostAction(cmd, who) {
    if (!mp.canAct) return;
    const role = who === 'host' ? hostRole : other(hostRole);
    switch (cmd.k) {
      case 'grab': {
        const it = items[cmd.i];
        if (role !== 'tidy' || !it || it.held || it.removed || it.removing || remoteHeld) return;
        it.held = true; it.heldBy = 'guest'; it.settle = 0;
        if (it.placed) tidy.unplace(it);
        it.body.allowSleep = false;
        it.body.wakeUp();
        remoteHeld = it;
        if (remote) remote.hr = cmd.hr;
        else remote = { hr: cmd.hr, hd: 1.2 };
        return;
      }
      case 'rel': {
        const it = remoteHeld;
        if (!it) return;
        remoteHeld = null;
        it.held = false; it.heldBy = null;
        const b = it.body;
        b.allowSleep = true;
        if (cmd.th) {
          const d = cmd.d;
          b.velocity.set(d[0] * 6, d[1] * 6 + 1, d[2] * 6);
          b.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
        } else {
          b.velocity.scale(0.2, b.velocity);
          b.angularVelocity.scale(0.2, b.angularVelocity);
        }
        return;
      }
      case 'furn': {
        const m = movables[cmd.m];
        if (!m) return;
        if (role === 'mess') return sabotageFurniture(m, who);
        const why = m.toggle();
        if (why) tell(who, why);
        else furnitureMoved(m);
        return;
      }
      case 'shove': if (role === 'mess') sabotageShove(items[cmd.i], who); return;
      case 'spill': if (role === 'mess') sabotageSpill(cmd.z, who); return;
    }
  }

  function furnitureMoved(m) {
    if (m.kind === 'drawer') sfx.drawer(m.state === 1); else sfx.slide();
    for (const it of items) if (!it.removed && it.body.position.distanceTo(m.body.position) < 1.6) it.body.wakeUp();
  }

  // 물건을 툭 쳐서 날려 보낸다 (도자기·유리는 살살 → 이 힘으로는 안 깨짐)
  function kick(it) {
    const b = it.body;
    b.wakeUp();
    const a = Math.random() * Math.PI * 2;
    const sp = it.fragile ? 1.6 : 3.4, up = it.fragile ? 1.2 : 2.6;
    b.velocity.set(Math.cos(a) * sp, up, Math.sin(a) * sp);
    b.angularVelocity.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    it.noBreakUntil = performance.now() + 3000;
  }

  function spend(cost, who) {
    if (energy < cost) { tell(who, `방해 에너지가 부족해요 (${Math.floor(energy)} / ${cost})`); return false; }
    energy -= cost;
    return true;
  }

  function sabotageShove(it, who) {
    if (!it || it.removed || it.removing) return;
    if (it.held) return tell(who, '정리 담당이 들고 있는 물건은 못 건드려요');
    const cd = itemCd.get(it) || 0;
    if (cd > 0) return tell(who, `${josa(it.name, '은', '는')} ${Math.ceil(cd)}초 뒤에 다시 어지를 수 있어요`);
    if (!spend(SAB.shove, who)) return;
    itemCd.set(it, SAB.itemCd);
    stats.shove++;
    if (it.placed) tidy.unplace(it);
    kick(it);
    broadcast('shove', idxOf(it));
  }

  function sabotageSpill(zoneId, who) {
    const z = tidy.zoneById[zoneId];
    if (!z || zoneId === 'trash') return;
    if (z.movable && z.movable.state === 0) return tell(who, '닫힌 서랍은 쏟을 수 없어요');
    const cd = zoneCd.get(zoneId) || 0;
    if (cd > 0) return tell(who, `${josa(z.label, '은', '는')} ${Math.ceil(cd)}초 뒤에 다시 쏟을 수 있어요`);
    const victims = items.filter((it) => it.target === zoneId && it.placed && !it.removed && !it.removing && !it.held);
    if (!victims.length) return tell(who, '여기엔 쏟을 정리된 물건이 없어요');
    if (!spend(SAB.spill, who)) return;
    zoneCd.set(zoneId, SAB.zoneCd);
    stats.spill++;
    for (const it of victims) {
      tidy.unplace(it);
      kick(it);
      itemCd.set(it, Math.max(itemCd.get(it) || 0, 3));
    }
    broadcast('spill', zoneId);
  }

  function sabotageFurniture(m, who) {
    const cd = movCd.get(m) || 0;
    if (cd > 0) return tell(who, `${josa(m.name, '은', '는')} ${Math.ceil(cd)}초 뒤에 다시 조작할 수 있어요`);
    if (energy < SAB.furniture) return tell(who, `방해 에너지가 부족해요 (${Math.floor(energy)} / ${SAB.furniture})`);
    const why = m.toggle();
    if (why) return tell(who, why);
    energy -= SAB.furniture;
    movCd.set(m, SAB.movCd);
    stats.furniture++;
    furnitureMoved(m);
  }

  // 방해 효과: 양쪽 화면에 소리·먼지·알림
  function broadcast(kind, arg) {
    fx(kind, arg);
    net.send({ t: 'fx', kind, arg });
  }
  function fx(kind, arg) {
    const dust = ['#e8dccb', '#ffffff', '#d9c7b0'];
    if (kind === 'shove') {
      const it = items[arg];
      if (!it) return;
      sfx.throw();
      effects.burst(it.mesh.position.clone(), { colors: dust, count: 10, speed: 1.2, up: 1 });
      if (mp.myRole === 'tidy') ui.toast(`방해꾼이 ${josa(it.name, '을', '를')} 툭 쳤어요!`, 'warn');
    } else if (kind === 'spill') {
      const z = tidy.zoneById[arg];
      if (!z) return;
      sfx.crash ? sfx.crash() : sfx.trash();
      effects.burst(z.box.getCenter(new THREE.Vector3()), { colors: dust, count: 26, speed: 2, up: 2 });
      ui.toast(mp.myRole === 'tidy' ? `방해꾼이 ${z.label}을 와르르 쏟았어요!` : `${z.label} 와르르!`, mp.myRole === 'tidy' ? 'warn' : 'great');
    }
  }

  // ── 참가자: 방장의 상태를 받아 반영 ──
  if (!isHost) {
    interaction.remoteDrive = true; // 들고 있는 물건을 직접 움직이지 않음 (방장이 계산)
    for (const it of items) {
      const b = it.body;
      b.type = CANNON.Body.KINEMATIC;
      b.mass = 0;
      b.updateMassProperties();
      b.velocity.set(0, 0, 0);
      b.angularVelocity.set(0, 0, 0);
      it.netP = new THREE.Vector3().copy(b.position);
      it.netQ = new THREE.Quaternion().copy(b.quaternion);
    }
  }
  let firstSnap = true;
  function applySnapshot(s) {
    matchLeft = s.tl;
    energy = s.e;
    cdView = s.cd;
    if (s.pl) remote = { p: [s.pl[0], s.pl[1], s.pl[2]], yaw: s.pl[3] };
    for (let i = 0; i < items.length; i++) {
      const it = items[i], k = i * 7, a = s.it;
      it.netP.set(a[k], a[k + 1], a[k + 2]);
      it.netQ.set(a[k + 3], a[k + 4], a[k + 5], a[k + 6]);
      if (firstSnap) { it.body.position.set(a[k], a[k + 1], a[k + 2]); it.body.quaternion.set(a[k + 3], a[k + 4], a[k + 5], a[k + 6]); }
      const f = s.f[i]; // 한 글자 상태: b 깨짐 · r 사라짐 · g 참가자가 듦 · h 방장이 듦 · p 정리됨 · 0 평소
      if (f === 'b' && !it.broken) { it.mesh.position.copy(it.netP); tidy.shatter(it); continue; }
      if (f === 'r' && !it.removed && !it.removing && !it.placed) { tidy.place(it); continue; }
      if (f === 'p' && !it.placed) tidy.place(it);
      else if (f !== 'p' && f !== 'r' && f !== 'b' && it.placed) tidy.unplace(it);
      it.held = f === 'g' || f === 'h';
      if (f === 'g' && interaction.held !== it) {
        interaction.held = it;
        interaction.refreshPrompt();
      } else if (f !== 'g' && interaction.held === it) {
        interaction.held = null;
        ui.setHolding(null);
        interaction.refreshPrompt();
      }
    }
    s.mv.forEach((st, i) => {
      const m = movables[i];
      if (m && m.state !== st) { m.state = st; if (m.kind === 'drawer') sfx.drawer(st === 1); else sfx.slide(); }
    });
    firstSnap = false;
  }

  // ── 방장: 상태 보내기 ──
  function snapshot() {
    const it = [], f = [];
    for (const x of items) {
      const p = x.body.position, q = x.body.quaternion;
      it.push(r3(p.x), r3(p.y), r3(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w));
      f.push(x.broken ? 'b' : x.removed || x.removing ? 'r' : x.heldBy === 'guest' ? 'g' : x.held ? 'h' : x.placed ? 'p' : '0');
    }
    const cd = {
      i: [...itemCd].filter(([, s]) => s > 0).map(([x, s]) => [idxOf(x), Math.ceil(s)]),
      z: [...zoneCd].filter(([, s]) => s > 0).map(([z, s]) => [z, Math.ceil(s)]),
      m: [...movCd].filter(([, s]) => s > 0).map(([m, s]) => [movIdx(m), Math.ceil(s)]),
    };
    const pb = player.body.position;
    net.send({
      t: 's', it, f: f.join(''), mv: movables.map((m) => m.state),
      e: Math.round(energy * 10) / 10, cd, tl: Math.round(matchLeft * 10) / 10,
      pl: [r3(pb.x), r3(pb.y), r3(pb.z), r3(player.yaw)],
    });
  }

  // ── 매 프레임 ──
  let avatar = null;
  const avatarPos = new THREE.Vector3();
  let avatarYaw = 0;

  mp.beforeStep = (dt) => {
    if (isHost) {
      // 참가자가 들고 있는 물건을 참가자의 시점 기준으로 끌고 다닌다
      if (remoteHeld && remote && remote.cam) {
        const c = remote.cam, d = remote.dir;
        interaction.driveBody(remoteHeld.body, { x: c[0], y: c[1], z: c[2] }, { x: d[0], y: d[1], z: d[2] },
          remote.hd || 1.2, remote.yaw || 0, new CANNON.Quaternion(...(remote.hr || [0, 0, 0, 1])));
      }
    } else {
      // 받은 위치로 부드럽게 따라가기
      const a = 1 - Math.exp(-dt * 18);
      for (const it of items) {
        if (it.removed || it.removing) continue;
        const b = it.body;
        b.position.x += (it.netP.x - b.position.x) * a;
        b.position.y += (it.netP.y - b.position.y) * a;
        b.position.z += (it.netP.z - b.position.z) * a;
        const q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w).slerp(it.netQ, a);
        b.quaternion.set(q.x, q.y, q.z, q.w);
        b.interpolatedPosition.copy(b.position);
        b.interpolatedQuaternion.copy(b.quaternion);
      }
    }
  };

  mp.frame = (dt) => {
    // 방장: 시간 · 에너지 · 쿨다운
    if (isHost && mp.active && !mp.ended) {
      matchLeft -= dt;
      energy = Math.min(SAB.maxEnergy, energy + SAB.regen * dt);
      for (const m of [itemCd, zoneCd, movCd]) for (const [k, s] of m) { if (s - dt <= 0) m.delete(k); else m.set(k, s - dt); }
      if (matchLeft <= 0) endMatch('time');
    }

    // 상태 주고받기
    sendT += dt;
    if (sendT >= 1 / SEND_HZ && started) {
      sendT = 0;
      if (isHost) snapshot();
      else {
        const pb = player.body.position, c = camera.position, d = interaction.dir, hr = interaction.holdRel;
        net.send({
          t: 'st', p: [r3(pb.x), r3(pb.y), r3(pb.z)], yaw: r3(player.yaw), cam: [r3(c.x), r3(c.y), r3(c.z)],
          dir: [r3(d.x), r3(d.y), r3(d.z)], hd: interaction.holdDist, hr: [hr.x, hr.y, hr.z, hr.w],
        });
      }
    }

    // 상대 모습
    if (avatar && remote && remote.p) {
      avatar.visible = true;
      const a = 1 - Math.exp(-dt * 14);
      avatarPos.lerp(new THREE.Vector3(remote.p[0], remote.p[1] - 0.3, remote.p[2]), avatarPos.lengthSq() ? a : 1);
      avatarYaw += ((remote.yaw || 0) - avatarYaw) * a;
      avatar.position.copy(avatarPos);
      avatar.rotation.y = avatarYaw;
    }

    // HUD: 남은 시간 · 줄다리기 막대 · 에너지
    if (started) {
      ui.setTimer(Math.max(0, matchLeft), { countdown: true, urgent: matchLeft <= 10 });
      const ratio = tidy.done / tidy.total;
      $('mp-tug-fill').style.width = `${ratio * 100}%`;
      $('mp-ratio').textContent = `정리율 ${Math.round(ratio * 100)}% · 목표 ${Math.round(MATCH.goal * 100)}%`;
      $('mp-energy-fill').style.width = `${(energy / SAB.maxEnergy) * 100}%`;
      $('mp-energy-text').textContent = `${Math.floor(energy)} / ${SAB.maxEnergy}`;
    }

    // 방해꾼: 조준한 물건·가구·구역에 맞춘 안내 (비용·쿨다운 표시)
    if (mp.myRole === 'mess' && g.isPlaying()) messPrompt();
  };

  const cdOf = (list, key) => { const e = (list || []).find(([k]) => k === key); return e ? e[1] : 0; };
  function itemCdLeft(it) { return isHost ? Math.ceil(itemCd.get(it) || 0) : cdOf(cdView.i, idxOf(it)); }
  function zoneCdLeft(z) { return isHost ? Math.ceil(zoneCd.get(z.id) || 0) : cdOf(cdView.z, z.id); }
  function movCdLeft(m) { return isHost ? Math.ceil(movCd.get(m) || 0) : cdOf(cdView.m, movIdx(m)); }
  const cost = (n, left) => (left > 0 ? `<span class="tip">${left}초 뒤 가능</span>` : `<span class="dest">에너지 ${n}</span>`);

  function messPrompt() {
    // 조준점이 닿은 곳의 정리 구역 찾기
    const rc = interaction.raycaster;
    rc.set(camera.position, interaction.dir);
    const targets = [...g.occluders, ...movables.map((m) => m.group), ...items.filter((x) => !x.removed).map((x) => x.mesh)];
    const hit = rc.intersectObjects(targets, true)[0];
    aimZone = null;
    if (hit) {
      aimZone = tidy.zones.find((z) => z.id !== 'trash' && z.box.clone().expandByScalar(0.12).containsPoint(hit.point)) || null;
    }
    const lines = [];
    const it = interaction.hovered, m = interaction.hoverMov;
    if (it) lines.push(`<b>${it.name}</b><span class="key">클릭</span>툭 치기 ${cost(SAB.shove, itemCdLeft(it))}`);
    else if (m) lines.push(`<b>${m.name}</b><span class="key">E</span>${m.actionLabel()} ${cost(SAB.furniture, movCdLeft(m))}`);
    if (aimZone) {
      const n = items.filter((x) => x.target === aimZone.id && x.placed && !x.removed).length;
      lines.push(`<b>${aimZone.label}</b><span class="key">우클릭</span>와르르 쏟기 (${n}개) ${cost(SAB.spill, zoneCdLeft(aimZone))}`);
    }
    ui.setPrompt(lines.join('<br>'));
  }

  // ── 승패 ──
  mp.onAllTidied = () => { if (isHost) endMatch('all'); };
  // 자동화 테스트용: 방해 행동을 직접 실행 / 남은 시간 조정
  mp.act = act;
  mp.debugSetTime = (v) => { matchLeft = v; };

  function endMatch(reason) {
    if (mp.ended) return;
    const ratio = tidy.done / tidy.total;
    const winner = reason === 'all' || ratio >= MATCH.goal ? 'tidy' : 'mess';
    const res = { t: 'end', winner, reason, ratio, stats, broken: tidy.broken };
    net.send(res);
    showEnd(res);
  }

  function showEnd(res) {
    if (mp.ended) return;
    mp.ended = true; mp.active = false; mp.running = false;
    g.setState('done');
    document.exitPointerLock();
    const win = res.winner === mp.myRole;
    if (win) { sfx.finish(); effects.confetti(camera.position.clone()); } else sfx.timeUp();
    $('mp-hud').classList.add('hidden');
    setTimeout(() => overlay({
      kicker: '경기 종료',
      title: win ? '승리!' : '패배…',
      text: `<b>${ROLE_NAME[res.winner]}</b> 승리! ${res.reason === 'all' ? '방을 100% 정리했어요.' : `정리율 ${Math.round(res.ratio * 100)}% (목표 ${Math.round(MATCH.goal * 100)}%)`}`,
      lines: [
        ['최종 정리율', `${Math.round(res.ratio * 100)}%`],
        ['툭 치기', `${res.stats.shove}번`],
        ['와르르 쏟기', `${res.stats.spill}번`],
        ['가구 조작(방해)', `${res.stats.furniture}번`],
        ['깨진 물건', `${res.broken}개`],
      ],
      leave: '타이틀로',
    }), 900);
  }

  return mp;
}
