// 맵 2: 서재 — 큰 책장, 창가 안락의자, 코르크보드 책상이 있는 아늑한 방
import * as THREE from 'three';
import {
  ROOM, lowMat, addStaticBox, createBuilder, buildShell, starGeometry,
  addWindow, addCeilingLamp, addPlant, addWallClock, addPoster, addRugSurface, softBox,
} from '../world.js';
import { buildDrawerCabinet, buildChair, linkBlocker } from '../furniture.js';
import { kindMat } from '../materials.js';
import { make } from '../textures.js';
import * as F from '../items.js';

const C = {
  floorA: '#e6c39c', floorB: '#dcb48b',
  wallBack: '#d8eedb', wallLeft: '#fff1da', wallRight: '#dfe8f8', wallFront: '#fbe3d9',
  ceiling: '#fffaf2', trim: '#ffffff',
  ceilA: '#d9aa80', ceilB: '#cc9b72', beam: '#9c6a48', baseboard: '#c08359',
  stripes: { a: '#cfe8d3', b: '#f1f8ee', width: 0.2 },
  wood: '#d9a273', woodDark: '#c08359', shelfBack: '#f6e2c6',
  chair: '#ffcf6b', chairSeat: '#ffe08f',
  sideboard: '#b9e4d2', tray: '#ffc4d4', filebox: '#a9dbff', trash: '#9fdcc6',
  rugA: '#b8d8f0', rugB: '#fff6dc', rugC: '#ffd1dc',
  cork: '#e8c39e',
};

// 노트북 화면: 바탕화면 + 창 두 개 + 작업 표시줄
function laptopScreenTex() {
  return make('laptop-screen', 512, 320, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#9fd8d0'); g.addColorStop(1, '#f6c7b3');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath(); c.arc(410, 70, 90, 0, Math.PI * 2); c.fill();
    const win = (x, y, ww, hh, title) => {
      c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + 4, y + 6, ww, hh);
      c.fillStyle = '#fbfaf7'; c.fillRect(x, y, ww, hh);
      c.fillStyle = title; c.fillRect(x, y, ww, 18);
      ['#ff6b6b', '#ffd166', '#6bd68a'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(x + 10 + i * 12, y + 9, 4, 0, Math.PI * 2); c.fill(); });
    };
    win(36, 34, 250, 190, '#e7e3dc');
    c.fillStyle = '#c9c3b8';
    for (let i = 0; i < 9; i++) c.fillRect(52, 70 + i * 16, 150 + ((i * 37) % 70), 6);
    win(250, 110, 210, 150, '#dfe8f2');
    [42, 80, 60, 110, 90].forEach((v, i) => { c.fillStyle = ['#7ec8ff', '#ff9fb5', '#8ee3a8', '#ffd56b', '#c4a7ff'][i]; c.fillRect(272 + i * 34, 245 - v, 22, v); });
    c.fillStyle = 'rgba(30,30,40,0.55)'; c.fillRect(0, h - 26, w, 26);
    ['#7ec8ff', '#ffd56b', '#ff9fb5', '#8ee3a8'].forEach((col, i) => { c.fillStyle = col; c.fillRect(200 + i * 30, h - 20, 16, 14); });
  });
}

// 알루미늄 노트북: 키보드·트랙패드·힌지·베젤·켜진 화면. (x, y=책상 윗면, z), rotY = 화면이 바라보는 방향
function addLaptop(ctx, x, y, z, rotY) {
  const alu = kindMat('paintedMetal', '#cfd4dc', { metalness: 0.6, roughness: 0.3, map: null });
  const dark = kindMat('plastic', '#25272e', { map: null });
  const g = new THREE.Group();
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  // 본체 + 키보드 판 + 키
  add(softBox(0.34, 0.016, 0.24, 0.006), alu, 0, 0.008, 0);
  add(new THREE.BoxGeometry(0.3, 0.002, 0.115), dark, 0, 0.0165, -0.035);
  const keyGeo = softBox(0.0175, 0.004, 0.017, 0.002);
  const keyMat = kindMat('plastic', '#3a3d46', { map: null });
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 13; k++) add(keyGeo, keyMat, -0.126 + k * 0.021, 0.0185, -0.077 + r * 0.021);
  }
  add(softBox(0.12, 0.004, 0.017, 0.002), keyMat, 0, 0.0185, 0.007); // 스페이스바
  add(new THREE.BoxGeometry(0.11, 0.0015, 0.065), kindMat('glossyPlastic', '#c5cad2', { map: null }), 0, 0.0165, 0.078); // 트랙패드
  const hinge = add(new THREE.CylinderGeometry(0.007, 0.007, 0.3, 12), dark, 0, 0.016, -0.118);
  hinge.rotation.z = Math.PI / 2;
  // 화면(뚜껑): 힌지를 축으로 살짝 뒤로 젖혀짐
  const lid = new THREE.Group();
  lid.position.set(0, 0.016, -0.118);
  lid.rotation.x = -0.26;
  const shell = new THREE.Mesh(softBox(0.34, 0.225, 0.008, 0.005), alu);
  shell.position.set(0, 0.1125, -0.004);
  shell.castShadow = true;
  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(0.328, 0.214), kindMat('glossyPlastic', '#14151a', { map: null }));
  bezel.position.set(0, 0.113, 0.0005);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.188), new THREE.MeshBasicMaterial({ map: laptopScreenTex(), color: new THREE.Color(1.15, 1.15, 1.15) }));
  screen.position.set(0, 0.118, 0.0012);
  const cam = new THREE.Mesh(new THREE.CircleGeometry(0.0025, 8), new THREE.MeshBasicMaterial({ color: '#2c3a4a' }));
  cam.position.set(0, 0.217, 0.0012);
  lid.add(shell, bezel, screen, cam);
  g.add(lid);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  ctx.scene.add(g);
  g.traverse((o) => o.isMesh && ctx.occluders.push(o));
}

function build(ctx) {
  const b = createBuilder(ctx);
  const { box, deco, container } = b;
  // 재질 등록: 이 색으로 만든 가구는 이 재질로
  b.setKinds({
    fabric: [C.chair, C.chairSeat, '#8fb8e8'], // 안락의자 · 사무용 의자 천
    woodPaint: [C.sideboard, C.shelfBack, '#fff1da', '#c9e7f5', '#cdeee0'], // 칠한 원목 가구 · 문
    plastic: [C.tray, C.trash],
    paintedMetal: [C.filebox, '#d6ebff'], // 철제 서류 서랍장
    metal: ['#e6e9f0'], // 알루미늄 노트북
    cork: [C.cork],
    rug: [C.rugA, C.rugB, C.rugC],
    bookCover: ['#e8a0b0', '#9fc4e8', '#a8d8b9', '#f2cf7a', '#c9b3e6', '#f0b08c'], // 책장에 꽂힌 책
  });
  buildShell(b, C);
  const frame = { collide: false, occlude: false };
  const starGeo = starGeometry();

  // 벽 몰딩 (서재 느낌의 가로줄)
  const rail = { collide: false, cast: false, occlude: false };
  box(ROOM.w, 0.05, 0.03, 0, 0.95, -ROOM.d / 2 + 0.015, C.trim, rail);
  box(ROOM.w, 0.05, 0.03, 0, 0.95, ROOM.d / 2 - 0.015, C.trim, rail);
  box(0.03, 0.05, ROOM.d, -ROOM.w / 2 + 0.015, 0.95, 0, C.trim, rail);
  box(0.03, 0.05, ROOM.d, ROOM.w / 2 - 0.015, 0.95, 0, C.trim, rail);

  // 직사각형 러그
  box(3.2, 0.02, 2.4, 0, 0.01, 0.4, C.rugA, { collide: false, cast: false, occlude: false });
  box(2.8, 0.022, 2.0, 0, 0.012, 0.4, C.rugB, { collide: false, cast: false, occlude: false });
  box(2.4, 0.024, 1.6, 0, 0.014, 0.4, C.rugC, { collide: false, cast: false, occlude: false });
  addRugSurface(ctx, 0, 0.4, 0.026, { w: 3.2, d: 2.4 });

  addWindow(b, 'left', -1.2, 1.85, { curtain: '#b9e4d2', rod: C.woodDark, trim: C.woodDark });
  addPoster(b, 'left', 1.7, 1.78, 0.6, 0.75, 'map', C.woodDark);
  addCeilingLamp(b, 0, 0.3, '#b9e4d2');

  // ── 큰 책장 (뒷벽) ──
  const shZ = -3.29;
  box(2.6, 2.2, 0.03, 0, 1.1, -3.485, C.shelfBack);
  box(0.05, 2.2, 0.42, -1.275, 1.1, shZ, C.wood);
  box(0.05, 2.2, 0.42, 1.275, 1.1, shZ, C.wood);
  const boards = [0.03, 0.56, 1.1, 1.64, 2.18];
  boards.forEach((y) => box(2.5, 0.05, 0.42, 0, y, shZ, C.woodDark));
  box(2.7, 0.08, 0.48, 0, 2.24, -3.27, C.wood);
  // 원래 꽂혀 있던 장식용 책 (칸마다 왼쪽·오른쪽 끝)
  const decoCols = ['#e8a0b0', '#9fc4e8', '#a8d8b9', '#f2cf7a', '#c9b3e6', '#f0b08c'];
  boards.slice(0, 4).forEach((y, row) => {
    const startX = row % 2 ? 0.75 : -1.22;
    for (let i = 0; i < 5; i++) {
      const h = 0.22 + ((i * 7 + row * 3) % 5) * 0.025;
      const w = 0.05 + (i % 2) * 0.012;
      box(w, h, 0.22, startX + i * 0.085, y + 0.025 + h / 2, shZ + 0.04, decoCols[(i + row) % decoCols.length]);
    }
  });
  addPlant(b, -0.8, -3.3, 0.5, { y: 2.28, type: 'bush', collide: false });
  const shelfZone = new THREE.Box3(new THREE.Vector3(-1.24, 0.06, -3.47), new THREE.Vector3(1.24, 2.12, -3.08));

  // ── 책상 (오른쪽 벽) ──
  const dx = 3.55, dz = -1.6;
  box(0.8, 0.05, 1.8, dx, 0.76, dz, C.wood);
  [[-0.36, -0.86], [0.36, -0.86], [-0.36, 0.86], [0.36, 0.86]].forEach(([ox, oz]) =>
    box(0.05, 0.74, 0.05, dx + ox, 0.37, dz + oz, C.woodDark));
  box(0.7, 0.45, 0.45, dx, 0.5, -0.98, '#fff1da');
  box(0.01, 0.04, 0.25, dx - 0.351, 0.55, -0.98, '#ff9fb5', frame);
  const deskTop = 0.785;
  // 노트북 (화면이 의자 쪽을 바라봄)
  addLaptop(ctx, 3.6, deskTop, -1.55, -Math.PI / 2);
  addStaticBox(ctx, 0.24, 0.02, 0.34, 3.6, deskTop + 0.01, -1.55);
  addStaticBox(ctx, 0.05, 0.22, 0.34, 3.75, deskTop + 0.12, -1.55);
  addStaticBox(ctx, 0.06, 0.22, 0.34, 3.77, deskTop + 0.12, -1.55);
  // 스탠드
  deco(new THREE.CylinderGeometry(0.07, 0.09, 0.03, 8), '#ffffff', 3.82, deskTop + 0.015, -2.4);
  deco(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 5), '#ffffff', 3.82, deskTop + 0.19, -2.4);
  deco(new THREE.ConeGeometry(0.12, 0.15, 8, 1, true), '#ffcf6b', 3.78, deskTop + 0.38, -2.4, {
    material: lowMat('#ffcf6b', { side: THREE.DoubleSide }),
  });
  addStaticBox(ctx, 0.18, 0.45, 0.18, 3.82, deskTop + 0.22, -2.4);
  // 문구 트레이 · 서류함 (책상 위 정리 구역)
  const trayZone = container(3.48, -2.05, 0.38, 0.06, 0.46, 0.02, C.tray, deskTop);
  // 코르크보드 + 메모
  box(0.03, 0.6, 0.95, 3.985, 1.55, -1.6, C.cork, frame);
  box(0.02, 0.64, 0.99, 3.995, 1.55, -1.6, C.woodDark, frame);
  [[-1.9, 1.68, '#fff1a8'], [-1.62, 1.45, '#ffc4d4'], [-1.35, 1.66, '#b9e4d2'], [-1.5, 1.72, '#a9dbff']].forEach(([z, y, col], i) =>
    box(0.01, 0.12, 0.12, 3.965, y, z, col, { ...frame, rotX: (i - 1.5) * 0.12 }));
  // ── 서류 서랍장 (오른쪽 벽, 책상 옆) — 누가 의자를 서랍 앞에 두고 갔다 ──
  const fileDrawer = buildDrawerCabinet(b, {
    name: '서류 서랍', x: 3.75, z: 0.25, facing: 'nx', W: 0.6, D: 0.5, H: 0.78,
    slot: [0.42, 0.74], pull: 0.38, body: C.filebox, front: '#d6ebff',
    fakeFronts: [[0.04, 0.215], [0.225, 0.41]],
  });
  addPlant(b, 3.78, 0.42, 0.42, { y: 0.78, type: 'snake', collide: false });
  const chair = buildChair(b, {
    name: '의자', seat: '#8fb8e8', office: true,
    poses: [{ x: 3.02, z: 0.25, rotY: -Math.PI / 2 }, { x: 2.82, z: -1.6, rotY: -Math.PI / 2 }],
    labels: ['의자를 책상으로 밀기', '의자 꺼내기'],
  });
  linkBlocker(chair, fileDrawer);

  // ── 휴지통 (책상 옆) ──
  const trashZone = container(3.55, 1.3, 0.42, 0.5, 0.42, 0.03, C.trash);
  box(0.425, 0.05, 0.01, 3.55, 0.45, 1.087, '#ffffff', frame);

  // ── 장식장 (앞벽) ──
  const sb = { x: 1.2, z: 3.27, w: 1.8, h: 0.8, d: 0.45 };
  box(sb.w, sb.h, sb.d, sb.x, sb.h / 2, sb.z, C.sideboard);
  box(sb.w + 0.06, 0.04, sb.d + 0.04, sb.x, sb.h + 0.02, sb.z, C.trim);
  [-0.6, 0, 0.6].forEach((ox) => {
    box(0.54, 0.6, 0.01, sb.x + ox, 0.4, sb.z - sb.d / 2 - 0.005, '#cdeee0', frame);
    deco(new THREE.IcosahedronGeometry(0.025, 0), '#ffd56b', sb.x + ox, 0.55, sb.z - sb.d / 2 - 0.03);
  });
  const sideboardZone = new THREE.Box3(
    new THREE.Vector3(sb.x - sb.w / 2 + 0.02, sb.h + 0.03, sb.z - sb.d / 2),
    new THREE.Vector3(sb.x + sb.w / 2 - 0.02, sb.h + 0.5, sb.z + sb.d / 2),
  );
  // 장식장 위 액자들
  [[0.55, 1.7, '#ffc4d4', 0.42], [1.2, 1.85, '#a9dbff', 0.5], [1.85, 1.65, '#fff1a8', 0.38]].forEach(([x, y, col, s]) => {
    box(s, s * 1.2, 0.03, x, y, ROOM.d / 2 - 0.015, '#ffffff', frame);
    box(s * 0.78, s * 0.98, 0.01, x, y, ROOM.d / 2 - 0.035, col, frame);
  });
  deco(starGeo, '#ffd56b', 1.2, 1.85, ROOM.d / 2 - 0.06, { rot: [0, Math.PI, 0], cast: false });

  // ── 안락의자 (왼쪽 벽, 방 안쪽을 향함) ──
  const ac = { x: -3.35, z: 1.7 };
  box(0.85, 0.42, 0.95, ac.x, 0.21, ac.z, C.chair);
  box(0.66, 0.1, 0.7, ac.x + 0.05, 0.47, ac.z, C.chairSeat);
  box(0.2, 0.95, 0.95, ac.x - 0.33, 0.62, ac.z, C.chair);
  box(0.85, 0.66, 0.14, ac.x, 0.33, ac.z - 0.405, C.chair);
  box(0.85, 0.66, 0.14, ac.x, 0.33, ac.z + 0.405, C.chair);
  [[0.35, -0.4], [0.35, 0.4]].forEach(([ox, oz]) =>
    deco(new THREE.CylinderGeometry(0.03, 0.02, 0.06, 5), C.woodDark, ac.x + ox, 0.02, ac.z + oz));
  const armchairZone = new THREE.Box3(new THREE.Vector3(-3.6, 0.5, 1.33), new THREE.Vector3(-2.95, 1.1, 2.07));

  // ── 티 테이블 (안락의자 옆 원형 탁자) ──
  const tt = { x: -3.3, z: 0.62 };
  deco(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 10), '#ffffff', tt.x, 0.6, tt.z, { occlude: true });
  deco(new THREE.CylinderGeometry(0.03, 0.03, 0.56, 6), C.woodDark, tt.x, 0.3, tt.z);
  deco(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 8), C.woodDark, tt.x, 0.015, tt.z);
  addStaticBox(ctx, 0.5, 0.62, 0.5, tt.x, 0.31, tt.z);
  deco(new THREE.CylinderGeometry(0.2, 0.2, 0.01, 10), '#ffd1dc', tt.x, 0.625, tt.z, { cast: false });
  const teaZone = new THREE.Box3(new THREE.Vector3(tt.x - 0.27, 0.6, tt.z - 0.27), new THREE.Vector3(tt.x + 0.27, 0.95, tt.z + 0.27));

  // ── 플로어 스탠드 (안락의자 뒤 구석) ──
  deco(new THREE.CylinderGeometry(0.15, 0.17, 0.04, 8), '#ffffff', -3.7, 0.02, 2.95);
  deco(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 5), '#ffffff', -3.7, 0.77, 2.95);
  deco(new THREE.ConeGeometry(0.22, 0.28, 8, 1, true), '#fff1a8', -3.7, 1.6, 2.95, {
    material: lowMat('#fff1a8', { side: THREE.DoubleSide }),
  });
  addStaticBox(ctx, 0.35, 1.8, 0.35, -3.7, 0.9, 2.95);

  // 문 (앞벽 왼쪽)
  box(1.0, 2.1, 0.04, -1.5, 1.05, ROOM.d / 2 - 0.02, '#ffffff', frame);
  box(0.9, 2.0, 0.05, -1.5, 1.0, ROOM.d / 2 - 0.03, '#c9e7f5', frame);
  deco(new THREE.IcosahedronGeometry(0.04, 0), '#ffd56b', -1.85, 1.0, ROOM.d / 2 - 0.08);

  addPlant(b, 1.85, -3.15);
  addPlant(b, -3.6, -2.9, 0.9);
  addPlant(b, 2.55, 3.15, 0.8, { pot: '#a9dbff' });
  addWallClock(b, -2.6, 2.25, -3.47, '#d8eedb');

  const zones = [
    { id: 'trash', label: '휴지통', task: '쓰레기 버리기', emoji: '🗑️', color: '#5fcfa8', box: trashZone },
    { id: 'bookshelf', label: '큰 책장', task: '책 꽂기', emoji: '📚', color: '#6aa8ff', box: shelfZone },
    { id: 'tray', label: '문구 트레이', task: '문구 정리', emoji: '✏️', color: '#ff7fa0', box: trayZone },
    { id: 'filebox', label: '서류 서랍', task: '서류 정리', emoji: '📂', color: '#4fa3e0', box: new THREE.Box3(), movable: fileDrawer },
    { id: 'armchair', label: '안락의자', task: '쿠션 정돈', emoji: '🛋️', color: '#ffb02e', box: armchairZone },
    { id: 'sideboard', label: '장식장 위', task: '소품 진열', emoji: '🌍', color: '#3fbf8f', box: sideboardZone },
    { id: 'teatable', label: '티 테이블', task: '찻잔 올려두기', emoji: '🍵', color: '#e37fb0', box: teaZone },
  ];
  for (const z of zones) if (z.movable) z.movable.updateZone(z);

  const blockers = [
    [-1.35, 1.35, -3.5, -3.0], [2.45, 4, -2.6, -0.65], [2.7, 4, -0.2, 0.7], [3.3, 3.8, 1.05, 1.55],
    [0.25, 2.15, 3.0, 3.5], [-3.85, -2.85, 1.15, 2.25], [-3.65, -2.95, 0.3, 1.0],
    [-3.9, -3.5, 2.7, 3.2], [1.6, 2.1, -3.4, -2.9], [-3.9, -3.3, -3.2, -2.6], [2.3, 2.8, 2.9, 3.4],
  ];

  return { zones, blockers, bounds: { x0: -3.5, x1: 3.2, z0: -2.7, z1: 3.0 } };
}

const items = [
  ...['#ff9fb5', '#7ec8ff', '#8ee3a8', '#ffcf6b', '#c4a7ff', '#ffb48f'].map((c) => ({ name: '책', target: 'bookshelf', make: () => F.book(c) })),
  { name: '색연필', target: 'tray', make: () => F.pencil('#ff8fa3') },
  { name: '색연필', target: 'tray', make: () => F.pencil('#7ec8ff') },
  { name: '색연필', target: 'tray', make: () => F.pencil('#8ee3a8') },
  { name: '지우개', target: 'tray', make: F.eraser },
  { name: '자', target: 'tray', make: F.ruler },
  { name: '서류 파일', target: 'filebox', make: () => F.documentFile('#ffc4d4') },
  { name: '서류 파일', target: 'filebox', make: () => F.documentFile('#a9dbff') },
  { name: '서류 파일', target: 'filebox', make: () => F.documentFile('#fff1a8') },
  ...[0, 1, 2].map(() => ({ name: '구겨진 종이', target: 'trash', make: F.paper })),
  { name: '종이컵', target: 'trash', make: F.paperCup },
  { name: '종이컵', target: 'trash', make: F.paperCup },
  { name: '사탕 껍질', target: 'trash', make: F.candyWrapper },
  { name: '귤껍질', target: 'trash', make: F.orangePeel },
  { name: '쿠션', target: 'armchair', make: () => F.cushion('#ff9fb5') },
  { name: '쿠션', target: 'armchair', make: () => F.cushion('#a9dbff', '#ffd56b') },
  { name: '지구본', target: 'sideboard', make: F.globe },
  { name: '탁상시계', target: 'sideboard', make: F.tableClock },
  { name: '모래시계', target: 'sideboard', make: F.hourglass },
  { name: '찻잔', target: 'teatable', make: () => F.teacup('#ffc4d4') },
  { name: '찻잔', target: 'teatable', make: () => F.teacup('#b9e4d2') },
];

export default {
  id: 'study',
  name: '서재',
  emoji: '📚',
  desc: '책과 서류, 찻잔이 어질러진 아늑한 서재',
  spawn: { x: -0.3, z: 2.3, yaw: 0 },
  timeLimit: 60,
  lamp: [0, 2.3, 0.3],
  windowLight: { pos: [-7, 3.3, -1.2], target: [-1.6, 0, -0.9] },
  background: '#eef7ee',
  build,
  items,
};
