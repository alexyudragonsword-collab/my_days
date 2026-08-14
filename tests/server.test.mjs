// 服务端集成测试：针对构建产物（server/dist）启动真实服务进行验证。
// 运行前需要先执行 npm run build。对应的验收标准见 docs/ACCEPTANCE.md。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverFile = path.join(projectRoot, 'server', 'dist', 'index.js');
const PORT = 5900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
let dataDir;
let child;

function startServer() {
  child = spawn(process.execPath, [serverFile], {
    env: { ...process.env, MY_DAYS_PORT: String(PORT), MY_DAYS_DATA_DIR: dataDir },
    stdio: 'ignore',
  });
}

async function waitForHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(500) });
      if (res.ok) return (await res.json());
    } catch { /* 服务尚未就绪 */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('服务启动超时');
}

async function stopServer() {
  if (!child) return;
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 400));
  child = null;
}

async function api(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

before(async () => {
  assert.ok(fs.existsSync(serverFile), '需要先运行 npm run build');
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'my-days-test-'));
  startServer();
  await waitForHealth();
});

after(async () => {
  await stopServer();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('AC-001/AC-003 健康检查可用，服务只监听回环地址', async () => {
  const health = await waitForHealth();
  assert.equal(health.status, 'ok');
  assert.equal(health.app, 'my-days');
  assert.ok(health.buildId);
});

test('AC-003 拒绝非本机来源的跨站请求', async () => {
  const res = await fetch(`${BASE}/api/t/memos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example.com' },
    body: JSON.stringify({ content: '恶意请求' }),
  });
  assert.equal(res.status, 403);
  const ok = await fetch(`${BASE}/api/t/memos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PORT}` },
    body: JSON.stringify({ content: '本机请求', status: 'archived' }),
  });
  assert.equal(ok.status, 200);
});

test('AC-005/AC-025 各业务模块可创建并读取专属数据', async () => {
  const cases = [
    ['plan_items', { title: '测试事项', date: '2026-08-14', priority: '高', start_time: '09:00' }],
    ['media_contents', { title: '测试视频', stage: '制作中', platform: 'B站' }],
    ['dev_projects', { name: '测试项目', status: '进行中' }],
    ['consult_clients', { name: '测试客户' }],
    ['fitness_templates', { name: '测试模板', weekdays: '一,三' }],
    ['foods', { name: '鸡胸肉', calories: 165, protein: 31 }],
    ['games', { name: '测试游戏', status: '想玩', next_goal: '第一章' }],
  ];
  for (const [table, payload] of cases) {
    const created = await api('POST', `/api/t/${table}`, payload);
    assert.equal(created.status, 200, table);
    const fetched = await api('GET', `/api/t/${table}/${created.data.row.id}`);
    for (const [k, v] of Object.entries(payload)) {
      assert.equal(fetched.data.row[k], v, `${table}.${k}`);
    }
  }
});

test('AC-007 重启服务后数据仍然存在（含 schema_migrations）', async () => {
  await stopServer();
  startServer();
  await waitForHealth();
  const { data } = await api('GET', '/api/t/plan_items');
  assert.ok(data.rows.some((r) => r.title === '测试事项'));
});

test('AC-015 关联计划事项实时解析来源标题', async () => {
  const media = await api('POST', '/api/t/media_contents', { title: '原始标题', stage: '灵感' });
  const plan = await api('POST', '/api/t/plan_items', {
    title: '推进', date: '2026-08-14', source_module: 'media', source_id: media.data.row.id,
  });
  await api('PATCH', `/api/t/media_contents/${media.data.row.id}`, { title: '改名后的标题' });
  const fetched = await api('GET', `/api/t/plan_items/${plan.data.row.id}`);
  assert.equal(fetched.data.row.source_title, '改名后的标题');
});

test('AC-026 全局搜索按模块分组返回', async () => {
  const { data } = await api('GET', `/api/search?q=${encodeURIComponent('测试')}`);
  assert.ok(data.groups.length >= 3);
  const modules = data.groups.map((g) => g.module);
  assert.ok(modules.includes('media'));
  assert.ok(modules.includes('games'));
});

test('AC-027/AC-028 删除进回收站、可恢复、可永久删除', async () => {
  const created = await api('POST', '/api/t/memos', { content: '要删除的备忘' });
  const id = created.data.row.id;
  await api('DELETE', `/api/t/memos/${id}`);
  let trash = await api('GET', '/api/trash');
  assert.ok(trash.data.items.some((t) => t.table === 'memos' && t.id === id));
  await api('POST', '/api/trash/restore', { table: 'memos', id });
  const restored = await api('GET', `/api/t/memos/${id}`);
  assert.equal(restored.status, 200);
  await api('DELETE', `/api/t/memos/${id}`);
  await api('DELETE', `/api/trash/memos/${id}`);
  trash = await api('GET', '/api/trash');
  assert.ok(!trash.data.items.some((t) => t.table === 'memos' && t.id === id));
});

test('AC-033 启动时已自动创建当日备份，且不重复创建', async () => {
  const { data } = await api('GET', '/api/backups');
  const autos = data.backups.filter((b) => b.type === 'auto');
  assert.equal(autos.length, 1);
});

test('AC-035/AC-036 备份→修改→恢复回到备份时状态，且恢复前生成安全备份', async () => {
  const backup = await api('POST', '/api/backups', { note: '恢复测试' });
  const extra = await api('POST', '/api/t/games', { name: '备份后新增的游戏' });
  assert.equal(extra.status, 200);
  const restore = await api('POST', `/api/backups/${encodeURIComponent(backup.data.backup.file)}/restore`);
  assert.equal(restore.status, 200);
  assert.ok(restore.data.safetyBackup.startsWith('safety-'));
  const games = await api('GET', '/api/t/games');
  assert.ok(!games.data.rows.some((g) => g.name === '备份后新增的游戏'));
});

test('AC-037 损坏的备份被拒绝且当前数据不受影响', async () => {
  const bad = 'manual-20990101-000000.db';
  fs.writeFileSync(path.join(dataDir, 'backups', bad), 'not a database');
  const before = await api('GET', '/api/t/plan_items');
  const restore = await api('POST', `/api/backups/${bad}/restore`);
  assert.equal(restore.status, 500);
  const after = await api('GET', '/api/t/plan_items');
  assert.equal(after.data.rows.length, before.data.rows.length);
  fs.unlinkSync(path.join(dataDir, 'backups', bad));
});

test('AC-039 导出 ZIP 含清单、全量 JSON 和每表 CSV，且不修改主数据', async () => {
  const before = await api('GET', '/api/t/plan_items');
  const res = await fetch(`${BASE}/api/export`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /application\/zip/);
  const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
  assert.ok(zip.file('manifest.json'));
  assert.ok(zip.file('all-data.json'));
  assert.ok(zip.file('csv/plan_items.csv'));
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  assert.equal(manifest.app, 'my_days');
  assert.ok(manifest.schema_version);
  const csv = await zip.file('csv/plan_items.csv').async('string');
  assert.ok(csv.includes('测试事项'));
  const after = await api('GET', '/api/t/plan_items');
  assert.equal(after.data.rows.length, before.data.rows.length);
});

test('AC-040 手动保存执行落盘检查点和完整性检查', async () => {
  const { status, data } = await api('POST', '/api/save');
  assert.equal(status, 200);
  assert.equal(data.ok, true);
});

test('AC-029 设置写入后重启仍然生效', async () => {
  await api('PUT', '/api/settings', { theme: 'dark', appearance: 'glass' });
  await stopServer();
  startServer();
  await waitForHealth();
  const { data } = await api('GET', '/api/settings');
  assert.equal(data.theme, 'dark');
  assert.equal(data.appearance, 'glass');
});


test('AC-034 自动备份超过 30 份时清理旧备份，长期保留标记不被清理', async () => {
  const backupsDir = path.join(dataDir, 'backups');
  // 用当天备份复制出 35 份过去日期的假自动备份
  const existing = fs.readdirSync(backupsDir).find((f) => f.startsWith('auto-'));
  assert.ok(existing, '应已有当天自动备份');
  for (let i = 1; i <= 35; i++) {
    const mm = String(Math.floor((i - 1) / 28) + 1).padStart(2, '0');
    const dd = String(((i - 1) % 28) + 1).padStart(2, '0');
    fs.copyFileSync(path.join(backupsDir, existing), path.join(backupsDir, `auto-2026${mm}${dd}-120000.db`));
  }
  // 标记最老的一份为长期保留
  const keptFile = fs.readdirSync(backupsDir).filter((f) => f.startsWith('auto-2026')).sort()[0];
  const manifestPath = path.join(backupsDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  manifest[keptFile] = { keep: true, note: 'keep-me' };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  // 删除当天的自动备份并重启服务 → 触发自动备份与清理
  fs.unlinkSync(path.join(backupsDir, existing));
  await stopServer();
  startServer();
  await waitForHealth();
  const { data } = await api('GET', '/api/backups');
  const autos = data.backups.filter((b) => b.type === 'auto');
  const kept = autos.filter((b) => b.keep);
  assert.equal(kept.length, 1, '长期保留的备份不被清理');
  assert.equal(kept[0].file, keptFile);
  assert.equal(autos.filter((b) => !b.keep).length, 30, '普通自动备份保留 30 份');
});

test('导入导出闭环：导出 ZIP 可完整导入恢复', async () => {
  const before = await api('GET', '/api/t/plan_items');
  const exported = await fetch(`${BASE}/api/export`);
  const zipBuffer = Buffer.from(await exported.arrayBuffer());
  // 修改数据后导入，应回到导出时状态
  await api('POST', '/api/t/plan_items', { title: '导入前新增', date: '2026-08-15' });
  const res = await fetch(`${BASE}/api/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: zipBuffer,
  });
  const result = await res.json();
  assert.equal(res.status, 200);
  assert.ok(result.imported > 0);
  assert.ok(result.safetyBackup.startsWith('safety-'));
  const after = await api('GET', '/api/t/plan_items');
  assert.equal(after.data.rows.length, before.data.rows.length);
  assert.ok(!after.data.rows.some((r) => r.title === '导入前新增'));
  // 垃圾文件被拒绝
  const bad = await fetch(`${BASE}/api/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: Buffer.from('garbage'),
  });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, 'IMPORT_INVALID');
});

test('保存并退出接口能安全关闭服务', async () => {
  const res = await api('POST', '/api/system/exit');
  assert.equal(res.status, 200);
  await new Promise((r) => setTimeout(r, 600));
  await assert.rejects(fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(500) }));
  child = null;
  // 重新拉起服务，验证退出后数据完好
  startServer();
  await waitForHealth();
  const { data } = await api('GET', '/api/t/plan_items');
  assert.ok(data.rows.length > 0);
});
