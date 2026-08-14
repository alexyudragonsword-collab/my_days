import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDataRoot } from './platform';

export const DATA_DIR = resolveDataRoot();
export const DB_DIR = path.join(DATA_DIR, 'data');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const DB_PATH = path.join(DB_DIR, 'my_days.db');

// 迁移文件目录：dist 编译产物位于 server/dist/，源码位于 server/src/，二者相对位置一致
const MIGRATIONS_DIR = process.env.MY_DAYS_MIGRATIONS_DIR || path.resolve(__dirname, '../migrations');

/** 按文件名顺序执行尚未应用的 SQL 迁移，每个迁移在独立事务中执行 */
function migrate(d: Database.Database): void {
  d.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const applied = d.prepare('SELECT 1 FROM schema_migrations WHERE version = ?');
  const record = d.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)');
  for (const file of files) {
    if (applied.get(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    d.transaction(() => {
      d.exec(sql);
      record.run(file, new Date().toISOString());
    })();
  }
}

let db: Database.Database | null = null;

function open(): Database.Database {
  fs.mkdirSync(DB_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const d = new Database(DB_PATH);
  d.pragma('journal_mode = WAL');
  d.pragma('synchronous = FULL');
  d.pragma('foreign_keys = ON');
  d.pragma('busy_timeout = 5000');
  migrate(d);
  d.pragma('optimize');
  return d;
}

export function getDb(): Database.Database {
  if (!db) db = open();
  return db;
}

/** 恢复备份时使用：checkpoint 并关闭当前连接 */
export function closeDb(): void {
  if (db) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // 关闭前的 checkpoint 失败不阻止关闭
    }
    db.close();
    db = null;
  }
}

export function reopenDb(): Database.Database {
  closeDb();
  return getDb();
}

export function now(): string {
  return new Date().toISOString();
}
