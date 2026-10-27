// 사물 재질: 천·인형 털·뜨개·러그·종이·플라스틱·고무·도자기·금속·유리·나무·라탄·코르크·과일 껍질 등
// 캔버스로 그린 무늬를 색(map)과 요철(bumpMap)에 함께 쓰고, 거칠기·천 광택(sheen)·클리어코트로 재질감을 낸다
import * as THREE from 'three';
import { make, rng, noise, blotches, woodTex } from './textures.js';

// ── 재질별 무늬 (회색조: 색은 재질 색과 곱해짐) ──────────────────────────────
const DRAW = {
  // 평직 천: 가로·세로 실이 번갈아 겹침
  weave(ctx, w, h, rand) {
    ctx.fillStyle = '#e4e4e4'; ctx.fillRect(0, 0, w, h);
    const c = 4;
    for (let i = 0; i < w / c; i++) {
      for (let j = 0; j < h / c; j++) {
        const v = 215 + rand() * 35 | 0;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        if ((i + j) % 2) ctx.fillRect(i * c + 1, j * c, c - 2, c);
        else ctx.fillRect(i * c, j * c + 1, c, c - 2);
      }
    }
    noise(ctx, w, h, 14, rand);
  },
  // 인형·담요 털: 짧은 털 가닥이 촘촘히
  fur(ctx, w, h, rand) {
    ctx.fillStyle = '#d6d6d6'; ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (let i = 0; i < 9000; i++) {
      const x = rand() * w, y = rand() * h, a = Math.PI / 2 + (rand() - 0.5) * 1.6, l = 2 + rand() * 6;
      ctx.strokeStyle = rand() < 0.55 ? `rgba(255,255,255,${0.18 + rand() * 0.25})` : `rgba(0,0,0,${0.08 + rand() * 0.12})`;
      ctx.lineWidth = 0.6 + rand() * 0.9;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    noise(ctx, w, h, 10, rand);
  },
  // 뜨개(양말): V자 코가 줄지어
  knit(ctx, w, h, rand) {
    ctx.fillStyle = '#b8b8b8'; ctx.fillRect(0, 0, w, h);
    const cw = 8, ch = 10;
    for (let j = -1; j < h / ch + 1; j++) {
      for (let i = 0; i < w / cw; i++) {
        const x = i * cw, y = j * ch, v = 225 + rand() * 25 | 0;
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        for (const s of [-1, 1]) {
          ctx.save(); ctx.translate(x + cw / 2 + s * cw * 0.2, y + ch / 2); ctx.rotate(s * 0.55);
          ctx.beginPath(); ctx.ellipse(0, 0, cw * 0.22, ch * 0.55, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
      }
    }
    noise(ctx, w, h, 10, rand);
  },
  // 러그 파일(털실 뭉치)
  pile(ctx, w, h, rand) {
    ctx.fillStyle = '#d2d2d2'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 7000; i++) {
      const v = 190 + rand() * 65 | 0;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath(); ctx.arc(rand() * w, rand() * h, 0.8 + rand() * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    noise(ctx, w, h, 18, rand);
  },
  // 종이 섬유
  paper(ctx, w, h, rand) {
    ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = rand() * w, y = rand() * h, a = rand() * Math.PI, l = 3 + rand() * 10;
      ctx.strokeStyle = rand() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    blotches(ctx, w, h, 40, rand, 0.015);
    noise(ctx, w, h, 6, rand);
  },
  // 플라스틱·도료: 거의 매끈 (아주 미세한 결)
  smooth(ctx, w, h, rand) {
    ctx.fillStyle = '#f6f6f6'; ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 30, rand, 0.01);
    noise(ctx, w, h, 4, rand);
  },
  // 금속: 한 방향으로 쓸린 헤어라인
  brushed(ctx, w, h, rand) {
    ctx.fillStyle = '#d4d4d4'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const y = rand() * h;
      ctx.strokeStyle = rand() < 0.5 ? `rgba(255,255,255,${0.08 + rand() * 0.18})` : `rgba(0,0,0,${0.05 + rand() * 0.1})`;
      ctx.lineWidth = 0.5 + rand();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + (rand() - 0.5) * 2); ctx.stroke();
    }
    noise(ctx, w, h, 6, rand);
  },
  // 테라코타 화분: 거친 흙 알갱이
  terra(ctx, w, h, rand) {
    ctx.fillStyle = '#dedede'; ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 120, rand, 0.05);
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = rand() < 0.6 ? `rgba(0,0,0,${0.12 + rand() * 0.2})` : `rgba(255,255,255,${0.2 + rand() * 0.3})`;
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 1.5, 1 + rand() * 1.5);
    }
    noise(ctx, w, h, 16, rand);
  },
  // 잎맥
  veins(ctx, w, h, rand) {
    ctx.fillStyle = '#dcdcdc'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    for (let k = 0; k < 4; k++) {
      const x0 = (k + 0.5) * (w / 4);
      ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, h); ctx.stroke();
      ctx.lineWidth = 1;
      for (let y = 6; y < h; y += 14 + rand() * 6) {
        for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo(x0 + s * 14, y - 6, x0 + s * 28, y - 16); ctx.stroke(); }
      }
    }
    noise(ctx, w, h, 8, rand);
  },
  // 귤·오렌지 껍질: 오목한 기름샘 자국
  dimples(ctx, w, h, rand) {
    ctx.fillStyle = '#e2e2e2'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const x = rand() * w, y = rand() * h, r = 1.2 + rand() * 2;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    noise(ctx, w, h, 8, rand);
  },
  // 사과 껍질·유약: 잔점
  speckle(ctx, w, h, rand) {
    ctx.fillStyle = '#f0f0f0'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.08)';
      ctx.beginPath(); ctx.arc(rand() * w, rand() * h, 0.6 + rand(), 0, Math.PI * 2); ctx.fill();
    }
    noise(ctx, w, h, 4, rand);
  },
  // 라탄 바구니: 가로 띠 사이로 세로 살이 오르내림
  wicker(ctx, w, h, rand) {
    ctx.fillStyle = '#8a8a8a'; ctx.fillRect(0, 0, w, h);
    const rowH = 14, stake = 22;
    for (let r = 0; r < h / rowH; r++) {
      for (let s = 0; s < w / stake; s++) {
        const x = s * stake + ((r % 2) * stake) / 2, y = r * rowH;
        const g = ctx.createLinearGradient(0, y, 0, y + rowH);
        const v = 210 + rand() * 30 | 0;
        g.addColorStop(0, `rgb(${v - 60},${v - 60},${v - 60})`); g.addColorStop(0.5, `rgb(${v},${v},${v})`); g.addColorStop(1, `rgb(${v - 70},${v - 70},${v - 70})`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(x + 1, y + 1, stake - 2, rowH - 2, 6); ctx.fill();
      }
    }
    noise(ctx, w, h, 12, rand);
  },
  // 코르크 알갱이
  cork(ctx, w, h, rand) {
    ctx.fillStyle = '#d0d0d0'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const v = 150 + rand() * 105 | 0;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath(); ctx.ellipse(rand() * w, rand() * h, 0.8 + rand() * 2.4, 0.6 + rand() * 1.6, rand() * 3, 0, Math.PI * 2); ctx.fill();
    }
    noise(ctx, w, h, 20, rand);
  },
  // 벽 페인트: 롤러 자국이 아주 옅게
  roller(ctx, w, h, rand) {
    ctx.fillStyle = '#f3f3f3'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.015)';
      ctx.fillRect(rand() * w, 0, 8 + rand() * 30, h);
    }
    noise(ctx, w, h, 5, rand);
  },
};
const SIZE = { weave: 256, fur: 256, knit: 256, pile: 256, paper: 256, smooth: 128, brushed: 256, terra: 256, veins: 128, dimples: 256, speckle: 128, wicker: 256, cork: 256, roller: 256 };

// 같은 무늬를 색 지도(sRGB)와 요철 지도(선형) 두 벌로
function detail(name) {
  const s = SIZE[name];
  const draw = (ctx, w, h) => DRAW[name](ctx, w, h, rng(name.length * 31 + 7));
  return {
    map: make(`m:${name}`, s, s, draw),
    bump: make(`m:${name}:lin`, s, s, draw, { srgb: false }),
  };
}
let woodBump = null;
function woodDetail() {
  if (!woodBump) {
    woodBump = woodTex().clone();
    woodBump.colorSpace = THREE.NoColorSpace;
    woodBump.needsUpdate = true;
  }
  return { map: woodTex(), bump: woodBump };
}

// ── 재질 프리셋 ──────────────────────────────
// d: 무늬 이름, bump: 요철 세기, sheen: 천의 보송한 광택, 나머지는 MeshPhysicalMaterial 속성
const PRESETS = {
  paint: { d: 'roller', roughness: 0.88, envMapIntensity: 0.3 },
  woodPaint: { d: 'smooth', wood: 'bump', bump: 0.35, roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.45, envMapIntensity: 0.45 },
  wood: { wood: 'both', bump: 0.45, roughness: 0.58, clearcoat: 0.25, clearcoatRoughness: 0.4, envMapIntensity: 0.5 },
  fabric: { d: 'weave', bump: 0.9, roughness: 0.95, sheen: 1, sheenRoughness: 0.55, envMapIntensity: 0.2 },
  plush: { d: 'fur', bump: 1.6, roughness: 1, sheen: 1, sheenRoughness: 0.35, envMapIntensity: 0.15 },
  knit: { d: 'knit', bump: 1.4, roughness: 0.95, sheen: 0.8, sheenRoughness: 0.5, envMapIntensity: 0.15 },
  rug: { d: 'pile', bump: 1.4, roughness: 1, sheen: 0.6, sheenRoughness: 0.6, envMapIntensity: 0.15 },
  paper: { d: 'paper', bump: 0.35, roughness: 0.92, envMapIntensity: 0.2 },
  paperGloss: { d: 'paper', bump: 0.15, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.5 },
  bookCover: { d: 'paper', bump: 0.4, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.35, envMapIntensity: 0.4 },
  plastic: { d: 'smooth', roughness: 0.38, clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 0.7 },
  glossyPlastic: { d: 'smooth', roughness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.1, envMapIntensity: 0.9 },
  vinyl: { d: 'smooth', roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.15, envMapIntensity: 0.75 },
  rubber: { d: 'smooth', bump: 0.2, roughness: 0.65, sheen: 0.25, sheenRoughness: 0.7, envMapIntensity: 0.3 },
  wax: { d: 'smooth', roughness: 0.5, sheen: 0.35, sheenRoughness: 0.5, clearcoat: 0.1, envMapIntensity: 0.4 },
  ceramic: { d: 'speckle', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1 },
  terracotta: { d: 'terra', bump: 0.9, roughness: 0.96, envMapIntensity: 0.15 },
  metal: { d: 'brushed', bump: 0.1, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.3 },
  paintedMetal: { d: 'smooth', metalness: 0.35, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 0.9 },
  gold: { d: 'brushed', metalness: 1, roughness: 0.25, envMapIntensity: 1.4 },
  foil: { d: 'brushed', metalness: 0.65, roughness: 0.22, clearcoat: 0.4, envMapIntensity: 1.2 },
  glass: { transmission: 0.95, thickness: 0.02, ior: 1.45, roughness: 0.04, envMapIntensity: 1, transparent: true },
  liquid: { roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 0.9 },
  leaf: { d: 'veins', bump: 0.5, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4, sheen: 0.2, envMapIntensity: 0.4 },
  fruitSkin: { d: 'speckle', roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 0.7 },
  citrus: { d: 'dimples', bump: 1.3, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.5 },
  wicker: { d: 'wicker', bump: 1.6, roughness: 0.85, envMapIntensity: 0.25 },
  cork: { d: 'cork', bump: 1.1, roughness: 0.95, envMapIntensity: 0.15 },
  sand: { d: 'pile', bump: 0.6, roughness: 1, envMapIntensity: 0.1 },
};

// kind 재질을 color 로 만든다. extra 로 무늬(map)나 속성을 덮어쓸 수 있다
export function kindMat(kind, color, extra = {}) {
  const p = PRESETS[kind] || PRESETS.paint;
  const { d, wood, bump, sheen, ...props } = p;
  const params = { color, metalness: 0, ...props };
  if (d) {
    const t = detail(d);
    params.map = t.map;
    if (bump) { params.bumpMap = t.bump; params.bumpScale = bump; }
  }
  if (wood) {
    const t = woodDetail();
    if (wood === 'both') params.map = t.map;
    params.bumpMap = t.bump;
    params.bumpScale = bump;
  }
  if (sheen) {
    // 천 광택은 그 천의 색을 살짝 밝힌 색으로 (하얗게 뜨면 색이 바래 보임)
    params.sheen = sheen * 0.7;
    params.sheenColor = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.15);
  }
  Object.assign(params, extra);
  const m = new THREE.MeshPhysicalMaterial(params);
  m.userData.kind = kind;
  return m;
}

// 큰 면에서 무늬가 늘어나 보이지 않도록 색·요철 지도를 같이 반복
export function repeatMaps(mat, rx, ry) {
  for (const key of ['map', 'bumpMap']) {
    const t = mat[key];
    if (!t) continue;
    const c = t.clone();
    c.repeat.set(rx, ry);
    c.needsUpdate = true;
    mat[key] = c;
  }
  return mat;
}

// ── 물건별 재질 규칙: base = 기본 재질, by = 부품 색(소문자 hex) → 재질 ──────────────
const EYES = { '3b3350': 'glossyPlastic', '5a4a5e': 'glossyPlastic' };
const ITEM_RULES = {
  '장난감 블록': { base: 'woodPaint', by: { ffffff: 'paint' } },
  '비치볼': { base: 'vinyl' },
  '고무공': { base: 'rubber' },
  '강아지 공': { base: 'rubber' },
  '장난감 자동차': { base: 'glossyPlastic', by: { '5d5470': 'rubber' } },
  '고무 오리': { base: 'vinyl', by: EYES },
  '동화책': { base: 'bookCover', by: { fffaf0: 'paper', ffffff: 'paper' } },
  '책': { base: 'bookCover', by: { fffaf0: 'paper', ffffff: 'paper' } },
  '양말': { base: 'knit' },
  '티셔츠': { base: 'fabric', by: { ffffff: 'knit' } }, // 목·소매 밴드는 신축 있는 뜨개 느낌
  '베개': { base: 'fabric' },
  // 쿠션 색과 단추 색이 겹칠 수 있어서 단추는 모양(둥근 부품)으로 구분
  '쿠션': { base: 'fabric', byGeo: { SphereGeometry: 'glossyPlastic', TubeGeometry: 'fabric' } },
  '수건': { base: 'plush' },
  '담요': { base: 'plush' },
  '곰인형': { base: 'plush', by: { ...EYES, ff8fa3: 'fabric' } },
  '머그컵': { base: 'ceramic', by: { '9b6a4b': 'liquid' } },
  '찻잔': { base: 'ceramic', by: { c98f63: 'liquid' } },
  '구겨진 종이': { base: 'paper' },
  '뭉친 휴지': { base: 'paper' },
  '빈 캔': { base: 'paintedMetal', by: { dfe3ea: 'metal' } },
  '바나나 껍질': { base: 'fruitSkin', by: { '8a6a3c': 'wood' } },
  '과자 봉지': { base: 'foil' },
  '사탕 껍질': { base: 'foil' },
  '크레파스': { base: 'wax', by: { f6d7b5: 'wax', ffffff: 'paper' } },
  '색연필': { base: 'woodPaint', by: { f6d7b5: 'wood', ffffff: 'paper' } },
  '지우개': { base: 'rubber', by: { '7ec8ff': 'paper' } },
  '자': { base: 'glossyPlastic', by: { c9a33c: 'paint' } },
  '서류 파일': { base: 'plastic', by: { fffdf4: 'paper', ffffff: 'paper' } },
  '종이컵': { base: 'paper', by: { ffffff: 'plastic' } },
  '귤껍질': { base: 'citrus' },
  '지구본': { base: 'paperGloss', by: { ffd56b: 'gold', cf9a6c: 'wood' } },
  '탁상시계': { base: 'paintedMetal', by: { fffaf0: 'paper', ffd56b: 'gold' } },
  '모래시계': { base: 'wood', by: { d6f0ff: 'glass', ffd56b: 'sand' } },
  '리모컨': { base: 'plastic', by: { ff8fa3: 'rubber', a9c8ff: 'rubber' } },
  '게임패드': { base: 'plastic', by: { ff8fa3: 'glossyPlastic', ffd56b: 'glossyPlastic', '8ee3a8': 'glossyPlastic' } },
  '게임 팩': { base: 'plastic', by: { fffaf0: 'paperGloss', ffd56b: 'gold' } },
  '잡지': { base: 'paperGloss', by: { fffdf4: 'paper' } },
  '사과': { base: 'fruitSkin', by: { '8a6a3c': 'wood', '8ee3a8': 'leaf' } },
  '오렌지': { base: 'citrus', by: { '8ee3a8': 'leaf' } },
  '뼈다귀 장난감': { base: 'rubber' },
};

// 물건 메시의 재질을 사물 특성에 맞게 바꾼다 (색·버텍스 색·투명도는 유지)
export function applyItemMaterials(root, name) {
  const rule = ITEM_RULES[name];
  if (!rule) return;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const old = o.material;
    const hex = old.color.getHexString();
    const kind = (rule.byGeo && rule.byGeo[o.geometry.type]) || (rule.by && rule.by[hex]) || rule.base;
    const extra = { vertexColors: old.vertexColors };
    if (old.transparent && kind !== 'glass') Object.assign(extra, { transparent: true, opacity: old.opacity });
    if (old.side !== THREE.FrontSide) extra.side = old.side;
    o.material = kindMat(kind, `#${hex}`, extra);
    old.dispose();
  });
}
