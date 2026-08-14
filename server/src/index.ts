import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { ensureDailyAutoBackup } from './backup';
import { closeDb, DATA_DIR, getDb } from './db';
import { openDirCommand } from './platform';
import { api } from './routes';

const PORT = Number(process.env.MY_DAYS_PORT || 5675);
// 仅监听本机回环地址：局域网内其他设备不可访问
const HOST = '127.0.0.1';

const clientDist = path.resolve(__dirname, '../../client/dist');
const INSTANCE_ID = randomUUID();

/** 由构建产物的大小和修改时间生成构建标识，供启动器判断后台服务是否为当前版本 */
function buildId(): string {
  try {
    const server = fs.statSync(__filename);
    const web = fs.statSync(path.join(clientDist, 'index.html'));
    return `${server.size}-${Math.trunc(server.mtimeMs)}:${web.size}-${Math.trunc(web.mtimeMs)}`;
  } catch {
    return 'dev';
  }
}
const BUILD_ID = buildId();

const app = express();
app.use(express.json({ limit: '5mb' }));

// 阻止其他网站页面通过浏览器向本机服务发起跨站请求
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
    res.status(403).json({ error: '请求来源无效' });
    return;
  }
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'my-days', buildId: BUILD_ID, instanceId: INSTANCE_ID, pid: process.pid });
});

// 保存并退出：先落盘校验，成功后安全关闭服务
app.post('/api/system/exit', (_req, res) => {
  const db = getDb();
  db.pragma('wal_checkpoint(TRUNCATE)');
  const check = db.pragma('quick_check', { simple: true });
  if (check !== 'ok') {
    res.status(500).json({ ok: false, error: `数据完整性检查失败：${check}` });
    return;
  }
  res.json({ ok: true });
  setTimeout(() => {
    closeDb();
    cleanupPidFile();
    process.exit(0);
  }, 200);
});

app.post('/api/system/open-data-dir', (_req, res) => {
  const { command, args } = openDirCommand(DATA_DIR);
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => { /* 桌面环境不可用时忽略 */ });
  child.unref();
  res.json({ ok: true, dir: DATA_DIR });
});

app.use('/api', api);

// 统一错误处理：写入失败等异常必须以明确的失败状态返回
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

// 生产模式：托管前端构建产物
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const PID_FILE = path.join(DATA_DIR, 'my_days.pid');

function writePidFile(): void {
  try {
    fs.writeFileSync(
      PID_FILE,
      JSON.stringify({ pid: process.pid, serverFile: __filename, buildId: BUILD_ID, instanceId: INSTANCE_ID, createdAt: new Date().toISOString() }, null, 2)
    );
  } catch {
    // PID 文件仅用于启动器识别，写入失败不影响运行
  }
}

function cleanupPidFile(): void {
  try {
    const record = JSON.parse(fs.readFileSync(PID_FILE, 'utf8'));
    if (record?.pid === process.pid) fs.unlinkSync(PID_FILE);
  } catch {
    // 不存在或已被新实例覆盖时跳过
  }
}

getDb();
ensureDailyAutoBackup();
// 每小时检查一次当天是否已有自动备份（跨天长驻时生效）
setInterval(ensureDailyAutoBackup, 60 * 60 * 1000);

app.listen(PORT, HOST, () => {
  writePidFile();
  console.log(`个人工作台已启动: http://${HOST}:${PORT}`);
  console.log(`数据目录: ${DATA_DIR}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    closeDb();
    cleanupPidFile();
    process.exit(0);
  });
}
