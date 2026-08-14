// 生成桌面版所需的自包含资源：
// - 服务端打包为单文件 desktop/bundle/server.cjs（better-sqlite3 除外，由 electron-builder 重建）
// - 前端构建产物复制到 desktop/bundle/web
// - 数据库迁移复制到 desktop/bundle/migrations
// 运行前需要先执行 npm run build（生成 client/dist）。
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundleDir = path.join(root, 'desktop', 'bundle');

fs.rmSync(bundleDir, { recursive: true, force: true });
fs.mkdirSync(bundleDir, { recursive: true });

await build({
  entryPoints: [path.join(root, 'server', 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['better-sqlite3'],
  outfile: path.join(bundleDir, 'server.cjs'),
  logLevel: 'info',
});

const webSrc = path.join(root, 'client', 'dist');
if (!fs.existsSync(path.join(webSrc, 'index.html'))) {
  console.error('client/dist 不存在，请先运行 npm run build');
  process.exit(1);
}
fs.cpSync(webSrc, path.join(bundleDir, 'web'), { recursive: true });
fs.cpSync(path.join(root, 'server', 'migrations'), path.join(bundleDir, 'migrations'), { recursive: true });

console.log('桌面资源已生成:', bundleDir);
