// 움직이는 가구: 서랍(당기고 밀기) · 의자/스툴(옆으로 치우기)
// 키네마틱 물리 바디라서 서랍 안 물건은 서랍과 함께 움직이고, 지나가는 길의 물건·플레이어는 밀려난다
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { G, softBox, smoothGeo } from './world.js';
import { josa } from './tidy.js';

const ease = (t) => t * t * (3 - 2 * t);
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Movable {
  // parts: { w,h,d | geo, x,y,z, color, rot?, collide?, box? } — 가구 기준 좌표
  // poses: [기본 자리, 옮긴 자리] { x, y?, z, rotY? }
  // labels: [기본 자리에서 할 행동, 옮긴 자리에서 할 행동]
  constructor(b, { name, kind, parts, poses, labels, duration = 0.45, zoneLocal = null }) {
    const ctx = b.ctx;
    Object.assign(this, { name, kind, labels, duration, zoneLocal });
    this.poses = poses.map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z, rotY: p.rotY ?? 0 }));
    this.state = 0; // 목표 자리 (0 또는 1)
    this.t = 0; // 현재 진행도 0..1
    this.shake = 0;
    this.blockers = []; // () => 막는 이유 문자열 | null

    this.group = new THREE.Group();
    this.group.userData.movable = this;
    this.body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.KINEMATIC,
      material: ctx.mats.furniture || ctx.mats.static,
      collisionFilterGroup: G.STATIC,
      collisionFilterMask: G.PLAYER | G.ITEM,
      allowSleep: false,
    });

    for (const p of parts) {
      if (p.geo || p.w) {
        const mesh = new THREE.Mesh(p.geo ? smoothGeo(p.geo) : softBox(p.w, p.h, p.d), p.material || b.matFor(p.color));
        mesh.position.set(p.x, p.y, p.z);
        if (p.rot) mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
      if (p.collide !== false && (p.box || p.w)) {
        const [w, h, d] = p.box || [p.w, p.h, p.d];
        this.body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)), new CANNON.Vec3(p.x, p.y, p.z));
      }
    }

    this.applyPose(this.poses[0]);
    this.body.interpolatedPosition.copy(this.body.position);
    this.body.interpolatedQuaternion.copy(this.body.quaternion);
    ctx.scene.add(this.group);
    ctx.world.addBody(this.body);
    ctx.movables.push(this);
    this.sync(0);
  }

  get moving() {
    return this.t !== this.state;
  }

  actionLabel() {
    return this.labels[this.state];
  }

  // 막는 게 있으면 이유를 돌려주고 움직이지 않는다
  toggle() {
    for (const why of this.blockers) {
      const msg = why();
      if (msg) return msg;
    }
    this.state = 1 - this.state;
    return null;
  }

  nudge() {
    this.shake = 0.3;
  }

  poseAt(t) {
    const e = ease(t), a = this.poses[0], c = this.poses[1];
    return {
      x: a.x + (c.x - a.x) * e,
      y: a.y + (c.y - a.y) * e,
      z: a.z + (c.z - a.z) * e,
      rotY: a.rotY + (c.rotY - a.rotY) * e,
    };
  }

  applyPose(p) {
    this.body.position.set(p.x, p.y, p.z);
    this.body.quaternion.setFromEuler(0, p.rotY, 0);
  }

  // 물리 서브스텝마다: 이전 자세에 맞춘 뒤, 다음 자세까지 가는 속도를 준다 (접촉하는 물건에 속도가 전달됨)
  preStep(h) {
    const prev = this.poseAt(this.t);
    if (this.t !== this.state) {
      const step = h / this.duration;
      this.t = this.state > this.t ? Math.min(this.state, this.t + step) : Math.max(this.state, this.t - step);
    }
    const next = this.poseAt(this.t);
    this.applyPose(prev);
    this.body.velocity.set((next.x - prev.x) / h, (next.y - prev.y) / h, (next.z - prev.z) / h);
    this.body.angularVelocity.set(0, (next.rotY - prev.rotY) / h, 0);
  }

  sync(dt) {
    this.group.position.copy(this.body.interpolatedPosition);
    this.group.quaternion.copy(this.body.interpolatedQuaternion);
    if (this.shake > 0) {
      // 막혔을 때 덜컹거리는 느낌 (보이는 것만 흔들림)
      this.shake = Math.max(0, this.shake - dt);
      const s = Math.sin(this.shake * 70) * 0.012 * (this.shake / 0.3);
      this.group.position.x += s;
      this.group.position.z += s;
    }
  }

  // 서랍 안쪽 공간(가구 기준 상자)을 현재 자세로 옮겨 정리 구역으로 쓴다
  updateZone(zone) {
    const lb = this.zoneLocal;
    _q.copy(this.body.quaternion);
    const pts = [];
    for (let i = 0; i < 8; i++) {
      pts.push(new THREE.Vector3(i & 1 ? lb.max.x : lb.min.x, i & 2 ? lb.max.y : lb.min.y, i & 4 ? lb.max.z : lb.min.z)
        .applyQuaternion(_q).add(_p.copy(this.body.position)));
    }
    zone.box.setFromPoints(pts);
    zone.assist = (zone.assist || new THREE.Box3()).copy(zone.box).expandByScalar(0.35);
  }
}

// 정면이 향하는 방향 → 회전각 (가구 기준 +z 가 정면)
const FACING = { pz: 0, px: Math.PI / 2, nz: Math.PI, nx: -Math.PI / 2 };

// 서랍장: 고정된 몸통 + 당겨지는 서랍 1칸. slot = [서랍 아래, 서랍 위] 높이, fakeFronts = 장식용 서랍 앞판
export function buildDrawerCabinet(b, {
  name = '서랍', x, z, facing = 'pz', W, D, H, slot, pull,
  body: bodyColor, front: frontColor, knob = '#ffd56b', fakeFronts = [],
}) {
  const [d0, d1] = slot;
  const th = FACING[facing], c = Math.cos(th), s = Math.sin(th);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const t = 0.03;
  const part = (w, h, d, lx, y, lz, color, o = {}) => {
    const [wx, wz] = at(lx, lz);
    return b.box(w, h, d, wx, y, wz, color, { rotY: th, ...o });
  };

  // 몸통: 양옆 · 뒤 · 서랍 아래 덩어리 · 서랍 위 상판
  part(t, H, D, -(W / 2 - t / 2), H / 2, 0, bodyColor);
  part(t, H, D, W / 2 - t / 2, H / 2, 0, bodyColor);
  part(W - 2 * t, H, t, 0, H / 2, -D / 2 + t / 2, bodyColor);
  if (d0 > 0.01) part(W - 2 * t, d0, D - t, 0, d0 / 2, t / 2, bodyColor);
  part(W + 0.02, H - d1, D + 0.02, 0, (H + d1) / 2, 0.01, bodyColor);
  for (const [f0, f1] of fakeFronts) {
    part(W - 2 * t - 0.01, f1 - f0 - 0.01, 0.02, 0, (f0 + f1) / 2, D / 2 + 0.01, frontColor, { collide: false });
    part(0.11, 0.024, 0.026, 0, (f0 + f1) / 2 + 0.02, D / 2 + 0.032, knob, { collide: false, occlude: false });
  }

  // 서랍: 바닥 · 옆판 · 뒤판 · 앞판 · 손잡이
  // 판은 얇게 보이되, 충돌 상자는 바깥·아래쪽으로 두껍게 잡아서 가는 물건이 뚫고 빠지지 않게 한다
  const iw = W - 2 * t - 0.012, ih = d1 - d0 - 0.012, id = D - t - 0.012, wt = 0.018, ct = 0.06;
  const parts = [
    { w: iw, h: wt, d: id, x: 0, y: wt / 2, z: 0, color: bodyColor, collide: false },
    { box: [iw, ct, id], x: 0, y: wt - ct / 2, z: 0 },
    { w: wt, h: ih, d: id, x: -(iw / 2 - wt / 2), y: ih / 2, z: 0, color: bodyColor, collide: false },
    { box: [ct, ih, id], x: -(iw / 2 - wt + ct / 2), y: ih / 2, z: 0 },
    { w: wt, h: ih, d: id, x: iw / 2 - wt / 2, y: ih / 2, z: 0, color: bodyColor, collide: false },
    { box: [ct, ih, id], x: iw / 2 - wt + ct / 2, y: ih / 2, z: 0 },
    { w: iw - 2 * wt, h: ih, d: wt, x: 0, y: ih / 2, z: -id / 2 + wt / 2, color: bodyColor },
    { w: W - 2 * t + 0.008, h: d1 - d0 - 0.004, d: 0.03, x: 0, y: (d1 - d0) / 2, z: id / 2 + 0.015, color: frontColor },
    { w: 0.13, h: 0.028, d: 0.03, x: 0, y: (d1 - d0) * 0.62, z: id / 2 + 0.045, color: knob },
  ];
  const zc = t / 2;
  const [cx, cz] = at(0, zc);
  const [ox, oz] = at(0, zc + pull);
  return new Movable(b, {
    name, kind: 'drawer', parts, duration: 0.55,
    poses: [{ x: cx, y: d0, z: cz, rotY: th }, { x: ox, y: d0, z: oz, rotY: th }],
    labels: ['서랍 열기', '서랍 닫기'],
    zoneLocal: new THREE.Box3(
      new THREE.Vector3(-iw / 2 + wt, wt - 0.04, -id / 2 + wt),
      new THREE.Vector3(iw / 2 - wt, ih + 0.12, id / 2),
    ),
  });
}

// 의자: 가구 기준 앞쪽이 -z, 등받이가 +z
export function buildChair(b, { name = '의자', poses, labels, seat = '#a9dbff', legs = '#ffffff', office = false }) {
  const parts = [
    { w: 0.46, h: 0.06, d: 0.46, x: 0, y: 0.46, z: 0, color: seat, collide: false },
    { box: [0.46, 0.49, 0.46], x: 0, y: 0.245, z: 0 },
    { w: 0.46, h: 0.45, d: 0.05, x: 0, y: 0.74, z: 0.205, color: seat },
  ];
  if (office) {
    parts.push(
      { geo: new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), color: legs, x: 0, y: 0.24, z: 0 },
      { geo: new THREE.CylinderGeometry(0.22, 0.22, 0.04, 5), color: legs, x: 0, y: 0.03, z: 0 },
    );
  } else {
    for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
      parts.push({ w: 0.04, h: 0.43, d: 0.04, x: lx, y: 0.215, z: lz, color: legs, collide: false });
    }
  }
  return new Movable(b, { name, kind: 'chair', parts, poses, labels, duration: 0.6 });
}

// 푹신한 쿠션 스툴(푸프): 통통하게 부푼 옆면, 둥근 어깨, 가운데가 단추로 눌려 오목한 윗면,
// 솔기 테두리(파이핑), 부드러운 세로 주름, 짧은 나무 다리
export function buildStool(b, { name = '쿠션 스툴', poses, labels, color = '#ffb7c9', button = '#e98aa0', legs = '#a9744a' }) {
  // 단면 곡선(반지름, 높이)을 부드럽게 이어서 회전시킨다
  const profile = new THREE.SplineCurve([
    new THREE.Vector2(0.0, 0.085), new THREE.Vector2(0.17, 0.085), new THREE.Vector2(0.25, 0.115), new THREE.Vector2(0.28, 0.2),
    new THREE.Vector2(0.272, 0.285), new THREE.Vector2(0.235, 0.345), new THREE.Vector2(0.17, 0.372), new THREE.Vector2(0.09, 0.36),
    new THREE.Vector2(0.03, 0.336), new THREE.Vector2(0.0, 0.33),
  ]).getPoints(40);
  const body = new THREE.LatheGeometry(profile, 56);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const w = Math.max(0, Math.sin(Math.PI * (y - 0.085) / 0.29)); // 위·아래 끝에서는 0
    const k = 1 + 0.02 * w * Math.cos(14 * Math.atan2(z, x)); // 세로 주름
    p.setXYZ(i, x * k, y, z * k);
  }
  const uv = body.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * 3);
  body.computeVertexNormals();

  const parts = [
    { geo: body, color, x: 0, y: 0, z: 0 },
    { geo: new THREE.TorusGeometry(0.255, 0.011, 8, 56), color, x: 0, y: 0.298, z: 0, rot: [Math.PI / 2, 0, 0] }, // 어깨 솔기
    { geo: new THREE.TorusGeometry(0.235, 0.011, 8, 56), color, x: 0, y: 0.105, z: 0, rot: [Math.PI / 2, 0, 0] }, // 밑단 솔기
    { geo: new THREE.SphereGeometry(0.024, 14, 10), color: button, x: 0, y: 0.336, z: 0 }, // 천으로 싼 단추
  ];
  for (const [lx, lz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
    parts.push({ geo: new THREE.CylinderGeometry(0.026, 0.018, 0.09, 10), color: legs, x: lx, y: 0.045, z: lz, rot: [lz * 0.5, 0, -lx * 0.5] });
  }
  parts.push({ box: [0.5, 0.39, 0.5], x: 0, y: 0.195, z: 0 });
  return new Movable(b, { name, kind: 'chair', parts, poses, labels, duration: 0.55 });
}

// blocker(의자 등)가 기본 자리에 있으면 서랍이 안 열리고, 서랍이 열려 있으면 blocker를 되돌릴 수 없다
export function linkBlocker(blocker, drawer) {
  drawer.blockers.push(() => (drawer.state === 0 && (blocker.state === 0 || blocker.moving)
    ? `🪑 ${josa(blocker.name, '이', '가')} 서랍 앞을 막고 있어요! 먼저 옮겨 주세요.`
    : null));
  blocker.blockers.push(() => (blocker.state === 1 && (drawer.state === 1 || drawer.moving)
    ? '서랍이 열려 있어서 못 옮겨요. 서랍을 먼저 닫아 주세요.'
    : null));
}
