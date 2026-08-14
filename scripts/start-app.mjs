// 一键启动器：双击启动文件或运行 `npm run app:start` 即可使用。
// 职责：检测已运行的服务并复用；旧版本服务先安全退出；首次启动自动构建；
// 后台方式启动服务并等待健康检查通过；自动打开浏览器。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserOpenCommand, npmCommand, platformDataRoot } from './platform.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.MY_DAYS_PORT || 5675);
const baseUrl = `http://127.0.0.1:${port}`;
const dataRoot = path.resolve(process.env.MY_DAYS_DATA_DIR || defaultDataRoot());
const logsDir = path.join(dataRoot, 'logs');
const pidFile = path.join(dataRoot, 'my_days.pid');
const lockFile = path.join(dataRoot, 'my_days.starting');
const serverFile = path.join(projectRoot, 'server', 'dist', 'index.js');
const webFile = path.join(projectRoot, 'client', 'dist', 'index.html');

fs.mkdirSync(logsDir, { recursive: true });

if (await reuseRunningService()) process.exit(0);

const lock = acquireLock();
if (lock === null) {
  // 另一个启动过程刚完成，直接复用
  if (await reuseRunningService()) process.exit(0);
  console.error('另一个启动过程仍在进行，请稍后再试。');
  process.exit(1);
}
process.once('exit', () => {
  try { fs.closeSync(lock); } catch { /* 可能已关闭 */ }
  try { fs.unlinkSync(lockFile); } catch { /* 可能已删除 */ }
});

// 拿到锁后再查一次，避免两次双击同时通过健康检查
if (await reuseRunningService()) process.exit(0);

const stale = await healthStatus();
if (stale) {
  console.log('检测到旧版本后台服务，正在安全保存并退出旧服务……');
  await stopStaleService(stale);
}

if (!fs.existsSync(serverFile) || !fs.existsSync(webFile)) {
  console.log('首次启动需要构建本地运行文件，可能需要几分钟……');
  const build = spawnSync(npmCommand(), ['run', 'build'], { cwd: projectRoot, stdio: 'inherit', env: process.env });
  if (build.status !== 0) {
    console.error('构建失败，请确认已运行 npm install。');
    process.exit(build.status ?? 1);
  }
}

const expectedBuild = currentBuildId();
const logFile = path.join(logsDir, 'app.log');
const logFd = fs.openSync(logFile, 'a');
const child = spawn(process.execPath, [serverFile], {
  cwd: projectRoot,
  detached: true,
  env: { ...process.env, NODE_ENV: 'production', MY_DAYS_PORT: String(port), MY_DAYS_DATA_DIR: dataRoot },
  stdio: ['ignore', logFd, logFd],
});
child.unref();
fs.closeSync(logFd);

for (let attempt = 0; attempt < 80; attempt += 1) {
  const status = await healthStatus();
  if (status && status.buildId === expectedBuild) {
    openBrowser();
    console.log(`个人工作台已启动：${baseUrl}`);
    console.log(`数据目录：${dataRoot}`);
    process.exit(0);
  }
  await sleep(250);
}
try { process.kill(child.pid, 'SIGTERM'); } catch { /* 可能已退出 */ }
console.error(`启动失败，请查看日志：${logFile}`);
process.exit(1);

// ---- 工具函数 ----

async function healthStatus() {
  try {
    const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.status === 'ok' && data?.app === 'my-days' ? data : null;
  } catch {
    return null;
  }
}

async function reuseRunningService() {
  const status = await healthStatus();
  const build = currentBuildId();
  if (status && build && status.buildId === build) {
    openBrowser();
    console.log(`个人工作台已经在运行：${baseUrl}`);
    return true;
  }
  return false;
}

function currentBuildId() {
  try {
    const server = fs.statSync(serverFile);
    const web = fs.statSync(webFile);
    return `${server.size}-${Math.trunc(server.mtimeMs)}:${web.size}-${Math.trunc(web.mtimeMs)}`;
  } catch {
    return null;
  }
}

/** 只结束能确认是本应用的旧服务；身份不明的端口占用者绝不误杀 */
async function stopStaleService(status) {
  try {
    const response = await fetch(`${baseUrl}/api/system/exit`, { method: 'POST', signal: AbortSignal.timeout(3000) });
    if (response.ok && (await waitForStop())) return;
  } catch { /* 旧服务无该接口或已退出时走 PID 路径 */ }

  const record = readPidRecord();
  const verified = record
    && Number.isSafeInteger(record.pid) && record.pid > 1
    && (record.instanceId === status.instanceId || processCommandMatches(record.pid));
  if (!verified) {
    console.error(`端口 ${port} 上存在无法确认身份的服务，为保护其他程序未做处理。请手动释放端口后重试。`);
    process.exit(1);
  }
  try { process.kill(record.pid, 'SIGTERM'); } catch (error) { if (error?.code !== 'ESRCH') throw error; }
  if (!(await waitForStop())) {
    console.error('旧版后台服务未能退出，请稍后重试。');
    process.exit(1);
  }
}

function readPidRecord() {
  try { return JSON.parse(fs.readFileSync(pidFile, 'utf8')); } catch { return null; }
}

function processCommandMatches(pid) {
  const expected = serverFile.replaceAll('\\', '/').toLowerCase();
  let commandLine = '';
  if (process.platform === 'win32') {
    const result = spawnSync('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`],
      { encoding: 'utf8', windowsHide: true });
    commandLine = result.status === 0 ? result.stdout : '';
  } else {
    const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
    commandLine = result.status === 0 ? result.stdout : '';
  }
  return commandLine.replaceAll('\\', '/').toLowerCase().includes(expected);
}

async function waitForStop() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!(await healthStatus())) return true;
    await sleep(100);
  }
  return false;
}

function acquireLock() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      return fd;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        // 超过 5 分钟的锁视为上次异常退出的残留
        if (Date.now() - fs.statSync(lockFile).mtimeMs > 5 * 60_000) {
          fs.unlinkSync(lockFile);
          continue;
        }
      } catch (statError) {
        if (statError?.code !== 'ENOENT') throw statError;
        continue;
      }
      return null;
    }
  }
  return null;
}

function openBrowser() {
  if (process.env.MY_DAYS_NO_OPEN === '1') return;
  const { command, args } = browserOpenCommand(process.platform, baseUrl);
  const opener = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
  opener.on('error', () => { /* 无桌面环境时忽略 */ });
  opener.unref();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultDataRoot() {
  const legacy = path.join(os.homedir(), '.my_days');
  if (fs.existsSync(path.join(legacy, 'data', 'my_days.db'))) return legacy;
  return platformDataRoot(process.platform, process.env, os.homedir());
}
