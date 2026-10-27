// 맵 공용 빌더: 정적 박스/장식/수납함, 방 껍데기(바닥·벽·천장·들보), 창문·화분·조명·포스터 같은 공용 소품
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { grainTex, plankTex, stripeTex, posterTex, repeated, make, rng } from './textures.js';
import { kindMat, repeatMaps } from './materials.js';

// 충돌 그룹: 플레이어는 정적 지형과만, 물건은 지형·물건끼리 충돌한다
export const G = { STATIC: 1, PLAYER: 2, ITEM: 4 };

// 방 크기: x -4..4, z -3.5..3.5, 높이 3
export const ROOM = { w: 8, d: 7, h: 3 };

// 손으로 칠한 듯한 결이 들어간 부드러운 재질
export function lowMat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.78, metalness: 0, map: grainTex(), envMapIntensity: 0.35, ...extra,
  });
}

export function woodMat(color, extra = {}) {
  return kindMat('wood', color, extra);
}

// 모서리를 살짝 둥글린 박스 (아주 얇은 판은 그냥 박스)
export function softBox(w, h, d, maxRadius = 0.022) {
  const m = Math.min(w, h, d);
  if (m < 0.03) return new THREE.BoxGeometry(w, h, d);
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(maxRadius, m * 0.22));
}

// 각진 저폴리 도형을 부드럽게: 원기둥·원뿔은 둘레 분할을 늘리고, 박스는 모서리를 둥글린다
// (정이십면체 detail 0 은 일부러 각진 스타일로 남겨 둔다 — 잎사귀·구겨진 종이 등)
export function smoothGeo(geo) {
  const p = geo.parameters || {};
  switch (geo.type) {
    case 'CylinderGeometry': {
      const seg = Math.max(p.radialSegments, Math.max(p.radiusTop, p.radiusBottom) > 0.5 ? 40 : 18);
      if (seg === p.radialSegments) return geo;
      return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, seg, p.heightSegments, p.openEnded, p.thetaStart, p.thetaLength);
    }
    case 'ConeGeometry': {
      if (p.radialSegments >= 16) return geo;
      return new THREE.ConeGeometry(p.radius, p.height, 18, p.heightSegments, p.openEnded, p.thetaStart, p.thetaLength);
    }
    case 'IcosahedronGeometry':
      return p.detail >= 1 && p.detail < 3 ? new THREE.IcosahedronGeometry(p.radius, p.detail + 1) : geo;
    case 'BoxGeometry':
      if (p.widthSegments !== 1 || p.heightSegments !== 1 || p.depthSegments !== 1) return geo; // 베개처럼 변형한 박스는 그대로
      return softBox(p.width, p.height, p.depth, 0.012);
    default:
      return geo;
  }
}

// HDR 색(1보다 밝게) → 블룸으로 은은하게 빛난다
export function glowMat(color, strength = 2.2) {
  const c = new THREE.Color(color).multiplyScalar(strength);
  return new THREE.MeshBasicMaterial({ color: c });
}

export function addStaticBox(ctx, w, h, d, x, y, z, rotY = 0) {
  const body = new CANNON.Body({
    mass: 0,
    material: ctx.mats.static,
    collisionFilterGroup: G.STATIC,
    collisionFilterMask: G.PLAYER | G.ITEM,
  });
  body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
  body.position.set(x, y, z);
  if (rotY) body.quaternion.setFromEuler(0, rotY, 0);
  ctx.world.addBody(body);
  return body;
}

// 러그 표면: 보이는 두께만큼 얇은 바닥을 깔아서 물건이 러그 '위'에 놓이게 한다 (밑으로 파묻히지 않게)
// 플레이어는 부딪히지 않아서 러그를 밟고 지나갈 때 화면이 덜컹거리지 않는다
// shape: { r } 원형 | { w, d } 사각형, top = 러그 윗면 높이
export function addRugSurface(ctx, x, z, top, shape) {
  const body = new CANNON.Body({
    mass: 0,
    material: ctx.mats.static,
    collisionFilterGroup: G.STATIC,
    collisionFilterMask: G.ITEM,
  });
  // 판을 바닥 속으로 두툼하게 내려서, 얇은 물건이 끼어도 아래가 아닌 위로만 밀려나게 한다
  const sink = 0.2, h = top + sink;
  if (shape.r) body.addShape(new CANNON.Cylinder(shape.r, shape.r, h, 32));
  else body.addShape(new CANNON.Box(new CANNON.Vec3(shape.w / 2, h / 2, shape.d / 2)));
  body.position.set(x, top - h / 2, z);
  ctx.world.addBody(body);
  return body;
}

export function createBuilder(ctx) {
  const { scene } = ctx;
  ctx.occluders = [];
  ctx.movables = []; // 서랍·의자처럼 움직이는 가구 (furniture.js)
  const b = { ctx, woodColors: new Set(), kinds: new Map() };
  // 맵마다 '이 색은 천, 이 색은 라탄…' 하고 재질을 등록 (색 → 재질 이름)
  b.setKinds = (table) => {
    for (const [kind, colors] of Object.entries(table)) for (const c of colors) b.kinds.set(c, kind);
  };
  // kind 를 직접 주면 그 재질, 아니면 색으로 등록된 재질 → 나무색 → 기본 칠
  const matFor = (color, extra, kind) => {
    const k = kind || b.kinds.get(color) || (b.woodColors.has(color) ? 'wood' : null);
    return k ? kindMat(k, color, extra) : lowMat(color, extra);
  };
  b.matFor = matFor;
  // 큰 면에서 무늬가 늘어나 보이지 않도록 크기에 맞춰 반복
  const sizedMat = (color, w, h, d, kind) => {
    const s = Math.max(w, h, d);
    const mat = matFor(color, undefined, kind);
    if (s > 1.2) repeatMaps(mat, s / 1.2, s / 1.2);
    return mat;
  };

  b.box = function box(w, h, d, x, y, z, color, o = {}) {
    const geo = o.round === false ? new THREE.BoxGeometry(w, h, d) : softBox(w, h, d);
    const mesh = new THREE.Mesh(geo, o.material || sizedMat(color, w, h, d, o.kind));
    mesh.position.set(x, y, z);
    if (o.rotY) mesh.rotation.y = o.rotY;
    if (o.rotX) mesh.rotation.x = o.rotX;
    if (o.rotZ) mesh.rotation.z = o.rotZ;
    mesh.castShadow = o.cast ?? true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (o.collide !== false) addStaticBox(ctx, w, h, d, x, y, z, o.rotY || 0);
    if (o.occlude !== false) ctx.occluders.push(mesh);
    return mesh;
  };

  b.deco = function deco(geometry, color, x, y, z, o = {}) {
    const mesh = new THREE.Mesh(smoothGeo(geometry), o.material || matFor(color, o.mat, o.kind));
    mesh.position.set(x, y, z);
    if (o.rot) mesh.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    if (o.scale) mesh.scale.set(o.scale[0], o.scale[1], o.scale[2]);
    mesh.castShadow = o.cast ?? true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (o.occlude) ctx.occluders.push(mesh);
    return mesh;
  };

  // 위가 뚫린 상자(장난감 상자·휴지통·트레이 등). y0 = 바닥면 높이. 안쪽 공간을 정리 구역으로 돌려준다
  b.container = function container(cx, cz, w, h, d, t, color, y0 = 0) {
    const { box } = b;
    box(w, t, d, cx, y0 + t / 2, cz, color);
    box(w, h, t, cx, y0 + h / 2, cz - d / 2 + t / 2, color);
    box(w, h, t, cx, y0 + h / 2, cz + d / 2 - t / 2, color);
    box(t, h, d - 2 * t, cx - w / 2 + t / 2, y0 + h / 2, cz, color);
    box(t, h, d - 2 * t, cx + w / 2 - t / 2, y0 + h / 2, cz, color);
    return new THREE.Box3(
      new THREE.Vector3(cx - w / 2 + t, y0 - 0.05, cz - d / 2 + t),
      new THREE.Vector3(cx + w / 2 - t, y0 + h + 0.3, cz + d / 2 - t),
    );
  };

  return b;
}

// 바닥 판자 · 네 벽(한 면은 줄무늬 벽지) · 판자 천장 + 들보 · 걸레받이
// C: floorA/B, wall*, ceilA/B, beam, trim, wood, woodDark, stripes {a, b, width}
export function buildShell(b, C) {
  [C.wood, C.woodDark, C.beam].forEach((c) => c && b.woodColors.add(c));
  const { box } = b;
  const shell = { collide: false, round: false, cast: false, occlude: false };
  addStaticBox(b.ctx, ROOM.w + 2, 0.2, ROOM.d + 2, 0, -0.1, 0);

  // 원목 마루: 판자 무늬로 이음새가 살짝 패이고, 니스 칠한 듯 은은하게 반사
  const floorTex = repeated(plankTex(C.floorA, C.floorB, 3), ROOM.w / 1, ROOM.d / 2);
  const floorMat = new THREE.MeshPhysicalMaterial({
    map: floorTex, bumpMap: floorTex, bumpScale: 0.6,
    roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.45,
  });
  box(ROOM.w, 0.1, ROOM.d, 0, -0.05, 0, '', { ...shell, material: floorMat });

  const h = ROOM.h;
  const wallMat = (color, width) => {
    if (C.stripes && color === C.wallBack) {
      // 종이 벽지: 줄무늬 + 종이 결 요철
      const paper = kindMat('paper', '#ffffff');
      return kindMat('paper', '#ffffff', {
        map: repeated(stripeTex(C.stripes.a, C.stripes.b), width / (2 * C.stripes.width), 1),
        bumpMap: repeated(paper.bumpMap, width, 3), bumpScale: 0.25,
      });
    }
    // 페인트 벽: 아주 옅은 롤러 자국
    return repeatMaps(kindMat('paint', color), 3, 1.5);
  };
  const wallOpt = (color, width) => ({ round: false, cast: false, material: wallMat(color, width) });
  box(ROOM.w + 0.4, h, 0.2, 0, h / 2, -ROOM.d / 2 - 0.1, C.wallBack, wallOpt(C.wallBack, ROOM.w + 0.4));
  box(ROOM.w + 0.4, h, 0.2, 0, h / 2, ROOM.d / 2 + 0.1, C.wallFront, wallOpt(C.wallFront));
  box(0.2, h, ROOM.d, -ROOM.w / 2 - 0.1, h / 2, 0, C.wallLeft, wallOpt(C.wallLeft));
  box(0.2, h, ROOM.d, ROOM.w / 2 + 0.1, h / 2, 0, C.wallRight, wallOpt(C.wallRight));

  // 판자 천장 + 들보
  const ceilTex = repeated(plankTex(C.ceilA, C.ceilB, 8), (ROOM.w + 0.4) / 1, (ROOM.d + 0.4) / 2);
  const ceilMat = new THREE.MeshStandardMaterial({
    map: ceilTex, bumpMap: ceilTex, bumpScale: 0.5, roughness: 0.82, envMapIntensity: 0.3,
  });
  box(ROOM.w + 0.4, 0.1, ROOM.d + 0.4, 0, h + 0.05, 0, '', { round: false, cast: false, material: ceilMat });
  [-2.6, -0.95, 1.05, 2.7].forEach((z) => box(ROOM.w, 0.2, 0.2, 0, h - 0.1, z, C.beam, { ...shell, round: true }));
  box(ROOM.w, 0.12, 0.12, 0, h - 0.06, -ROOM.d / 2 + 0.06, C.beam, { ...shell, round: true });
  box(ROOM.w, 0.12, 0.12, 0, h - 0.06, ROOM.d / 2 - 0.06, C.beam, { ...shell, round: true });

  // 걸레받이
  const trim = C.baseboard || C.trim;
  const tb = { collide: false, cast: false, occlude: false };
  box(ROOM.w, 0.12, 0.035, 0, 0.06, -ROOM.d / 2 + 0.017, trim, tb);
  box(ROOM.w, 0.12, 0.035, 0, 0.06, ROOM.d / 2 - 0.017, trim, tb);
  box(0.035, 0.12, ROOM.d, -ROOM.w / 2 + 0.017, 0.06, 0, trim, tb);
  box(0.035, 0.12, ROOM.d, ROOM.w / 2 - 0.017, 0.06, 0, trim, tb);
}

// 벽 기준 좌표 → 월드 좌표. u = 벽을 따라가는 좌표, n = 벽에서 방 안쪽으로 떨어진 거리
export function wallSpot(wall, u, n) {
  switch (wall) {
    case 'back': return { x: u, z: -ROOM.d / 2 + n, rotY: 0, alongX: true };
    case 'front': return { x: u, z: ROOM.d / 2 - n, rotY: Math.PI, alongX: true };
    case 'left': return { x: -ROOM.w / 2 + n, z: u, rotY: Math.PI / 2, alongX: false };
    default: return { x: ROOM.w / 2 - n, z: u, rotY: -Math.PI / 2, alongX: false };
  }
}

export function starGeometry(outer = 0.16, inner = 0.07, depth = 0.02) {
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? inner : outer;
    i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ExtrudeGeometry(star, { depth, bevelEnabled: false });
}

// 하늘·구름이 보이는 창문 + 커튼. wall: 'back'(뒷벽) | 'left'(왼쪽 벽)
export function addWindow(b, wall, u, y, { curtain = '#ffc2d1', rod = '#cf9a6c', trim = '#ffffff' } = {}) {
  const B = (du, h, dn, uu, yy, n, color, o) => {
    const s = wallSpot(wall, uu, n);
    return b.box(s.alongX ? du : dn, h, s.alongX ? dn : du, s.x, yy, s.z, color, o);
  };
  const D = (geo, mat, du, dy, n, o = {}) => {
    const s = wallSpot(wall, u + du, n);
    return b.deco(geo, '', s.x, y + dy, s.z, { material: mat, rot: [0, s.rotY, 0], cast: false, ...o });
  };

  D(new THREE.PlaneGeometry(1.6, 1.1), glowMat('#bfe6ff', 1.25), 0, 0, 0.005);
  const cloudMat = glowMat('#ffffff', 1.3);
  [[-0.45, 0.2, 0.16], [-0.3, 0.25, 0.12], [0.35, -0.15, 0.14], [0.5, -0.11, 0.1]].forEach(([du, dy, r]) =>
    D(new THREE.IcosahedronGeometry(r, 1), cloudMat, du, dy, 0.01, { scale: [1.6, 0.8, 0.1] }));
  D(new THREE.CircleGeometry(0.12, 16), glowMat('#ffe680', 2.5), 0.55, 0.35, 0.012);

  const frame = { collide: false, occlude: false };
  B(1.8, 0.1, 0.1, u, y + 0.6, 0.05, trim, frame);
  B(1.8, 0.1, 0.1, u, y - 0.6, 0.05, trim, frame);
  B(0.1, 1.3, 0.1, u - 0.85, y, 0.05, trim, frame);
  B(0.1, 1.3, 0.1, u + 0.85, y, 0.05, trim, frame);
  B(0.05, 1.1, 0.05, u, y, 0.03, trim, frame);
  B(1.6, 0.05, 0.05, u, y, 0.03, trim, frame);
  B(1.95, 0.06, 0.18, u, y - 0.64, 0.09, trim, { occlude: false });
  addCurtain(b, wall, u - 1.08, y + 0.75, -1, curtain);
  addCurtain(b, wall, u + 1.08, y + 0.75, 1, curtain);
  B(2.7, 0.06, 0.06, u, y + 0.78, 0.12, rod, { ...frame, kind: 'wood' });
}

// 드리운 커튼 한 폭: 주름이 물결치고, 2/3 높이에서 끈으로 묶여 모였다가 아래로 다시 퍼진다.
// uc = 벽을 따라 놓일 가운데, yTop = 봉 높이, outer = 창문 바깥쪽 방향(-1 | 1, u 기준)
function addCurtain(b, wall, uc, yTop, outer, color) {
  const cw = 0.46, H = 1.62, folds = 5, tie = 0.62;
  const s = wallSpot(wall, uc, 0.06);
  // 벽을 따라가는 u 방향이 커튼 자체의 x 방향과 같은지 (벽마다 회전이 달라서)
  const dot = s.alongX ? Math.cos(s.rotY) : -Math.sin(s.rotY);
  const out = outer * Math.sign(dot); // 묶어서 모으는 쪽(창문 바깥쪽)
  const ax = out * cw / 2;
  const gatherAt = (t) => {
    let g = 1 - 0.52 * Math.exp(-(((t - tie) / 0.17) ** 2));
    if (t > tie) g *= 1 + 0.15 * ((t - tie) / (1 - tie));
    return g;
  };
  const peaks = [];
  const geo = new THREE.PlaneGeometry(cw, H, 60, 40);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const t = (H / 2 - y) / H; // 0 = 위, 1 = 아래
    const g = gatherAt(t);
    const phase = (x / cw + 0.5) * folds * Math.PI * 2;
    const depth = 0.016 + 0.035 * (1 - g) + 0.01 * t; // 모인 곳·아래쪽일수록 주름이 깊다
    const sway = Math.sin(t * 3 + x * 8) * 0.006; // 살짝 흐트러진 결
    p.setXYZ(i, ax + (x - ax) * g, y, 0.028 + depth * (0.5 + 0.5 * Math.sin(phase)) + sway);
  }
  geo.computeVertexNormals();
  for (let k = 0; k < folds; k++) peaks.push(-cw / 2 + ((k + 0.25) / folds) * cw);

  const g = new THREE.Group();
  const cloth = new THREE.Mesh(geo, kindMat('fabric', color, { side: THREE.DoubleSide }));
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  g.add(cloth);
  // 봉에 거는 고리
  const ringGeo = new THREE.TorusGeometry(0.022, 0.005, 6, 16);
  const ringMat = kindMat('wood', '#c98f62');
  for (const px of peaks) {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(px, H / 2 + 0.03, 0.06);
    g.add(ring);
  }
  // 묶는 끈 (모인 폭만큼)
  const tw = cw * gatherAt(tie) + 0.03;
  const sash = new THREE.Mesh(softBox(tw, 0.045, 0.1, 0.015), kindMat('fabric', new THREE.Color(color).multiplyScalar(0.82)));
  sash.position.set(ax + (0 - ax) * gatherAt(tie), H / 2 - tie * H, 0.06);
  sash.castShadow = true;
  g.add(sash);

  g.position.set(s.x, yTop - H / 2, s.z);
  g.rotation.y = s.rotY;
  b.ctx.scene.add(g);
}

// 천장에 매달린 펜던트 조명 (전구는 블룸으로 빛남)
export function addCeilingLamp(b, x, z, shade = '#ffc4d4') {
  b.deco(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 6), '#5a4a3e', x, 2.78, z, { cast: false, kind: 'metal' });
  b.deco(new THREE.CylinderGeometry(0.06, 0.08, 0.08, 12), shade, x, 2.55, z, { cast: false, kind: 'paintedMetal' });
  // 천 갓: 안쪽 전구 빛이 살짝 비침
  b.deco(new THREE.ConeGeometry(0.34, 0.2, 24, 1, true), shade, x, 2.44, z, {
    material: kindMat('fabric', shade, { side: THREE.DoubleSide, emissive: new THREE.Color(shade), emissiveIntensity: 0.15 }), cast: false,
  });
  b.deco(new THREE.SphereGeometry(0.09, 16, 12), '', x, 2.38, z, { material: glowMat('#ffd98a', 3.2), cast: false });
}

// 잎 한 장: 끝이 뾰족한 타원 모양이 가운데 잎맥을 따라 접히고, 끝으로 갈수록 아래로 휘어진다.
// 원점이 잎자루(밑동)이고 +y 쪽으로 자란다
function leafGeo(len, wid, droop = 0.35, fold = 0.22) {
  const g = new THREE.PlaneGeometry(wid, len, 6, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, p.getY(i) / len + 0.5)); // 0 = 밑동, 1 = 끝 (반올림 오차로 음수가 되면 NaN)
    const w = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 0.75))), 0.85); // 끝이 뾰족한 폭 (끝에서 살짝 음수가 되어 NaN 나지 않게)
    const x = p.getX(i) * w;
    const z = -droop * len * t * t - Math.abs(x) * fold * (1 - t * 0.4) + Math.sin(t * 9 + x * 20) * 0.004; // 휨 + 접힘 + 잔주름
    p.setXYZ(i, x, p.getY(i) + len / 2, z);
  }
  g.computeVertexNormals();
  return g;
}

// 잎 무늬: 가운데 굵은 잎맥 + 비스듬한 곁잎맥 (회색조 → 잎 색에 곱해짐)
function leafTex() {
  return make('plant-leaf', 128, 256, (c, w, h) => {
    const r = rng(5);
    c.fillStyle = '#d9d9d9'; c.fillRect(0, 0, w, h);
    for (let k = 0; k < 400; k++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'; c.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 6); }
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(w / 2, h); c.lineTo(w / 2, 4); c.stroke();
    c.lineWidth = 1.6; c.strokeStyle = 'rgba(255,255,255,0.4)';
    for (let y = 20; y < h; y += 16) for (const s of [-1, 1]) { c.beginPath(); c.moveTo(w / 2, h - y); c.quadraticCurveTo(w / 2 + s * 26, h - y - 12, w / 2 + s * 54, h - y - 38); c.stroke(); }
  });
}

let plantCount = 0;
// 화분 식물. 방마다 모양이 다르게 보이도록 번갈아 3가지 종류로 만든다 (고무나무 · 산세베리아 · 덤불)
// y: 놓인 면의 높이 (선반·장 위에 올릴 때), collide: false 면 충돌 없이 장식만
export function addPlant(b, x, z, s = 1, { pot = '#ffb48f', leaf = '#8fd6a0', type = null, y = 0, collide = true } = {}) {
  const kind = type || ['ficus', 'snake', 'bush'][plantCount++ % 3];
  const seed = (x * 13.7 + z * 7.3 + y * 3.1) | 0;
  const rnd = (() => { let a = (seed * 9301 + 49297) >>> 0; return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; }; })();
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const put = (geo, mat, px, py, pz, o = {}) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true;
    if (o.rot) m.rotation.set(...o.rot);
    g.add(m); if (o.occlude) b.ctx.occluders.push(m); return m;
  };

  // 화분: 위가 넓은 도자기·테라코타 + 윗단 테두리 + 받침 접시 + 흙
  const potMat = kindMat(pot === '#ffb48f' ? 'terracotta' : 'ceramic', pot);
  put(new THREE.CylinderGeometry(0.17 * s, 0.12 * s, 0.26 * s, 28), potMat, 0, 0.14 * s, 0, { occlude: true });
  put(new THREE.CylinderGeometry(0.19 * s, 0.18 * s, 0.045 * s, 28), potMat, 0, 0.265 * s, 0);
  put(new THREE.CylinderGeometry(0.15 * s, 0.14 * s, 0.025 * s, 28), potMat, 0, 0.012 * s, 0, { rot: [0, 0, 0] });
  put(new THREE.CylinderGeometry(0.2 * s, 0.17 * s, 0.022 * s, 28), potMat, 0, 0.011 * s, 0); // 받침 접시
  put(new THREE.CylinderGeometry(0.165 * s, 0.165 * s, 0.012 * s, 24), kindMat('sand', '#3b2a20'), 0, 0.27 * s, 0); // 흙

  const leafColor = new THREE.Color(leaf);
  const leafMat = (tint = 1, extra = {}) => kindMat('leaf', leafColor.clone().multiplyScalar(tint), {
    side: THREE.DoubleSide, map: leafTex(), bumpMap: leafTex(), bumpScale: 0.5, ...extra,
  });
  const stemMat = kindMat('leaf', '#6f9a5a', { map: null, bumpMap: null });
  const stem = (x0, y0, z0, x1, y1, z1, r) => { // 두 점을 잇는 가는 줄기
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz);
    const m = put(new THREE.CylinderGeometry(r * 0.7, r, len, 8), stemMat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
  };
  const addLeaf = (px, py, pz, len, wid, yaw, tilt, tint, droop = 0.3) => {
    const m = put(leafGeo(len, wid, droop), leafMat(tint), px, py, pz);
    m.rotation.order = 'YXZ'; m.rotation.set(tilt, yaw, 0);
  };

  if (kind === 'ficus') {
    // 고무나무: 굵은 줄기 위에 넓고 반들거리는 잎이 돌려나기
    stem(0, 0.27 * s, 0, 0.01, 0.62 * s, 0.01, 0.014 * s);
    for (let i = 0; i < 16; i++) {
      const hgt = (0.38 + (i / 16) * 0.5) * s, a = i * 2.4 + rnd();
      const r0 = 0.012 * s;
      addLeaf(Math.cos(a) * r0, hgt, Math.sin(a) * r0, (0.2 + rnd() * 0.07) * s, (0.1 + rnd() * 0.03) * s, a + Math.PI / 2, 0.75 + rnd() * 0.45 - i * 0.02, 0.85 + rnd() * 0.3, 0.34);
    }
    addLeaf(0, 0.6 * s, 0, 0.17 * s, 0.085 * s, 0.4, 0.2, 1.1, 0.15);
  } else if (kind === 'snake') {
    // 산세베리아: 단단하게 곧게 서는 칼 모양 잎 (가장자리에 노란 띠)
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd() * 0.5, rr = 0.03 * s + rnd() * 0.035 * s;
      const len = (0.34 + rnd() * 0.3) * s;
      addLeaf(Math.cos(a) * rr, 0.27 * s, Math.sin(a) * rr, len, 0.075 * s, a + Math.PI / 2, 0.08 + rnd() * 0.16, 0.8 + rnd() * 0.25, 0.08);
    }
  } else {
    // 덤불: 작은 잎이 아래서부터 풍성하게 부채꼴로 퍼짐
    for (let i = 0; i < 34; i++) {
      const a = i * 2.39996, ring = Math.sqrt(i / 34);
      const hgt = (0.28 + ring * 0.26) * s;
      addLeaf(Math.cos(a) * 0.03 * s * ring, hgt, Math.sin(a) * 0.03 * s * ring, (0.12 + rnd() * 0.06) * s, (0.055 + rnd() * 0.02) * s, a + Math.PI / 2, 0.55 + ring * 0.7 + rnd() * 0.2, 0.8 + rnd() * 0.35, 0.28);
    }
  }
  b.ctx.scene.add(g);
  if (collide) addStaticBox(b.ctx, 0.4 * s, 0.9 * s, 0.4 * s, x, y + 0.45 * s, z);
}

export function addWallClock(b, x, y, z, face = '#fff1a8') {
  const frame = { collide: false, occlude: false };
  b.deco(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 24), '#ffffff', x, y, z, { rot: [Math.PI / 2, 0, 0] });
  b.deco(new THREE.CylinderGeometry(0.19, 0.19, 0.055, 24), face, x, y, z + 0.005, { rot: [Math.PI / 2, 0, 0] });
  b.box(0.015, 0.13, 0.01, x, y + 0.05, z + 0.035, '#7a6a6a', frame);
  b.box(0.09, 0.015, 0.01, x + 0.04, y, z + 0.035, '#7a6a6a', frame);
}

// 액자 포스터. kind: 'fruit' | 'abc' | 'map' | 'sea'
export function addPoster(b, wall, u, y, w, h, kind, frameColor = '#ffffff') {
  const s = wallSpot(wall, u, 0.02);
  b.box(s.alongX ? w + 0.06 : 0.03, h + 0.06, s.alongX ? 0.03 : w + 0.06, s.x, y, s.z, frameColor, { collide: false, occlude: false });
  const p = wallSpot(wall, u, 0.037);
  b.deco(new THREE.PlaneGeometry(w, h), '', p.x, y, p.z, {
    material: kindMat('paperGloss', '#ffffff', { map: posterTex(kind) }),
    rot: [0, p.rotY, 0], cast: false,
  });
}
