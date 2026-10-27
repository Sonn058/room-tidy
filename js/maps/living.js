// 맵 3: 거실 — 소파·TV·커피 테이블, 그리고 강아지가 사는 따뜻한 거실
import * as THREE from 'three';
import {
  ROOM, lowMat, addStaticBox, createBuilder, buildShell, starGeometry,
  addWindow, addCeilingLamp, addPlant, addWallClock, addPoster, glowMat, addRugSurface,
} from '../world.js';
import { checkerTex, repeated, make, rng } from '../textures.js';
import { kindMat } from '../materials.js';
import { buildDrawerCabinet, buildStool, linkBlocker } from '../furniture.js';
import * as F from '../items.js';

const C = {
  floorA: '#e9c49c', floorB: '#ddb488',
  wallBack: '#ffe3c9', wallLeft: '#e2f2ff', wallRight: '#e8f6dc', wallFront: '#fde2ea',
  ceiling: '#fffaf2', trim: '#ffffff',
  ceilA: '#b4805b', ceilB: '#a87451', beam: '#7a4f35', baseboard: '#8f6143',
  stripes: { a: '#a9bbec', b: '#f7f2e8', width: 0.24 },
  wood: '#e3b07f', woodDark: '#c98f62',
  sofa: '#a9c8ff', sofaSeat: '#cfe0ff',
  tvStand: '#fff1da', cabinet: '#ffe7b3',
  bowl: '#ffd56b', basket: '#f5d3a1', basketStripe: '#e8b77e',
  dogBed: '#ffb7c9', dogPad: '#fff1f5', trash: '#9fdcc6',
  rugA: '#ffd1dc', rugB: '#fff6dc', rugC: '#b8e6d0',
  puppy: '#f2c79a', puppyDark: '#c98f63',
};

// TV 화면: 해 질 무렵의 산 풍경 (하늘 그라데이션 · 번진 구름 · 겹친 산 · 호수 반사 · 풀밭)
function tvScreenTex() {
  return make('tv-screen', 1024, 576, (c, w, h) => {
    const rand = rng(21);
    const sky = c.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, '#5b93d6'); sky.addColorStop(0.55, '#a9cdf0'); sky.addColorStop(1, '#ffe2bd');
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    const sun = c.createRadialGradient(w * 0.74, h * 0.46, 4, w * 0.74, h * 0.46, h * 0.5);
    sun.addColorStop(0, 'rgba(255,248,214,1)'); sun.addColorStop(0.15, 'rgba(255,224,160,0.85)'); sun.addColorStop(1, 'rgba(255,200,140,0)');
    c.fillStyle = sun; c.fillRect(0, 0, w, h);
    c.filter = 'blur(9px)';
    for (let i = 0; i < 9; i++) {
      c.fillStyle = `rgba(255,255,255,${0.28 + rand() * 0.3})`;
      c.beginPath(); c.ellipse(60 + rand() * (w - 120), 40 + rand() * h * 0.3, 70 + rand() * 90, 14 + rand() * 18, 0, 0, Math.PI * 2); c.fill();
    }
    c.filter = 'none';
    // 산: 먼 산일수록 푸르고 흐릿
    const ridge = (base, amp, col, seed, jag) => {
      const r = rng(seed); c.fillStyle = col; c.beginPath(); c.moveTo(0, h);
      let y = base;
      for (let x = 0; x <= w; x += 8) {
        y += (r() - 0.5) * jag; y = Math.max(base - amp, Math.min(base + amp, y));
        c.lineTo(x, y + Math.sin(x * 0.006 + seed) * amp * 0.5);
      }
      c.lineTo(w, h); c.closePath(); c.fill();
    };
    ridge(h * 0.52, 55, '#8fa9c7', 3, 22);
    ridge(h * 0.58, 50, '#6a8aa6', 7, 26);
    ridge(h * 0.65, 38, '#3f6a57', 11, 20);
    // 호수에 비친 하늘
    const lake = c.createLinearGradient(0, h * 0.72, 0, h * 0.86);
    lake.addColorStop(0, '#f5d6a8'); lake.addColorStop(1, '#6f94b8');
    c.fillStyle = lake; c.fillRect(0, h * 0.72, w, h * 0.14);
    c.fillStyle = 'rgba(255,240,200,0.5)'; c.fillRect(w * 0.68, h * 0.72, w * 0.12, 4);
    // 풀밭
    const grass = c.createLinearGradient(0, h * 0.84, 0, h);
    grass.addColorStop(0, '#5d8f4a'); grass.addColorStop(1, '#2f5a30');
    c.fillStyle = grass; c.fillRect(0, h * 0.84, w, h * 0.16);
    for (let i = 0; i < 900; i++) {
      c.strokeStyle = `rgba(${40 + rand() * 60},${110 + rand() * 80},${40 + rand() * 40},0.55)`;
      c.lineWidth = 1 + rand();
      const x = rand() * w, y = h * 0.84 + rand() * h * 0.16;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rand() - 0.5) * 6, y - 8 - rand() * 14); c.stroke();
    }
    const v = c.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.9); // 가장자리 어둡게
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = v; c.fillRect(0, 0, w, h);
  });
}

function tvGlareTex() {
  return make('tv-glare', 256, 144, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.35, 'rgba(255,255,255,0.05)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(0.78, 'rgba(255,255,255,0.0)'); g.addColorStop(1, 'rgba(255,255,255,0.06)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, { srgb: false });
}

// 털이 복슬복슬한 덩어리: 매끈한 구를 늘려서 겉에 불규칙한 털 뭉치 요철을 준다
function furBlob(rx, ry, rz, fluff = 0.03) {
  const g = new THREE.SphereGeometry(1, 40, 28);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + fluff * (Math.sin(x * 9 + y * 5) * Math.cos(z * 8 - y * 6) + 0.6 * Math.sin(x * 21 - z * 17 + y * 11));
    p.setXYZ(i, x * rx * n, y * ry * n, z * rz * n);
  }
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 4);
  g.computeVertexNormals();
  return g;
}

// 비글 강아지: 큰 머리, 반짝이는 큰 눈, 길게 늘어진 갈색 귀, 오렌지·흰색 몸에 등에는 검은 안장 무늬.
// 네 발로 선 작은 강아지이고, 바라보는 방향이 +x
function addDog(ctx, x, z) {
  const ORANGE = '#e0742a', ORANGE_D = '#c25a1c', WHITE = '#f7f0e6', BROWN = '#6b2f12', SADDLE = '#26211f';
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = -0.4; // 방 안쪽을 향해 살짝 돌아서 있게
  const fur = (col) => kindMat('plush', col);
  const put = (geo, mat, px, py, pz, rot = null) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m); ctx.occluders.push(m); return m;
  };
  const orange = fur(ORANGE), orangeD = fur(ORANGE_D), white = fur(WHITE), brown = fur(BROWN), saddle = fur(SADDLE);

  // 몸통: 오렌지 몸 + 등의 검은 안장 + 흰 배·가슴
  put(furBlob(0.17, 0.1, 0.1, 0.02), orange, 0, 0.2, 0);
  put(furBlob(0.13, 0.05, 0.098, 0.02), saddle, -0.02, 0.268, 0);
  put(furBlob(0.12, 0.07, 0.085, 0.02), white, 0.07, 0.15, 0);
  put(furBlob(0.085, 0.095, 0.085, 0.02), white, 0.135, 0.225, 0);
  // 다리 네 개: 위쪽은 오렌지(허벅지), 아래는 흰 양말 + 발
  for (const s of [-1, 1]) {
    put(furBlob(0.07, 0.075, 0.045, 0.02), orange, -0.105, 0.14, s * 0.07); // 뒷다리 허벅지
    put(furBlob(0.03, 0.08, 0.03, 0.01), white, -0.11, 0.065, s * 0.065);
    put(furBlob(0.045, 0.022, 0.032, 0.01), white, -0.095, 0.02, s * 0.065);
    put(furBlob(0.032, 0.09, 0.032, 0.01), white, 0.125, 0.07, s * 0.05); // 앞다리
    put(furBlob(0.045, 0.022, 0.032, 0.01), white, 0.14, 0.02, s * 0.05);
  }
  // 꼬리: 위로 솟고 끝이 흰색
  put(furBlob(0.02, 0.07, 0.02, 0.01), orangeD, -0.185, 0.29, 0, [0, 0, 0.45]);
  put(furBlob(0.017, 0.026, 0.017, 0.01), white, -0.215, 0.35, 0, [0, 0, 0.45]);
  // 머리: 몸에 비해 큼직하게 (귀여운 비율)
  put(furBlob(0.09, 0.085, 0.085, 0.015), orange, 0.215, 0.345, 0);
  put(furBlob(0.045, 0.06, 0.03, 0.01), white, 0.255, 0.385, 0); // 이마에서 코로 내려오는 흰 줄
  put(furBlob(0.055, 0.042, 0.05, 0.012), white, 0.275, 0.31, 0); // 주둥이
  const black = kindMat('glossyPlastic', '#15151a', { roughness: 0.15 });
  put(new THREE.SphereGeometry(0.015, 14, 10), black, 0.327, 0.325, 0).scale.set(1, 0.85, 1.15); // 코
  // 큰 눈: 반짝이는 검은 구슬 + 크고 작은 하이라이트
  const eyeMat = kindMat('glossyPlastic', '#1d120d', { roughness: 0.1 });
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  for (const s of [-1, 1]) {
    put(new THREE.SphereGeometry(0.024, 18, 14), eyeMat, 0.262, 0.365, s * 0.047);
    put(new THREE.SphereGeometry(0.0085, 8, 6), shine, 0.281, 0.375, s * 0.054);
    put(new THREE.SphereGeometry(0.0045, 8, 6), shine, 0.278, 0.355, s * 0.04);
    put(furBlob(0.022, 0.009, 0.014, 0.01), orangeD, 0.262, 0.397, s * 0.05, [0, 0, 0.2]); // 눈썹 무늬
  }
  // 길게 늘어진 큰 갈색 귀
  for (const s of [-1, 1]) put(furBlob(0.04, 0.11, 0.06, 0.02), brown, 0.2, 0.31, s * 0.095, [s * 0.18, 0, s * 0.08]);
  // 빨간 목줄과 작은 이름표
  const collar = put(new THREE.TorusGeometry(0.066, 0.009, 8, 24), kindMat('fabric', '#d9534f'), 0.155, 0.27, 0, [0.2, Math.PI / 2, 0]);
  collar.scale.set(1, 1.1, 1);
  put(new THREE.CylinderGeometry(0.013, 0.013, 0.004, 14), kindMat('gold', '#ffd56b'), 0.19, 0.215, 0, [0, 0, Math.PI / 2]);
  ctx.scene.add(g);
}

function build(ctx) {
  const b = createBuilder(ctx);
  const { box, deco, container } = b;
  // 재질 등록: 이 색으로 만든 가구는 이 재질로
  b.setKinds({
    fabric: [C.sofa, C.sofaSeat, C.dogBed, '#e98aa0'], // 소파 · 강아지 방석 · 쿠션 스툴과 그 단추
    plush: [C.dogPad, C.puppy, C.puppyDark], // 방석 속 · 강아지 털
    woodPaint: [C.cabinet, '#ffd1dc', '#d6f0e0', '#fff6dc', '#ffd9b8'], // 칠한 가구 · 문
    wood: ['#8f6038', '#c99560', '#6e4a2c', '#3a2a22', '#a9744a'], // 월넛 미디어장 · 스툴 다리
    paintedMetal: ['#2b2d33'], // TV 받침 · 손잡이
    glossyPlastic: ['#101114'],
    ceramic: [C.bowl, '#a9dbff'], // 과일 그릇 · 꽃병
    wicker: [C.basket, C.basketStripe],
    plastic: [C.trash],
    rug: ['#f2c14e'],
  });
  buildShell(b, C);
  const frame = { collide: false, occlude: false };
  const starGeo = starGeometry();

  // 노랑·흰 체크 러그 (한 칸 0.4m) — 털실 파일 재질
  const rug = { collide: false, cast: false, occlude: false, round: false };
  box(3.4, 0.016, 2.6, 0, 0.008, 0.35, '#f2c14e', rug);
  const pile = kindMat('rug', '#ffffff');
  box(3.2, 0.024, 2.4, 0, 0.012, 0.35, '', {
    ...rug,
    material: kindMat('rug', '#ffffff', {
      map: repeated(checkerTex('#ffc94a', '#f4efe6'), 4, 3),
      bumpMap: repeated(pile.bumpMap, 6, 4.5),
    }),
  });
  addRugSurface(ctx, 0, 0.35, 0.024, { w: 3.4, d: 2.6 });

  addWindow(b, 'left', 1.2, 1.85, { curtain: '#ffd1dc', rod: C.woodDark, trim: C.woodDark });
  addPoster(b, 'back', 2.65, 1.8, 0.55, 0.7, 'fruit', C.woodDark);
  addPoster(b, 'back', 3.35, 1.45, 0.3, 0.38, 'sea');
  addPoster(b, 'front', -0.6, 1.7, 0.7, 0.85, 'map', C.woodDark);
  addCeilingLamp(b, 0, 0.3, '#ffe08f');

  // ── TV 장 + TV (뒷벽) ──
  // 양옆 칸은 고정, 가운데 칸은 진짜 서랍 (앞을 쿠션 스툴이 막고 있음)
  // 월넛 미디어장: 어두운 몸통 + 밝은 문(틈이 그림자 선으로 보임) + 홈 손잡이 + 두툼한 상판
  const CARCASS = '#8f6038', WOOD_DOOR = '#c99560', METAL = '#2b2d33';
  box(0.67, 0.5, 0.45, -0.665, 0.25, -3.27, CARCASS);
  box(0.67, 0.5, 0.45, 0.665, 0.25, -3.27, CARCASS);
  box(2.08, 0.035, 0.49, 0, 0.5175, -3.27, WOOD_DOOR); // 상판 (앞으로 살짝 튀어나옴)
  box(1.96, 0.012, 0.4, 0, 0.5, -3.27, '#6e4a2c', frame); // 상판 아래 그림자 띠
  [[-0.665, -1], [0.665, 1]].forEach(([x, side]) => {
    box(0.61, 0.43, 0.018, x, 0.255, -3.046, WOOD_DOOR); // 문
    // 홈 손잡이: 안쪽 가장자리를 따라 세로로 길쭉한 금속 바
    box(0.012, 0.14, 0.014, x - side * 0.26, 0.27, -3.032, METAL, { collide: false, occlude: false });
    box(0.006, 0.43, 0.004, x, 0.255, -3.036, '#6e4a2c', { collide: false, occlude: false }); // 문 가운데 결 홈
  });
  box(1.96, 0.04, 0.02, 0, 0.02, -3.05, '#3a2a22', { collide: false, occlude: false }); // 아래 걸레받이 띠
  const tvDrawer = buildDrawerCabinet(b, {
    name: 'TV장 서랍', x: 0, z: -3.27, facing: 'pz', W: 0.66, D: 0.45, H: 0.5,
    slot: [0.07, 0.46], pull: 0.33, body: CARCASS, front: WOOD_DOOR, knob: METAL,
  });
  const stool = buildStool(b, {
    name: '쿠션 스툴',
    poses: [{ x: 0, z: -2.55 }, { x: -1.4, z: -2.45 }],
    labels: ['스툴 옆으로 치우기', '스툴 제자리로'],
  });
  linkBlocker(stool, tvDrawer);
  // 평면 TV: 얇은 검은 베젤 · 뒤판 · 금속 목과 납작한 받침 · 유리 같은 화면
  box(0.5, 0.012, 0.22, 0, 0.54, -3.34, METAL, { kind: 'paintedMetal' }); // 받침
  box(0.07, 0.17, 0.022, 0, 0.62, -3.405, METAL, { collide: false, kind: 'paintedMetal' }); // 목
  box(1.5, 0.86, 0.03, 0, 1.13, -3.43, '#101114', { kind: 'glossyPlastic' }); // 패널 + 베젤
  box(0.78, 0.46, 0.04, 0, 1.13, -3.46, '#1a1b20', { collide: false, occlude: false, kind: 'plastic' }); // 뒤판 볼록한 부분
  const tvScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.44, 0.81),
    new THREE.MeshBasicMaterial({ map: tvScreenTex(), color: new THREE.Color(1.08, 1.08, 1.08) }),
  );
  tvScreen.position.set(0, 1.13, -3.4145);
  ctx.scene.add(tvScreen);
  // 유리에 비치는 은은한 빛 반사 (대각선 하이라이트)
  const glare = new THREE.Mesh(
    new THREE.PlaneGeometry(1.44, 0.81),
    new THREE.MeshBasicMaterial({ map: tvGlareTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  glare.position.set(0, 1.13, -3.4140);
  ctx.scene.add(glare);
  // 전원 표시등
  deco(new THREE.SphereGeometry(0.006, 8, 6), '', 0.0, 0.715, -3.4135, { material: glowMat('#7dffa0', 3), cast: false });
  const tvZone = new THREE.Box3(new THREE.Vector3(-0.98, 0.5, -3.47), new THREE.Vector3(0.98, 0.85, -3.06));

  // 꼬마전구 가랜드 (TV 위)
  const bulbCols = ['#ffd56b', '#ff9fb5', '#9fdcc6', '#a9c8ff', '#d4b5ff'];
  for (let i = 0; i < 17; i++) {
    const x = -2.4 + i * 0.3;
    const y = 2.5 - Math.sin((i / 16) * Math.PI) * 0.18;
    deco(new THREE.IcosahedronGeometry(0.035, 1), '', x, y, -3.46, {
      material: glowMat(bulbCols[i % bulbCols.length], 3), cast: false,
    });
  }

  // ── 소파 (TV를 마주 봄) ──
  const sf = { x: 0, z: 1.7 };
  box(2.4, 0.4, 0.9, sf.x, 0.2, sf.z, C.sofa);
  box(1.0, 0.1, 0.7, sf.x - 0.52, 0.45, sf.z - 0.05, C.sofaSeat);
  box(1.0, 0.1, 0.7, sf.x + 0.52, 0.45, sf.z - 0.05, C.sofaSeat);
  box(2.4, 0.55, 0.22, sf.x, 0.675, sf.z + 0.34, C.sofa);
  box(0.18, 0.62, 0.9, sf.x - 1.11, 0.31, sf.z, C.sofa);
  box(0.18, 0.62, 0.9, sf.x + 1.11, 0.31, sf.z, C.sofa);
  [[-1.1, -0.38], [1.1, -0.38], [-1.1, 0.38], [1.1, 0.38]].forEach(([ox, oz]) =>
    deco(new THREE.CylinderGeometry(0.035, 0.025, 0.06, 5), C.woodDark, sf.x + ox, 0.03, sf.z + oz));
  const sofaZone = new THREE.Box3(new THREE.Vector3(-1.0, 0.48, 1.28), new THREE.Vector3(1.0, 1.2, 1.92));

  // ── 커피 테이블 + 과일 그릇 ──
  const ct = { x: 0, z: 0.2 };
  box(1.2, 0.05, 0.6, ct.x, 0.4, ct.z, C.wood);
  [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]].forEach(([ox, oz]) =>
    box(0.05, 0.38, 0.05, ct.x + ox, 0.19, ct.z + oz, C.woodDark));
  box(1.1, 0.03, 0.5, ct.x, 0.12, ct.z, C.woodDark, { collide: false });
  // 동그란 유리 접시: 얇은 곡면 접시 + 반짝이는 테두리 + 바닥 굽. 충돌은 바닥판과 테두리를 따라 둥글게 둘러싼 낮은 벽
  const fx = ct.x + 0.3, fy = 0.425, fz = ct.z;
  const dishProfile = new THREE.SplineCurve([
    [0, 0.002], [0.1, 0.002], [0.15, 0.011], [0.185, 0.035], [0.198, 0.056], // 바깥 면
    [0.19, 0.058], [0.18, 0.042], [0.145, 0.02], [0.1, 0.012], [0, 0.012], // 안쪽 면 (두께 약 1cm)
  ].map(([r, y]) => new THREE.Vector2(r, y))).getPoints(48);
  const glass = kindMat('glass', '#cfeff0', { side: THREE.DoubleSide, thickness: 0.012, envMapIntensity: 1.4 });
  const dish = new THREE.Mesh(new THREE.LatheGeometry(dishProfile, 64), glass);
  dish.position.set(fx, fy, fz);
  dish.castShadow = true; dish.receiveShadow = true;
  ctx.scene.add(dish);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.194, 0.0045, 8, 64), kindMat('glossyPlastic', '#e6fbfb', { roughness: 0.05 }));
  rim.rotation.x = Math.PI / 2; rim.position.set(fx, fy + 0.0575, fz);
  const foot = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.004, 8, 48), kindMat('glossyPlastic', '#e6fbfb', { roughness: 0.05 }));
  foot.rotation.x = Math.PI / 2; foot.position.set(fx, fy + 0.002, fz);
  ctx.scene.add(rim, foot);
  ctx.occluders.push(dish);
  addStaticBox(ctx, 0.36, 0.014, 0.36, fx, fy + 0.007, fz); // 바닥판
  for (let k = 0; k < 14; k++) { // 둥근 테두리 벽
    const a = (k / 14) * Math.PI * 2, rr = 0.185;
    addStaticBox(ctx, 0.085, 0.05, 0.014, fx + Math.cos(a) * rr, fy + 0.03, fz + Math.sin(a) * rr, -a + Math.PI / 2);
  }
  const fruitZone = new THREE.Box3(new THREE.Vector3(fx - 0.17, fy - 0.05, fz - 0.17), new THREE.Vector3(fx + 0.17, fy + 0.38, fz + 0.17));
  // 꽃병
  deco(new THREE.CylinderGeometry(0.05, 0.07, 0.16, 8), '#a9dbff', ct.x - 0.38, 0.505, ct.z);
  [[0, 0.65, 0, '#ff9fb5'], [0.04, 0.62, 0.03, '#ffd56b'], [-0.035, 0.63, -0.02, '#d4b5ff']].forEach(([ox, y, oz, col]) =>
    deco(new THREE.IcosahedronGeometry(0.035, 0), col, ct.x - 0.38 + ox, y, ct.z + oz));
  addStaticBox(ctx, 0.15, 0.3, 0.15, ct.x - 0.38, 0.57, ct.z);

  // ── 잡지 바구니 (소파 오른쪽) ──
  // 받침 위에 얕은 바구니를 올려서 안에 넣은 잡지가 위에서 잘 보이게
  box(0.6, 0.25, 0.52, 1.78, 0.125, 1.7, C.basket); // 윗면이 바구니 바닥(0.25)과 딱 맞도록
  box(0.61, 0.04, 0.53, 1.78, 0.12, 1.7, C.basketStripe, frame);
  const magZone = container(1.78, 1.7, 0.6, 0.12, 0.52, 0.03, C.basket, 0.22);

  // ── 강아지 방석 + 강아지 (왼쪽) ──
  const dogZone = container(-3.0, -1.5, 0.9, 0.18, 0.7, 0.1, C.dogBed);
  box(0.7, 0.03, 0.5, -3.0, 0.115, -1.5, C.dogPad, { collide: false, occlude: false });
  const ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
  addDog(ctx, -3.35, -0.45);
  addStaticBox(ctx, 0.4, 0.3, 0.3, -3.35, 0.15, -0.45); // 몸통
  addStaticBox(ctx, 0.2, 0.2, 0.2, -3.15, 0.34, -0.37); // 머리
  // 밥그릇
  deco(new THREE.CylinderGeometry(0.1, 0.08, 0.06, 8), '#ff9fb5', -2.65, 0.03, -0.35);
  deco(new THREE.CylinderGeometry(0.075, 0.075, 0.01, 8), '#c98f63', -2.65, 0.058, -0.35);

  // ── 휴지통 (TV 장 오른쪽) ──
  const trashZone = container(1.55, -3.15, 0.42, 0.5, 0.42, 0.03, C.trash);
  box(0.425, 0.05, 0.01, 1.55, 0.45, -2.937, '#ffffff', frame);

  // ── 장식 수납장 (오른쪽 벽) ──
  box(0.4, 0.9, 1.4, 3.78, 0.45, 0, C.cabinet);
  box(0.42, 0.03, 1.42, 3.78, 0.915, 0, '#ffffff');
  [-0.35, 0.35].forEach((oz) => {
    box(0.01, 0.7, 0.6, 3.575, 0.45, oz, '#fff6dc', frame);
    deco(ico(0.022, 0), '#ffb48f', 3.56, 0.55, oz + (oz < 0 ? 0.24 : -0.24));
  });
  [[-0.4, 0.14, '#ffd1dc'], [0.1, 0.18, '#cfe0ff']].forEach(([oz, h, col]) => {
    box(0.04, h + 0.04, h, 3.8, 0.93 + (h + 0.04) / 2, oz, '#ffffff');
    box(0.005, h, h - 0.04, 3.777, 0.93 + (h + 0.04) / 2, oz, col, frame);
  });
  addPlant(b, 3.8, 0.5, 0.45, { y: 0.93, type: 'ficus', collide: false });
  box(0.03, 0.55, 0.75, 3.985, 1.75, 0, '#ffffff', frame);
  box(0.01, 0.45, 0.65, 3.968, 1.75, 0, '#fff1a8', frame);
  deco(starGeo, '#ff9fb5', 3.955, 1.75, 0, { rot: [0, -Math.PI / 2, 0], cast: false });

  // ── 플로어 스탠드 (소파 뒤 오른쪽) ──
  deco(new THREE.CylinderGeometry(0.15, 0.17, 0.04, 8), '#ffffff', 1.6, 0.02, 2.75);
  deco(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 5), '#ffffff', 1.6, 0.77, 2.75);
  deco(new THREE.ConeGeometry(0.22, 0.28, 8, 1, true), '#ffd1dc', 1.6, 1.6, 2.75, {
    material: lowMat('#ffd1dc', { side: THREE.DoubleSide }),
  });
  addStaticBox(ctx, 0.35, 1.8, 0.35, 1.6, 0.9, 2.75);

  // 문 (앞벽 오른쪽)
  box(1.0, 2.1, 0.04, 2.8, 1.05, ROOM.d / 2 - 0.02, '#ffffff', frame);
  box(0.9, 2.0, 0.05, 2.8, 1.0, ROOM.d / 2 - 0.03, '#ffd9b8', frame);
  deco(ico(0.04, 0), '#ffd56b', 2.45, 1.0, ROOM.d / 2 - 0.08);

  addPlant(b, -3.6, -3.1);
  addPlant(b, 3.6, -3.1, 0.9);
  addPlant(b, -3.6, 3.1, 0.85, { pot: '#a9dbff' });
  addWallClock(b, -2.4, 2.2, -3.47);

  const zones = [
    { id: 'trash', label: '휴지통', task: '쓰레기 버리기', emoji: '🗑️', color: '#5fcfa8', box: trashZone },
    { id: 'sofa', label: '소파', task: '쿠션·담요 정돈', emoji: '🛋️', color: '#6aa8ff', box: sofaZone },
    { id: 'tvstand', label: 'TV 장', task: '리모컨 정리', emoji: '📺', color: '#b48cff', box: tvZone },
    { id: 'tvdrawer', label: 'TV장 서랍', task: '게임기 정리', emoji: '🎮', color: '#7f8cff', box: new THREE.Box3(), movable: tvDrawer },
    { id: 'magazine', label: '잡지 바구니', task: '잡지 모으기', emoji: '📰', color: '#e39a4f', box: magZone },
    { id: 'fruitbowl', label: '과일 그릇', task: '과일 담기', emoji: '🍎', color: '#ff7fa0', box: fruitZone },
    { id: 'dogbed', label: '강아지 방석', task: '강아지 장난감', emoji: '🐶', color: '#ffb02e', box: dogZone },
  ];

  for (const z of zones) if (z.movable) z.movable.updateZone(z);

  const blockers = [
    [-1.75, 1.1, -3.5, -2.15], [1.3, 1.8, -3.45, -2.9], [-1.3, 1.3, 1.15, 2.25],
    [-0.7, 0.7, -0.15, 0.55], [1.45, 2.1, 1.4, 2.0], [-3.5, -2.5, -1.9, -1.1],
    [-3.7, -2.5, -0.8, -0.1], [3.5, 4, -0.75, 0.75], [1.35, 1.85, 2.5, 3.0],
    [-3.9, -3.3, -3.4, -2.8], [3.3, 3.9, -3.4, -2.8], [-3.9, -3.3, 2.8, 3.4],
  ];

  return { zones, blockers, bounds: { x0: -3.5, x1: 3.3, z0: -2.8, z1: 3.1 } };
}

const items = [
  { name: '뭉친 휴지', target: 'trash', make: F.paper },
  { name: '뭉친 휴지', target: 'trash', make: F.paper },
  { name: '빈 캔', target: 'trash', make: () => F.can('#ffb48f') },
  { name: '빈 캔', target: 'trash', make: () => F.can('#a9c8ff') },
  { name: '과자 봉지', target: 'trash', make: F.snackBag },
  { name: '바나나 껍질', target: 'trash', make: F.bananaPeel },
  { name: '귤껍질', target: 'trash', make: F.orangePeel },
  { name: '쿠션', target: 'sofa', make: () => F.cushion('#ffd56b') },
  { name: '쿠션', target: 'sofa', make: () => F.cushion('#ff9fb5') },
  { name: '쿠션', target: 'sofa', make: () => F.cushion('#ffffff', '#a9c8ff') },
  { name: '담요', target: 'sofa', make: () => F.blanket('#d4b5ff') },
  { name: '리모컨', target: 'tvstand', make: () => F.remote('#ffffff') },
  { name: '리모컨', target: 'tvstand', make: () => F.remote('#ffd1dc') },
  { name: '게임패드', target: 'tvdrawer', make: F.gamepad },
  { name: '게임 팩', target: 'tvdrawer', make: () => F.gameCart('#ff8fa3') },
  { name: '게임 팩', target: 'tvdrawer', make: () => F.gameCart('#7ec8ff') },
  { name: '잡지', target: 'magazine', make: () => F.magazine('#ff9fb5') },
  { name: '잡지', target: 'magazine', make: () => F.magazine('#7ec8ff') },
  { name: '잡지', target: 'magazine', make: () => F.magazine('#8ee3a8') },
  { name: '사과', target: 'fruitbowl', make: () => F.apple() },
  { name: '사과', target: 'fruitbowl', make: () => F.apple('#ffd56b') },
  { name: '오렌지', target: 'fruitbowl', make: F.orange },
  { name: '뼈다귀 장난감', target: 'dogbed', make: () => F.bone() },
  { name: '뼈다귀 장난감', target: 'dogbed', make: () => F.bone('#a9dbff') },
  { name: '강아지 공', target: 'dogbed', make: () => F.ball(['#ff8fa3', '#ffffff'], 0.08) },
];

export default {
  id: 'living',
  name: '거실',
  emoji: '🛋️',
  desc: '리모컨·잡지·과일이 흩어진 강아지와 함께 사는 거실',
  spawn: { x: -2.2, z: 2.6, yaw: -0.7 },
  timeLimit: 60,
  lamp: [0, 2.3, 0.3],
  windowLight: { pos: [-7, 3.3, 1.2], target: [-1.6, 0, 1.0] },
  background: '#fff3e6',
  build,
  items,
};
