// Electron 主进程：在本进程内启动打包后的本地服务，然后打开窗口。
// 数据目录沿用服务端的平台标准位置逻辑，与源码版 / 启动器版完全一致。
const { app, BrowserWindow, Menu, Tray, dialog, nativeImage, shell } = require('electron');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const RELEASES_URL = 'https://github.com/alexyudragonsword-collab/my_days/releases/latest';

// ---- 桌面外壳偏好 ----
// 只存窗口/托盘等外壳行为，与业务数据完全分离（业务数据在 SQLite 数据目录中）。
const DEFAULT_PREFS = { minimizeToTray: false };

function prefsPath() {
  return path.join(app.getPath('userData'), 'desktop-prefs.json');
}

function readPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(fs.readFileSync(prefsPath(), 'utf8')) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function writePrefs(patch) {
  const next = { ...readPrefs(), ...patch };
  try {
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
    fs.writeFileSync(prefsPath(), JSON.stringify(next, null, 2));
  } catch {
    // 偏好写入失败不影响使用，下次启动回到默认值
  }
  return next;
}

function openAtLogin() {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}

function setOpenAtLogin(value) {
  try {
    app.setLoginItemSettings({ openAtLogin: value, openAsHidden: value && process.platform === 'darwin' });
  } catch {
    // 部分 Linux 桌面环境不支持，忽略
  }
}

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
let mainWindow = null;
let tray = null;
let quitting = false;

/** 退出前把尚未落盘的数据写入并做一次完整性检查 */
async function flushData() {
  try {
    if (baseUrl) await fetch(`${baseUrl}/api/save`, { method: 'POST', signal: AbortSignal.timeout(3000) });
  } catch { /* 保存失败不阻塞退出，WAL 也能保证已提交数据安全 */ }
}

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
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow = win;
  // 应用内的外部链接（发布链接、仓库链接）用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(baseUrl)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  // 开启“关闭窗口时保留在托盘”后，关闭按钮只隐藏窗口，服务继续在后台运行
  win.on('close', (e) => {
    if (!quitting && readPrefs().minimizeToTray) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  if (ok) {
    win.loadURL(baseUrl);
  } else {
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<h2>启动失败 / Failed to start</h2><p>请重启应用。Please restart the app.</p>')}`);
  }
}

function showWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

// ---- 托盘 ----
function trayImage() {
  const file = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  const image = nativeImage.createFromPath(path.join(__dirname, 'assets', file));
  if (process.platform === 'darwin') image.setTemplateImage(true);
  return image;
}

function refreshTrayMenu() {
  if (!tray) return;
  const prefs = readPrefs();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开个人工作台', click: showWindow },
    { type: 'separator' },
    {
      label: '关闭窗口时保留在托盘',
      type: 'checkbox',
      checked: prefs.minimizeToTray,
      click: (item) => {
        writePrefs({ minimizeToTray: item.checked });
        refreshTrayMenu();
      },
    },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: openAtLogin(),
      click: (item) => {
        setOpenAtLogin(item.checked);
        refreshTrayMenu();
      },
    },
    { type: 'separator' },
    { label: '检查更新…', click: () => checkForUpdates(true) },
    { label: '打开数据目录', click: () => { if (baseUrl) fetch(`${baseUrl}/api/system/open-data-dir`, { method: 'POST' }).catch(() => {}); } },
    { type: 'separator' },
    {
      label: '保存并退出',
      click: async () => {
        quitting = true;
        await flushData();
        app.quit();
      },
    },
  ]));
}

function createTray() {
  try {
    tray = new Tray(trayImage());
  } catch {
    // 无托盘的桌面环境（部分 Linux）下跳过
    return;
  }
  tray.setToolTip('个人工作台');
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
  refreshTrayMenu();
}

// ---- 自动更新（GitHub Releases） ----
let updater = null;
let updateChecking = false;

function getUpdater() {
  if (updater !== null) return updater;
  try {
    updater = require('electron-updater').autoUpdater;
  } catch {
    updater = false;
    return false;
  }
  updater.autoDownload = process.platform !== 'darwin';
  updater.autoInstallOnAppQuit = true;
  updater.on('update-available', (info) => {
    if (process.platform !== 'darwin') return;
    // 安装包未经 Apple 公证，macOS 无法自动替换，引导手动下载
    dialog.showMessageBox({
      type: 'info',
      message: `发现新版本 ${info?.version || ''}`,
      detail: 'macOS 版本未经过 Apple 公证，无法自动更新。点击“前往下载”打开发布页，手动下载新版安装包。',
      buttons: ['前往下载', '稍后'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) shell.openExternal(RELEASES_URL);
    });
  });
  updater.on('update-downloaded', (info) => {
    dialog.showMessageBox({
      type: 'info',
      message: `新版本 ${info?.version || ''} 已下载`,
      detail: '重启后即可使用新版本。你的数据不受影响。',
      buttons: ['立即重启', '下次启动时更新'],
      defaultId: 0,
      cancelId: 1,
    }).then(async ({ response }) => {
      if (response === 0) {
        quitting = true;
        await flushData();
        updater.quitAndInstall();
      }
    });
  });
  return updater;
}

/** @param manual 手动触发时即使没有更新也给出反馈 */
async function checkForUpdates(manual = false) {
  const up = getUpdater();
  if (!up || (!app.isPackaged && !manual)) return;
  if (!app.isPackaged) {
    if (manual) {
      dialog.showMessageBox({ type: 'info', message: '开发模式下不检查更新', buttons: ['好'] });
    }
    return;
  }
  if (updateChecking) return;
  updateChecking = true;
  try {
    const result = await up.checkForUpdates();
    if (manual && !result?.updateInfo) {
      dialog.showMessageBox({ type: 'info', message: '当前已是最新版本', buttons: ['好'] });
    } else if (manual && result?.updateInfo?.version === app.getVersion()) {
      dialog.showMessageBox({ type: 'info', message: `当前已是最新版本（${app.getVersion()}）`, buttons: ['好'] });
    }
  } catch (e) {
    if (manual) {
      dialog.showMessageBox({
        type: 'warning',
        message: '检查更新失败',
        detail: String(e?.message || e),
        buttons: ['好'],
      });
    }
  } finally {
    updateChecking = false;
  }
}

// 只允许一个实例：再次启动时激活已有窗口，避免同一数据库被两个进程同时写入
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(async () => {
    await createWindow();
    createTray();
    // 启动几秒后再检查更新，避免与首次加载抢带宽
    setTimeout(() => checkForUpdates(false), 5000);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });

  app.on('before-quit', () => { quitting = true; });

  // 关闭窗口时先做一次落盘检查点；开启托盘常驻后则保持运行
  app.on('window-all-closed', async () => {
    await flushData();
    if (readPrefs().minimizeToTray && tray) return;
    app.quit();
  });
}
