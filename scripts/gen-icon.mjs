/**
 * 生成应用图标（零依赖）：
 *  - build/icon.ico          electron-builder 打包用（256x256，PNG 压缩 ICO）
 *  - electron/assets/icon.png 窗口图标
 *
 * 设计：深蓝渐变圆角底 + 红色上升 K 线蜡烛 + 白色均线折线 + 金色买点圆点
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SIZE = 256;

// ---------- 简单画布 ----------
const px = Buffer.alloc(SIZE * SIZE * 4); // RGBA
function setPx(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  const sa = a / 255;
  px[i] = Math.round(r * sa + px[i] * (1 - sa));
  px[i + 1] = Math.round(g * sa + px[i + 1] * (1 - sa));
  px[i + 2] = Math.round(b * sa + px[i + 2] * (1 - sa));
  px[i + 3] = Math.round(255 * sa + px[i + 3] * (1 - sa));
}
function fillRect(x0, y0, x1, y1, r, g, b, a = 255) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setPx(x, y, r, g, b, a);
}
function fillCircle(cx, cy, rad, r, g, b, a = 255) {
  for (let y = cy - rad; y <= cy + rad; y++)
    for (let x = cx - rad; x <= cx + rad; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= rad) setPx(x, y, r, g, b, a * Math.min(1, rad - d + 0.5));
    }
}
function strokeLine(x0, y0, x1, y1, w, r, g, b, a = 255) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    fillCircle(x, y, w / 2, r, g, b, a);
  }
}

// 背景：深蓝渐变圆角矩形
const M = 10, R = 48;
for (let y = M; y < SIZE - M; y++) {
  const t = (y - M) / (SIZE - 2 * M);
  const r = Math.round(20 + t * 14), g = Math.round(32 + t * 20), b = Math.round(58 + t * 30);
  for (let x = M; x < SIZE - M; x++) {
    // 圆角判定
    const rr = (cx, cy) => {
      if (x < M + R && y < M + R) return Math.hypot(x - (M + R), y - (M + R)) <= R;
      if (x > SIZE - M - R && y < M + R) return Math.hypot(x - (SIZE - M - R), y - (M + R)) <= R;
      if (x < M + R && y > SIZE - M - R) return Math.hypot(x - (M + R), y - (SIZE - M - R)) <= R;
      if (x > SIZE - M - R && y > SIZE - M - R) return Math.hypot(x - (SIZE - M - R), y - (SIZE - M - R)) <= R;
      return true;
    };
    if (rr()) setPx(x, y, r, g, b);
  }
}

// K 线蜡烛（中国习惯：红涨）
const CANDLE_W = 26;
// 第一根（左侧，涨）
fillRect(66, 92, 66 + CANDLE_W, 168, 229, 77, 77);          // 实体
fillRect(78, 68, 80, 168, 229, 77, 77);                      // 影线
// 第二根（右侧，涨，更大）
fillRect(128, 60, 128 + CANDLE_W, 180, 229, 77, 77);
fillRect(140, 36, 142, 180, 229, 77, 77);

// 白色均线折线（从低到高）
const pts = [
  [40, 196], [84, 176], [128, 150], [176, 122], [220, 88],
];
for (let i = 1; i < pts.length; i++) {
  strokeLine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 6, 255, 255, 255, 235);
}

// 金色买点圆点（折线末端）
fillCircle(220, 88, 16, 255, 214, 102);
fillCircle(220, 88, 9, 255, 214, 102);
fillCircle(220, 88, 4, 255, 235, 160);

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
// ---------- ICO 容器（Vista+ PNG 压缩格式） ----------
function encodeICO(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = 0; entry[1] = 0; // 256x256（0 表示 256）
  entry[2] = 0; entry[3] = 0; // palette / reserved
  entry.writeUInt16LE(1, 4);  // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12); // data offset
  return Buffer.concat([header, entry, png]);
}

const png = encodePNG(SIZE, SIZE, px);
const ico = encodeICO(png);

fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'electron', 'assets'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'build', 'icon.ico'), ico);
fs.writeFileSync(path.join(ROOT, 'electron', 'assets', 'icon.png'), png);
console.log('icon.ico:', ico.length, 'bytes');
console.log('icon.png:', png.length, 'bytes');
console.log('OK - 图标已生成');
