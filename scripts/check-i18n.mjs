// 检查 i18n 词典完整性：客户端每个 t('中文…') 调用都应在 DICT 中有英文译文。
// 运行：node scripts/check-i18n.mjs（已接入 npm run verify）
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'client', 'src');
const I18N_FILE = path.join(SRC, 'i18n.tsx');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const i18nSource = fs.readFileSync(I18N_FILE, 'utf8');
const dictBody = i18nSource.slice(i18nSource.indexOf('const DICT'));
const dictKeys = new Set([...dictBody.matchAll(/^\s{2}'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1]));

const hasChinese = (s) => /[一-龥]/.test(s);
const missing = new Map();

for (const file of walk(SRC)) {
  if (file === I18N_FILE) continue;
  const source = fs.readFileSync(file, 'utf8');
  // 只匹配字面量参数的 t('…')，变量参数（如 t(String(x))）在运行时回退为原文
  for (const match of source.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) {
    const key = match[1];
    if (!hasChinese(key) || dictKeys.has(key)) continue;
    if (!missing.has(key)) missing.set(key, path.relative(ROOT, file));
  }
}

if (missing.size > 0) {
  console.error(`i18n 词典缺少 ${missing.size} 条英文译文（client/src/i18n.tsx 的 DICT）：`);
  for (const [key, file] of missing) console.error(`  ${file}: '${key}'`);
  console.error('\n业务枚举值等以中文入库的文案也需要在 DICT 中补译，只在显示层翻译。');
  process.exit(1);
}

console.log(`i18n 词典完整：${dictKeys.size} 条译文覆盖全部带中文的 t() 调用`);
