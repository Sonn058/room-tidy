// 2인 대전: 한 명은 정리 담당, 한 명은 방해꾼.
// 방장(host)의 컴퓨터가 물리를 계산하고, 참가자(guest)는 자기 움직임·행동을 보내고 방 상태를 받아서 그린다.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Net, peekRoom } from './net.js';
import { sfx, initAudio } from './audio.js';
import { josa } from './tidy.js';
import { G } from './world.js';

const $ = (id) => document.getElementById(id);

export const MATCH = { time: 150, goal: 0.7 }; // 150초 · 정리율 70%
// 방해꾼 밸런스: 에너지(액션 포인트)와 쿨다운
const SAB = {
  maxEnergy: 100, startEnergy: 50,
  regen: 6, // 초당 회복 (가만히 서 있을 때만. 움직이거나 물건을 들고 있으면 회복 없음)
  walkDrain: 1.5, runDrain: 3.5, // 걸을 때 · 달릴 때 초당 소모
  holdDrain: 5, grabMin: 8, // 물건을 들고 있는 동안 초당 소모 · 집어 들 때 필요한 최소 에너지
  spill: 50, furniture: 10, // 구역 뒤집어엎기 · 서랍/의자 조작 비용
  zoneCd: 25, movCd: 6, // 같은 구역 · 같은 가구를 다시 건드릴 수 있을 때까지(초)
};
const RUN_SPEED = 3.3; // 이보다 빠르면 달리는 중 (걷기 2.6 · 달리기 4.3)
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

// 상대가 들고 있는 물건 표시: 물건 둘레에 역할 색의 부드러운 빛무리
function makeHalo() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  const gr = c.createRadialGradient(64, 64, 6, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.renderOrder = 15; s.visible = false;
  return s;
}
const AVATAR_SCALE = 1.5; // 캐릭터 크기 배율 (1 = 키 약 0.85m)
// 상대 플레이어 모습: 헤드폰 낀 통통한 콩 캐릭터 + 역할 이름표
function makeAvatar(role) {
  const g = new THREE.Group();
  const color = role === 'tidy' ? '#9a5fe0' : '#ff7a6b';
  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, ...extra });
  const part = (geo, m, x, y, z, rot = [0, 0, 0], sc = [1, 1, 1]) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z); o.rotation.set(...rot); o.scale.set(...sc);
    o.castShadow = true; g.add(o);
    return o;
  };
  const skin = mat(color);
  // 몸통: 위아래로 길쭉한 콩
  part(new THREE.SphereGeometry(1, 28, 20), skin, 0, 0.5, 0, [0, 0, 0], [0.2, 0.3, 0.18]);
  // 다리 · 발
  for (const s of [-1, 1]) {
    part(new THREE.CapsuleGeometry(0.024, 0.16, 4, 8), skin, s * 0.075, 0.14, 0);
    part(new THREE.SphereGeometry(1, 12, 8), skin, s * 0.075, 0.025, -0.025, [0, 0, 0], [0.05, 0.028, 0.075]);
  }
  // 팔: 한쪽은 옆으로 쭉, 한쪽은 아래로
  part(new THREE.CapsuleGeometry(0.022, 0.22, 4, 8), skin, 0.31, 0.52, 0, [0, 0, Math.PI / 2 - 0.08]);
  part(new THREE.CapsuleGeometry(0.022, 0.22, 4, 8), skin, -0.228, 0.396, 0, [0, 0, -0.3]);
  // 헤드폰: 머리띠 + 노란 귀덮개
  const yellow = mat('#ffc21a', { roughness: 0.4 }), dark = mat('#2a2230');
  part(new THREE.TorusGeometry(0.2, 0.014, 8, 28, Math.PI), dark, 0, 0.62, 0);
  for (const s of [-1, 1]) {
    part(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 20), yellow, s * 0.2, 0.62, 0, [0, 0, Math.PI / 2]);
    part(new THREE.CylinderGeometry(0.045, 0.045, 0.055, 16), dark, s * 0.2, 0.62, 0, [0, 0, Math.PI / 2]);
  }
  // 얼굴: 까만 눈(반짝이 포함) + 웃는 입
  for (const s of [-1, 1]) {
    part(new THREE.SphereGeometry(0.024, 10, 8), dark, s * 0.07, 0.6, -0.168);
    part(new THREE.SphereGeometry(0.008, 6, 6), mat('#ffffff'), s * 0.07 + 0.007, 0.608, -0.188);
  }
  part(new THREE.TorusGeometry(0.045, 0.008, 6, 14, Math.PI), dark, 0, 0.545, -0.178, [0, 0, Math.PI]);  // 이름표
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(24,18,15,0.8)';
  c.beginPath(); c.roundRect(8, 8, 240, 48, 24); c.fill();
  c.fillStyle = color; c.font = "900 28px 'Nunito','Noto Sans KR',sans-serif"; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(ROLE_NAME[role], 128, 34);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
  tag.scale.set(0.5, 0.125, 1);
  tag.position.y = 1.0;
  tag.renderOrder = 20;
  g.add(tag);
  g.scale.setScalar(AVATAR_SCALE);
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

  // 시작 위치: 방장은 왼쪽, 참가자는 오른쪽으로 비켜 서서 같은 자리에서 태어나 서로 밀지 않게 한다
  const spawnAt = () => {
    const sp = map.spawn, side = isHost ? -0.55 : 0.55;
    return { x: sp.x + Math.cos(sp.yaw) * side, z: sp.z - Math.sin(sp.yaw) * side };
  };
  const toSpawn = () => {
    const s = spawnAt(), b = player.body;
    b.position.set(s.x, player.radius + 0.02, s.z);
    b.velocity.set(0, 0, 0);
    b.interpolatedPosition.copy(b.position);
  };
  toSpawn();
  let myReady = false, peerReady = false, started = false;
  let matchLeft = MATCH.time;
  let energy = SAB.startEnergy;
  const zoneCd = new Map(), movCd = new Map(); // (방장) 남은 쿨다운
  let cdView = { z: [], m: [] }; // (참가자) 방장이 알려준 쿨다운
  const stats = { shove: 0, spill: 0, furniture: 0 }; // shove = 집어 든 횟수
  let remoteSpeed = 0, remoteLastP = null, remoteLastT = 0; // (방장) 참가자의 이동 속도
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
    mess: `<b>클릭</b> 물건 집어서 박스 밖으로 빼내기 (들고 있는 동안 에너지 -${SAB.holdDrain}/초) · <b>우클릭</b> 정리된 구역 통째로 뒤집어엎기(${SAB.spill}) · <b>E</b> 서랍·의자 조작(${SAB.furniture})
걸으면 -${SAB.walkDrain}/초, 달리면 -${SAB.runDrain}/초. 에너지는 <b>가만히 서 있을 때만</b> 초당 ${SAB.regen}씩 차요. 같은 구역은 ${SAB.zoneCd}초 동안 다시 엎을 수 없어요.
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
    if (!oppBody) {
      // 상대 몸: 내 쪽 물리 세계에 둔 움직이는 구 3개. 서로 겹치지 않고 부딪힌다 (물건·벽 판정엔 영향 없음)
      oppBody = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0, collisionFilterGroup: G.OPP, collisionFilterMask: G.PLAYER | G.ITEM });
      player.body.collisionFilterMask |= G.ITEM; // 던진 물건이 사람을 통과하지 않고 부딪혀 튕겨 나가게
      for (const y of [0, 0.5, 1.0]) oppBody.addShape(new CANNON.Sphere(player.radius), new CANNON.Vec3(0, y, 0));
      oppBody.position.set(0, -50, 0); // 상대 위치를 받기 전엔 멀리 치워 둠
      player.world.addBody(oppBody);
    }
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
    if (item.held) return;
    if (mp.myRole === 'mess' && energy < SAB.grabMin) return ui.toast(`방해 에너지가 부족해요 (${Math.floor(energy)} / ${SAB.grabMin})`, 'warn');
    if (isHost) {
      orig.grab(item);
      if (mp.myRole === 'mess' && interaction.held === item) stats.shove++;
      return;
    }
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
    if (isHost) return orig.release(throwIt);
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
  addEventListener('mousedown', (e) => { // 방해꾼의 우클릭 = 정리된 구역 뒤집어엎기 (물건을 들고 있을 땐 던지기)
    if (e.button === 2 && mp.myRole === 'mess' && mp.canAct && g.isPlaying() && aimZone && !interaction.held) act({ k: 'spill', z: aimZone.id });
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
    sfx.wrong();
    if (document.pointerLockElement) document.exitPointerLock();
    // 시작 전에 방장만 남았다면 다시 친구를 기다린다
    if (!started && isHost) {
      peerHere = false; myReady = false; peerReady = false;
      ui.toast('상대가 나갔어요. 다시 기다리는 중…', 'warn');
      showWaiting();
      return;
    }
    mp.ended = true; mp.active = false; mp.running = false;
    g.setState('done');
    $('mp-hud').classList.add('hidden');
    overlay({
      kicker: '알림', title: '상대방이 게임을 나갔어요',
      text: '상대가 없어서 경기를 계속할 수 없어요.\n아래 버튼으로 타이틀로 돌아가세요.', leave: '타이틀로',
    });
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
  net.on('st', (m) => {
    const now = performance.now();
    if (remoteLastP && now > remoteLastT) {
      const v = Math.hypot(m.p[0] - remoteLastP[0], m.p[2] - remoteLastP[2]) / ((now - remoteLastT) / 1000);
      remoteSpeed += (v - remoteSpeed) * 0.5; // 잔떨림을 눌러 주는 평활화
    }
    remoteLastP = m.p; remoteLastT = now;
    remote = m;
  });
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
        if (!it || it.held || it.removed || it.removing || remoteHeld) return;
        if (role === 'mess') {
          if (energy < SAB.grabMin) return tell(who, `방해 에너지가 부족해요 (${Math.floor(energy)} / ${SAB.grabMin})`);
          stats.shove++;
        }
        it.held = true; it.heldBy = 'guest'; it.settle = 0;
        if (it.placed) tidy.unplace(it);
        it.body.allowSleep = false;
        it.body.wakeUp();
        remoteHeld = it;
        if (remote) remote.hr = cmd.hr;
        else remote = { hr: cmd.hr, hd: 1.2 };
        return;
      }
      case 'rel': return releaseRemote(cmd.th, cmd.d);
      case 'furn': {
        const m = movables[cmd.m];
        if (!m) return;
        if (role === 'mess') return sabotageFurniture(m, who);
        const why = m.toggle();
        if (why) tell(who, why);
        else furnitureMoved(m);
        return;
      }
      case 'spill': if (role === 'mess') sabotageSpill(cmd.z, who); return;
    }
  }

  // (방장) 참가자가 들고 있던 물건을 내려놓거나 던진다 (에너지가 바닥나면 강제로도 불린다)
  function releaseRemote(throwIt, d) {
    const it = remoteHeld;
    if (!it) return;
    remoteHeld = null;
    it.held = false; it.heldBy = null;
    const b = it.body;
    b.allowSleep = true;
    if (throwIt && d) {
      b.velocity.set(d[0] * 6, d[1] * 6 + 1, d[2] * 6);
      b.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    } else {
      b.velocity.scale(0.2, b.velocity);
      b.angularVelocity.scale(0.2, b.angularVelocity);
    }
  }

  function furnitureMoved(m) {
    if (m.kind === 'drawer') sfx.drawer(m.state === 1); else sfx.slide();
    for (const it of items) if (!it.removed && it.body.position.distanceTo(m.body.position) < 1.6) it.body.wakeUp();
  }

  // 박스를 뒤집어엎어 안의 물건을 구역 중심에서 바깥으로 멀리 날려 보낸다 (도자기·유리는 조금 약하게, 날아가는 동안은 안 깨짐)
  function fling(it, center) {
    const b = it.body;
    b.wakeUp();
    let dx = b.position.x - center.x, dz = b.position.z - center.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dz = Math.sin(a); } else { dx /= len; dz /= len; }
    const a = (Math.random() - 0.5) * 0.9; // 방향을 조금씩 흩뜨림
    const ca = Math.cos(a), sa = Math.sin(a);
    const sp = (it.fragile ? 4.5 : 7) + Math.random() * 2, up = it.fragile ? 3.5 : 5.5;
    b.velocity.set((dx * ca - dz * sa) * sp, up, (dx * sa + dz * ca) * sp);
    b.angularVelocity.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
    it.noBreakUntil = performance.now() + 3000;
  }

  function spend(cost, who) {
    if (energy < cost) { tell(who, `방해 에너지가 부족해요 (${Math.floor(energy)} / ${cost})`); return false; }
    energy -= cost;
    return true;
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
    const center = z.box.getCenter(new THREE.Vector3());
    for (const it of victims) {
      tidy.unplace(it);
      fling(it, center);
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
    if (kind === 'spill') {
      const z = tidy.zoneById[arg];
      if (!z) return;
      sfx.crash ? sfx.crash() : sfx.trash();
      effects.burst(z.box.getCenter(new THREE.Vector3()), { colors: dust, count: 40, speed: 3.5, up: 3 });
      ui.toast(mp.myRole === 'tidy' ? `방해꾼이 ${z.label}을 뒤집어엎었어요!` : `${z.label} 뒤집어엎기!`, mp.myRole === 'tidy' ? 'warn' : 'great');
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
  let avatar = null, oppBody = null;
  const halo = makeHalo();
  g.scene.add(halo);
  const avatarPos = new THREE.Vector3();
  let avatarYaw = 0;

  mp.beforeStep = (dt) => {
    if (isHost) {
      // 들고 있지 않은 물건은 두 플레이어의 몸에 부딪힌다 (들고 있는 동안엔 들고 있는 사람과 겹쳐도 밀지 않게 제외)
      for (const it of items) it.body.collisionFilterMask = it.held ? (G.STATIC | G.ITEM) : (G.STATIC | G.ITEM | G.PLAYER | G.OPP);
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

  // (방장) 방해꾼 에너지: 서 있을 때만 회복, 걷기·달리기·물건 들기는 소모
  function updateMessEnergy(dt) {
    const messIsHost = hostRole === 'mess';
    let speed = 0, holding = false;
    if (messIsHost) {
      const v = player.body.velocity;
      speed = Math.hypot(v.x, v.z);
      holding = !!interaction.held;
    } else {
      speed = remoteSpeed;
      holding = !!remoteHeld;
    }
    let drain = 0;
    if (speed > RUN_SPEED) drain += SAB.runDrain;
    else if (speed > 0.5) drain += SAB.walkDrain;
    if (holding) drain += SAB.holdDrain;
    if (drain > 0) energy = Math.max(0, energy - drain * dt);
    else energy = Math.min(SAB.maxEnergy, energy + SAB.regen * dt);
    if (holding && energy <= 0) { // 에너지가 바닥나면 들고 있던 물건을 놓친다
      if (messIsHost) { interaction.release(false); ui.toast('에너지가 바닥나서 물건을 놓쳤어요!', 'warn'); }
      else { releaseRemote(false); tell('guest', '에너지가 바닥나서 물건을 놓쳤어요!'); }
    }
  }

  mp.frame = (dt) => {
    if (player.body.position.y < -1 || Math.abs(player.body.position.x) > 30 || Math.abs(player.body.position.z) > 30) toSpawn(); // 맵 밖으로 빠졌으면 시작 위치로 되돌린다
    // 방장: 시간 · 에너지 · 쿨다운
    if (isHost && mp.active && !mp.ended) {
      matchLeft -= dt;
      if (hostRole === 'mess' || other(hostRole) === 'mess') updateMessEnergy(dt);
      for (const m of [zoneCd, movCd]) for (const [k, s] of m) { if (s - dt <= 0) m.delete(k); else m.set(k, s - dt); }
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

    // 상대가 들고 있는 물건에 빛무리를 씌워 눈에 띄게
    {
      const theirs = isHost ? remoteHeld : items.find((x) => x.held && x !== interaction.held && !x.removed);
      if (theirs && mp.myRole) {
        const col = mp.myRole === 'mess' ? '#9a5fe0' : '#ff7a6b'; // 상대 역할 색
        halo.material.color.set(col);
        halo.position.copy(theirs.mesh.position);
        halo.scale.setScalar(0.7 + 0.08 * Math.sin(performance.now() / 160));
        halo.visible = true;
      } else halo.visible = false;
    }
    // 상대 모습
    if (avatar && remote && remote.p) {
      avatar.visible = true;
      const a = 1 - Math.exp(-dt * 14);
      avatarPos.lerp(new THREE.Vector3(remote.p[0], remote.p[1] - 0.3, remote.p[2]), avatarPos.lengthSq() ? a : 1);
      avatarYaw += ((remote.yaw || 0) - avatarYaw) * a;
      avatar.position.copy(avatarPos);
      avatar.rotation.y = avatarYaw;
      if (oppBody) oppBody.position.set(avatarPos.x, avatarPos.y + 0.3, avatarPos.z);
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
    if (interaction.held) lines.push(`<b>${interaction.held.name}</b><span class="key">클릭</span>내려놓기 <span class="key">우클릭</span>던지기 <span class="tip">들고 있는 동안 에너지 -${SAB.holdDrain}/초</span>`);
    else if (it) lines.push(`<b>${it.name}</b><span class="key">클릭</span>집어 들기 <span class="dest">들고 있는 동안 -${SAB.holdDrain}/초</span>`);
    else if (m) lines.push(`<b>${m.name}</b><span class="key">E</span>${m.actionLabel()} ${cost(SAB.furniture, movCdLeft(m))}`);
    if (aimZone && !interaction.held) {
      const n = items.filter((x) => x.target === aimZone.id && x.placed && !x.removed).length;
      lines.push(`<b>${aimZone.label}</b><span class="key">우클릭</span>뒤집어엎기 (${n}개) ${cost(SAB.spill, zoneCdLeft(aimZone))}`);
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
        ['물건 집어 들기', `${res.stats.shove}번`],
        ['구역 뒤집어엎기', `${res.stats.spill}번`],
        ['가구 조작(방해)', `${res.stats.furniture}번`],
        ['깨진 물건', `${res.broken}개`],
      ],
      leave: '타이틀로',
    }), 900);
  }

  return mp;
}





