import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { apiDelete, apiGet, apiPatch, apiPost, queryClient } from '../api';
import { APPEARANCES, useSettings } from '../settings';
import { EmptyState, Field, fmtDateTime, fmtSize, QueryView, useUI } from '../ui';

const TYPE_LABEL: Record<string, string> = { auto: '自动', manual: '手动', safety: '安全备份' };

function DataFileCard() {
  const query = useQuery({ queryKey: ['status'], queryFn: () => apiGet<any>('/api/status') });
  return (
    <div className="card">
      <h3>本地数据文件</h3>
      <QueryView query={query}>
        {(data) =>
          data.dataFile ? (
            <table className="tbl">
              <tbody>
                <tr><th style={{ width: 110 }}>文件位置</th><td style={{ wordBreak: 'break-all' }}>{data.dataFile.path}</td></tr>
                <tr><th>文件大小</th><td>{fmtSize(data.dataFile.size)}</td></tr>
                <tr><th>最近修改</th><td>{fmtDateTime(data.dataFile.mtime)}</td></tr>
              </tbody>
            </table>
          ) : (
            <p className="muted">尚未找到数据文件</p>
          )
        }
      </QueryView>
      <p className="small muted" style={{ marginBottom: 0 }}>
        所有业务数据都保存在上述 SQLite 文件中，可直接在文件系统中复制该文件做额外备份。
      </p>
    </div>
  );
}

function BackupsCard() {
  const query = useQuery({ queryKey: ['backups'], queryFn: () => apiGet<any>('/api/backups') });
  const { toast, confirm } = useUI();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['backups'] });
    queryClient.invalidateQueries({ queryKey: ['status'] });
  };

  const createBackup = async () => {
    try {
      await apiPost('/api/backups', {});
      refresh();
      toast('备份已创建');
    } catch (e) {
      toast('备份失败：' + (e instanceof Error ? e.message : e), { error: true });
    }
  };

  const restore = async (b: any) => {
    const ok = await confirm({
      title: '从备份恢复',
      danger: true,
      confirmText: '确认恢复',
      body: (
        <div>
          <p>将把全部数据恢复到以下备份创建时的状态：</p>
          <table className="tbl">
            <tbody>
              <tr><th>备份时间</th><td>{fmtDateTime(b.created_at)}</td></tr>
              <tr><th>文件大小</th><td>{fmtSize(b.size)}</td></tr>
              <tr><th>类型</th><td>{TYPE_LABEL[b.type] || b.type}</td></tr>
              <tr><th>备注</th><td>{b.note || '—'}</td></tr>
            </tbody>
          </table>
          <p className="small muted">恢复前会自动创建一份当前数据的安全备份。</p>
        </div>
      ),
    });
    if (!ok) return;
    try {
      await apiPost(`/api/backups/${encodeURIComponent(b.file)}/restore`);
      toast('恢复成功，正在重新加载…');
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast('恢复失败，当前数据未被修改：' + (e instanceof Error ? e.message : e), { error: true });
    }
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>备份</h3>
        <button className="btn primary" onClick={createBackup}>立即备份</button>
      </div>
      <QueryView query={query}>
        {(data) => (
          <>
            {data.status?.lastError && (
              <p className="badge danger" style={{ marginTop: 0 }}>最近备份失败：{data.status.lastError}</p>
            )}
            {data.backups.length === 0 ? (
              <EmptyState icon="🗄️" text="还没有备份" hint="点击“立即备份”创建第一份备份；应用每天也会自动备份一次" />
            ) : (
              <table className="tbl">
                <thead>
                  <tr><th>时间</th><th>类型</th><th>大小</th><th>备注</th><th>长期保留</th><th /></tr>
                </thead>
                <tbody>
                  {data.backups.map((b: any) => (
                    <tr key={b.file}>
                      <td>{fmtDateTime(b.created_at)}</td>
                      <td><span className="badge">{TYPE_LABEL[b.type] || b.type}</span></td>
                      <td>{fmtSize(b.size)}</td>
                      <td>
                        {b.note || <span className="muted">—</span>}{' '}
                        <button className="btn small" onClick={async () => {
                          const note = window.prompt('备份备注 / 名称', b.note || '');
                          if (note !== null) {
                            await apiPatch(`/api/backups/${encodeURIComponent(b.file)}`, { note });
                            refresh();
                          }
                        }}>✎</button>
                      </td>
                      <td>
                        <input type="checkbox" checked={b.keep} onChange={async (e) => {
                          await apiPatch(`/api/backups/${encodeURIComponent(b.file)}`, { keep: e.target.checked });
                          refresh();
                          toast(e.target.checked ? '已标记长期保留，不会被自动清理' : '已取消长期保留');
                        }} />
                      </td>
                      <td>
                        <div className="row">
                          <button className="btn small" onClick={() => restore(b)}>恢复</button>
                          <button className="btn small danger" onClick={async () => {
                            if (await confirm({ title: '删除备份', danger: true, body: `确定删除 ${fmtDateTime(b.created_at)} 的备份文件？此操作不可恢复。` })) {
                              try {
                                await apiDelete(`/api/backups/${encodeURIComponent(b.file)}`);
                                refresh();
                              } catch (e) {
                                toast(e instanceof Error ? e.message : String(e), { error: true });
                              }
                            }
                          }}>删</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="small muted" style={{ marginBottom: 0 }}>
              应用每天自动备份一次；普通自动备份最多保留 30 份，勾选“长期保留”的备份不会被清理。
            </p>
          </>
        )}
      </QueryView>
    </div>
  );
}

function ExportCard() {
  return (
    <div className="card">
      <h3>导出数据</h3>
      <p className="small muted">
        导出全部核心业务记录为 JSON 文件，用于迁移或人工查看。导出不会修改主数据，也不能替代完整备份。
      </p>
      <a className="btn" href="/api/export" download>导出 JSON</a>
    </div>
  );
}

function TrashCard() {
  const query = useQuery({ queryKey: ['trash'], queryFn: () => apiGet<any>('/api/trash') });
  const { toast, confirm } = useUI();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['trash'] });

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>回收站</h3>
        <button className="btn danger small" onClick={async () => {
          if (await confirm({ title: '清空回收站', danger: true, confirmText: '永久删除全部', body: '回收站中的所有记录将被永久删除，无法恢复。' })) {
            await apiPost('/api/trash/empty');
            refresh();
            toast('回收站已清空');
          }
        }}>清空回收站</button>
      </div>
      <QueryView query={query} isEmpty={(d: any) => d.items.length === 0}
        empty={<p className="small muted" style={{ margin: 0 }}>回收站是空的。删除的记录会先进入这里，可随时恢复。</p>}>
        {(data: any) => (
          <div>
            {data.items.slice(0, 50).map((it: any) => (
              <div className="list-item small" key={it.table + it.id}>
                <span className="badge">{it.moduleLabel} · {it.label}</span>
                <span className="title">{it.title}</span>
                <span className="muted">{fmtDateTime(it.deleted_at)}</span>
                <button className="btn small" onClick={async () => {
                  await apiPost('/api/trash/restore', { table: it.table, id: it.id });
                  refresh();
                  queryClient.invalidateQueries({ queryKey: ['t', it.table] });
                  toast('已恢复');
                }}>恢复</button>
                <button className="btn small danger" onClick={async () => {
                  if (await confirm({ title: '永久删除', danger: true, confirmText: '永久删除', body: `永久删除「${it.title}」？此操作无法撤销。` })) {
                    await apiDelete(`/api/trash/${it.table}/${it.id}`);
                    refresh();
                    toast('已永久删除');
                  }
                }}>永久删除</button>
              </div>
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}

function AppearanceCard() {
  const { settings, update } = useSettings();
  const { toast } = useUI();
  return (
    <div className="card">
      <h3>界面外观 <span className="sub">只改变界面样式，不影响任何业务数据</span></h3>
      <div className="appearance-grid">
        {APPEARANCES.map((a) => (
          <button
            key={a.key}
            className={'appearance-option' + (settings.appearance === a.key ? ' selected' : '')}
            data-preview={a.key}
            onClick={async () => {
              await update({ appearance: a.key });
              toast(`已切换为「${a.label}」外观`);
            }}
          >
            <span className="preview">
              <span className="p-dot" /><span className="p-bar" /><span className="p-chip" />
            </span>
            <strong>{a.label}</strong>
            <span className="small muted">{a.desc}</span>
          </button>
        ))}
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>每种外观都支持下方“主题”里的浅色与深色模式。</p>
    </div>
  );
}

function PreferencesCard() {
  const { settings, update } = useSettings();
  const { toast } = useUI();
  const MODULES: [string, string][] = [
    ['media', '自媒体'], ['dev', '开发工作'], ['consult', '咨询工作'],
    ['fitness', '健身计划'], ['diet', '饮食计划'], ['games', '游戏娱乐'],
  ];
  return (
    <div className="card">
      <h3>使用偏好</h3>
      <div className="grid-2">
        <Field label="主题">
          <select className="input" value={settings.theme} onChange={async (e) => {
            await update({ theme: e.target.value as any });
            toast('主题已更新');
          }}>
            <option value="auto">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </Field>
        <Field label="每周起始日">
          <select className="input" value={String(settings.week_start)} onChange={async (e) => {
            await update({ week_start: Number(e.target.value) as 0 | 1 });
            toast('已更新');
          }}>
            <option value="1">周一</option>
            <option value="0">周日</option>
          </select>
        </Field>
        <Field label="日期格式">
          <select className="input" value={settings.date_format} onChange={async (e) => {
            await update({ date_format: e.target.value as any });
            toast('已更新');
          }}>
            <option value="iso">2026-08-14</option>
            <option value="cn">2026年8月14日</option>
            <option value="slash">2026/08/14</option>
          </select>
        </Field>
      </div>
      <Field label="首页显示的模块摘要">
        <div className="row wrap">
          {MODULES.map(([key, label]) => (
            <label key={key} className="row small" style={{ gap: 4 }}>
              <input
                type="checkbox"
                checked={settings.home_summaries[key] !== false}
                onChange={async (e) => {
                  await update({ home_summaries: { ...settings.home_summaries, [key]: e.target.checked } });
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </Field>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div>
      <div className="page-head"><h2>数据与设置</h2></div>
      <DataFileCard />
      <BackupsCard />
      <ExportCard />
      <TrashCard />
      <AppearanceCard />
      <PreferencesCard />
    </div>
  );
}
