// 정리 판정: 물건이 올바른 구역 안에서 멈추면 정리 완료, 쓰레기는 휴지통에 들어가면 사라진다
import * as THREE from 'three';
import { sfx } from './audio.js';

// 받침 있는 글자면 a, 없으면 b (은/는, 을/를, 이/가)
export function josa(word, a, b) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return word + (code >= 0 && code <= 11171 && code % 28 !== 0 ? a : b);
}

const SETTLE_TIME = 0.35;
const SETTLE_SPEED = 0.4;
const REMOVE_TIME = 0.4;

export class Tidy {
  constructor({ scene, world, items, zones, effects, ui, onComplete, onPlace = () => {} }) {
    Object.assign(this, { scene, world, items, zones, effects, ui, onComplete, onPlace });
    this.zoneById = {};
    this.activeZone = null;
    this.done = 0;
    this.broken = 0; // 깨져서 영영 정리할 수 없게 된 물건 수
    this.total = items.length;
    this._p = new THREE.Vector3();

    for (const z of zones) {
      z.assist = z.box.clone().expandByScalar(0.35);
      z.total = items.filter((it) => it.target === z.id).length;
      z.done = 0;
      z.broken = 0;
      this.zoneById[z.id] = z;
      this.makeMarker(z);
    }
    ui.initTasks(zones, this.done, this.total);
  }

  // 물건을 들었을 때 목적지를 알려주는 반투명 박스 + 화살표
  makeMarker(z) {
    const size = z.box.getSize(new THREE.Vector3());
    const center = z.box.getCenter(new THREE.Vector3());
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    // 가구(닫힌 서랍) 안에 있어도 보이도록 깊이 검사 없이 맨 위에 그린다
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.16, depthWrite: false, depthTest: false }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: z.color, transparent: true, opacity: 0.9, depthTest: false }));
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), new THREE.MeshBasicMaterial({ color: z.color, depthTest: false }));
    [fill, edges, arrow].forEach((o) => { o.renderOrder = 10; });
    arrow.rotation.x = Math.PI;
    const baseY = size.y / 2 + 0.3;
    arrow.position.y = baseY;
    const g = new THREE.Group();
    g.add(fill, edges, arrow);
    g.position.copy(center);
    g.visible = false;
    g.renderOrder = 10;
    this.scene.add(g);
    z.marker = { g, fill, arrow, baseY };
  }

  // 힌트: 목적지 표시를 잠깐(초) 보여 준다. 기본은 표시 없이 직접 찾기
  hint(zoneId, duration = 5) {
    this.activeZone = zoneId;
    this.hintLeft = duration;
  }

  clearHint() {
    this.activeZone = null;
    this.hintLeft = 0;
  }

  get hintZone() {
    return this.activeZone;
  }

  update(dt, time, active) {
    if (this.activeZone && active) {
      this.hintLeft -= dt;
      if (this.hintLeft <= 0) this.clearHint();
    }
    const fade = Math.min(1, this.hintLeft || 0); // 마지막 1초 동안 흐려짐
    for (const z of this.zones) {
      const m = z.marker;
      // 서랍 구역은 서랍과 함께 움직인다
      if (z.movable) {
        z.movable.updateZone(z);
        z.box.getCenter(m.g.position);
      }
      m.g.visible = z.id === this.activeZone;
      if (m.g.visible) {
        m.fill.material.opacity = (0.12 + 0.08 * Math.sin(time * 5)) * fade;
        m.arrow.material.transparent = true;
        m.arrow.material.opacity = fade;
        m.arrow.position.y = m.baseY + Math.sin(time * 3) * 0.06;
        m.arrow.rotation.y += dt * 2;
      }
    }

    for (const it of this.items) {
      if (it.removing) { this.animateRemoval(it, dt); continue; }
      if (!active || it.removed || it.held) continue;

      const b = it.body;
      const p = this._p.set(b.position.x, b.position.y, b.position.z);
      if (p.y < -2) { this.respawn(it); continue; }

      const zone = this.zoneById[it.target];
      const inZone = zone.box.containsPoint(p);
      const speed = b.velocity.length();

      it.settle = inZone && speed < SETTLE_SPEED ? it.settle + dt : 0;
      const need = it.target === 'trash' ? 0.12 : SETTLE_TIME;
      if (!it.placed && it.settle > need) this.place(it);
      else if (it.placed && !inZone) this.unplace(it);

      // 엉뚱한 곳에 넣으면 알려 주기 (한 번만)
      if (!inZone) {
        const wrong = this.zones.find((z) => z.id !== it.target && z.box.containsPoint(p));
        if (wrong && speed < 0.3 && !it.wrongShown) {
          it.wrongShown = true;
          // 정답은 알려 주지 않는다 — 직접 찾거나 F 힌트
          this.ui.toast(`${josa(it.name, '은', '는')} 여기가 아닌 것 같아요… 막히면 F로 힌트!`, 'warn');
          sfx.wrong();
        } else if (!wrong) {
          it.wrongShown = false;
        }
      }
    }
  }

  place(it) {
    const zone = this.zoneById[it.target];
    it.placed = true;
    this.done++;
    zone.done++;
    const pos = it.mesh.position.clone();

    if (it.target === 'trash') {
      it.removing = true;
      it.removeT = 0;
      this.world.removeBody(it.body);
      sfx.trash();
      this.effects.burst(pos.add(new THREE.Vector3(0, 0.15, 0)), { colors: ['#9fdcc6', '#ffffff', '#d3f0e2'], count: 16, speed: 1.6, up: 1.8 });
      this.ui.toast(`🗑️ ${josa(it.name, '을', '를')} 버렸어요!`, 'good');
    } else {
      sfx.place();
      this.effects.burst(pos, { colors: ['#ffd56b', '#ff9fb5', '#ffffff', zone.color], count: 20, speed: 1.8, up: 1.4 });
      this.flash(it);
      this.ui.toast(`✨ ${josa(it.name, '을', '를')} ${zone.label}에 정리했어요!`, 'good');
    }
    if (zone.done === zone.total) {
      setTimeout(() => this.ui.toast(`${zone.emoji} ${zone.task} 완료!`, 'great'), 350);
    }
    this.ui.updateTasks(this.zones, this.done, this.total);
    this.onPlace(it, zone);
    this.checkComplete();
  }

  // 남은(안 깨진) 물건을 모두 정리하면 끝. 깨진 게 있으면 100%는 영영 못 채운다
  checkComplete() {
    if (this.done + this.broken === this.total) setTimeout(() => this.onComplete(), 900);
  }

  // 도자기·유리 물건이 세게 부딪혀 깨짐: 조각이 튀고 물건은 사라진다 (되돌릴 수 없음)
  shatter(it) {
    if (it.broken || it.removed || it.removing) return;
    if (it.placed) this.unplace(it);
    const zone = this.zoneById[it.target];
    it.broken = true;
    it.removed = true;
    const pos = it.mesh.position.clone();
    const colors = [];
    it.mesh.traverse((o) => o.isMesh && colors.push(`#${o.material.color.getHexString()}`));
    this.world.removeBody(it.body);
    this.scene.remove(it.mesh);
    this.effects.shards(pos, colors);
    sfx.shatter();
    this.broken++;
    zone.broken++;
    this.ui.toast(`쨍그랑! ${josa(it.name, '이', '가')} 깨졌어요… 이제 100% 정리는 못 해요`, 'warn');
    this.ui.updateTasks(this.zones, this.done, this.total);
    this.checkComplete();
  }

  unplace(it) {
    if (!it.placed) return;
    const zone = this.zoneById[it.target];
    it.placed = false;
    it.settle = 0;
    this.done--;
    zone.done--;
    this.ui.updateTasks(this.zones, this.done, this.total);
  }

  // 정리 성공 시 잠깐 반짝임
  flash(it) {
    let t = 0;
    const mats = [];
    it.mesh.traverse((o) => o.isMesh && o.material.emissive && mats.push(o.material));
    const tick = () => {
      t += 1 / 60;
      const k = Math.max(0, 1 - t / 0.6);
      for (const m of mats) {
        if (it.held) return;
        m.emissive.setRGB(1, 0.95, 0.7);
        m.emissiveIntensity = 0.6 * k;
      }
      if (k > 0) requestAnimationFrame(tick);
      else mats.forEach((m) => { m.emissive.setRGB(0, 0, 0); m.emissiveIntensity = 0; });
    };
    tick();
  }

  animateRemoval(it, dt) {
    it.removeT += dt;
    const k = Math.max(0, 1 - it.removeT / REMOVE_TIME);
    it.mesh.scale.setScalar(k * k);
    it.mesh.rotation.y += dt * 12;
    it.mesh.position.y -= dt * 0.3;
    if (k <= 0) {
      it.removing = false;
      it.removed = true;
      this.scene.remove(it.mesh);
    }
  }

  respawn(it) {
    const b = it.body;
    b.position.set(0, 1.2, 0.6);
    b.velocity.set(0, 0, 0);
    b.angularVelocity.set(0, 0, 0);
    b.wakeUp();
  }
}
