// 흩어진 물건들: 로우폴리 메시 + 물리 바디
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, lowMat, smoothGeo } from './world.js';
import { applyItemMaterials } from './materials.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new CANNON.Vec3(x, y, z);

function part(geo, color, x = 0, y = 0, z = 0, rot = null, scale = null, extra = {}) {
  const m = new THREE.Mesh(smoothGeo(geo), lowMat(color, { roughness: 0.6, ...extra }));
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  if (scale) m.scale.set(scale[0], scale[1], scale[2]);
  return m;
}

function group(...children) {
  const g = new THREE.Group();
  children.forEach((c) => g.add(c));
  return g;
}

// ── 물건 팩토리: { mesh, shapes, mass, bouncy? } ──────────────────────────────

export function block(color) {
  const s = 0.16;
  const mesh = group(
    part(new THREE.BoxGeometry(s, s, s), color),
    part(new THREE.BoxGeometry(s * 0.55, s * 0.55, 0.01), '#ffffff', 0, 0, s / 2 + 0.002),
    part(new THREE.BoxGeometry(s * 0.55, s * 0.55, 0.01), '#ffffff', 0, 0, -s / 2 - 0.002),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(s / 2, s / 2, s / 2)) }], mass: 0.2 };
}

export function ball(colors, r = 0.12) {
  const geo = new THREE.IcosahedronGeometry(r, 1);
  const pos = geo.attributes.position;
  const col = [];
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const sector = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 6) % colors.length;
    tmp.set(colors[sector]);
    for (let k = 0; k < 3; k++) col.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, lowMat('#ffffff', { vertexColors: true }));
  return { mesh: group(mesh), shapes: [{ shape: new CANNON.Sphere(r) }], mass: 0.15, bouncy: true };
}

export function car() {
  const wheel = new THREE.CylinderGeometry(0.045, 0.045, 0.03, 8);
  const mesh = group(
    part(new THREE.BoxGeometry(0.3, 0.09, 0.16), '#ff8fa3', 0, -0.03, 0),
    part(new THREE.BoxGeometry(0.15, 0.08, 0.14), '#ffffff', -0.02, 0.055, 0),
    part(new THREE.BoxGeometry(0.152, 0.05, 0.142), '#a9dbff', -0.02, 0.06, 0),
    part(new THREE.BoxGeometry(0.02, 0.03, 0.04), '#fff1a8', 0.151, -0.02, 0.05),
    part(new THREE.BoxGeometry(0.02, 0.03, 0.04), '#fff1a8', 0.151, -0.02, -0.05),
    ...[[-0.1, 0.085], [0.1, 0.085], [-0.1, -0.085], [0.1, -0.085]].map(([x, z]) =>
      part(wheel, '#5d5470', x, -0.055, z, [Math.PI / 2, 0, 0])),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.15, 0.1, 0.09)) }], mass: 0.3 };
}

export function duck() {
  const mesh = group(
    part(new THREE.IcosahedronGeometry(0.09, 1), '#ffe066', 0, 0, 0, null, [1.25, 0.85, 1]),
    part(new THREE.IcosahedronGeometry(0.06, 1), '#ffe066', 0.06, 0.08, 0),
    part(new THREE.BoxGeometry(0.05, 0.02, 0.04), '#ff9a3c', 0.12, 0.075, 0),
    part(new THREE.IcosahedronGeometry(0.01, 0), '#3b3350', 0.1, 0.1, 0.035),
    part(new THREE.IcosahedronGeometry(0.01, 0), '#3b3350', 0.1, 0.1, -0.035),
    part(new THREE.ConeGeometry(0.03, 0.05, 4), '#ffd23f', -0.11, 0.03, 0, [0, 0, -1.1]),
  );
  return {
    mesh,
    shapes: [
      { shape: new CANNON.Sphere(0.085) },
      { shape: new CANNON.Sphere(0.055), offset: V(0.06, 0.08, 0) },
      // 꼬리·부리 끝도 충돌에 넣어서 옆으로 쓰러져도 바닥에 파묻히지 않게
      { shape: new CANNON.Sphere(0.03), offset: V(-0.11, 0.03, 0) },
      { shape: new CANNON.Sphere(0.022), offset: V(0.12, 0.075, 0) },
    ],
    mass: 0.1,
  };
}

export function book(color) {
  const mesh = group(
    part(new THREE.BoxGeometry(0.045, 0.26, 0.19), color),
    part(new THREE.BoxGeometry(0.036, 0.245, 0.186), '#fffaf0', 0, 0, 0.007),
    part(new THREE.BoxGeometry(0.047, 0.03, 0.05), '#ffffff', 0, 0.07, -0.072),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.0225, 0.13, 0.095)) }], mass: 0.25 };
}

// UV 를 늘려서 무늬(뜨개·천 결)가 촘촘하게 반복되게
function scaleUV(geo, sx, sy) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy);
  return geo;
}

// 양말: 납작하게 놓인 뜨개 관 — 발목에서 발뒤꿈치를 돌아 발끝으로 꺾이고, 목 부분 고무단 · 뒤꿈치·발끝 덧댐
export function sock(color) {
  const R = 0.036;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, -0.15), new THREE.Vector3(0.002, 0, -0.07), new THREE.Vector3(0.012, 0, -0.005),
    new THREE.Vector3(0.04, 0, 0.045), new THREE.Vector3(0.09, 0, 0.078), new THREE.Vector3(0.135, 0, 0.088),
  ]);
  const tube = new THREE.TubeGeometry(curve, 48, R, 14, false);
  scaleUV(tube, 10, 4);
  tube.scale(1, 0.55, 1); // 눌려서 납작하게
  tube.computeVertexNormals();
  const flat = [1, 0.5, 1];
  const mesh = group(
    part(tube, color, 0, R * 0.55, 0),
    part(new THREE.CylinderGeometry(R * 1.08, R * 1.08, 0.036, 20), '#ffffff', 0, R * 0.55, -0.145, [Math.PI / 2, 0, 0], [1, 1, 0.58]), // 목 고무단
    part(new THREE.SphereGeometry(R * 0.92, 14, 10), '#ffffff', -0.022, R * 0.55, 0.03, null, flat), // 뒤꿈치 덧댐
    part(new THREE.SphereGeometry(R * 1.02, 14, 10), '#ffffff', 0.138, R * 0.55, 0.088, null, flat), // 발끝 덧댐
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.07, 0.02, 0.13)) }], mass: 0.05 };
}

// 티셔츠: 반팔 윤곽을 그대로 도려낸 천 + 목둘레 밴드 · 소매단 · 가슴 프린트
export function shirt(color) {
  const s = new THREE.Shape();
  s.moveTo(-0.11, -0.17);
  s.lineTo(0.11, -0.17);
  s.lineTo(0.115, 0.04);
  s.lineTo(0.205, 0.0); // 소매 아래
  s.lineTo(0.228, 0.078); // 소매 끝
  s.lineTo(0.095, 0.166); // 어깨
  s.lineTo(0.05, 0.17);
  s.quadraticCurveTo(0, 0.09, -0.05, 0.17); // 목둘레
  s.lineTo(-0.095, 0.166);
  s.lineTo(-0.228, 0.078);
  s.lineTo(-0.205, 0.0);
  s.lineTo(-0.115, 0.04);
  s.closePath();
  const body = new THREE.ExtrudeGeometry(s, {
    depth: 0.012, curveSegments: 14, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 3,
  });
  scaleUV(body, 70, 70);
  body.rotateX(-Math.PI / 2); // 눕히기: 목 쪽이 -z, 밑단이 +z
  body.translate(0, 0.006, 0);
  const hem = (x1, z1, x2, z2, w) => { // 소매·밑단을 따라 한 줄 박음질 띠
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = part(new THREE.BoxGeometry(len, 0.002, w), '#ffffff', (x1 + x2) / 2, 0.0185, (z1 + z2) / 2, [0, -Math.atan2(z2 - z1, x2 - x1), 0]);
    return m;
  };
  const collarCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.05, 0.0185, -0.17), new THREE.Vector3(0, 0.0185, -0.09), new THREE.Vector3(0.05, 0.0185, -0.17));
  const collar = new THREE.TubeGeometry(collarCurve, 16, 0.006, 6, false);
  const mesh = group(
    part(body, color),
    part(collar, '#ffffff'),
    hem(-0.11, 0.165, 0.11, 0.165, 0.012), // 밑단
    hem(0.2, -0.0, 0.222, -0.075, 0.01), // 소매단
    hem(-0.2, -0.0, -0.222, -0.075, 0.01),
    part(new THREE.CircleGeometry(0.036, 20), '#ffffff', 0, 0.0186, 0.0, [-Math.PI / 2, 0, 0]), // 가슴 프린트
    part(new THREE.CircleGeometry(0.02, 5), color, 0, 0.0188, 0.0, [-Math.PI / 2, 0, 0]),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.2, 0.02, 0.17)) }], mass: 0.12 };
}

export function mug(color) {
  const mesh = group(
    part(new THREE.CylinderGeometry(0.055, 0.05, 0.11, 10), color),
    part(new THREE.CylinderGeometry(0.047, 0.047, 0.005, 10), '#9b6a4b', 0, 0.048, 0),
    part(new THREE.TorusGeometry(0.03, 0.01, 5, 10), color, 0.06, 0, 0),
    part(new THREE.CylinderGeometry(0.056, 0.056, 0.02, 10), '#ffffff', 0, 0.01, 0),
  );
  return {
    mesh,
    shapes: [
      { shape: new CANNON.Cylinder(0.055, 0.05, 0.11, 10) },
      { shape: new CANNON.Box(V(0.015, 0.03, 0.008)), offset: V(0.08, 0, 0) },
    ],
    mass: 0.2,
  };
}

export function teddy() {
  const fur = '#d9a273';
  const light = '#f6d7b5';
  const ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
  const mesh = group(
    part(ico(0.14), fur, 0, 0, 0, null, [1, 1.1, 0.95]),
    part(ico(0.085), light, 0, -0.01, 0.075, null, [1, 1, 0.6]),
    part(ico(0.11), fur, 0, 0.2, 0),
    part(ico(0.04, 0), fur, -0.08, 0.29, 0),
    part(ico(0.04, 0), fur, 0.08, 0.29, 0),
    part(ico(0.045), light, 0, 0.18, 0.09),
    part(ico(0.016, 0), '#3b3350', 0, 0.2, 0.13),
    part(ico(0.012, 0), '#3b3350', -0.04, 0.23, 0.095),
    part(ico(0.012, 0), '#3b3350', 0.04, 0.23, 0.095),
    part(ico(0.05), fur, -0.13, 0.05, 0.05),
    part(ico(0.05), fur, 0.13, 0.05, 0.05),
    part(ico(0.06), fur, -0.08, -0.13, 0.07),
    part(ico(0.06), fur, 0.08, -0.13, 0.07),
    part(new THREE.BoxGeometry(0.1, 0.04, 0.03), '#ff8fa3', 0, 0.11, 0.1),
  );
  return {
    mesh,
    shapes: [{ shape: new CANNON.Sphere(0.14) }, { shape: new CANNON.Sphere(0.11), offset: V(0, 0.2, 0) }],
    mass: 0.4,
  };
}

// ── 푹신한 천 소품 모양 ──────────────────────────────
// 가운데가 볼록하고 가장자리로 갈수록 얇아져 솔기에서 만나는 쿠션 몸통.
// 모서리는 살짝 안쪽으로 당겨지고(귀퉁이), tuft 를 주면 가운데가 단추로 눌린 듯 오목해진다
function plumpGeo(w, h, d, { pinch = 0.09, tuft = 0, seam = 0.12 } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d, 22, 6, 22);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2), v = p.getZ(i) / (d / 2), f = p.getY(i) / (h / 2);
    const dome = Math.pow(Math.max(0, (1 - u * u) * (1 - v * v)), 0.42);
    let thick = seam + (1 - seam) * dome;
    if (tuft) thick *= 1 - tuft * Math.exp(-(u * u + v * v) / 0.03);
    p.setXYZ(i, p.getX(i) * (1 - pinch * v * v), f * thick * (h / 2), p.getZ(i) * (1 - pinch * u * u));
  }
  geo.computeVertexNormals();
  return geo;
}

// 솔기를 따라 도는 파이핑(테두리 끈)
function pipingGeo(w, d, pinch, r) {
  const pts = [];
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    // 둥근 사각형 둘레 (모서리 쪽이 안으로 당겨진 모양에 맞춤)
    const u = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.35);
    const v = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.35);
    pts.push(new THREE.Vector3(u * (w / 2) * (1 - pinch * v * v), 0, v * (d / 2) * (1 - pinch * u * u)));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, r, 6, true);
}

export function pillow() {
  const mesh = group(
    part(plumpGeo(0.55, 0.16, 0.36, { pinch: 0.12, seam: 0.1 }), '#cfe9ff'),
    part(pipingGeo(0.55, 0.36, 0.12, 0.007), '#ffffff'),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.275, 0.07, 0.18)) }], mass: 0.3 };
}

// 구겨진 종이 공: 촘촘한 구를 '셀 무늬(보로노이)'로 나눠 면마다 높이를 다르게 하고, 면과 면이 만나는 선을 날카로운 주름으로 판다.
// 주름 골은 어둡게(그늘진 접힌 자리), 면은 종이색으로
export function paper() {
  const R = 0.062 + Math.random() * 0.012;
  let geo = new THREE.IcosahedronGeometry(1, 16); // 주름선이 선명하도록 촘촘하게
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const p = geo.attributes.position;
  // 셀 중심점(구 위의 랜덤 점)과 면마다의 높이·색
  const cells = [];
  const n = 13 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    cells.push({ v, h: (Math.random() - 0.5) * 0.5, tint: 0.95 + Math.random() * 0.05 });
  }
  const cols = [];
  const dir = new THREE.Vector3();
  const uv = [];
  for (let i = 0; i < p.count; i++) {
    dir.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    let d1 = 9, d2 = 9, c1 = null;
    for (const c of cells) {
      const d = dir.distanceTo(c.v);
      if (d < d1) { d2 = d1; d1 = d; c1 = c; } else if (d < d2) d2 = d;
    }
    const gap = d2 - d1; // 0 에 가까울수록 주름 선
    const crease = 1 - Math.min(1, gap / 0.13); // 주름 안쪽 정도 0..1
    // 면은 완만히 부풀고(면 높이 + 중심에서 멀수록 살짝 꺼짐), 주름선은 안쪽으로 날카롭게 파임
    const r = R * (1 + c1.h * 0.14 - d1 * 0.06 - Math.pow(crease, 1.6) * 0.1);
    p.setXYZ(i, dir.x * r, dir.y * r, dir.z * r);
    const shade = c1.tint * (1 - Math.pow(crease, 1.3) * 0.38);
    cols.push(shade, shade, shade * 0.985);
    uv.push(Math.atan2(dir.z, dir.x) / (Math.PI * 2) + 0.5, Math.acos(dir.y) / Math.PI);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv.map((v, i) => v * (i % 2 ? 3 : 6)), 2));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, lowMat('#fffdf4', { vertexColors: true, roughness: 0.92 }));
  m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
  return { mesh: group(m), shapes: [{ shape: new CANNON.Sphere(0.056) }], mass: 0.03 };
}

export function can(color) {
  const mesh = group(
    part(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8), color),
    part(new THREE.CylinderGeometry(0.041, 0.041, 0.03, 8), '#ffffff', 0, 0.005, 0),
    part(new THREE.CylinderGeometry(0.035, 0.04, 0.012, 8), '#dfe3ea', 0, 0.066, 0, null, null, { metalness: 0.4, roughness: 0.4 }),
  );
  return { mesh, shapes: [{ shape: new CANNON.Cylinder(0.04, 0.04, 0.13, 8) }], mass: 0.05 };
}

export function bananaPeel() {
  const peel = new THREE.BoxGeometry(0.035, 0.012, 0.11);
  const parts = [part(new THREE.IcosahedronGeometry(0.03, 0), '#f2d24b', 0, 0.01, 0)];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3;
    const m = part(peel, '#ffe066', Math.sin(a) * 0.05, 0, Math.cos(a) * 0.05);
    m.rotation.set(0.25, a, 0, 'YXZ');
    parts.push(m);
  }
  parts.push(part(new THREE.BoxGeometry(0.015, 0.03, 0.015), '#8a6a3c', 0, 0.035, 0));
  return { mesh: group(...parts), shapes: [{ shape: new CANNON.Box(V(0.08, 0.02, 0.08)) }], mass: 0.04 };
}

export function snackBag() {
  const mesh = group(
    part(new THREE.BoxGeometry(0.16, 0.035, 0.2), '#ffb7c9'),
    part(new THREE.BoxGeometry(0.162, 0.037, 0.05), '#ffffff', 0, 0, 0),
    part(new THREE.IcosahedronGeometry(0.025, 0), '#ffd56b', 0, 0.02, 0),
    part(new THREE.BoxGeometry(0.17, 0.015, 0.025), '#ff8fa3', 0, 0, 0.11),
    part(new THREE.BoxGeometry(0.17, 0.015, 0.025), '#ff8fa3', 0, 0, -0.11),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.085, 0.02, 0.12)) }], mass: 0.04 };
}

// ── 서재 물건 ──────────────────────────────

// 굵은 색연필 (육각 기둥 + 깎은 심)
export function pencil(color) {
  const mesh = group(
    part(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 6), color, 0, -0.01, 0),
    part(new THREE.CylinderGeometry(0.004, 0.022, 0.04, 6), '#f6d7b5', 0, 0.09, 0),
    part(new THREE.CylinderGeometry(0.001, 0.007, 0.012, 6), color, 0, 0.114, 0),
    part(new THREE.CylinderGeometry(0.023, 0.023, 0.012, 6), '#ffffff', 0, -0.06, 0),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.02, 0.11, 0.02)) }], mass: 0.03 };
}

export function eraser() {
  const mesh = group(
    part(new THREE.BoxGeometry(0.08, 0.03, 0.045), '#ffffff'),
    part(new THREE.BoxGeometry(0.045, 0.032, 0.047), '#7ec8ff', 0.015, 0, 0),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.04, 0.015, 0.0225)) }], mass: 0.03 };
}

export function ruler() {
  const parts = [part(new THREE.BoxGeometry(0.26, 0.012, 0.045), '#ffe066')];
  for (let i = 0; i < 12; i++) {
    parts.push(part(new THREE.BoxGeometry(0.004, 0.013, i % 4 ? 0.01 : 0.018), '#c9a33c', -0.115 + i * 0.021, 0, -0.016 + (i % 4 ? 0 : 0.004)));
  }
  return { mesh: group(...parts), shapes: [{ shape: new CANNON.Box(V(0.13, 0.01, 0.0225)) }], mass: 0.04 };
}

// 서류 파일: 폴더 + 삐져나온 종이
export function documentFile(color) {
  const mesh = group(
    part(new THREE.BoxGeometry(0.22, 0.012, 0.3), color),
    part(new THREE.BoxGeometry(0.2, 0.014, 0.27), '#fffdf4', 0.01, 0.002, -0.02),
    part(new THREE.BoxGeometry(0.06, 0.013, 0.03), '#ffffff', -0.06, 0.001, 0.15),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.11, 0.012, 0.15)) }], mass: 0.08 };
}

export function paperCup() {
  const mesh = group(
    part(new THREE.CylinderGeometry(0.045, 0.035, 0.11, 8), '#fff6ea'),
    part(new THREE.CylinderGeometry(0.043, 0.039, 0.04, 8), '#d9a273', 0, 0, 0),
    part(new THREE.CylinderGeometry(0.049, 0.049, 0.014, 8), '#ffffff', 0, 0.06, 0),
  );
  return { mesh, shapes: [{ shape: new CANNON.Cylinder(0.047, 0.035, 0.125, 8) }], mass: 0.03 };
}

export function candyWrapper() {
  const mesh = group(
    part(new THREE.BoxGeometry(0.05, 0.022, 0.03), '#ff9fb5'),
    part(new THREE.ConeGeometry(0.02, 0.035, 4), '#ffd56b', 0.04, 0, 0, [0, 0, Math.PI / 2]),
    part(new THREE.ConeGeometry(0.02, 0.035, 4), '#ffd56b', -0.04, 0, 0, [0, 0, -Math.PI / 2]),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.058, 0.02, 0.02)) }], mass: 0.02 };
}

export function orangePeel() {
  const geo = new THREE.IcosahedronGeometry(0.035, 0);
  const parts = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    parts.push(part(geo, k % 2 ? '#ffa94d' : '#ffb866', Math.cos(a) * 0.035, 0, Math.sin(a) * 0.035, [0, a, 0.3], [1.2, 0.35, 0.9]));
  }
  return { mesh: group(...parts), shapes: [{ shape: new CANNON.Box(V(0.065, 0.015, 0.065)) }], mass: 0.03 };
}

// 쿠션: 통통한 몸통 + 솔기 파이핑 + 가운데를 눌러 잡은 단추(앞뒤)
export function cushion(color, accent = '#ffffff') {
  const h = 0.17, tuft = 0.22;
  const top = (h / 2) * (1 - tuft); // 단추 자리(오목한 가운데)의 높이
  const button = new THREE.SphereGeometry(0.02, 12, 8);
  const mesh = group(
    part(plumpGeo(0.4, h, 0.4, { pinch: 0.13, tuft, seam: 0.1 }), color),
    part(pipingGeo(0.4, 0.4, 0.13, 0.008), accent),
    part(button, accent, 0, top + 0.006, 0, null, [1, 0.55, 1]),
    part(button, accent, 0, -top - 0.006, 0, null, [1, 0.55, 1]),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.19, 0.075, 0.19)) }], mass: 0.25 };
}

// 지구본: 바다·육지를 면 단위로 칠한 구 + 받침대
export function globe() {
  const geo = new THREE.IcosahedronGeometry(0.11, 1);
  const pos = geo.attributes.position;
  const col = [];
  const sea = new THREE.Color('#7ec8ff'), land = new THREE.Color('#8ee3a8');
  for (let i = 0; i < pos.count; i += 3) {
    const cx = pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2);
    const cy = pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2);
    const cz = pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2);
    const c = Math.sin(cx * 30) + Math.cos(cz * 25 + cy * 12) > 0.6 ? land : sea;
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const ball = new THREE.Mesh(geo, lowMat('#ffffff', { vertexColors: true }));
  ball.position.y = 0.05;
  ball.rotation.z = 0.4;
  const mesh = group(
    ball,
    part(new THREE.TorusGeometry(0.125, 0.008, 4, 12, Math.PI), '#ffd56b', 0, 0.05, 0, [0, Math.PI / 2, 0.4 + Math.PI / 2]),
    part(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 5), '#cf9a6c', 0, -0.085, 0),
    part(new THREE.CylinderGeometry(0.06, 0.075, 0.025, 8), '#cf9a6c', 0, -0.115, 0),
  );
  return {
    mesh,
    shapes: [
      { shape: new CANNON.Sphere(0.11), offset: V(0, 0.05, 0) },
      { shape: new CANNON.Cylinder(0.06, 0.075, 0.07, 8), offset: V(0, -0.095, 0) },
    ],
    mass: 0.4,
  };
}

export function tableClock() {
  const mesh = group(
    part(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 10), '#ff9fb5', 0, 0, 0, [Math.PI / 2, 0, 0]),
    part(new THREE.CylinderGeometry(0.065, 0.065, 0.052, 10), '#fffaf0', 0, 0, 0.002, [Math.PI / 2, 0, 0]),
    part(new THREE.BoxGeometry(0.008, 0.05, 0.004), '#5a4a5e', 0, 0.02, 0.03),
    part(new THREE.BoxGeometry(0.035, 0.008, 0.004), '#5a4a5e', 0.015, 0, 0.03),
    part(new THREE.IcosahedronGeometry(0.025, 0), '#ffd56b', -0.05, 0.075, 0),
    part(new THREE.IcosahedronGeometry(0.025, 0), '#ffd56b', 0.05, 0.075, 0),
    part(new THREE.CylinderGeometry(0.01, 0.01, 0.03, 4), '#5a4a5e', -0.045, -0.085, 0),
    part(new THREE.CylinderGeometry(0.01, 0.01, 0.03, 4), '#5a4a5e', 0.045, -0.085, 0),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.08, 0.1, 0.03)) }], mass: 0.25 };
}

export function hourglass() {
  const mesh = group(
    part(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 6), '#cf9a6c', 0, 0.09, 0),
    part(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 6), '#cf9a6c', 0, -0.09, 0),
    part(new THREE.ConeGeometry(0.042, 0.08, 6), '#d6f0ff', 0, 0.04, 0, [Math.PI, 0, 0], null, { transparent: true, opacity: 0.75 }),
    part(new THREE.ConeGeometry(0.042, 0.08, 6), '#d6f0ff', 0, -0.04, 0, null, null, { transparent: true, opacity: 0.75 }),
    part(new THREE.ConeGeometry(0.03, 0.04, 6), '#ffd56b', 0, -0.06, 0),
    ...[0, 1, 2].map((k) => {
      const a = (k / 3) * Math.PI * 2;
      return part(new THREE.CylinderGeometry(0.006, 0.006, 0.17, 4), '#cf9a6c', Math.cos(a) * 0.045, 0, Math.sin(a) * 0.045);
    }),
  );
  return { mesh, shapes: [{ shape: new CANNON.Cylinder(0.055, 0.055, 0.2, 6) }], mass: 0.2 };
}

export function teacup(color) {
  const mesh = group(
    part(new THREE.CylinderGeometry(0.075, 0.06, 0.012, 10), '#ffffff', 0, -0.035, 0),
    part(new THREE.CylinderGeometry(0.048, 0.034, 0.06, 10), color, 0, 0.004, 0),
    part(new THREE.CylinderGeometry(0.042, 0.042, 0.004, 10), '#c98f63', 0, 0.03, 0),
    part(new THREE.TorusGeometry(0.02, 0.007, 4, 8), color, 0.05, 0.005, 0),
  );
  return {
    mesh,
    shapes: [
      { shape: new CANNON.Cylinder(0.075, 0.06, 0.015, 10), offset: V(0, -0.035, 0) },
      { shape: new CANNON.Cylinder(0.048, 0.034, 0.06, 10), offset: V(0, 0.004, 0) },
    ],
    mass: 0.15,
  };
}

// ── 거실 물건 ──────────────────────────────

export function remote(color = '#e6e9f0') {
  const mesh = group(
    part(new THREE.BoxGeometry(0.05, 0.022, 0.17), color),
    part(new THREE.BoxGeometry(0.018, 0.024, 0.018), '#ff8fa3', 0, 0.002, -0.06),
    ...[[-0.012, -0.02], [0.012, -0.02], [-0.012, 0.01], [0.012, 0.01], [-0.012, 0.04], [0.012, 0.04]].map(([x, z]) =>
      part(new THREE.BoxGeometry(0.012, 0.024, 0.012), '#a9c8ff', x, 0.002, z)),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.025, 0.012, 0.085)) }], mass: 0.08 };
}

export function gamepad() {
  const mesh = group(
    part(new THREE.BoxGeometry(0.15, 0.04, 0.08), '#c4a7ff'),
    part(new THREE.IcosahedronGeometry(0.045, 0), '#c4a7ff', -0.075, -0.005, 0.02, null, [1, 0.7, 1.1]),
    part(new THREE.IcosahedronGeometry(0.045, 0), '#c4a7ff', 0.075, -0.005, 0.02, null, [1, 0.7, 1.1]),
    part(new THREE.BoxGeometry(0.04, 0.045, 0.012), '#ffffff', -0.05, 0.005, 0),
    part(new THREE.BoxGeometry(0.012, 0.045, 0.04), '#ffffff', -0.05, 0.005, 0),
    part(new THREE.IcosahedronGeometry(0.01, 0), '#ff8fa3', 0.05, 0.022, -0.012),
    part(new THREE.IcosahedronGeometry(0.01, 0), '#ffd56b', 0.065, 0.022, 0.004),
    part(new THREE.IcosahedronGeometry(0.01, 0), '#8ee3a8', 0.035, 0.022, 0.004),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.11, 0.025, 0.055)) }], mass: 0.15 };
}

// 개어 놓은 담요
// 개어 놓은 담요: 세 겹이 포개져 한쪽(+x)은 둥글게 접힌 자국, 반대쪽은 끝단이 엇갈리고 술이 달림.
// 윗면은 살짝 물결치고, 줄무늬는 천에 짜여 들어간 것처럼 색으로 넣는다
export function blanket(color, stripe = '#ffffff') {
  const w = 0.45, h = 0.085, d = 0.32, layers = 3, lh = h / layers;
  const geo = new THREE.BoxGeometry(w, h, d, 20, 18, 14);
  const p = geo.attributes.position;
  const base = new THREE.Color(color), band = new THREE.Color(stripe);
  const cols = [];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const u = x / (w / 2), v = z / (d / 2);
    // 어느 겹인지, 겹 안에서의 위치(-1..1)
    const layer = Math.min(layers - 1, Math.floor((y + h / 2) / lh));
    const ly = ((y + h / 2) - (layer + 0.5) * lh) / (lh / 2);
    const roll = Math.sqrt(Math.max(0, 1 - ly * ly)); // 겹마다 둥근 단면
    const edge = Math.pow(Math.abs(u), 3);
    if (u > 0) x += roll * 0.022 * edge - (1 - roll) * 0.018 * edge; // 접힌 쪽: 겹마다 둥글게 말림
    else x -= (layer - 1) * 0.014 * edge + (1 - roll) * 0.01 * edge; // 끝단 쪽: 겹마다 엇갈림
    // 옆면(z)도 겹마다 살짝 부풀었다 들어감
    const side = Math.pow(Math.abs(v), 4);
    z += Math.sign(z) * (roll * 0.008 - (1 - roll) * 0.01) * side;
    // 윗겹은 접힌 쪽으로 늘어지고, 윗면은 부드럽게 물결
    if (y > h / 2 - 0.001) {
      y += Math.sin(u * 5.2 + v * 2) * 0.006 + Math.cos(v * 6.5 + u) * 0.004 - Math.max(0, u - 0.6) * 0.02;
    }
    y *= 1 - 0.2 * Math.pow(Math.abs(v), 6);
    p.setXYZ(i, x, y, z);
    // 겹 사이 접힌 틈은 그늘지게
    const crease = Math.abs(ly) > 0.8 && layer > 0 && ly < 0 || Math.abs(ly) > 0.8 && layer < layers - 1 && ly > 0 ? 0.72 : 1;
    const c = (Math.abs(Math.abs(v) - 0.55) < 0.12 ? band : base).clone().multiplyScalar(crease);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, lowMat('#ffffff', { vertexColors: true }));
  // 끝단 술
  const tassel = new THREE.CylinderGeometry(0.004, 0.002, 0.03, 5);
  const fringe = [];
  for (let k = 0; k < 9; k++) {
    fringe.push(part(tassel, stripe, -w / 2 - 0.012 - 0.008, -h / 2 + 0.008, -d / 2 + 0.03 + k * ((d - 0.06) / 8), [0, 0, Math.PI / 2 + 0.3]));
  }
  const mesh = group(body, ...fringe);
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.225, 0.042, 0.16)) }], mass: 0.3 };
}

export function magazine(color) {
  const mesh = group(
    part(new THREE.BoxGeometry(0.21, 0.012, 0.28), color),
    part(new THREE.BoxGeometry(0.17, 0.013, 0.04), '#ffffff', 0, 0.001, -0.1),
    part(new THREE.BoxGeometry(0.1, 0.013, 0.1), '#fff6dc', 0.02, 0.001, 0.04),
    part(new THREE.BoxGeometry(0.205, 0.011, 0.275), '#fffdf4', 0.004, -0.002, 0),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.105, 0.008, 0.14)) }], mass: 0.08 };
}

export function apple(color = '#ff6f7d') {
  const mesh = group(
    part(new THREE.IcosahedronGeometry(0.055, 1), color, 0, 0, 0, null, [1, 0.9, 1]),
    part(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 4), '#8a6a3c', 0, 0.058, 0),
    part(new THREE.IcosahedronGeometry(0.018, 0), '#8ee3a8', 0.015, 0.065, 0, null, [1.4, 0.4, 0.8]),
  );
  return { mesh, shapes: [{ shape: new CANNON.Sphere(0.053) }], mass: 0.15 };
}

export function orange() {
  const mesh = group(
    part(new THREE.IcosahedronGeometry(0.058, 1), '#ffab4a'),
    part(new THREE.IcosahedronGeometry(0.015, 0), '#8ee3a8', 0.01, 0.058, 0, null, [1.4, 0.4, 0.8]),
  );
  return { mesh, shapes: [{ shape: new CANNON.Sphere(0.058) }], mass: 0.15 };
}

// 강아지 뼈다귀 장난감
export function bone(color = '#fff6dc') {
  const knob = new THREE.IcosahedronGeometry(0.026, 0);
  const mesh = group(
    part(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 6), color, 0, 0, 0, [0, 0, Math.PI / 2]),
    part(knob, color, -0.075, 0, -0.018), part(knob, color, -0.075, 0, 0.018),
    part(knob, color, 0.075, 0, -0.018), part(knob, color, 0.075, 0, 0.018),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.1, 0.025, 0.04)) }], mass: 0.05 };
}

// 게임 팩 (카트리지)
export function gameCart(color) {
  const mesh = group(
    part(new THREE.BoxGeometry(0.1, 0.022, 0.12), color),
    part(new THREE.BoxGeometry(0.07, 0.024, 0.06), '#fffaf0', 0, 0, -0.01),
    part(new THREE.BoxGeometry(0.06, 0.023, 0.012), '#ffd56b', 0, 0, 0.055),
  );
  return { mesh, shapes: [{ shape: new CANNON.Box(V(0.05, 0.012, 0.06)) }], mass: 0.05 };
}

function scatterPoints(count, { blockers, bounds }, spawn) {
  const pts = [];
  const free = (x, z) =>
    !blockers.some(([x0, x1, z0, z1]) => x > x0 - 0.2 && x < x1 + 0.2 && z > z0 - 0.2 && z < z1 + 0.2) &&
    Math.hypot(x - spawn.x, z - spawn.z) > 0.8 &&
    pts.every((p) => Math.hypot(p.x - x, p.z - z) > 0.42);
  let tries = 0;
  while (pts.length < count && tries++ < 5000) {
    const x = bounds.x0 + Math.random() * (bounds.x1 - bounds.x0);
    const z = bounds.z0 + Math.random() * (bounds.z1 - bounds.z0);
    if (free(x, z)) pts.push({ x, z });
  }
  while (pts.length < count) pts.push({ x: (Math.random() - 0.5) * 2, z: Math.random() * 1.5 - 0.5 });
  return pts;
}

// 도자기·유리라서 세게 부딪히면 깨지는 물건
const FRAGILE = new Set(['머그컵', '찻잔', '모래시계']);
// 이 속도(m/s) 이상으로 부딪히면 깨짐 — 던지거나 가슴 높이에서 떨어뜨리면 깨지고, 살며시 놓으면 괜찮다
export const BREAK_SPEED = 3.6;

// specs: [{ name, target, make }] — 맵마다 다른 물건 목록
export function spawnItems(ctx, layout, specs, spawn) {
  const pts = scatterPoints(specs.length, layout, spawn);
  return specs.map((spec, i) => {
    const { mesh, shapes, mass, bouncy } = spec.make();
    applyItemMaterials(mesh, spec.name); // 천·종이·도자기·금속 등 사물 특성에 맞는 재질
    const body = new CANNON.Body({
      mass,
      material: bouncy ? ctx.mats.ball : ctx.mats.item,
      collisionFilterGroup: G.ITEM,
      collisionFilterMask: G.STATIC | G.ITEM,
      linearDamping: 0.05,
      angularDamping: 0.15,
      allowSleep: true,
      sleepSpeedLimit: 0.12,
      sleepTimeLimit: 0.6,
    });
    shapes.forEach((s) => body.addShape(s.shape, s.offset));
    body.position.set(pts[i].x, 0.25 + Math.random() * 0.3, pts[i].z);
    body.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI * 2, Math.random() * Math.PI);
    body.interpolatedPosition.copy(body.position);
    body.interpolatedQuaternion.copy(body.quaternion);
    ctx.world.addBody(body);

    mesh.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    ctx.scene.add(mesh);

    const item = {
      name: spec.name, target: spec.target, mesh, body,
      held: false, placed: false, removing: false, removed: false,
      settle: 0, wrongShown: false, lastImpact: 0,
      fragile: FRAGILE.has(spec.name), broken: false,
      squeaky: spec.name === '고무 오리', // 던지거나 부딪히면 삑삑
    };
    mesh.userData.item = item;
    return item;
  });
}
