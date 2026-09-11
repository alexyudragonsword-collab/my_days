import express, { Router } from 'express';
import * as fs from 'fs';
import JSZip from 'jszip';
import { createBackup, deleteBackup, getBackupStatus, listBackups, localToday, restoreBackup, updateBackupMeta } from './backup';
import { DB_PATH, getDb, now } from './db';
import { codedError } from './errors';
import { SOURCE_TABLES, TABLES, tableByName } from './tables';

export const api = Router();

function pickColumns(table: string, body: Record<string, unknown>): Record<string, unknown> {
  const def = tableByName.get(table)!;
  const out: Record<string, unknown> = {};
  for (const col of def.columns) {
    if (col in body) out[col] = body[col];
  }
  return out;
}

/** 为带来源关联的计划事项解析来源记录的实时标题与存活状态 */
function resolveSource(row: any): any {
  if (!row || !row.source_module || !row.source_id) return row;
  const table = SOURCE_TABLES[row.source_module];
  if (!table) return row;
  const def = tableByName.get(table);
  if (!def) return row;
  const src = getDb()
    .prepare(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`)
    .get(row.source_id) as any;
  return {
    ...row,
    source_title: src ? String(src[def.titleField] ?? '') : null,
    source_exists: !!src,
  };
}

// ---- 设置（key/value） ----
api.get('/settings', (_req, res) => {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as any[];
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      out[r.key] = r.value;
    }
  }
  res.json(out);
});

api.put('/settings', (req, res) => {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction((entries: [string, unknown][]) => {
    for (const [k, v] of entries) stmt.run(k, JSON.stringify(v));
  });
  tx(Object.entries(req.body || {}));
  res.json({ ok: true });
});

// ---- 状态 ----
api.get('/status', (_req, res) => {
  let file: { path: string; size: number; mtime: string } | null = null;
  try {
    const st = fs.statSync(DB_PATH);
    file = { path: DB_PATH, size: st.size, mtime: st.mtime.toISOString() };
  } catch {
    file = null;
  }
  res.json({ dataFile: file, backup: getBackupStatus() });
});

// ---- 手动保存：落盘 checkpoint + 完整性检查 ----
api.post('/save', (_req, res) => {
  const db = getDb();
  db.pragma('wal_checkpoint(TRUNCATE)');
  const check = db.pragma('quick_check', { simple: true });
  if (check !== 'ok') {
    res.status(500).json({ ok: false, error: `数据完整性检查失败：${check}`, code: 'INTEGRITY_FAIL', detail: String(check) });
    return;
  }
  res.json({ ok: true, checkedAt: now() });
});

// ---- 全局搜索 ----
// trigram 分词器按三字符片段建索引，因此不足 3 个字符的关键词走 LIKE 兜底。
const FTS_MIN_LENGTH = 3;
const PER_TABLE_LIMIT = 20;

/** 用 FTS5 索引检索候选记录，按表分组返回 id（软删除过滤在取行时完成） */
function ftsCandidates(q: string): Map<string, number[]> {
  const phrase = '"' + q.replace(/"/g, '""') + '"';
  const rows = getDb()
    .prepare('SELECT table_name AS tbl, row_id AS id FROM search_fts WHERE search_fts MATCH ? ORDER BY rank LIMIT 500')
    .all(phrase) as { tbl: string; id: number }[];
  const byTable = new Map<string, number[]>();
  for (const r of rows) {
    const list = byTable.get(r.tbl);
    if (!list) byTable.set(r.tbl, [r.id]);
    else if (list.length < PER_TABLE_LIMIT) list.push(r.id);
  }
  return byTable;
}

api.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.json({ groups: [], mode: 'none' });
    return;
  }
  const db = getDb();
  const useFts = Array.from(q).length >= FTS_MIN_LENGTH;
  const candidates = useFts ? ftsCandidates(q) : null;
  const like = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
  const groups: { module: string; moduleLabel: string; results: any[] }[] = [];
  for (const def of TABLES) {
    if (def.searchFields.length === 0) continue;
    let rows: any[];
    if (candidates) {
      const ids = candidates.get(def.name);
      if (!ids || ids.length === 0) continue;
      rows = db
        .prepare(`SELECT * FROM ${def.name} WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(', ')})
          ORDER BY updated_at DESC`)
        .all(...ids) as any[];
    } else {
      const where = def.searchFields.map((f) => `${f} LIKE ? ESCAPE '\\'`).join(' OR ');
      rows = db
        .prepare(`SELECT * FROM ${def.name} WHERE deleted_at IS NULL AND (${where}) ORDER BY updated_at DESC LIMIT ${PER_TABLE_LIMIT}`)
        .all(...def.searchFields.map(() => like)) as any[];
    }
    if (rows.length === 0) continue;
    let group = groups.find((g) => g.module === def.module);
    if (!group) {
      group = { module: def.module, moduleLabel: def.moduleLabel, results: [] };
      groups.push(group);
    }
    for (const r of rows) {
      group.results.push({
        table: def.name,
        label: def.label,
        id: r.id,
        title: String(r[def.titleField] ?? '').slice(0, 80) || '（无标题）',
      });
    }
  }
  res.json({ groups, mode: useFts ? 'fts' : 'like' });
});

// ---- 首页“需要关注”：服务端聚合，避免客户端多查询拼装 ----
export interface AttentionItem {
  key: string;
  table: string;
  id: number;
  title: string;
  /** 原因代码，由客户端按当前语言渲染文案 */
  reason: string;
  args: string[];
  level: 'warn' | 'danger';
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return localToday(d);
}

api.get('/home/attention', (req, res) => {
  // 客户端传入本机当天日期；缺省时退回服务端本地日期
  const raw = String(req.query.today || '');
  const today = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : localToday();
  const db = getDb();
  const items: AttentionItem[] = [];

  // 逾期未完成的计划事项（限定 90 天窗口）
  const overdue = db
    .prepare(`SELECT * FROM plan_items
      WHERE deleted_at IS NULL AND date >= ? AND date <= ? AND status IN ('未开始', '进行中')
      ORDER BY date DESC LIMIT 50`)
    .all(shiftDate(today, -90), shiftDate(today, -1)) as any[];
  for (const r of overdue) {
    const row = resolveSource(r);
    items.push({
      key: 'p' + r.id, table: 'plan_items', id: r.id,
      title: String(row.source_title ?? r.title ?? ''),
      reason: 'PLAN_OVERDUE', args: [String(r.date)], level: 'danger',
    });
  }

  // 到期或临近的客户跟进
  const followups = db
    .prepare(`SELECT * FROM consult_followups
      WHERE deleted_at IS NULL AND done = 0 AND next_time IS NOT NULL AND next_time != ''
        AND substr(next_time, 1, 10) <= ?
      ORDER BY next_time LIMIT 50`)
    .all(shiftDate(today, 2)) as any[];
  for (const f of followups) {
    const at = String(f.next_time).slice(0, 10);
    items.push({
      key: 'f' + f.id, table: 'consult_followups', id: f.id,
      title: String(f.content || ''),
      reason: at <= today ? 'FOLLOWUP_DUE' : 'FOLLOWUP_SOON', args: [at],
      level: at <= today ? 'danger' : 'warn',
    });
  }

  // 到期或临近的交付物
  const deliverables = db
    .prepare(`SELECT * FROM consult_deliverables
      WHERE deleted_at IS NULL AND status != '已完成' AND due_date IS NOT NULL AND due_date != '' AND due_date <= ?
      ORDER BY due_date LIMIT 50`)
    .all(shiftDate(today, 3)) as any[];
  for (const d of deliverables) {
    const due = String(d.due_date);
    items.push({
      key: 'd' + d.id, table: 'consult_deliverables', id: d.id,
      title: String(d.name || ''),
      reason: due < today ? 'DELIVERABLE_OVERDUE' : 'DELIVERABLE_DUE', args: [due],
      level: due <= today ? 'danger' : 'warn',
    });
  }

  // 今天安排但未完成的训练
  const sessions = db
    .prepare(`SELECT * FROM fitness_sessions WHERE deleted_at IS NULL AND date = ? AND status != '已完成' LIMIT 20`)
    .all(today) as any[];
  for (const s of sessions) {
    items.push({
      key: 's' + s.id, table: 'fitness_sessions', id: s.id,
      title: String(s.name || ''), reason: 'FITNESS_PENDING', args: [], level: 'warn',
    });
  }

  // 计划发布日期已到但未发布的内容
  const media = db
    .prepare(`SELECT * FROM media_contents
      WHERE deleted_at IS NULL AND archived = 0 AND stage != '已发布'
        AND planned_date IS NOT NULL AND planned_date != '' AND planned_date <= ?
      ORDER BY planned_date LIMIT 50`)
    .all(today) as any[];
  for (const m of media) {
    items.push({
      key: 'm' + m.id, table: 'media_contents', id: m.id,
      title: String(m.title || ''), reason: 'MEDIA_PLANNED_DUE', args: [String(m.planned_date)], level: 'warn',
    });
  }

  res.json({ items, today });
});

// ---- 周报 / 月报：按日期区间跨模块汇总 ----
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

api.get('/report', (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    throw codedError('统计区间无效', 'BAD_REQUEST', `${from} ~ ${to}`);
  }
  const db = getDb();
  const one = <T>(sql: string, ...params: unknown[]): T => db.prepare(sql).get(...params) as T;

  // 计划完成情况
  const planRows = db
    .prepare(`SELECT status, count(*) AS count, sum(coalesce(duration_min, 0)) AS minutes
      FROM plan_items WHERE deleted_at IS NULL AND date >= ? AND date <= ? GROUP BY status`)
    .all(from, to) as { status: string; count: number; minutes: number }[];
  const byStatus: Record<string, { count: number; minutes: number }> = {};
  for (const r of planRows) byStatus[r.status] = { count: r.count, minutes: r.minutes || 0 };
  const pick = (s: string) => byStatus[s]?.count || 0;
  // 完成率的分母排除已取消/已延期：那两类不代表“没做完”
  const effective = pick('未开始') + pick('进行中') + pick('已完成');
  const plan = {
    total: planRows.reduce((s, r) => s + r.count, 0),
    done: pick('已完成'),
    pending: pick('未开始') + pick('进行中'),
    cancelled: pick('已取消'),
    postponed: pick('已延期'),
    rate: effective ? Math.round((pick('已完成') / effective) * 100) : 0,
    plannedMinutes: planRows.reduce((s, r) => s + (r.minutes || 0), 0),
    doneMinutes: byStatus['已完成']?.minutes || 0,
  };

  // 每日完成情况（供柱状图）
  const daily = db
    .prepare(`SELECT date,
        sum(CASE WHEN status = '已完成' THEN 1 ELSE 0 END) AS done,
        sum(CASE WHEN status IN ('未开始', '进行中', '已完成') THEN 1 ELSE 0 END) AS total
      FROM plan_items WHERE deleted_at IS NULL AND date >= ? AND date <= ?
      GROUP BY date ORDER BY date`)
    .all(from, to) as { date: string; done: number; total: number }[];

  const games = one<{ minutes: number; sessions: number }>(
    `SELECT coalesce(sum(duration_min), 0) AS minutes, count(*) AS sessions FROM game_sessions
     WHERE deleted_at IS NULL AND substr(start_time, 1, 10) >= ? AND substr(start_time, 1, 10) <= ?`, from, to);

  const consult = one<{ minutes: number; comms: number; fee: number; settledFee: number }>(
    `SELECT coalesce(sum(duration_min), 0) AS minutes, count(*) AS comms,
       coalesce(sum(fee_amount), 0) AS fee,
       coalesce(sum(CASE WHEN settled = 1 THEN fee_amount ELSE 0 END), 0) AS settledFee
     FROM consult_comms
     WHERE deleted_at IS NULL AND substr(time, 1, 10) >= ? AND substr(time, 1, 10) <= ?`, from, to);

  const fitness = one<{ sessions: number; completed: number }>(
    `SELECT count(*) AS sessions, sum(CASE WHEN status = '已完成' THEN 1 ELSE 0 END) AS completed
     FROM fitness_sessions WHERE deleted_at IS NULL AND date >= ? AND date <= ?`, from, to);
  const volume = one<{ sets: number; volume: number }>(
    `SELECT count(*) AS sets, coalesce(sum(coalesce(ss.reps, 0) * coalesce(ss.weight, 0)), 0) AS volume
     FROM fitness_session_sets ss JOIN fitness_sessions s ON s.id = ss.session_id
     WHERE ss.deleted_at IS NULL AND s.deleted_at IS NULL AND ss.done = 1 AND s.date >= ? AND s.date <= ?`, from, to);

  const media = one<{ published: number }>(
    `SELECT count(*) AS published FROM media_contents
     WHERE deleted_at IS NULL AND stage = '已发布' AND actual_date >= ? AND actual_date <= ?`, from, to);

  const dev = one<{ logs: number }>(
    `SELECT count(*) AS logs FROM dev_logs WHERE deleted_at IS NULL AND date >= ? AND date <= ?`, from, to);
  // 工作项没有完成时间字段，按最近更新时间近似统计（界面标注“按最近更新”）
  const devItems = one<{ itemsDone: number }>(
    `SELECT count(*) AS itemsDone FROM dev_work_items
     WHERE deleted_at IS NULL AND status = '已完成' AND substr(updated_at, 1, 10) >= ? AND substr(updated_at, 1, 10) <= ?`, from, to);

  const diet = one<{ days: number; calories: number; protein: number }>(
    `SELECT count(DISTINCT m.date) AS days,
       coalesce(sum(mf.calories), 0) AS calories, coalesce(sum(mf.protein), 0) AS protein
     FROM meal_foods mf JOIN meals m ON m.id = mf.meal_id
     WHERE mf.deleted_at IS NULL AND m.deleted_at IS NULL AND mf.kind = 'actual' AND m.date >= ? AND m.date <= ?`, from, to);

  const weights = db
    .prepare(`SELECT date, weight FROM body_metrics
      WHERE deleted_at IS NULL AND weight IS NOT NULL AND date >= ? AND date <= ? ORDER BY date`)
    .all(from, to) as { date: string; weight: number }[];

  res.json({
    from, to, plan, daily,
    modules: {
      games: { minutes: games.minutes, sessions: games.sessions },
      consult: { minutes: consult.minutes, comms: consult.comms, fee: consult.fee, settledFee: consult.settledFee },
      fitness: { sessions: fitness.sessions, completed: fitness.completed || 0, sets: volume.sets, volume: volume.volume },
      media: { published: media.published },
      dev: { logs: dev.logs, itemsDone: devItems.itemsDone },
      diet: {
        days: diet.days,
        avgCalories: diet.days ? Math.round(diet.calories / diet.days) : 0,
        avgProtein: diet.days ? Math.round(diet.protein / diet.days) : 0,
      },
      body: weights.length
        ? { first: weights[0].weight, last: weights[weights.length - 1].weight, count: weights.length }
        : null,
    },
  });
});

// ---- 回收站 ----
api.get('/trash', (_req, res) => {
  const db = getDb();
  const items: any[] = [];
  for (const def of TABLES) {
    const rows = db
      .prepare(`SELECT * FROM ${def.name} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 200`)
      .all() as any[];
    for (const r of rows) {
      items.push({
        table: def.name,
        moduleLabel: def.moduleLabel,
        label: def.label,
        id: r.id,
        title: String(r[def.titleField] ?? '').slice(0, 80) || '（无标题）',
        deleted_at: r.deleted_at,
      });
    }
  }
  items.sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at)));
  res.json({ items });
});

api.post('/trash/restore', (req, res) => {
  const { table, id } = req.body || {};
  if (!tableByName.has(table)) {
    res.status(400).json({ error: '未知数据表', code: 'UNKNOWN_TABLE' });
    return;
  }
  getDb().prepare(`UPDATE ${table} SET deleted_at = NULL, updated_at = ? WHERE id = ?`).run(now(), id);
  res.json({ ok: true });
});

api.delete('/trash/:table/:id', (req, res) => {
  const { table, id } = req.params;
  if (!tableByName.has(table)) {
    res.status(400).json({ error: '未知数据表', code: 'UNKNOWN_TABLE' });
    return;
  }
  getDb().prepare(`DELETE FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).run(id);
  res.json({ ok: true });
});

api.post('/trash/empty', (_req, res) => {
  const db = getDb();
  for (const def of TABLES) {
    db.prepare(`DELETE FROM ${def.name} WHERE deleted_at IS NOT NULL`).run();
  }
  res.json({ ok: true });
});

// ---- 导出（不修改主数据）：ZIP 包含清单、全量 JSON 和每表 CSV ----
function toCsv(columns: string[], rows: any[]): string {
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [columns.join(',')];
  for (const r of rows) lines.push(columns.map((c) => escape(r[c])).join(','));
  return '﻿' + lines.join('\r\n');
}

api.get('/export', (_req, res, next) => {
  (async () => {
    const db = getDb();
    const zip = new JSZip();
    const schemaVersion = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
      .get() as { version: string } | undefined;
    zip.file('manifest.json', JSON.stringify({
      app: 'my_days',
      exported_at: now(),
      format_version: 1,
      schema_version: schemaVersion?.version || null,
    }, null, 2));
    const data: Record<string, unknown> = {};
    const csv = zip.folder('csv')!;
    for (const def of TABLES) {
      const rows = db.prepare(`SELECT * FROM ${def.name} WHERE deleted_at IS NULL`).all() as any[];
      data[def.name] = rows;
      const columns = ['id', ...def.columns, 'created_at', 'updated_at'];
      csv.file(`${def.name}.csv`, toCsv(columns, rows));
    }
    data['settings'] = db.prepare('SELECT key, value FROM settings').all();
    zip.file('all-data.json', JSON.stringify(data, null, 2));
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="my_days-export-${new Date().toISOString().slice(0, 10)}.zip"`);
    res.send(buffer);
  })().catch((e) => next(codedError('导出失败', 'EXPORT_FAILED', e instanceof Error ? e.message : String(e), 500)));
});


// ---- 导入：从导出的 ZIP 完整替换业务数据（先自动创建安全备份） ----
api.post('/import', express.raw({ type: ['application/zip', 'application/octet-stream'], limit: '200mb' }), (req, res, next) => {
  (async () => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: '导入文件无效', code: 'IMPORT_INVALID' });
      return;
    }
    let manifest: any;
    let data: Record<string, any>;
    try {
      const zip = await JSZip.loadAsync(req.body);
      manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
      data = JSON.parse(await zip.file('all-data.json')!.async('string'));
    } catch {
      res.status(400).json({ error: '导入文件无效', code: 'IMPORT_INVALID' });
      return;
    }
    if (manifest?.app !== 'my_days' || manifest?.format_version !== 1) {
      res.status(400).json({ error: '导入文件无效', code: 'IMPORT_INVALID' });
      return;
    }
    const db = getDb();
    const current = db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get() as { version: string } | undefined;
    if (manifest.schema_version && current && String(manifest.schema_version) > current.version) {
      res.status(400).json({ error: '导入数据来自更新版本，请先升级应用', code: 'IMPORT_NEWER_SCHEMA' });
      return;
    }
    // 覆盖前先创建当前数据的安全备份
    const safety = createBackup('safety', 'before-import');
    let imported = 0;
    const tx = db.transaction(() => {
      for (const def of TABLES) {
        db.prepare(`DELETE FROM ${def.name}`).run();
        const rows: any[] = Array.isArray(data[def.name]) ? data[def.name] : [];
        if (rows.length === 0) continue;
        const columns = ['id', ...def.columns, 'created_at', 'updated_at'];
        const insert = db.prepare(
          `INSERT INTO ${def.name} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
        );
        for (const row of rows) {
          insert.run(...columns.map((c) => (c === 'created_at' || c === 'updated_at' ? row[c] ?? now() : row[c] ?? null)));
          imported++;
        }
      }
      db.prepare('DELETE FROM settings').run();
      const putSetting = db.prepare('INSERT INTO settings(key, value) VALUES (?, ?)');
      for (const s of Array.isArray(data['settings']) ? data['settings'] : []) {
        if (s?.key) putSetting.run(String(s.key), String(s.value ?? ''));
      }
    });
    try {
      tx();
    } catch (e) {
      // 事务已回滚，当前数据保持不变
      throw codedError('导入失败，当前数据未被修改', 'IMPORT_FAILED', e instanceof Error ? e.message : String(e), 500);
    }
    db.pragma('wal_checkpoint(TRUNCATE)');
    res.json({ ok: true, imported, safetyBackup: safety.file });
  })().catch(next);
});

// ---- 备份 ----
api.get('/backups', (_req, res) => {
  res.json({ backups: listBackups(), status: getBackupStatus() });
});

api.post('/backups', (req, res) => {
  const info = createBackup('manual', req.body?.note);
  res.json({ ok: true, backup: info });
});

api.patch('/backups/:file', (req, res) => {
  updateBackupMeta(req.params.file, {
    ...(req.body?.note !== undefined ? { note: String(req.body.note) } : {}),
    ...(req.body?.keep !== undefined ? { keep: !!req.body.keep } : {}),
  });
  res.json({ ok: true });
});

api.delete('/backups/:file', (req, res) => {
  const b = listBackups().find((x) => x.file === req.params.file);
  if (b?.keep) {
    res.status(400).json({ error: '该备份已标记长期保留，请先取消标记', code: 'BACKUP_KEPT' });
    return;
  }
  deleteBackup(req.params.file);
  res.json({ ok: true });
});

api.post('/backups/:file/restore', (req, res) => {
  const { safetyBackup } = restoreBackup(req.params.file);
  res.json({ ok: true, safetyBackup });
});

// ---- 通用 CRUD：/api/t/<table> ----
api.get('/t/:table', (req, res) => {
  const def = tableByName.get(req.params.table);
  if (!def) {
    res.status(404).json({ error: '未知数据表', code: 'UNKNOWN_TABLE' });
    return;
  }
  const clauses = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  for (const col of def.columns) {
    const v = req.query[col];
    if (v !== undefined) {
      clauses.push(`${col} = ?`);
      params.push(v);
    }
  }
  // since：按创建时间过滤（供首页等场景限定拉取范围）
  if (req.query.since) {
    clauses.push('created_at >= ?');
    params.push(req.query.since);
  }
  // 特殊过滤：date_from / date_to 作用于 date 列
  if (def.columns.includes('date')) {
    if (req.query.date_from) {
      clauses.push('date >= ?');
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      clauses.push('date <= ?');
      params.push(req.query.date_to);
    }
  }
  let rows = getDb()
    .prepare(`SELECT * FROM ${def.name} WHERE ${clauses.join(' AND ')} ORDER BY id DESC LIMIT 2000`)
    .all(...params) as any[];
  if (def.name === 'plan_items') rows = rows.map(resolveSource);
  res.json({ rows });
});

api.get('/t/:table/:id', (req, res) => {
  const def = tableByName.get(req.params.table);
  if (!def) {
    res.status(404).json({ error: '未知数据表', code: 'UNKNOWN_TABLE' });
    return;
  }
  let row = getDb().prepare(`SELECT * FROM ${def.name} WHERE id = ? AND deleted_at IS NULL`).get(req.params.id) as any;
  if (!row) {
    res.status(404).json({ error: '记录不存在', code: 'NOT_FOUND' });
    return;
  }
  if (def.name === 'plan_items') row = resolveSource(row);
  res.json({ row });
});

api.post('/t/:table', (req, res) => {
  const def = tableByName.get(req.params.table);
  if (!def) {
    res.status(404).json({ error: '未知数据表', code: 'UNKNOWN_TABLE' });
    return;
  }
  const data = pickColumns(def.name, req.body || {});
  const cols = Object.keys(data);
  const ts = now();
  const sql = `INSERT INTO ${def.name} (${[...cols, 'created_at', 'updated_at'].join(', ')})
    VALUES (${[...cols, 'created_at', 'updated_at'].map(() => '?').join(', ')})`;
  const info = getDb().prepare(sql).run(...cols.map((c) => data[c] ?? null), ts, ts);
  const row = getDb().prepare(`SELECT * FROM ${def.name} WHERE id = ?`).get(info.lastInsertRowid);
  res.json({ ok: true, row });
});

api.patch('/t/:table/:id', (req, res) => {
  const def = tableByName.get(req.params.table);
  if (!def) {
    res.status(404).json({ error: '未知数据表', code: 'UNKNOWN_TABLE' });
    return;
  }
  const data = pickColumns(def.name, req.body || {});
  const cols = Object.keys(data);
  if (cols.length === 0) {
    res.status(400).json({ error: '没有可更新的字段', code: 'NO_FIELDS' });
    return;
  }
  const sql = `UPDATE ${def.name} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND deleted_at IS NULL`;
  const info = getDb().prepare(sql).run(...cols.map((c) => data[c] ?? null), now(), req.params.id);
  if (info.changes === 0) {
    res.status(404).json({ error: '记录不存在', code: 'NOT_FOUND' });
    return;
  }
  const row = getDb().prepare(`SELECT * FROM ${def.name} WHERE id = ?`).get(req.params.id);
  res.json({ ok: true, row });
});

// 删除 = 进入回收站（软删除）
api.delete('/t/:table/:id', (req, res) => {
  const def = tableByName.get(req.params.table);
  if (!def) {
    res.status(404).json({ error: '未知数据表', code: 'UNKNOWN_TABLE' });
    return;
  }
  const info = getDb()
    .prepare(`UPDATE ${def.name} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
    .run(now(), now(), req.params.id);
  if (info.changes === 0) {
    res.status(404).json({ error: '记录不存在', code: 'NOT_FOUND' });
    return;
  }
  res.json({ ok: true, trash: { table: def.name, id: Number(req.params.id) } });
});
