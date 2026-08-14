import { Router } from 'express';
import * as fs from 'fs';
import { createBackup, deleteBackup, getBackupStatus, listBackups, restoreBackup, updateBackupMeta } from './backup';
import { DB_PATH, getDb, now } from './db';
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
    res.status(500).json({ ok: false, error: `数据完整性检查失败：${check}` });
    return;
  }
  res.json({ ok: true, checkedAt: now() });
});

// ---- 全局搜索 ----
api.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.json({ groups: [] });
    return;
  }
  const db = getDb();
  const like = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
  const groups: { module: string; moduleLabel: string; results: any[] }[] = [];
  for (const def of TABLES) {
    if (def.searchFields.length === 0) continue;
    const where = def.searchFields.map((f) => `${f} LIKE ? ESCAPE '\\'`).join(' OR ');
    const rows = db
      .prepare(`SELECT * FROM ${def.name} WHERE deleted_at IS NULL AND (${where}) ORDER BY updated_at DESC LIMIT 20`)
      .all(...def.searchFields.map(() => like)) as any[];
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
  res.json({ groups });
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
    res.status(400).json({ error: '未知数据表' });
    return;
  }
  getDb().prepare(`UPDATE ${table} SET deleted_at = NULL, updated_at = ? WHERE id = ?`).run(now(), id);
  res.json({ ok: true });
});

api.delete('/trash/:table/:id', (req, res) => {
  const { table, id } = req.params;
  if (!tableByName.has(table)) {
    res.status(400).json({ error: '未知数据表' });
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

// ---- 导出（不修改主数据） ----
api.get('/export', (_req, res) => {
  const db = getDb();
  const data: Record<string, unknown> = { exported_at: now(), app: 'my_days', version: 1 };
  for (const def of TABLES) {
    data[def.name] = db.prepare(`SELECT * FROM ${def.name} WHERE deleted_at IS NULL`).all();
  }
  const settings = db.prepare('SELECT key, value FROM settings').all();
  data['settings'] = settings;
  res.setHeader('Content-Disposition', `attachment; filename="my_days-export-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(data);
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
    res.status(400).json({ error: '该备份已标记长期保留，请先取消标记' });
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
    res.status(404).json({ error: '未知数据表' });
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
    res.status(404).json({ error: '未知数据表' });
    return;
  }
  let row = getDb().prepare(`SELECT * FROM ${def.name} WHERE id = ? AND deleted_at IS NULL`).get(req.params.id) as any;
  if (!row) {
    res.status(404).json({ error: '记录不存在' });
    return;
  }
  if (def.name === 'plan_items') row = resolveSource(row);
  res.json({ row });
});

api.post('/t/:table', (req, res) => {
  const def = tableByName.get(req.params.table);
  if (!def) {
    res.status(404).json({ error: '未知数据表' });
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
    res.status(404).json({ error: '未知数据表' });
    return;
  }
  const data = pickColumns(def.name, req.body || {});
  const cols = Object.keys(data);
  if (cols.length === 0) {
    res.status(400).json({ error: '没有可更新的字段' });
    return;
  }
  const sql = `UPDATE ${def.name} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND deleted_at IS NULL`;
  const info = getDb().prepare(sql).run(...cols.map((c) => data[c] ?? null), now(), req.params.id);
  if (info.changes === 0) {
    res.status(404).json({ error: '记录不存在' });
    return;
  }
  const row = getDb().prepare(`SELECT * FROM ${def.name} WHERE id = ?`).get(req.params.id);
  res.json({ ok: true, row });
});

// 删除 = 进入回收站（软删除）
api.delete('/t/:table/:id', (req, res) => {
  const def = tableByName.get(req.params.table);
  if (!def) {
    res.status(404).json({ error: '未知数据表' });
    return;
  }
  const info = getDb()
    .prepare(`UPDATE ${def.name} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
    .run(now(), now(), req.params.id);
  if (info.changes === 0) {
    res.status(404).json({ error: '记录不存在' });
    return;
  }
  res.json({ ok: true, trash: { table: def.name, id: Number(req.params.id) } });
});
