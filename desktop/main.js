// Electron 主进程：在本进程内启动打包后的本地服务，然后打开窗口。
// 数据目录沿用服务端的平台标准位置逻辑，与源码版 / 启动器版完全一致。
const { app, BrowserWindow, shell } = require('electron');
const net = require('node:net');
const path = require('node:path');

/** 找一个空闲端口，避免与源码版（5675）或其他程序冲突 */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitForHealth(baseUrl, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(500) });
      if (res.ok) return true;
    } catch { /* 服务尚未就绪 */ }
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

let baseUrl = null;

async function createWindow() {
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  process.env.MY_DAYS_PORT = String(port);
  process.env.MY_DAYS_MIGRATIONS_DIR = path.join(__dirname, 'bundle', 'migrations');
  process.env.MY_DAYS_WEB_DIR = path.join(__dirname, 'bundle', 'web');
  // 在主进程内直接启动服务（require 即监听）
  require('./bundle/server.cjs');

  const ok = await waitForHealth(baseUrl);
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  // 应用内的外部链接（发布链接、仓库链接）用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(baseUrl)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  if (ok) {
    win.loadURL(baseUrl);
  } else {
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<h2>启动失败 / Failed to start</h2><p>请重启应用。Please restart the app.</p>')}`);
  }
}

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// 关闭窗口时先做一次落盘检查点，再退出应用（服务随进程结束）
app.on('window-all-closed', async () => {
  try {
    if (baseUrl) await fetch(`${baseUrl}/api/save`, { method: 'POST', signal: AbortSignal.timeout(3000) });
  } catch { /* 保存失败不阻塞退出，WAL 也能保证已提交数据安全 */ }
  app.quit();
});
