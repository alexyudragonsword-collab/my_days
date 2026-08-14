import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const DATA_DIR = process.env.MY_DAYS_DATA_DIR || path.join(os.homedir(), '.my_days');
export const DB_DIR = path.join(DATA_DIR, 'data');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const DB_PATH = path.join(DB_DIR, 'my_days.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  converted_type TEXT,
  converted_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS plan_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  start_time TEXT,
  duration_min INTEGER,
  priority TEXT NOT NULL DEFAULT '中',
  status TEXT NOT NULL DEFAULT '未开始',
  source_module TEXT,
  source_id INTEGER,
  note TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS daily_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS media_contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  platform TEXT,
  form TEXT,
  stage TEXT NOT NULL DEFAULT '灵感',
  planned_date TEXT,
  actual_date TEXT,
  notes TEXT,
  asset_path TEXT,
  publish_link TEXT,
  views INTEGER,
  likes INTEGER,
  comments INTEGER,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS dev_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  description TEXT,
  status TEXT NOT NULL DEFAULT '进行中',
  local_path TEXT,
  repo_link TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS dev_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  name TEXT NOT NULL DEFAULT '',
  target_date TEXT,
  status TEXT NOT NULL DEFAULT '未开始',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS dev_work_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  milestone_id INTEGER,
  title TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '功能',
  priority TEXT NOT NULL DEFAULT '中',
  status TEXT NOT NULL DEFAULT '待处理',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS dev_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  date TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS consult_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  note TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS consult_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  name TEXT NOT NULL DEFAULT '',
  requirement TEXT,
  status TEXT NOT NULL DEFAULT '进行中',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS consult_comms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  time TEXT,
  form TEXT,
  notes TEXT,
  duration_min INTEGER,
  fee_amount REAL,
  settled INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS consult_deliverables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  name TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  status TEXT NOT NULL DEFAULT '进行中',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS consult_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  next_time TEXT,
  content TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS fitness_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  weekdays TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS fitness_template_exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER,
  name TEXT NOT NULL DEFAULT '',
  target_sets INTEGER,
  target_reps INTEGER,
  target_weight REAL,
  rest_sec INTEGER,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS fitness_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  template_id INTEGER,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '计划中',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS fitness_session_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  exercise_name TEXT NOT NULL DEFAULT '',
  set_no INTEGER NOT NULL DEFAULT 1,
  target_reps INTEGER,
  target_weight REAL,
  reps INTEGER,
  weight REAL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS body_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  weight REAL,
  measurements TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS foods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  portion TEXT,
  calories REAL,
  protein REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  meal_type TEXT NOT NULL DEFAULT '早餐',
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS meal_foods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meal_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'actual',
  food_name TEXT NOT NULL DEFAULT '',
  portion TEXT,
  calories REAL,
  protein REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  platform TEXT,
  status TEXT NOT NULL DEFAULT '想玩',
  progress TEXT,
  next_goal TEXT,
  notes TEXT,
  rating INTEGER,
  completed_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS game_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER,
  start_time TEXT,
  end_time TEXT,
  duration_min INTEGER,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_plan_items_date ON plan_items(date);
CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);
CREATE INDEX IF NOT EXISTS idx_fitness_sessions_date ON fitness_sessions(date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_reviews_date ON daily_reviews(date) WHERE deleted_at IS NULL;
`;

let db: Database.Database | null = null;

function open(): Database.Database {
  fs.mkdirSync(DB_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const d = new Database(DB_PATH);
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');
  d.pragma('busy_timeout = 5000');
  d.exec(SCHEMA);
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
