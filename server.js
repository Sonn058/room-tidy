// 의존성 없는 로컬 정적 서버: node server.js → http://localhost:5180
// (ES 모듈과 포인터 락은 file:// 보다 http://localhost 에서 안정적으로 동작한다)
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 5180;
const ROOT = __dirname;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
};

const server = http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    const file = path.normalize(path.join(ROOT, urlPath === "/" ? "index.html" : urlPath));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
        return;
      }
      const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
      // 영상은 브라우저가 부분 요청(Range)으로 받아 가므로 해당 구간만 보내 준다
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
        res.writeHead(206, {
          "Content-Type": type,
          "Content-Range": `bytes ${start}-${end}/${data.length}`,
          "Accept-Ranges": "bytes",
          "Content-Length": end - start + 1,
        });
        res.end(data.subarray(start, end + 1));
        return;
      }
      // 코드가 자주 바뀌므로 브라우저가 옛 파일을 재사용하지 않게 (영상·이미지는 그대로 캐시해도 됨)
      const noCache = /\.(js|css|html)$/i.test(file) ? { "Cache-Control": "no-cache" } : {};
      res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", ...noCache });
      res.end(data);
    });
  });

// ── 2인 대전: 방 코드로 두 사람을 묶어 메시지를 서로 전달하는 웹소켓 중계 (외부 패키지 없음) ──
const crypto = require("crypto");
const os = require("os");

// 같은 와이파이의 친구가 접속할 주소 (이 컴퓨터의 내부 IP)
function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === "IPv4" && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  return out;
}

function sendWs(socket, obj) {
  if (socket.destroyed) return;
  const data = Buffer.from(typeof obj === "string" ? obj : JSON.stringify(obj));
  let header;
  if (data.length < 126) header = Buffer.from([0x81, data.length]);
  else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  socket.write(Buffer.concat([header, data]));
}

// 받은 바이트에서 웹소켓 프레임 하나를 꺼낸다 (모자라면 null)
function readFrame(c) {
  const b = c.buf;
  if (b.length < 2) return null;
  const op = b[0] & 0x0f, masked = b[1] & 0x80;
  let len = b[1] & 0x7f, off = 2;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (b.length < 10) return null; len = Number(b.readBigUInt64BE(2)); off = 10; }
  const ml = masked ? 4 : 0;
  if (b.length < off + ml + len) return null;
  let data = Buffer.from(b.subarray(off + ml, off + ml + len));
  if (masked) { const m = b.subarray(off, off + 4); for (let i = 0; i < data.length; i++) data[i] ^= m[i & 3]; }
  c.buf = b.subarray(off + ml + len);
  return { op, data };
}

const rooms = new Map(); // code → { host, guest, map, hostRole }
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 I·O·0·1 제외
function newCode() {
  let code;
  do { code = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join(""); } while (rooms.has(code));
  return code;
}

function onMessage(c, text) {
  let msg;
  try { msg = JSON.parse(text); } catch { return; }
  switch (msg.t) {
    case "create": {
      const code = newCode();
      rooms.set(code, { host: c, guest: null, map: msg.map, hostRole: msg.role });
      c.room = code;
      sendWs(c.socket, { t: "created", code, urls: lanUrls() });
      return;
    }
    case "peek": { // 들어가기 전에 방 정보만 확인 (어느 맵인지 알아야 그 맵으로 불러옴)
      const r = rooms.get(String(msg.code || "").toUpperCase());
      sendWs(c.socket, r ? { t: "room", ok: !r.guest, map: r.map, hostRole: r.hostRole } : { t: "room", ok: false, missing: true });
      return;
    }
    case "join": {
      const code = String(msg.code || "").toUpperCase();
      const r = rooms.get(code);
      if (!r || r.guest) { sendWs(c.socket, { t: "join-failed", reason: r ? "full" : "missing" }); return; }
      r.guest = c;
      c.room = code;
      sendWs(c.socket, { t: "joined", code, map: r.map, hostRole: r.hostRole });
      sendWs(r.host.socket, { t: "peer-joined" });
      return;
    }
    case "role": { // 대기 화면에서 누가 어느 역할을 할지 바꿈 → 방 정보도 갱신하고 상대에게 전달
      const r = rooms.get(c.room);
      if (!r) return;
      r.hostRole = msg.hr;
      const peer = r.host === c ? r.guest : r.host;
      if (peer) sendWs(peer.socket, text);
      return;
    }
    default: { // 그 밖의 메시지는 같은 방의 상대에게 그대로 전달
      const r = rooms.get(c.room);
      if (!r) return;
      const peer = r.host === c ? r.guest : r.host;
      if (peer) sendWs(peer.socket, text);
    }
  }
}

function leave(c) {
  const code = c.room;
  const r = rooms.get(code);
  c.room = null;
  if (!r) return;
  if (r.host === c) {
    if (r.guest) sendWs(r.guest.socket, { t: "peer-left" });
    rooms.delete(code);
  } else if (r.guest === c) {
    r.guest = null;
    sendWs(r.host.socket, { t: "peer-left" });
  }
}

server.on("upgrade", (req, socket) => {
  if (!req.url.startsWith("/ws")) { socket.destroy(); return; }
  const accept = crypto.createHash("sha1")
    .update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const c = { socket, room: null, buf: Buffer.alloc(0) };
  socket.on("data", (chunk) => {
    c.buf = Buffer.concat([c.buf, chunk]);
    let f;
    while ((f = readFrame(c))) {
      if (f.op === 8) { socket.end(); return; } // 닫기
      if (f.op === 9) { socket.write(Buffer.concat([Buffer.from([0x8a, f.data.length]), f.data])); continue; } // 핑 → 퐁
      if (f.op === 1) onMessage(c, f.data.toString("utf8"));
    }
  });
  socket.on("close", () => leave(c));
  socket.on("error", () => leave(c));
});

server.listen(PORT, () => {
  console.log(`말랑말랑 방 정리 → http://localhost:${PORT}`);
  for (const u of lanUrls()) console.log(`  같은 와이파이의 친구는 → ${u}`);
});
