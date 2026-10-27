// 플레이어 설정 (이 브라우저에만 저장)
const KEY = 'room-tidy:settings';

export const DEFAULTS = {
  sensitivity: 1, // 마우스 감도 배율
  volume: 0.8, // 효과음 볼륨 0..1
  musicVolume: 0.6, // 배경음악 볼륨 0..1
  headBob: true, // 걸을 때 화면 흔들림
};

export function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    delete stored.graphics; // 그래픽 품질 설정은 없어졌다 (예전에 저장된 값 정리)
    delete stored.v;
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* 저장 불가 환경은 무시 */ }
}

// 기록 저장 키 (타이틀의 '기록' 화면과 결과 화면이 함께 쓴다)
export const recordKey = {
  best: (mapId) => `room-tidy:best:${mapId}`, // 타임 어택 최고 점수
  bestTime: (mapId) => `room-tidy:bestTime:${mapId}`, // 자유 모드 최단 시간(초)
  lastMap: 'room-tidy:lastMap', // 마지막으로 고른 방 (타이틀 배경)
};

export function readNumber(key) {
  try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
}

export function writeValue(key, v) {
  try { localStorage.setItem(key, String(v)); } catch { /* 무시 */ }
}
