// 生成桌面版应用图标与托盘图标（无第三方依赖：手写 PNG 编码 + SDF 光栅化）。
// 运行：node scripts/make-icons.mjs
// 产物：desktop/build/icon.png（electron-builder 用它生成各平台图标）
//       desktop/assets/tray.png / tray@2x.png（Windows / Linux 托盘）
//       desktop/assets/trayTemplate.png / trayTemplate@2x.png（macOS 模板图，仅黑色 + 透明度）

import { deflateSync } from 'node:zlib';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- PNG 编码 ----
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array，长度 = size * size * 4 */
function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 形状（归一化坐标，均返回有符号距离，负值表示在形状内部） ----
function roundedRect(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2 - r;
  const hy = (y1 - y0) / 2 - r;
  const dx = Math.abs(px - cx) - hx;
  const dy = Math.abs(py - cy) - hy;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - r;
}

function capsule(px, py, ax, ay, bx, by, r) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy || 1;
  const tt = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  return Math.hypot(wx - vx * tt, wy - vy * tt) - r;
}

/** 把颜色按覆盖度混合到画布上 */
function blend(dst, i, color, coverage) {
  if (coverage <= 0) return;
  const a = coverage * (color[3] ?? 1);
  const inv = 1 - a;
  dst[i] = color[0] * a + dst[i] * inv;
  dst[i + 1] = color[1] * a + dst[i + 1] * inv;
  dst[i + 2] = color[2] * a + dst[i + 2] * inv;
  dst[i + 3] = a + dst[i + 3] * inv;
}

/**
 * 渲染图标。
 * @param size 输出边长
 * @param opts.background 是否绘制品牌色圆角底
 * @param opts.mono 是否输出纯黑（macOS 模板图要求）
 */
function render(size, opts = {}) {
  const SS = 3; // 超采样倍数
  const n = size * SS;
  const acc = new Float64Array(n * n * 4);

  const mono = !!opts.mono;
  const paper = [255, 255, 255, 1];
  const lineColor = [186, 201, 234, 1];
  const accent = [59, 110, 245, 1];
  const black = [0, 0, 0, 1];

  for (let y = 0; y < n; y++) {
    const v = (y + 0.5) / n;
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n;
      const i = (y * n + x) * 4;

      // macOS 模板图：只用黑色描边 + 一个勾，保证 16~22px 下依然清晰
      if (mono) {
        const outer = roundedRect(u, v, 0.16, 0.20, 0.84, 0.88, 0.12);
        const inner = roundedRect(u, v, 0.24, 0.28, 0.76, 0.80, 0.07);
        if (outer < 0 && inner > 0) blend(acc, i, black, 1);
        const clip = roundedRect(u, v, 0.38, 0.11, 0.62, 0.26, 0.05);
        if (clip < 0) blend(acc, i, black, 1);
        const a = capsule(u, v, 0.36, 0.55, 0.45, 0.65, 0.055);
        const b = capsule(u, v, 0.45, 0.65, 0.66, 0.40, 0.055);
        if (a < 0 || b < 0) blend(acc, i, black, 1);
        continue;
      }

      if (opts.background) {
        const d = roundedRect(u, v, 0.02, 0.02, 0.98, 0.98, 0.22);
        if (d < 0) {
          // 竖向渐变：顶部更亮
          const tG = v;
          blend(acc, i, [75 - 28 * tG, 123 - 33 * tG, 255 - 31 * tG, 1], 1);
        }
      }

      // 剪贴板主体
      const body = roundedRect(u, v, 0.235, 0.225, 0.765, 0.83, 0.07);
      if (body < 0) blend(acc, i, paper, 1);

      // 顶部夹子
      const clip = roundedRect(u, v, 0.40, 0.145, 0.60, 0.275, 0.045);
      if (clip < 0) blend(acc, i, opts.background ? [214, 226, 255, 1] : accent, 1);

      // 三行清单：前两行已勾选
      const rows = [0.42, 0.565, 0.71];
      for (let r = 0; r < rows.length; r++) {
        const cy = rows[r];
        if (r < 2) {
          // 勾号
          const a = capsule(u, v, 0.315, cy, 0.355, cy + 0.038, 0.022);
          const b = capsule(u, v, 0.355, cy + 0.038, 0.425, cy - 0.05, 0.022);
          if (a < 0 || b < 0) blend(acc, i, accent, 1);
        } else {
          const box = roundedRect(u, v, 0.302, cy - 0.045, 0.392, cy + 0.045, 0.018);
          const inner = roundedRect(u, v, 0.322, cy - 0.025, 0.372, cy + 0.025, 0.008);
          if (box < 0 && inner > 0) blend(acc, i, lineColor, 1);
        }
        const line = roundedRect(u, v, 0.45, cy - 0.024, 0.70, cy + 0.024, 0.024);
        if (line < 0) blend(acc, i, lineColor, 1);
      }
    }
  }

  // 下采样到目标尺寸
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * n + x * SS + sx) * 4;
          r += acc[i]; g += acc[i + 1]; b += acc[i + 2]; a += acc[i + 3];
        }
      }
      const count = SS * SS;
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / count);
      out[o + 1] = Math.round(g / count);
      out[o + 2] = Math.round(b / count);
      out[o + 3] = Math.round((a / count) * 255);
    }
  }
  return out;
}

function write(file, size, opts) {
  const target = path.join(ROOT, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, encodePng(size, render(size, opts)));
  console.log(`生成 ${file}（${size}×${size}）`);
}

write('desktop/build/icon.png', 1024, { background: true });
write('desktop/assets/tray.png', 32, { background: true });
write('desktop/assets/tray@2x.png', 64, { background: true });
write('desktop/assets/trayTemplate.png', 32, { mono: true });
write('desktop/assets/trayTemplate@2x.png', 64, { mono: true });
