// 반짝이·먼지 파티클과 완료 축하 컨페티
import * as THREE from 'three';

const GEO = new THREE.OctahedronGeometry(1, 0);
const SHARD = new THREE.TetrahedronGeometry(1, 0); // 깨진 조각

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
  }

  burst(pos, { colors = ['#ffffff'], count = 14, speed = 2, up = 1.5, size = 0.035, gravity = -4, life = 0.9 } = {}) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true });
      const m = new THREE.Mesh(GEO, mat);
      m.position.copy(pos);
      const base = size * (0.6 + Math.random() * 0.8);
      m.scale.setScalar(base);
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const r = speed * (0.4 + Math.random() * 0.6);
      this.parts.push({
        m, base, gravity,
        vel: new THREE.Vector3(Math.cos(a) * r, up * (0.5 + Math.random() * 0.8), Math.sin(a) * r),
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        life: life * (0.7 + Math.random() * 0.6),
        max: life,
      });
    }
  }

  // 깨진 조각: 납작하고 각진 파편이 사방으로 튀어 바닥에서 튕기다 멈춘 뒤 서서히 사라진다
  shards(pos, colors) {
    for (let i = 0; i < 22; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: colors[i % colors.length], roughness: 0.15, metalness: 0, transparent: true, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(SHARD, mat);
      m.position.copy(pos);
      const base = 0.012 + Math.random() * 0.022;
      m.scale.set(base * (0.6 + Math.random()), base, base * 0.25);
      m.castShadow = true;
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 1.8;
      this.parts.push({
        m, base, gravity: -9.8, floor: 0.03, keepScale: true,
        vel: new THREE.Vector3(Math.cos(a) * r, 0.8 + Math.random() * 1.8, Math.sin(a) * r),
        spin: new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20),
        life: 2.6 + Math.random(), max: 3.2,
      });
    }
  }

  confetti(center) {
    const colors = ['#ff9fb5', '#ffd56b', '#9fdcc6', '#a9c8ff', '#d4b5ff', '#ffffff'];
    for (let i = 0; i < 6; i++) {
      const p = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random(), (Math.random() - 0.5) * 3));
      this.burst(p, { colors, count: 24, speed: 2.5, up: 2.5, size: 0.05, gravity: -2.5, life: 2.4 });
    }
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.m);
        p.m.material.dispose();
        this.parts.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(1 - dt * (p.floor !== undefined ? 0.4 : 1.5));
      p.m.position.addScaledVector(p.vel, dt);
      if (p.floor !== undefined && p.m.position.y < p.floor) {
        // 바닥에서 튕기고, 점점 미끄러지다 멈춤
        p.m.position.y = p.floor;
        p.vel.y = Math.abs(p.vel.y) * 0.3;
        p.vel.x *= 0.55;
        p.vel.z *= 0.55;
        p.spin.multiplyScalar(0.5);
      }
      p.m.rotation.x += p.spin.x * dt;
      p.m.rotation.y += p.spin.y * dt;
      const t = Math.min(1, p.life / (p.max * 0.5));
      if (!p.keepScale) p.m.scale.setScalar(p.base * t);
      p.m.material.opacity = Math.min(1, p.life / 0.6);
    }
  }
}
