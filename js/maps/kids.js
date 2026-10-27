// 맵 1: 아이 방 — 장난감·빨래·책이 널브러진 파스텔 방
import * as THREE from 'three';
import {
  ROOM, lowMat, addStaticBox, createBuilder, buildShell, starGeometry,
  addWindow, addCeilingLamp, addPlant, addWallClock, addPoster, addRugSurface,
} from '../world.js';
import { buildDrawerCabinet, buildChair, linkBlocker } from '../furniture.js';
import * as F from '../items.js';

const C = {
  floorA: '#f3d6b6', floorB: '#ebc8a2',
  wallBack: '#ffd9e3', wallLeft: '#d3f0e2', wallRight: '#dbe7ff', wallFront: '#fff0c8',
  ceiling: '#fffaf2', trim: '#ffffff',
  ceilA: '#f3dcc0', ceilB: '#e9cfae', beam: '#d6a57a',
  stripes: { a: '#ffd3df', b: '#fff5f7', width: 0.2 },
  wood: '#e9b98c', woodDark: '#cf9a6c',
  sheet: '#ffffff', blanket: '#ffb7c9', blanketStripe: '#fff1a8',
  toybox: '#ffd56b', toyboxStripe: '#ff9fb5',
  trash: '#9fdcc6', trashRim: '#ffffff',
  basket: '#f5d3a1', basketStripe: '#e8b77e',
  shelf: '#fff4e2', shelfBoard: '#a8e0d0',
  rugA: '#a9dbff', rugB: '#fff6dc', rugC: '#ffc4d4',
  plant: '#8fd6a0', pot: '#ffb48f',
};

function build(ctx) {
  const b = createBuilder(ctx);
  const { box, deco, container } = b;
  // 재질 등록: 이 색으로 만든 가구는 이 재질로
  b.setKinds({
    fabric: [C.blanket, '#d4b5ff'], // 이불 · 빈백
    woodPaint: [C.toybox, C.toyboxStripe, C.shelf, C.shelfBoard, '#ffe7b3', '#ffc4d4', '#ffc9a8', '#ffe08f'], // 칠한 원목 가구
    plastic: [C.trash, '#a9dbff'], // 휴지통 · 의자
    wicker: [C.basket, C.basketStripe], // 라탄 빨래 바구니
    terracotta: [C.pot],
    leaf: [C.plant],
  });
  buildShell(b, C);
  const frame = { collide: false, occlude: false };
  const starGeo = starGeometry();

  // 러그 (털실 파일)
  deco(new THREE.CylinderGeometry(1.7, 1.7, 0.02, 10), C.rugA, 0, 0.01, 0.6, { cast: false, kind: 'rug' });
  deco(new THREE.CylinderGeometry(1.15, 1.15, 0.022, 10), C.rugB, 0, 0.012, 0.6, { cast: false, kind: 'rug' });
  deco(new THREE.CylinderGeometry(0.55, 0.55, 0.024, 10), C.rugC, 0, 0.014, 0.6, { cast: false, kind: 'rug' });
  addRugSurface(ctx, 0, 0.6, 0.026, { r: 1.7 });

  addWindow(b, 'back', 0, 1.85, { curtain: '#ffc2d1', rod: C.woodDark });

  // 가랜드(삼각 깃발) — 왼쪽 벽
  const flagColors = ['#ff9fb5', '#ffd56b', '#9fdcc6', '#a9c8ff', '#d4b5ff'];
  const tri = new THREE.Shape();
  tri.moveTo(-0.11, 0); tri.lineTo(0.11, 0); tri.lineTo(0, -0.22); tri.closePath();
  const triGeo = new THREE.ShapeGeometry(tri);
  for (let i = 0; i < 13; i++) {
    const z = -3.0 + i * 0.5;
    const sag = 2.62 - Math.sin((i / 12) * Math.PI) * 0.22;
    const col = flagColors[i % flagColors.length];
    deco(triGeo, col, -ROOM.w / 2 + 0.02, sag, z, {
      material: lowMat(col, { side: THREE.DoubleSide }), rot: [0, Math.PI / 2, 0], cast: false,
    });
  }

  // 별 액자 — 오른쪽 벽
  [[-1.4, 2.0, '#ffd56b'], [-2.1, 1.75, '#ff9fb5'], [2.2, 2.05, '#a9c8ff']].forEach(([z, y, col]) => {
    box(0.03, 0.5, 0.5, ROOM.w / 2 - 0.015, y, z, '#ffffff', frame);
    deco(starGeo, col, ROOM.w / 2 - 0.04, y, z, { rot: [0, -Math.PI / 2, 0], cast: false });
  });

  // 문 (앞벽)
  box(1.0, 2.1, 0.04, 1.6, 1.05, ROOM.d / 2 - 0.02, '#ffffff', frame);
  box(0.9, 2.0, 0.05, 1.6, 1.0, ROOM.d / 2 - 0.03, '#ffc9a8', frame);
  deco(new THREE.IcosahedronGeometry(0.04, 0), '#ffd56b', 1.25, 1.0, ROOM.d / 2 - 0.08);

  addCeilingLamp(b, 0, 0.4, '#ffc4d4');

  // ── 침대 (왼쪽 뒤) ──
  const bed = { x: -2.9, z: -2.4, w: 1.5, d: 2.2 };
  box(bed.w, 0.53, bed.d, bed.x, 0.265, bed.z, C.wood);
  box(1.42, 0.12, 2.12, bed.x, 0.5, bed.z, C.sheet, { collide: false, kind: 'fabric' });
  box(1.46, 0.06, 1.3, bed.x, 0.58, bed.z + 0.42, C.blanket, { collide: false });
  box(1.47, 0.065, 0.12, bed.x, 0.58, bed.z + 0.2, C.blanketStripe, { collide: false, occlude: false, kind: 'fabric' });
  box(1.47, 0.065, 0.12, bed.x, 0.58, bed.z + 0.62, C.blanketStripe, { collide: false, occlude: false, kind: 'fabric' });
  box(bed.w + 0.06, 1.05, 0.08, bed.x, 0.525, -3.46, C.woodDark);
  box(bed.w + 0.06, 0.68, 0.08, bed.x, 0.34, bed.z + bed.d / 2 - 0.04, C.woodDark);
  deco(new THREE.SphereGeometry(0.06, 6, 4), '#ffd56b', bed.x - 0.6, 1.1, -3.44);
  deco(new THREE.SphereGeometry(0.06, 6, 4), '#ffd56b', bed.x + 0.6, 1.1, -3.44);
  const bedZone = new THREE.Box3(new THREE.Vector3(-3.6, 0.5, -3.38), new THREE.Vector3(-2.2, 1.4, -1.4));

  // ── 책상 + 의자 (오른쪽 뒤) ──
  const desk = { x: 2.7, z: -3.08 };
  box(1.4, 0.06, 0.75, desk.x, 0.75, desk.z, C.wood);
  [[-0.65, -0.32], [0.65, -0.32], [-0.65, 0.32], [0.65, 0.32]].forEach(([dx, dz]) =>
    box(0.06, 0.72, 0.06, desk.x + dx, 0.36, desk.z + dz, C.woodDark));
  // 책상 서랍 (크레파스) — 앞에 의자가 들어가 있어서 먼저 빼야 열린다
  const deskDrawer = buildDrawerCabinet(b, {
    name: '책상 서랍', x: 3.02, z: -3.12, facing: 'pz', W: 0.44, D: 0.62, H: 0.7,
    slot: [0.3, 0.66], pull: 0.46, body: '#ffe7b3', front: '#ffc4d4', fakeFronts: [[0.04, 0.29]],
  });
  const chair = buildChair(b, {
    name: '의자', seat: '#a9dbff',
    poses: [{ x: 3.0, z: -2.25 }, { x: 2.15, z: -1.8, rotY: 0.6 }],
    labels: ['의자 빼기', '의자 밀어 넣기'],
  });
  linkBlocker(chair, deskDrawer);
  deco(new THREE.CylinderGeometry(0.08, 0.1, 0.03, 8), '#ffffff', 3.22, 0.795, -3.3);
  deco(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 5), '#ffffff', 3.22, 0.97, -3.3);
  deco(new THREE.ConeGeometry(0.13, 0.16, 8, 1, true), '#a9dbff', 3.22, 1.16, -3.3, {
    material: lowMat('#a9dbff', { side: THREE.DoubleSide }),
  });
  addStaticBox(ctx, 0.2, 0.45, 0.2, 3.22, 1.0, -3.3);
  deco(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 10), '#ffc4d4', 2.35, 0.785, -2.95, { cast: false });
  deco(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 10), '#a9dbff', 2.65, 0.785, -2.95, { cast: false });
  const deskZone = new THREE.Box3(new THREE.Vector3(2.02, 0.77, -3.43), new THREE.Vector3(3.08, 1.25, -2.72));

  // ── 책장 (오른쪽 벽) ──
  const sh = { x: 3.78, z: 0.6, w: 1.4, d: 0.4, h: 1.8 };
  box(0.03, sh.h, sh.w, 3.985, sh.h / 2, sh.z, C.shelf);
  box(sh.d, sh.h, 0.04, sh.x, sh.h / 2, sh.z - sh.w / 2 + 0.02, C.shelf);
  box(sh.d, sh.h, 0.04, sh.x, sh.h / 2, sh.z + sh.w / 2 - 0.02, C.shelf);
  [0.02, 0.6, 1.2, 1.78].forEach((y) => box(sh.d, 0.04, sh.w - 0.08, sh.x, y, sh.z, C.shelfBoard));
  addPlant(b, 3.78, 0.15, 0.5, { y: 1.8, type: 'bush', collide: false });
  const shelfZone = new THREE.Box3(new THREE.Vector3(3.59, 0.04, -0.07), new THREE.Vector3(3.97, 1.76, 1.27));

  // ── 장난감 상자 (왼쪽 앞) ──
  const toyZone = container(-3.25, 2.75, 1.1, 0.5, 0.8, 0.06, C.toybox);
  box(1.11, 0.08, 0.01, -3.25, 0.32, 2.345, C.toyboxStripe, frame);
  deco(starGeo, '#ffffff', -3.25, 0.18, 2.34, { rot: [0, Math.PI, 0], scale: [0.6, 0.6, 1] });
  box(1.1, 0.8, 0.05, -3.25, 0.72, 3.27, '#ffe08f', { collide: false, rotX: -0.15 });

  // ── 휴지통 (오른쪽 앞) ──
  const trashZone = container(3.4, 3.0, 0.5, 0.6, 0.5, 0.04, C.trash);
  box(0.505, 0.06, 0.01, 3.4, 0.56, 2.745, C.trashRim, frame);
  box(0.16, 0.03, 0.08, 3.4, 0.02, 2.71, '#ffffff', { collide: false });
  deco(new THREE.CircleGeometry(0.07, 6), '#fff', 3.4, 0.32, 2.744, { rot: [0, Math.PI, 0], cast: false });

  // ── 빨래 바구니 (뒷벽 창문 아래) ──
  // 받침 위에 얕은 바구니를 올려서, 넣은 옷이 위에서 보이고 잘못 넣은 것도 쉽게 다시 집을 수 있게
  box(0.8, 0.28, 0.6, -0.9, 0.14, -3.05, C.basket); // 윗면이 바구니 바닥(0.28)과 딱 맞도록
  box(0.81, 0.05, 0.61, -0.9, 0.14, -3.05, C.basketStripe, frame);
  const laundryZone = container(-0.9, -3.05, 0.8, 0.16, 0.6, 0.05, C.basket, 0.25);

  // ── 서랍장 (왼쪽 벽, 양말 서랍) ──
  const dresser = buildDrawerCabinet(b, {
    name: '서랍장', x: -3.775, z: -0.45, facing: 'px', W: 0.9, D: 0.45, H: 0.85,
    slot: [0.46, 0.8], pull: 0.34, body: '#fff4e2', front: '#a8e0d0',
    fakeFronts: [[0.05, 0.245], [0.255, 0.45]],
  });
  addPlant(b, -3.8, -0.15, 0.45, { y: 0.85, type: 'ficus', collide: false });

  // ── 장식 ──
  addPlant(b, -1.78, -3.2, 0.8);
  addPlant(b, 3.62, -0.85, 0.9);
  addPlant(b, -1.8, 3.15, 0.85);
  deco(new THREE.IcosahedronGeometry(0.45, 1), '#d4b5ff', -3.35, 0.28, 0.9, { scale: [1, 0.62, 1], occlude: true });
  addStaticBox(ctx, 0.75, 0.5, 0.75, -3.35, 0.25, 0.9);
  addWallClock(b, 1.55, 2.3, -3.47);
  addPoster(b, 'front', -0.5, 1.7, 0.55, 0.7, 'abc', C.woodDark);
  addPoster(b, 'right', 0.6, 2.25, 0.36, 0.45, 'sea');

  const zones = [
    { id: 'trash', label: '휴지통', task: '쓰레기 버리기', emoji: '🗑️', color: '#5fcfa8', box: trashZone },
    { id: 'toybox', label: '장난감 상자', task: '장난감 정리', emoji: '🧸', color: '#ffb02e', box: toyZone },
    { id: 'bookshelf', label: '책장', task: '책 꽂기', emoji: '📚', color: '#6aa8ff', box: shelfZone },
    { id: 'laundry', label: '빨래 바구니', task: '빨래 모으기', emoji: '🧺', color: '#e39a4f', box: laundryZone },
    { id: 'desk', label: '책상 위', task: '컵 올려두기', emoji: '☕', color: '#ff7fa0', box: deskZone },
    { id: 'bed', label: '침대 위', task: '인형·베개 정돈', emoji: '🛏️', color: '#b48cff', box: bedZone },
    { id: 'dresser', label: '서랍장', task: '양말 넣기', emoji: '🧦', color: '#3fb0d8', box: new THREE.Box3(), movable: dresser },
    { id: 'deskdrawer', label: '책상 서랍', task: '크레파스 정리', emoji: '🖍️', color: '#ff9a3c', box: new THREE.Box3(), movable: deskDrawer },
  ];
  for (const z of zones) if (z.movable) z.movable.updateZone(z);

  // 물건을 흩뿌리면 안 되는 영역 (x0, x1, z0, z1)
  const blockers = [
    [-3.75, -2.05, -3.5, -1.2], [1.85, 3.5, -3.5, -1.5], [3.45, 4, -0.25, 1.45],
    [-3.95, -2.55, 2.2, 3.5], [3.0, 3.8, 2.6, 3.5], [-1.45, -0.35, -3.5, -2.6],
    [-4, -3.1, -1.0, 0.1], [3.3, 3.9, -1.15, -0.55], [-2.15, -1.45, 2.8, 3.5],
    [-3.85, -2.85, 0.4, 1.4], [-2.0, -1.55, -3.45, -2.95],
  ];

  return { zones, blockers, bounds: { x0: -3.6, x1: 3.4, z0: -3.2, z1: 3.2 } };
}

const items = [
  ...['#ff8fa3', '#ffd56b', '#7ec8ff', '#8ee3a8'].map((c) => ({ name: '장난감 블록', target: 'toybox', make: () => F.block(c) })),
  { name: '비치볼', target: 'toybox', make: () => F.ball(['#ff8fa3', '#fff6dc', '#7ec8ff', '#fff6dc', '#ffd56b', '#fff6dc']) },
  { name: '고무공', target: 'toybox', make: () => F.ball(['#c4a7ff', '#ffffff'], 0.09) },
  { name: '장난감 자동차', target: 'toybox', make: F.car },
  { name: '고무 오리', target: 'toybox', make: F.duck },
  ...['#ff9fb5', '#7ec8ff', '#8ee3a8', '#ffcf6b'].map((c) => ({ name: '동화책', target: 'bookshelf', make: () => F.book(c) })),
  { name: '양말', target: 'dresser', make: () => F.sock('#a9c8ff') },
  { name: '양말', target: 'dresser', make: () => F.sock('#ffb7c9') },
  { name: '티셔츠', target: 'laundry', make: () => F.shirt('#ffe08f') },
  { name: '수건', target: 'laundry', make: () => F.blanket('#bfe3ff') },
  { name: '크레파스', target: 'deskdrawer', make: () => F.pencil('#ff8fa3') },
  { name: '크레파스', target: 'deskdrawer', make: () => F.pencil('#ffd56b') },
  { name: '크레파스', target: 'deskdrawer', make: () => F.pencil('#8ee3a8') },
  { name: '머그컵', target: 'desk', make: () => F.mug('#ffc4d4') },
  { name: '머그컵', target: 'desk', make: () => F.mug('#a9dbff') },
  { name: '곰인형', target: 'bed', make: F.teddy },
  { name: '베개', target: 'bed', make: F.pillow },
  ...[0, 1, 2].map(() => ({ name: '구겨진 종이', target: 'trash', make: F.paper })),
  { name: '빈 캔', target: 'trash', make: () => F.can('#ff8fa3') },
  { name: '빈 캔', target: 'trash', make: () => F.can('#8ee3a8') },
  { name: '바나나 껍질', target: 'trash', make: F.bananaPeel },
  { name: '과자 봉지', target: 'trash', make: F.snackBag },
];

export default {
  id: 'kids',
  name: '아이 방',
  emoji: '🧸',
  desc: '장난감과 빨래가 굴러다니는 알록달록 아이 방',
  spawn: { x: 0.4, z: 2.4, yaw: 0 },
  timeLimit: 60,
  lamp: [0, 2.3, 0.4],
  windowLight: { pos: [0.4, 3.3, -6.5], target: [0.1, 0, -1.4] },
  background: '#ffe9f0',
  build,
  items,
};
