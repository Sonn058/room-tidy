// HUD: 조준점, 상호작용 안내, 정리 목록, 타이머, 토스트
const $ = (id) => document.getElementById(id);
// HUD 는 깔끔하게: 메시지에 섞인 이모지는 화면에 내보내기 전에 걷어낸다
const plain = (s) => s.replace(/\p{Extended_Pictographic}️?\s*/gu, '');

export class UI {
  constructor() {
    this.crosshair = $('crosshair');
    this.prompt = $('prompt');
    this.tasks = $('tasks');
    this.bar = $('progress-bar');
    this.progressText = $('progress-text');
    this.timer = $('timer');
    this.toasts = $('toasts');
    this.scoreValue = $('score-value');
    this.comboBadge = $('combo');
    this.comboBar = $('combo-bar');
    this.pops = $('pops');
    this.rows = {};
    this.state = '';
    this.lastPrompt = '';
    this.lastSec = -1;
  }

  initTasks(zones, done, total) {
    this.tasks.innerHTML = '';
    for (const z of zones) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="dot"></span><span class="label">${z.task}</span><span class="count"></span>`;
      li.style.setProperty('--zone', z.color);
      this.tasks.appendChild(li);
      this.rows[z.id] = li;
    }
    this.updateTasks(zones, done, total);
  }

  updateTasks(zones, done, total) {
    for (const z of zones) {
      const li = this.rows[z.id];
      li.querySelector('.count').textContent = `${z.done}/${z.total}` + (z.broken ? ` · 깨짐 ${z.broken}` : '');
      li.classList.toggle('complete', z.done === z.total);
      li.classList.toggle('broken', !!z.broken);
    }
    this.bar.style.width = `${(done / total) * 100}%`;
    this.progressText.textContent = `${Math.round((done / total) * 100)}%`;
  }

  setPrompt(html) {
    if (html === this.lastPrompt) return;
    this.lastPrompt = html;
    this.prompt.innerHTML = plain(html);
    this.prompt.classList.toggle('show', !!html);
  }

  setCrosshair(state) {
    if (state === this.state) return;
    this.state = state;
    this.crosshair.className = state;
  }

  // hint: F 힌트가 켜져 있을 때만 목적지를 보여 준다 (기본은 직접 찾기)
  setHover(item, zone, hint = false) {
    if (!item) return this.setPrompt('');
    this.setPrompt(`<b>${item.name}</b><span class="key">클릭</span>집기 ` +
      (hint ? `<span class="dest">→ ${zone.label}</span>` : '<span class="key">F</span>힌트'));
  }

  // mov: 들고 있는 동안 바라보는 가구 (E로 조작 가능)
  setHolding(item, zone, mov = null, hint = false) {
    for (const id in this.rows) this.rows[id].classList.toggle('active', !!item && hint && id === item.target);
    if (!item) return this.setPrompt('');
    let html = `<b>${item.name}</b> ` +
      (hint ? `<span class="dest">힌트: ${toward(zone.label)} 옮겨요</span>` : '<span class="dest">어디에 둘까요?</span>') + '<br>' +
      `<span class="key">클릭</span>내려놓기 <span class="key">우클릭</span>던지기 ` +
      `<span class="key">R</span>회전 <span class="key">T</span>뒤집기 <span class="key">휠</span>거리 <span class="key">F</span>힌트`;
    if (item.fragile) html += '<br><span class="tip">깨지기 쉬워요 — 던지거나 떨어뜨리지 말고 살며시 내려놓아요</span>';
    if (mov) html += `<br><span class="key">E</span>${mov.name} ${mov.actionLabel()}`;
    else if (hint && zone.movable && zone.movable.state === 0) {
      html += `<br><span class="tip">${zone.label}이 닫혀 있어요 — 서랍을 바라보고 <span class="key">E</span>로 열어요</span>`;
    }
    this.setPrompt(html);
  }

  setFurniture(mov) {
    this.setPrompt(mov ? `<b>${mov.name}</b><span class="key">클릭</span>${mov.actionLabel()}` : '');
  }

  toast(msg, type = 'good') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = plain(msg);
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2200);
    setTimeout(() => el.remove(), 2700);
  }

  // countdown: 남은 시간 표시(올림), urgent: 마지막 10초 강조
  setTimer(sec, { countdown = false, urgent = false } = {}) {
    const s = countdown ? Math.ceil(sec) : Math.floor(sec);
    if (s === this.lastSec) return;
    this.lastSec = s;
    this.timer.textContent = formatTime(s);
    this.timer.classList.toggle('urgent', urgent);
    if (urgent) {
      this.timer.classList.remove('tick');
      void this.timer.offsetWidth; // 애니메이션 재시작
      this.timer.classList.add('tick');
    }
  }

  // ── 타임 어택 ──
  setScore(score, combo) {
    this.scoreValue.textContent = score.toLocaleString();
    const mult = Math.min(combo, 5);
    this.comboBadge.textContent = mult > 1 ? `콤보 x${mult}` : '';
    this.comboBadge.classList.toggle('show', mult > 1);
  }

  setComboTime(ratio) {
    this.comboBar.style.transform = `scaleX(${Math.max(0, ratio)})`;
  }

  // 조준점 근처에 떠오르는 점수
  popScore(text, sub) {
    this.pop(`<b>${text}</b>${sub ? `<span>${sub}</span>` : ''}`, 'score');
  }

  popTime(text) {
    this.pop(`<b>${text}</b>`, 'time');
  }

  pop(html, type) {
    const el = document.createElement('div');
    el.className = `pop ${type}`;
    el.innerHTML = html;
    this.pops.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }
}

// '으로/로': 받침이 없거나 ㄹ 받침이면 '로'
function toward(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const jong = code >= 0 && code <= 11171 ? code % 28 : 0;
  return word + (jong === 0 || jong === 8 ? '로' : '으로');
}

export function formatTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
}
