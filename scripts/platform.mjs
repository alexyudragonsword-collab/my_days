import path from 'node:path';

/** 各操作系统的标准应用数据目录（与 server/src/platform.ts 保持一致） */
export function platformDataRoot(platform, env, home) {
  if (platform === 'win32') {
    return path.join(env.LOCALAPPDATA || env.APPDATA || home, 'MyDays');
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'MyDays');
  }
  return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'MyDays');
}

export function npmCommand(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function browserOpenCommand(platform, url) {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'start', '', url] };
  return { command: 'xdg-open', args: [url] };
}
