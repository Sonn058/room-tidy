import { WS_URL } from './config.js';
// 2인 대전 통신: 게임 서버의 웹소켓(/ws)으로 같은 방의 상대와 메시지를 주고받는다
export class Net {
  constructor() {
    this.handlers = {};
    this.ready = new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      this.ws = new WebSocket(WS_URL || `${proto}://${location.host}/ws`);
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error('서버에 연결할 수 없어요'));
      this.ws.onclose = () => this.emit('closed', {});
      this.ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        this.emit(msg.t, msg);
      };
    });
  }

  on(type, fn) {
    (this.handlers[type] ||= []).push(fn);
    return this;
  }

  // 한 번만 받을 응답을 기다림
  once(type) {
    return new Promise((resolve) => {
      const fn = (m) => { this.handlers[type] = this.handlers[type].filter((f) => f !== fn); resolve(m); };
      this.on(type, fn);
    });
  }

  emit(type, msg) {
    for (const fn of this.handlers[type] || []) fn(msg);
  }

  send(obj) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close() {
    this.ws.close();
  }
}

// 방 코드로 어느 맵인지 확인 (참가 전에 그 맵으로 페이지를 불러오기 위해)
export async function peekRoom(code) {
  const net = new Net();
  await net.ready;
  const res = net.once('room');
  net.send({ t: 'peek', code });
  const info = await res;
  net.close();
  return info;
}

