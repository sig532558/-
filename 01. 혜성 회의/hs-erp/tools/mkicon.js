// 홈 화면 어플 아이콘 만들기 (PNG) — node tools/mkicon.js
//  · 남색 바탕에 금색 막대 세 개 (일일 보고 느낌) · 안드로이드 적응형 아이콘을 위해 네모를 꽉 채운다
const fs = require('fs'); const zlib = require('zlib'); const path = require('path');
const NAVY = [15, 30, 61], GOLD = [201, 162, 39], WHITE = [255, 255, 255];
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td)); return Buffer.concat([len, td, crc]); };
function png(size) {
  const px = Buffer.alloc(size * size * 3);
  const set = (x, y, c) => { const i = (y * size + x) * 3; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, NAVY);
  // 가운데 막대 세 개 + 점
  const u = size / 16; const bars = [[4, 5.5, 8], [4, 8, 8], [4, 10.5, 5.6]];
  bars.forEach(([bx, by, bw], i) => {
    const x0 = Math.round(bx * u), x1 = Math.round((bx + bw) * u), y0 = Math.round(by * u), y1 = Math.round((by + 1.1) * u);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, i === 2 ? GOLD : WHITE);
  });
  const dx = Math.round(10.6 * u), dy = Math.round(5.2 * u), dr = Math.round(1.1 * u);
  for (let y = dy - dr; y <= dy + dr; y++) for (let x = dx - dr; x <= dx + dr; x++) if ((x - dx) ** 2 + (y - dy) ** 2 <= dr * dr && x >= 0 && y >= 0 && x < size && y < size) set(x, y, GOLD);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 3 + 1)] = 0; px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; // 8bit RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const out = path.join(__dirname, '..', 'site');
[180, 192, 512].forEach((s) => { const f = path.join(out, 'icon-' + s + '.png'); fs.writeFileSync(f, png(s)); console.log('icon-' + s + '.png', fs.statSync(f).size, 'bytes'); });
