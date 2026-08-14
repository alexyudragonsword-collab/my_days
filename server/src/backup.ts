import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { BACKUP_DIR, DB_PATH, closeDb, getDb, reopenDb } from './db';

// 备份元数据（备注、长期保留标记）存放在主数据库之外的 manifest 中，
// 这样恢复备份覆盖主库时不会丢失备份列表信息。
const MANIFEST_PATH = path.join(BACKUP_DIR, 'manifest.json');

interface ManifestEntry {
  note?: string;
  keep?: boolean;
}
type Manifest = Record<string, ManifestEntry>;

export interface BackupInfo {
  file: string;
  type: 'auto' | 'manual' | 'safety';
  created_at: string;
  size: number;
  note: string;
  keep: boolean;
}

export interface BackupStatus {
  lastBackupAt: string | null;
  lastBackupType: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

const status: BackupStatus = { lastBackupAt: null, lastBackupType: null, lastError: null, lastErrorAt: null };

export function getBackupStatus(): BackupStatus {
  return status;
}

function readManifest(): Manifest {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeManifest(m: Manifest): void {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2));
}

function stampToIso(stamp: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(stamp);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

export function listBackups(): BackupInfo[] {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const manifest = readManifest();
  const out: BackupInfo[] = [];
  for (const file of fs.readdirSync(BACKUP_DIR)) {
    const m = /^(auto|manual|safety)-(\d{8}-\d{6})\.db$/.exec(file);
    if (!m) continue;
    let size = 0;
    try {
      size = fs.statSync(path.join(BACKUP_DIR, file)).size;
    } catch {
      continue;
    }
    out.push({
      file,
      type: m[1] as BackupInfo['type'],
      created_at: stampToIso(m[2]) || '',
      size,
      note: manifest[file]?.note || '',
      keep: !!manifest[file]?.keep,
    });
  }
  out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return out;
}

function timeStamp(d = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function localToday(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function createBackup(type: 'auto' | 'manual' | 'safety', note?: string): BackupInfo {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const db = getDb();
  db.pragma('wal_checkpoint(TRUNCATE)');
  let file = `${type}-${timeStamp()}.db`;
  let target = path.join(BACKUP_DIR, file);
  // 同一秒重复备份时避免覆盖
  let i = 1;
  while (fs.existsSync(target)) {
    file = `${type}-${timeStamp(new Date(Date.now() + i * 1000))}.db`;
    target = path.join(BACKUP_DIR, file);
    i++;
  }
  const tmp = target + '.tmp';
  try {
    // better-sqlite3 的在线备份是异步 API，这里用 VACUUM INTO 同步生成一致快照
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    fs.renameSync(tmp, target);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* 忽略清理失败 */ }
    status.lastError = e instanceof Error ? e.message : String(e);
    status.lastErrorAt = new Date().toISOString();
    throw e;
  }
  if (note) {
    const manifest = readManifest();
    manifest[file] = { ...manifest[file], note };
    writeManifest(manifest);
  }
  status.lastBackupAt = new Date().toISOString();
  status.lastBackupType = type;
  status.lastError = null;
  status.lastErrorAt = null;
  if (type === 'auto') cleanupAutoBackups();
  const size = fs.statSync(target).size;
  return { file, type, created_at: stampToIso(file.split('-').slice(1).join('-').replace('.db', '')) || '', size, note: note || '', keep: false };
}

export function updateBackupMeta(file: string, patch: { note?: string; keep?: boolean }): void {
  if (!fs.existsSync(path.join(BACKUP_DIR, file))) throw new Error('备份文件不存在');
  const manifest = readManifest();
  manifest[file] = { ...manifest[file], ...patch };
  writeManifest(manifest);
}

export function deleteBackup(file: string): void {
  const p = path.join(BACKUP_DIR, file);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  const manifest = readManifest();
  delete manifest[file];
  writeManifest(manifest);
}

const AUTO_KEEP_COUNT = 30;

/** 普通自动备份最多保留 30 份；标记长期保留的不清理 */
export function cleanupAutoBackups(): void {
  const autos = listBackups().filter((b) => b.type === 'auto' && !b.keep);
  for (const b of autos.slice(AUTO_KEEP_COUNT)) {
    try {
      deleteBackup(b.file);
    } catch {
      // 清理失败不影响主流程
    }
  }
}

/** 校验备份文件可读且结构有效 */
export function validateBackupFile(fullPath: string): { ok: boolean; error?: string } {
  if (!fs.existsSync(fullPath)) return { ok: false, error: '备份文件不存在' };
  let d: Database.Database | null = null;
  try {
    d = new Database(fullPath, { readonly: true });
    const check = d.pragma('integrity_check', { simple: true });
    if (check !== 'ok') return { ok: false, error: `完整性检查失败：${check}` };
    const tables = d
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: any) => r.name);
    for (const required of ['plan_items', 'settings', 'memos']) {
      if (!tables.includes(required)) return { ok: false, error: `备份缺少核心数据表 ${required}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    try { d?.close(); } catch { /* 忽略 */ }
  }
}

/** 恢复备份：校验 → 生成当前数据安全备份 → 覆盖主库 → 重开连接 */
export function restoreBackup(file: string): { safetyBackup: string } {
  const source = path.join(BACKUP_DIR, file);
  const valid = validateBackupFile(source);
  if (!valid.ok) throw new Error(`备份无效，已取消恢复：${valid.error}`);
  const safety = createBackup('safety', `恢复 ${file} 前的自动安全备份`);
  closeDb();
  try {
    fs.copyFileSync(source, DB_PATH);
    for (const suffix of ['-wal', '-shm']) {
      try { fs.unlinkSync(DB_PATH + suffix); } catch { /* 不存在则忽略 */ }
    }
  } finally {
    reopenDb();
  }
  return { safetyBackup: safety.file };
}

/** 当天没有有效自动备份时创建一份 */
export function ensureDailyAutoBackup(): void {
  const today = localToday();
  const hasToday = listBackups().some((b) => b.type === 'auto' && b.created_at.startsWith(today));
  if (hasToday) return;
  try {
    createBackup('auto');
  } catch (e) {
    // createBackup 已记录失败状态，供状态栏展示
    console.error('自动备份失败:', e);
  }
}
