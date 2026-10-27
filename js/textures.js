// 캔버스로 그리는 손그림 느낌 텍스처: 붓 자국 결, 나뭇결, 바닥 판자, 줄무늬 벽지, 체크 러그, 포스터
import * as THREE from 'three';

const cache = new Map();

// 매번 같은 무늬가 나오도록 시드 고정 난수
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function make(key, w, h, draw, { srgb = true } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

// 반복 횟수만 다른 복사본 (이미지는 공유)
export function repeated(tex, rx, ry) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

export function noise(ctx, w, h, amount, rand) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function blotches(ctx, w, h, count, rand, alpha) {
  for (let i = 0; i < count; i++) {
    const r = 6 + rand() * 40;
    ctx.fillStyle = rand() < 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 0.6})`;
    ctx.beginPath();
    ctx.ellipse(rand() * w, rand() * h, r, r * (0.4 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 모든 재질에 곱해지는 은은한 붓 자국 결 (거의 흰색)
export function grainTex() {
  return make('grain', 256, 256, (ctx, w, h) => {
    const rand = rng(7);
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 260, rand, 0.014);
    noise(ctx, w, h, 4, rand);
  });
}

// 가구용 나뭇결 (회색조 → 재질 색으로 물듦)
export function woodTex() {
  return make('wood', 512, 512, (ctx, w, h) => {
    const rand = rng(11);
    ctx.fillStyle = '#ececec';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const y0 = rand() * h, amp = 2 + rand() * 6, f = 0.004 + rand() * 0.01, ph = rand() * 6;
      ctx.strokeStyle = rand() < 0.75 ? `rgba(60,35,15,${0.05 + rand() * 0.1})` : `rgba(255,255,255,${0.1 + rand() * 0.1})`;
      ctx.lineWidth = 1 + rand() * 3;
      ctx.beginPath();
      for (let x = -10; x <= w + 10; x += 12) {
        const y = y0 + Math.sin(x * f + ph) * amp;
        x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = 'rgba(60,35,15,0.14)';
      ctx.lineWidth = 2;
      const kx = rand() * w, ky = rand() * h;
      for (let r = 4; r < 22; r += 5) {
        ctx.beginPath();
        ctx.ellipse(kx, ky, r * 2.2, r * 0.7, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    noise(ctx, w, h, 12, rand);
  });
}

// 바닥/천장 판자: 1칸 = 가로 1m(판자 4장) × 세로 2m, 판자는 v(세로) 방향
export function plankTex(colA, colB, seed = 3) {
  return make(`plank:${colA}:${colB}`, 512, 1024, (ctx, w, h) => {
    const rand = rng(seed);
    const A = new THREE.Color(colA), B = new THREE.Color(colB);
    const pw = w / 4;
    for (let i = 0; i < 4; i++) {
      let y = -rand() * h * 0.6;
      while (y < h) {
        const len = h * (0.35 + rand() * 0.45);
        const c = A.clone().lerp(B, rand());
        c.offsetHSL(0, (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.05);
        ctx.fillStyle = `#${c.getHexString()}`;
        ctx.fillRect(i * pw, y, pw, len);
        // 나뭇결
        for (let g = 0; g < 7; g++) {
          const x0 = i * pw + 6 + rand() * (pw - 12);
          ctx.strokeStyle = rand() < 0.7 ? `rgba(80,45,20,${0.06 + rand() * 0.08})` : 'rgba(255,255,255,0.08)';
          ctx.lineWidth = 1 + rand() * 2.5;
          ctx.beginPath();
          for (let yy = y; yy <= y + len; yy += 16) {
            const xx = x0 + Math.sin(yy * 0.012 + g) * 3;
            yy === y ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
          }
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(70,40,20,0.45)';
        ctx.fillRect(i * pw, y + len - 3, pw, 3);
        y += len;
      }
      ctx.fillStyle = 'rgba(70,40,20,0.5)';
      ctx.fillRect(i * pw, 0, 3, h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(i * pw + 3, 0, 2, h);
    }
    noise(ctx, w, h, 10, rand);
  });
}

// 세로 줄무늬 벽지: 1칸 = 줄무늬 2개
export function stripeTex(colA, colB) {
  return make(`stripe:${colA}:${colB}`, 256, 256, (ctx, w, h) => {
    const rand = rng(5);
    ctx.fillStyle = colA;
    ctx.fillRect(0, 0, w / 2, h);
    ctx.fillStyle = colB;
    ctx.fillRect(w / 2, 0, w / 2, h);
    blotches(ctx, w, h, 120, rand, 0.035);
    noise(ctx, w, h, 8, rand);
  });
}

// 체크무늬 러그: 1칸 = 2×2 칸
export function checkerTex(colA, colB) {
  return make(`checker:${colA}:${colB}`, 256, 256, (ctx, w, h) => {
    const rand = rng(9);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (i + j) % 2 ? colA : colB;
        ctx.fillRect(i * w / 2, j * h / 2, w / 2, h / 2);
      }
    }
    blotches(ctx, w, h, 160, rand, 0.05);
    noise(ctx, w, h, 14, rand);
  });
}

// 벽 포스터
export function posterTex(kind) {
  return make(`poster:${kind}`, 256, 320, (ctx, w, h) => {
    const rand = rng(kind.length * 13);
    const draw = POSTERS[kind];
    draw(ctx, w, h, rand);
    blotches(ctx, w, h, 60, rand, 0.04);
    noise(ctx, w, h, 10, rand);
  });
}

const POSTERS = {
  // 오렌지 포스터
  fruit(ctx, w, h) {
    ctx.fillStyle = '#fbf3e2'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3b6fb6'; ctx.fillRect(14, 14, w - 28, h - 28);
    const orange = (x, y, r) => {
      ctx.fillStyle = '#ff9a2e'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, Math.PI * 2); ctx.fill();
    };
    const slice = (x, y, r) => {
      ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff9a2e';
      for (let k = 0; k < 8; k++) {
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.arc(x, y, r * 0.82, (k / 8) * Math.PI * 2 + 0.06, ((k + 1) / 8) * Math.PI * 2 - 0.06);
        ctx.fill();
      }
    };
    ctx.fillStyle = '#4caf6a';
    [[150, 70, 0.5], [175, 92, -0.4], [90, 205, 0.9]].forEach(([x, y, a]) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, 0, 30, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
    orange(120, 120, 56);
    slice(150, 230, 50);
  },
  // 알록달록 ABC 차트
  abc(ctx, w, h) {
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, w, h);
    const cols = ['#ff8fa3', '#ffd56b', '#7ec8ff', '#8ee3a8', '#c4a7ff', '#ffb48f'];
    const letters = 'ABCDEF';
    for (let i = 0; i < 6; i++) {
      const x = 24 + (i % 2) * 108, y = 24 + Math.floor(i / 2) * 94;
      ctx.fillStyle = cols[i]; ctx.fillRect(x, y, 100, 84);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 60px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(letters[i], x + 50, y + 46);
    }
  },
  // 섬 지도
  map(ctx, w, h, rand) {
    ctx.fillStyle = '#f6ecd6'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7fc6e8'; ctx.fillRect(12, 12, w - 24, h - 24);
    const island = (x, y, r, col) => {
      ctx.fillStyle = col; ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const a = (k / 12) * Math.PI * 2, rr = r * (0.7 + rand() * 0.45);
        k ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.fill();
    };
    island(90, 110, 55, '#e8d49a'); island(90, 110, 42, '#7cc47f');
    island(180, 220, 45, '#e8d49a'); island(180, 220, 32, '#93d18f');
    island(70, 250, 22, '#e8d49a');
    ctx.strokeStyle = '#d9534f'; ctx.lineWidth = 4; ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.moveTo(100, 120); ctx.quadraticCurveTo(200, 140, 180, 215); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#d9534f'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✕', 180, 228);
  },
  // 바다 사진 엽서
  sea(ctx, w, h) {
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 16, 0, h - 60);
    g.addColorStop(0, '#9fd8ff'); g.addColorStop(1, '#e8f6ff');
    ctx.fillStyle = g; ctx.fillRect(16, 16, w - 32, h - 90);
    ctx.fillStyle = '#4aa3d8'; ctx.fillRect(16, 170, w - 32, h - 244);
    ctx.fillStyle = '#ffe680'; ctx.beginPath(); ctx.arc(180, 80, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0d9a8'; ctx.beginPath(); ctx.ellipse(70, 238, 70, 22, 0, 0, Math.PI * 2); ctx.fill();
  },
};
