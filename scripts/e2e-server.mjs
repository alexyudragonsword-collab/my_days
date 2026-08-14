// 端到端测试专用启动脚本：每次用全新的临时数据目录启动服务，保证测试可重复。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(projectRoot, '.e2e-data');

fs.rmSync(dataDir, { recursive: true, force: true });
process.env.MY_DAYS_DATA_DIR = dataDir;
process.env.MY_DAYS_PORT = process.env.MY_DAYS_PORT || '5899';

await import(path.join(projectRoot, 'server', 'dist', 'index.js'));
