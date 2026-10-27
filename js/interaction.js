// 시선 레이캐스트 → 하이라이트 → 물리 기반 집기/들고 다니기/내려놓기/던지기 + 서랍·의자 같은 가구 조작
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { sfx } from './audio.js';
import { G } from './world.js';

const UP = new CANNON.Vec3(0, 1, 0);
const RIGHT = new CANNON.Vec3(1, 0, 0);
const HIGHLIGHT = new THREE.Color('#fff0a0');
const BLACK = new THREE.Color('#000000');
const REACH = 2.8;

export class Interaction {
  constructor({ camera, world, items, occluders, movables, player, tidy, ui, isActive }) {
    Object.assign(this, { camera, world, items, occluders, movables, player, tidy, ui, isActive });
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = REACH;
    this.dir = new THREE.Vector3(0, 0, -1);
    this.hovered = null; // 바라보는 물건
    this.hoverMov = null; // 바라보는 가구 (서랍·의자)
    this.held = null;
    this.hintCount = 0; // F 힌트를 본 횟수 (결과 화면)
    this.lastHint = null;
    this.holdDist = 1.5;
    this.holdRel = new CANNON.Quaternion();
    this.stuck = 0;

    this._yawQ = new CANNON.Quaternion();
    this._tq = new CANNON.Quaternion();
    this._qc = new CANNON.Quaternion();
    this._qe = new CANNON.Quaternion();
    this._spin = new CANNON.Quaternion();
    this._p = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this._from = new CANNON.Vec3();
    this._to = new CANNON.Vec3();
    this._ray = new CANNON.RaycastResult();

    // 클릭: 들고 있으면 내려놓기, 아니면 물건 집기 또는 가구 조작
    addEventListener('mousedown', (e) => {
      if (!this.isActive()) return;
      if (e.button === 0) {
        if (this.held) this.release(false);
        else if (this.hovered) this.grab(this.hovered);
        else if (this.hoverMov) this.useFurniture(this.hoverMov);
      } else if (e.button === 2 && this.held) this.release(true);
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => {
      if (!this.isActive() || !this.held) return;
      this.holdDist = THREE.MathUtils.clamp(this.holdDist - Math.sign(e.deltaY) * 0.15, 0.9, 2.4);
    }, { passive: true });
    addEventListener('keydown', (e) => {
      if (!this.isActive() || e.repeat) return;
      // E: 가구를 바라보고 있으면 (물건을 든 채로도) 가구 조작, 아니면 집기/놓기
      if (e.code === 'KeyE') {
        if (this.hoverMov) this.useFurniture(this.hoverMov);
        else if (this.held) this.release(false);
        else if (this.hovered) this.grab(this.hovered);
      }
      if (e.code === 'KeyF') this.useHint();
      if (!this.held) return;
      if (e.code === 'KeyR') this.rotateHeld(UP, Math.PI / 4);
      if (e.code === 'KeyT') this.rotateHeld(RIGHT, Math.PI / 2);
      if (e.code === 'KeyQ') this.release(true);
    });
  }

  setHighlight(root, on) {
    root.traverse((o) => {
      if (o.isMesh && o.material.emissive) {
        o.material.emissive.copy(on ? HIGHLIGHT : BLACK);
        o.material.emissiveIntensity = on ? 0.32 : 0;
      }
    });
  }

  setHoverItem(item) {
    if (item === this.hovered) return;
    if (this.hovered) this.setHighlight(this.hovered.mesh, false);
    this.hovered = item;
    if (item) this.setHighlight(item.mesh, true);
    this.refreshPrompt();
  }

  setHoverMov(m) {
    if (m === this.hoverMov) return;
    if (this.hoverMov) this.setHighlight(this.hoverMov.group, false);
    this.hoverMov = m;
    if (m) this.setHighlight(m.group, true);
    this.refreshPrompt();
  }

  refreshPrompt() {
    const hz = this.tidy.hintZone;
    if (this.held) this.ui.setHolding(this.held, this.tidy.zoneById[this.held.target], this.hoverMov, hz === this.held.target);
    else if (this.hovered) this.ui.setHover(this.hovered, this.tidy.zoneById[this.hovered.target], hz === this.hovered.target);
    else this.ui.setFurniture(this.hoverMov);
  }

  // F: 들고 있거나 바라보는 물건의 제자리를 잠깐 보여 준다
  useHint() {
    const item = this.held || this.hovered;
    if (!item) {
      this.ui.toast('물건을 들거나 바라본 채로 F를 누르면 놓을 곳을 알려 줘요', 'warn');
      return;
    }
    const zone = this.tidy.zoneById[item.target];
    this.tidy.hint(zone.id, 5);
    if (!item.hinted) {
      item.hinted = true;
      this.hintCount++;
    }
    const closed = zone.movable && zone.movable.state === 0 ? ' (서랍을 열어야 해요)' : '';
    this.ui.toast(`힌트: ${item.name} → ${zone.label}${closed}`, 'good');
    sfx.tick();
    this.refreshPrompt();
  }

  // 서랍 열고 닫기 · 의자 옮기기
  useFurniture(m) {
    const blocked = m.toggle();
    if (blocked) {
      this.ui.toast(blocked, 'warn');
      sfx.wrong();
      m.nudge();
      return;
    }
    if (m.kind === 'drawer') sfx.drawer(m.state === 1);
    else sfx.slide();
    // 잠든 물건을 깨워서 가구와 함께 움직이거나 밀려나게 한다
    const p = m.body.position;
    for (const it of this.items) {
      if (!it.removed && !it.removing && it.body.position.distanceTo(p) < 1.6) it.body.wakeUp();
    }
    this.refreshPrompt();
  }

  // 시선 끝의 첫 번째 대상: { item } | { mov } | {}
  pick() {
    this.raycaster.set(this.camera.position, this.dir);
    const targets = this.occluders.slice();
    for (const m of this.movables) targets.push(m.group);
    for (const it of this.items) if (!it.removing && !it.removed && it !== this.held) targets.push(it.mesh);
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return {};
    let o = hit.object;
    while (o && !o.userData.item && !o.userData.movable) o = o.parent;
    if (!o) return {};
    return o.userData.item ? { item: o.userData.item } : { mov: o.userData.movable };
  }

  rotateHeld(axis, angle) {
    this._spin.setFromAxisAngle(axis, angle);
    this.holdRel = this._spin.mult(this.holdRel);
    sfx.tick();
  }

  grab(item) {
    if (item.held) return; // 상대가 들고 있는 물건
    this.setHighlight(item.mesh, false);
    this.hovered = null;
    this.held = item;
    item.held = true;
    item.settle = 0;
    if (item.placed) this.tidy.unplace(item);

    const b = item.body;
    b.allowSleep = false;
    b.wakeUp();
    // 눈앞의 편한 거리로 끌어온다 (바닥 물건도 자연스럽게 들려 올라옴)
    this.holdDist = 1.2;
    // 카메라 yaw 기준 상대 회전을 저장 → 고개를 돌리면 물건도 함께 돈다
    this._yawQ.setFromAxisAngle(UP, this.player.yaw);
    this.holdRel = this._yawQ.conjugate().mult(b.quaternion);
    this.stuck = 0;

    sfx.pickup();
    if (this.tidy.hintZone !== item.target) this.tidy.clearHint(); // 다른 물건의 힌트는 끈다
    this.refreshPrompt();
  }

  release(throwIt) {
    const item = this.held;
    if (!item) return;
    const b = item.body;
    item.held = false;
    this.held = null;
    b.allowSleep = true;

    if (throwIt) {
      const v = 6;
      b.velocity.set(this.dir.x * v, this.dir.y * v + 1.0, this.dir.z * v);
      b.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      sfx.throw();
      if (item.squeaky) sfx.squeak(1); // 던지는 순간 꽉 쥐어서 삑!
    } else {
      b.velocity.scale(0.2, b.velocity);
      b.angularVelocity.scale(0.2, b.angularVelocity);
      // 목표 구역 근처에서 놓으면 살짝 끌어당겨 준다 (자석 보조)
      const zone = this.tidy.zoneById[item.target];
      this._p.set(b.position.x, b.position.y, b.position.z);
      if (!zone.box.containsPoint(this._p) && zone.assist.containsPoint(this._p)) {
        zone.box.getCenter(this._c);
        const dx = this._c.x - this._p.x, dz = this._c.z - this._p.z;
        const l = Math.hypot(dx, dz) || 1;
        b.velocity.x = (dx / l) * 1.4;
        b.velocity.z = (dz / l) * 1.4;
        b.velocity.y = Math.max(b.velocity.y, 0.8);
      }
      sfx.drop();
    }
    this.ui.setHolding(null);
    this.refreshPrompt();
  }

  holdTarget() {
    return this.targetFor(this.held.body, this.camera.position, this.dir, this.holdDist);
  }

  // 들고 있는 물건이 갈 자리: 조준점이 가구·벽 속이나 뒤라면 그 표면 바로 앞까지만
  // (2인 대전에서 상대가 든 물건도 같은 계산을 쓰도록 카메라 위치·방향을 인자로 받는다)
  targetFor(b, cp, d, holdDist) {
    let dist = holdDist;
    this._from.set(cp.x, cp.y, cp.z);
    this._to.set(cp.x + d.x * (dist + 0.3), cp.y + d.y * (dist + 0.3), cp.z + d.z * (dist + 0.3));
    this._ray.reset();
    this.world.raycastClosest(this._from, this._to, { collisionFilterMask: G.STATIC, skipBackfaces: true }, this._ray);
    if (this._ray.hasHit) {
      // 물건 크기(바운딩 반지름)만큼 표면에서 떨어뜨린다
      dist = Math.min(dist, Math.max(0.35, this._ray.distance - b.boundingRadius * 0.85 - 0.02));
    }
    return [cp.x + d.x * dist, cp.y + d.y * dist, cp.z + d.z * dist];
  }

  // 물리 스텝 '전'에 호출: 들고 있는 물건을 목표 위치/회전으로 속도 제어.
  // 스텝 전에 속도를 주어야 충돌 계산이 그 뒤에 적용돼서 가구·벽을 뚫고 들어가지 않는다
  driveHeld() {
    if (!this.held || this.remoteDrive) return;
    this.driveBody(this.held.body, this.camera.position, this.dir, this.holdDist, this.player.yaw, this.holdRel);
  }

  // 물건 하나를 (카메라 위치·방향·거리·yaw·상대 회전) 기준으로 끌고 다닌다
  driveBody(b, cp, dir, holdDist, yaw, holdRel) {
    const [tx, ty, tz] = this.targetFor(b, cp, dir, holdDist);
    let vx = (tx - b.position.x) * 14, vy = (ty - b.position.y) * 14, vz = (tz - b.position.z) * 14;
    const len = Math.hypot(vx, vy, vz);
    if (len > 9) { vx *= 9 / len; vy *= 9 / len; vz *= 9 / len; }
    b.velocity.set(vx, vy, vz);

    this._yawQ.setFromAxisAngle(UP, yaw);
    this._yawQ.mult(holdRel, this._tq);
    b.quaternion.conjugate(this._qc);
    this._tq.mult(this._qc, this._qe);
    let { x, y, z, w } = this._qe;
    if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
    const s = Math.sqrt(Math.max(0, 1 - w * w));
    if (s < 1e-4) {
      b.angularVelocity.set(0, 0, 0);
    } else {
      const angle = 2 * Math.acos(Math.min(1, w)) * 11;
      b.angularVelocity.set((x / s) * angle, (y / s) * angle, (z / s) * angle);
    }
  }

  update(dt) {
    this.camera.getWorldDirection(this.dir);
    const { item, mov } = this.pick();
    // 힌트가 켜지거나 꺼지면 안내 문구도 바꾼다
    if (this.tidy.hintZone !== this.lastHint) {
      this.lastHint = this.tidy.hintZone;
      this.refreshPrompt();
    }

    if (this.held) {
      this.setHoverMov(mov || null);
      const b = this.held.body, cp = this.camera.position;
      void cp;
      const [tx, ty, tz] = this.holdTarget();
      const gap = Math.hypot(tx - b.position.x, ty - b.position.y, tz - b.position.z);
      this.stuck = gap > 1.2 && !this.remoteDrive ? this.stuck + dt : 0;
      if (this.stuck > 0.4) {
        this.ui.toast('물건이 어딘가에 걸렸어요!', 'warn');
        this.release(false);
      }
      this.ui.setCrosshair('hold');
      return;
    }

    this.setHoverItem(item || null);
    this.setHoverMov(item ? null : mov || null);
    this.ui.setCrosshair(item || mov ? 'hover' : 'idle');
  }
}
