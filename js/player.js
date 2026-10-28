// 1인칭 플레이어: 물리 캡슐 이동 + 부드러운 카메라
import * as CANNON from 'cannon-es';
import { G } from './world.js';
import { sfx } from './audio.js';

const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export class Player {
  constructor(camera, world, mats, spawn) {
    this.camera = camera;
    this.world = world;
    this.radius = 0.3;

    // 구 3개를 쌓은 캡슐 형태 — 회전 고정, 바닥과 마찰 0 (속도는 직접 제어)
    const b = new CANNON.Body({
      mass: 70,
      material: mats.player,
      fixedRotation: true,
      allowSleep: false,
      collisionFilterGroup: G.PLAYER,
      collisionFilterMask: G.STATIC | G.OPP,
    });
    const r = this.radius;
    b.addShape(new CANNON.Sphere(r));
    b.addShape(new CANNON.Sphere(r), new CANNON.Vec3(0, 0.5, 0));
    b.addShape(new CANNON.Sphere(r), new CANNON.Vec3(0, 1.0, 0));
    b.position.set(spawn.x, r + 0.02, spawn.z);
    b.interpolatedPosition.copy(b.position);
    b.updateMassProperties();
    world.addBody(b);
    this.body = b;

    this.yaw = spawn.yaw; this.pitch = -0.12; this.roll = 0;
    this.tYaw = spawn.yaw; this.tPitch = -0.12;
    this.sensitivity = 0.0021;
    this.bobScale = 1; // 화면 흔들림(헤드밥·기울기) 세기 — 설정에서 끌 수 있다

    this.keys = {};
    this.vx = 0; this.vz = 0;
    this.grounded = false; this.lastVy = 0; this.jumpHeld = false;
    this.running = false; this.crouching = false;
    this.eye = 1.55;
    this.bobPhase = 0; this.bobAmp = 0; this.lastStep = 0;
    this.land = 0; this.landVel = 0;
    this.fov = camera.fov;

    this._from = new CANNON.Vec3();
    this._to = new CANNON.Vec3();
    this._ray = new CANNON.RaycastResult();

    addEventListener('keydown', (e) => { this.keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement) return;
      this.tYaw -= e.movementX * this.sensitivity;
      this.tPitch -= e.movementY * this.sensitivity;
      this.tPitch = Math.max(-1.45, Math.min(1.45, this.tPitch));
    });
  }

  checkGround() {
    const p = this.body.position;
    this._from.set(p.x, p.y, p.z);
    this._to.set(p.x, p.y - this.radius - 0.12, p.z);
    this._ray.reset();
    this.world.raycastClosest(this._from, this._to, { collisionFilterMask: G.STATIC, skipBackfaces: true }, this._ray);
    return this._ray.hasHit;
  }

  // 물리 스텝 직전: 입력 → 목표 속도
  update(dt) {
    const k = this.keys;
    const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    this.crouching = !!k.KeyC; // Ctrl은 브라우저 단축키(Ctrl+W 탭 닫기 등)와 겹쳐서 쓰지 않는다
    this.running = !!(k.ShiftLeft || k.ShiftRight) && f > 0 && !this.crouching;
    const speed = this.crouching ? 1.4 : this.running ? 4.3 : 2.6;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let dx = -sin * f + cos * s;
    let dz = -cos * f - sin * s;
    const len = Math.hypot(dx, dz);
    if (len > 0) { dx = (dx / len) * speed; dz = (dz / len) * speed; }

    const wasGrounded = this.grounded;
    this.grounded = this.checkGround();
    const a = damp(this.grounded ? 14 : 3, dt);
    this.vx += (dx - this.vx) * a;
    this.vz += (dz - this.vz) * a;

    const b = this.body;
    b.velocity.x = this.vx;
    b.velocity.z = this.vz;

    if (this.grounded && k.Space && !this.jumpHeld) {
      b.velocity.y = 4.0;
      this.jumpHeld = true;
      sfx.jump();
    }
    if (!k.Space) this.jumpHeld = false;

    if (!wasGrounded && this.grounded && this.lastVy < -2.2) {
      this.landVel -= Math.min(1.3, -this.lastVy * 0.28);
      sfx.land();
    }
    this.lastVy = b.velocity.y;
  }

  // 물리 스텝 이후: 보간된 위치로 카메라 갱신
  updateCamera(dt) {
    const cam = this.camera;
    const sm = damp(22, dt);
    this.yaw += (this.tYaw - this.yaw) * sm;
    this.pitch += (this.tPitch - this.pitch) * sm;

    const hs = Math.hypot(this.vx, this.vz);
    this.eye += ((this.crouching ? 1.0 : 1.55) - this.eye) * damp(10, dt);

    // 헤드 밥 + 발소리
    if (this.grounded && hs > 0.2) this.bobPhase += dt * hs * 3.1;
    const ampTarget = this.grounded ? Math.min(hs / 4.3, 1) * 0.034 * this.bobScale : 0;
    this.bobAmp += (ampTarget - this.bobAmp) * damp(8, dt);
    const step = Math.floor(this.bobPhase / Math.PI);
    if (step !== this.lastStep) {
      this.lastStep = step;
      if (this.grounded && hs > 0.6) sfx.step();
    }

    // 착지 스프링
    this.landVel += (-this.land * 90 - this.landVel * 12) * dt;
    this.land += this.landVel * dt;

    // 옆걸음 시 살짝 기울기
    const strafe = this.vx * Math.cos(this.yaw) - this.vz * Math.sin(this.yaw);
    this.roll += (-strafe * 0.009 * this.bobScale - this.roll) * damp(8, dt);

    // 달리기 시 FOV 확장
    const fovTarget = this.running && hs > 3 ? 80 : 72;
    this.fov += (fovTarget - this.fov) * damp(6, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }

    const p = this.body.interpolatedPosition;
    const bobY = Math.sin(this.bobPhase * 2) * this.bobAmp;
    const bobX = Math.cos(this.bobPhase) * this.bobAmp * 0.6;
    cam.position.set(
      p.x + Math.cos(this.yaw) * bobX,
      p.y - this.radius + this.eye + bobY + this.land * 0.6,
      p.z - Math.sin(this.yaw) * bobX,
    );
    cam.rotation.set(this.pitch + this.land * 0.05, this.yaw, this.roll);
  }
}

