import { useQuery } from '@tanstack/react-query';
import React, { useRef, useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost, queryClient } from '../api';
import { t } from '../i18n';
import { APPEARANCES, useSettings } from '../settings';
import { EmptyState, Field, fmtDateTime, fmtSize, QueryView, useUI } from '../ui';

const TYPE_LABEL: Record<string, string> = { auto: '自动', manual: '手动', safety: '安全备份' };

function DataFileCard() {
  const query = useQuery({ queryKey: ['status'], queryFn: () => apiGet<any>('/api/status') });
  return (
    <div className="card">
      <h3>{t('本地数据文件')}</h3>
      <QueryView query={query}>
        {(data) =>
          data.dataFile ? (
            <table className="tbl">
              <tbody>
                <tr><th style={{ width: 110 }}>{t('文件位置')}</th><td style={{ wordBreak: 'break-all' }}>{data.dataFile.path}</td></tr>
                <tr><th>{t('文件大小')}</th><td>{fmtSize(data.dataFile.size)}</td></tr>
                <tr><th>{t('最近修改')}</th><td>{fmtDateTime(data.dataFile.mtime)}</td></tr>
              </tbody>
            </table>
          ) : (
            <p className="muted">{t('尚未找到数据文件')}</p>
          )
        }
      </QueryView>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn small" onClick={async () => {
          try {
            await apiPost('/api/system/open-data-dir');
          } catch {
            /* 无桌面环境时按钮无效果，路径已在上方展示 */
          }
        }}>{t('打开数据目录')}</button>
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        {t('所有业务数据都保存在上述 SQLite 文件中，可直接在文件系统中复制该文件做额外备份。')}
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
      toast(t('备份已创建'));
    } catch (e) {
      toast(t('备份失败：') + (e instanceof Error ? e.message : e), { error: true });
    }
  };

  const restore = async (b: any) => {
    const ok = await confirm({
      title: t('从备份恢复'),
      danger: true,
      confirmText: t('确认恢复'),
      body: (
        <div>
          <p>{t('将把全部数据恢复到以下备份创建时的状态：')}</p>
          <table className="tbl">
            <tbody>
              <tr><th>{t('备份时间')}</th><td>{fmtDateTime(b.created_at)}</td></tr>
              <tr><th>{t('文件大小')}</th><td>{fmtSize(b.size)}</td></tr>
              <tr><th>{t('类型')}</th><td>{t(TYPE_LABEL[b.type] || b.type)}</td></tr>
              <tr><th>{t('备注')}</th><td>{b.note || '—'}</td></tr>
            </tbody>
          </table>
          <p className="small muted">{t('恢复前会自动创建一份当前数据的安全备份。')}</p>
        </div>
      ),
    });
    if (!ok) return;
    try {
      await apiPost(`/api/backups/${encodeURIComponent(b.file)}/restore`);
      toast(t('恢复成功，正在重新加载…'));
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast(t('恢复失败，当前数据未被修改：') + (e instanceof Error ? e.message : e), { error: true });
    }
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>{t('备份')}</h3>
        <button className="btn primary" onClick={createBackup}>{t('立即备份')}</button>
      </div>
      <QueryView query={query}>
        {(data) => (
          <>
            {data.status?.lastError && (
              <p className="badge danger" style={{ marginTop: 0 }}>{t('最近备份失败：')}{data.status.lastError}</p>
            )}
            {data.backups.length === 0 ? (
              <EmptyState icon="🗄️" text={t('还没有备份')} hint={t('点击“立即备份”创建第一份备份；应用每天也会自动备份一次')} />
            ) : (
              <table className="tbl">
                <thead>
                  <tr><th>{t('时间')}</th><th>{t('类型')}</th><th>{t('大小')}</th><th>{t('备注')}</th><th>{t('长期保留')}</th><th /></tr>
                </thead>
                <tbody>
                  {data.backups.map((b: any) => (
                    <tr key={b.file}>
                      <td>{fmtDateTime(b.created_at)}</td>
                      <td><span className="badge">{t(TYPE_LABEL[b.type] || b.type)}</span></td>
                      <td>{fmtSize(b.size)}</td>
                      <td>
                        {b.note || <span className="muted">—</span>}{' '}
                        <button className="btn small" onClick={async () => {
                          const note = window.prompt(t('备份备注 / 名称'), b.note || '');
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
                          toast(t(e.target.checked ? '已标记长期保留，不会被自动清理' : '已取消长期保留'));
                        }} />
                      </td>
                      <td>
                        <div className="row">
                          <button className="btn small" onClick={() => restore(b)}>{t('恢复')}</button>
                          <button className="btn small danger" onClick={async () => {
                            if (await confirm({ title: t('删除备份'), danger: true, body: t('确定删除 {0} 的备份文件？此操作不可恢复。', fmtDateTime(b.created_at)) })) {
                              try {
                                await apiDelete(`/api/backups/${encodeURIComponent(b.file)}`);
                                refresh();
                              } catch (e) {
                                toast(e instanceof Error ? e.message : String(e), { error: true });
                              }
                            }
                          }}>{t('删')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="small muted" style={{ marginBottom: 0 }}>
              {t('应用每天自动备份一次；普通自动备份最多保留 30 份，勾选“长期保留”的备份不会被清理。')}
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
      <h3>{t('导出数据')}</h3>
      <p className="small muted">
        {t('导出 ZIP 压缩包，内含机读的全量 JSON 和每个模块一份可用表格软件打开的 CSV，用于迁移或人工查看。导出不会修改主数据，也不能替代完整备份。')}
      </p>
      <a className="btn" href="/api/export" download>{t('导出 ZIP（JSON + CSV）')}</a>
    </div>
  );
}

function ImportCard() {
  const { toast, confirm } = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const doImport = async (file: File) => {
    const ok = await confirm({
      title: t('从导出文件导入'),
      danger: true,
      confirmText: t('确认导入'),
      body: t('导入将用文件中的数据完整替换当前全部业务数据与设置。替换前会自动创建一份当前数据的安全备份。'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: await file.arrayBuffer(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || t('导入文件无效'));
      toast(t('导入成功（{0} 条记录），正在重新加载…', data.imported));
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast(t('导入失败：') + (e instanceof Error ? e.message : e), { error: true });
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3>{t('导入数据')}</h3>
      <p className="small muted">
        {t('从本应用导出的 ZIP 文件恢复全部业务数据，用于迁移到新电脑。导入会完整替换当前数据，替换前自动创建安全备份。')}
      </p>
      <input ref={fileRef} type="file" accept=".zip" style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) doImport(f);
          e.target.value = '';
        }} />
      <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? t('导入中…') : t('选择导出 ZIP 导入')}
      </button>
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
        <h3 style={{ margin: 0 }}>{t('回收站')}</h3>
        <button className="btn danger small" onClick={async () => {
          if (await confirm({ title: t('清空回收站'), danger: true, confirmText: t('永久删除全部'), body: t('回收站中的所有记录将被永久删除，无法恢复。') })) {
            await apiPost('/api/trash/empty');
            refresh();
            toast(t('回收站已清空'));
          }
        }}>{t('清空回收站')}</button>
      </div>
      <QueryView query={query} isEmpty={(d: any) => d.items.length === 0}
        empty={<p className="small muted" style={{ margin: 0 }}>{t('回收站是空的。删除的记录会先进入这里，可随时恢复。')}</p>}>
        {(data: any) => (
          <div>
            {data.items.slice(0, 50).map((it: any) => (
              <div className="list-item small" key={it.table + it.id}>
                <span className="badge">{t(it.moduleLabel)} · {t(it.label)}</span>
                <span className="title">{it.title}</span>
                <span className="muted">{fmtDateTime(it.deleted_at)}</span>
                <button className="btn small" onClick={async () => {
                  await apiPost('/api/trash/restore', { table: it.table, id: it.id });
                  refresh();
                  queryClient.invalidateQueries({ queryKey: ['t', it.table] });
                  toast('已恢复');
                }}>{t('恢复')}</button>
                <button className="btn small danger" onClick={async () => {
                  if (await confirm({ title: t('永久删除'), danger: true, confirmText: t('永久删除'), body: t('永久删除「{0}」？此操作无法撤销。', it.title) })) {
                    await apiDelete(`/api/trash/${it.table}/${it.id}`);
                    refresh();
                    toast(t('已永久删除'));
                  }
                }}>{t('永久删除')}</button>
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
      <h3>{t('界面外观')} <span className="sub">{t('只改变界面样式，不影响任何业务数据')}</span></h3>
      <div className="appearance-grid">
        {APPEARANCES.map((a) => (
          <button
            key={a.key}
            className={'appearance-option' + (settings.appearance === a.key ? ' selected' : '')}
            data-preview={a.key}
            onClick={async () => {
              await update({ appearance: a.key });
              toast(t('已切换为「{0}」外观', t(a.label)));
            }}
          >
            <span className="preview">
              <span className="p-dot" /><span className="p-bar" /><span className="p-chip" />
            </span>
            <strong>{t(a.label)}</strong>
            <span className="small muted">{t(a.desc)}</span>
          </button>
        ))}
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>{t('每种外观都支持下方“主题”里的浅色与深色模式。')}</p>
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
      <h3>{t('使用偏好')}</h3>
      <div className="grid-2">
        <Field label={t('语言 / Language')}>
          <select className="input" value={settings.language || 'zh'} onChange={async (e) => {
            await update({ language: e.target.value as 'zh' | 'en' });
            window.location.reload();
          }}>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </Field>
        <Field label={t('主题')}>
          <select className="input" value={settings.theme} onChange={async (e) => {
            await update({ theme: e.target.value as any });
            toast(t('主题已更新'));
          }}>
            <option value="auto">{t('跟随系统')}</option>
            <option value="light">{t('浅色')}</option>
            <option value="dark">{t('深色')}</option>
          </select>
        </Field>
        <Field label={t('每周起始日')}>
          <select className="input" value={String(settings.week_start)} onChange={async (e) => {
            await update({ week_start: Number(e.target.value) as 0 | 1 });
            toast(t('已更新'));
          }}>
            <option value="1">{t('周一')}</option>
            <option value="0">{t('周日')}</option>
          </select>
        </Field>
        <Field label={t('日期格式')}>
          <select className="input" value={settings.date_format} onChange={async (e) => {
            await update({ date_format: e.target.value as any });
            toast(t('已更新'));
          }}>
            <option value="iso">2026-08-14</option>
            <option value="cn">2026年8月14日</option>
            <option value="slash">2026/08/14</option>
          </select>
        </Field>
      </div>
      <Field label={t('首页显示的模块摘要')}>
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
              {t(label)}
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
      <div className="page-head"><h2>{t('数据与设置')}</h2></div>
      <DataFileCard />
      <BackupsCard />
      <ExportCard />
      <ImportCard />
      <TrashCard />
      <AppearanceCard />
      <PreferencesCard />
    </div>
  );
}
