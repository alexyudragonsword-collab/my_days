import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** 各操作系统的标准应用数据目录 */
export function platformDataRoot(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): string {
  if (platform === 'win32') {
    return path.join(env.LOCALAPPDATA || env.APPDATA || home, 'MyDays');
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'MyDays');
  }
  return path.join(env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'MyDays');
}

/**
 * 解析数据根目录：
 * 1. MY_DAYS_DATA_DIR 环境变量优先；
 * 2. 旧版目录 ~/.my_days 已有数据文件时继续使用（不迁移、不复制已有数据）；
 * 3. 否则使用当前系统的标准应用数据目录。
 */
export function resolveDataRoot(): string {
  if (process.env.MY_DAYS_DATA_DIR) return process.env.MY_DAYS_DATA_DIR;
  const legacy = path.join(os.homedir(), '.my_days');
  if (fs.existsSync(path.join(legacy, 'data', 'my_days.db'))) return legacy;
  return platformDataRoot();
}

/** 用系统文件管理器打开目录的命令 */
export function openDirCommand(dir: string): { command: string; args: string[] } {
  if (process.platform === 'darwin') return { command: 'open', args: [dir] };
  if (process.platform === 'win32') return { command: 'explorer.exe', args: [dir] };
  return { command: 'xdg-open', args: [dir] };
}
