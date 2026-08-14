import React, { useEffect, useState } from 'react';
import { createRow, invalidateTable, Row, todayStr, updateRow } from '../api';
import { DEV_ITEM_TYPES, PRIORITIES, priorityBadgeClass } from '../constants';
import { useAddToPlan, useClearOpenParam, useOpenParam, useSoftDelete, useTable } from '../hooks';
import { Drawer, Dropdown, EmptyState, Field, Modal, QueryView, useUI } from '../ui';

const ITEM_STATUSES = ['待处理', '进行中', '已完成'];

function ProjectEditor(props: { project?: Row; onClose: () => void }) {
  const p = props.project;
  const [form, setForm] = useState({
    name: String(p?.name || ''),
    description: String(p?.description || ''),
    status: String(p?.status || '进行中'),
    local_path: String(p?.local_path || ''),
    repo_link: String(p?.repo_link || ''),
  });
  const { toast } = useUI();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { toast('请填写项目名称', { error: true }); return; }
    const data = {
      name: form.name.trim(),
      description: form.description || null,
      status: form.status,
      local_path: form.local_path || null,
      repo_link: form.repo_link || null,
    };
    if (p) await updateRow('dev_projects', p.id, data);
    else await createRow('dev_projects', data);
    invalidateTable('dev_projects');
    toast('项目已保存');
    props.onClose();
  };

  return (
    <Modal title={p ? '编辑项目' : '新建项目'} onClose={props.onClose}>
      <Field label="项目名称"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="说明"><textarea className="input" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
      <div className="grid-2">
        <Field label="状态">
          <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {['进行中', '暂停', '已完成'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="本地项目目录">
          <input className="input" value={form.local_path} onChange={(e) => set('local_path', e.target.value)} placeholder="例如 D:\code\my_app" />
        </Field>
      </div>
      <Field label="代码仓库 / 文档链接">
        <input className="input" value={form.repo_link} onChange={(e) => set('repo_link', e.target.value)} />
      </Field>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={props.onClose}>取消</button>
        <button className="btn primary" onClick={save}>保存</button>
      </div>
    </Modal>
  );
}

function WorkItemEditor(props: { item: Row; milestones: Row[]; onClose: () => void }) {
  const it = props.item;
  const [form, setForm] = useState({
    title: String(it.title || ''),
    type: String(it.type || '功能'),
    priority: String(it.priority || '中'),
    status: String(it.status || '待处理'),
    milestone_id: it.milestone_id == null ? '' : String(it.milestone_id),
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const { toast } = useUI();

  const save = async () => {
    await updateRow('dev_work_items', it.id, {
      title: form.title,
      type: form.type,
      priority: form.priority,
      status: form.status,
      milestone_id: form.milestone_id === '' ? null : Number(form.milestone_id),
    });
    invalidateTable('dev_work_items');
    toast('已保存');
    props.onClose();
  };

  return (
    <Drawer title="编辑工作项" onClose={props.onClose}>
      <Field label="标题"><input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
      <div className="grid-2">
        <Field label="类型">
          <select className="input" value={form.type} onChange={(e) => set('type', e.target.value)}>
            {DEV_ITEM_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="优先级">
          <select className="input" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            {PRIORITIES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="状态">
          <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {ITEM_STATUSES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="所属里程碑">
          <select className="input" value={form.milestone_id} onChange={(e) => set('milestone_id', e.target.value)}>
            <option value="">无</option>
            {props.milestones.map((m) => <option key={m.id} value={m.id}>{String(m.name)}</option>)}
          </select>
        </Field>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={props.onClose}>取消</button>
        <button className="btn primary" onClick={save}>保存</button>
      </div>
    </Drawer>
  );
}

export default function DevPage() {
  const projectsQuery = useTable('dev_projects');
  const milestonesQuery = useTable('dev_milestones');
  const itemsQuery = useTable('dev_work_items');
  const logsQuery = useTable('dev_logs');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [projectEditor, setProjectEditor] = useState<Row | null | 'new'>(null);
  const [itemEditor, setItemEditor] = useState<Row | null>(null);
  const [filters, setFilters] = useState({ type: '', status: '', priority: '' });
  const [newItem, setNewItem] = useState({ title: '', type: '功能', priority: '中' });
  const [newMilestone, setNewMilestone] = useState({ name: '', target_date: '' });
  const [newLog, setNewLog] = useState('');
  const { toast, confirm } = useUI();
  const addToPlan = useAddToPlan();
  const softDelete = useSoftDelete();
  const openParam = useOpenParam();
  const clearOpen = useClearOpenParam();

  const projects = (projectsQuery.data || []).filter((p) => !p.archived);
  const selected = projects.find((p) => p.id === selectedId) || projects[0] || null;

  useEffect(() => {
    if (!openParam) return;
    if (openParam.table === 'dev_projects' && projectsQuery.data) {
      setSelectedId(openParam.id);
      clearOpen();
    } else if (openParam.table === 'dev_work_items' && itemsQuery.data) {
      const item = itemsQuery.data.find((r) => r.id === openParam.id);
      if (item) {
        if (item.project_id) setSelectedId(Number(item.project_id));
        setItemEditor(item);
        clearOpen();
      }
    } else if (openParam.table === 'dev_milestones' && milestonesQuery.data) {
      const ms = milestonesQuery.data.find((r) => r.id === openParam.id);
      if (ms) {
        if (ms.project_id) setSelectedId(Number(ms.project_id));
        clearOpen();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, projectsQuery.data, itemsQuery.data, milestonesQuery.data]);

  const milestones = (milestonesQuery.data || []).filter((m) => selected && Number(m.project_id) === selected.id);
  const items = (itemsQuery.data || []).filter((i) => selected && Number(i.project_id) === selected.id)
    .filter((i) => (!filters.type || i.type === filters.type) && (!filters.status || i.status === filters.status) && (!filters.priority || i.priority === filters.priority));
  const logs = (logsQuery.data || []).filter((l) => selected && Number(l.project_id) === selected.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const addItem = async () => {
    if (!selected || !newItem.title.trim()) return;
    await createRow('dev_work_items', { project_id: selected.id, title: newItem.title.trim(), type: newItem.type, priority: newItem.priority });
    invalidateTable('dev_work_items');
    setNewItem((n) => ({ ...n, title: '' }));
  };

  const addMilestone = async () => {
    if (!selected || !newMilestone.name.trim()) return;
    await createRow('dev_milestones', { project_id: selected.id, name: newMilestone.name.trim(), target_date: newMilestone.target_date || null });
    invalidateTable('dev_milestones');
    setNewMilestone({ name: '', target_date: '' });
  };

  const addLog = async () => {
    if (!selected || !newLog.trim()) return;
    await createRow('dev_logs', { project_id: selected.id, date: todayStr(), content: newLog.trim() });
    invalidateTable('dev_logs');
    setNewLog('');
    toast('日志已记录');
  };

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      toast('目录路径已复制');
    } catch {
      window.prompt('请手动复制目录路径：', path);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h2>开发工作</h2>
        <button className="btn primary" onClick={() => setProjectEditor('new')}>＋ 新建项目</button>
      </div>
      <QueryView
        query={projectsQuery}
        isEmpty={() => projects.length === 0}
        empty={<EmptyState icon="💻" text="还没有开发项目" hint="创建一个项目来管理里程碑、工作项和开发日志"
          action={<button className="btn primary" onClick={() => setProjectEditor('new')}>新建项目</button>} />}
      >
        {() => (
          <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 16, alignItems: 'start' }}>
            <div className="card" style={{ padding: 10 }}>
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="list-item clickable"
                  style={selected?.id === p.id ? { background: 'var(--accent-soft)' } : undefined}
                  onClick={() => setSelectedId(p.id)}
                >
                  <span className="title">{String(p.name)}</span>
                  <span className={'badge ' + (p.status === '进行中' ? 'ok' : '')}>{String(p.status)}</span>
                </div>
              ))}
            </div>

            {selected && (
              <div>
                <div className="card">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0 }}>{String(selected.name)} <span className="sub">{String(selected.status)}</span></h3>
                    <div className="row">
                      <button className="btn small" onClick={() => setProjectEditor(selected)}>编辑</button>
                      <button className="btn small" onClick={() => addToPlan({ title: `开发：${selected.name}`, sourceModule: 'dev_project', sourceId: selected.id })}>加入今日计划</button>
                      <Dropdown>
                        <button onClick={async () => {
                          if (await confirm({ title: '归档项目', body: `归档「${selected.name}」？归档后不在列表显示。` })) {
                            await updateRow('dev_projects', selected.id, { archived: 1 });
                            invalidateTable('dev_projects');
                          }
                        }}>归档项目</button>
                        <button className="danger" onClick={() => softDelete('dev_projects', selected.id, '项目')}>删除项目</button>
                      </Dropdown>
                    </div>
                  </div>
                  {selected.description ? <p className="small muted">{String(selected.description)}</p> : null}
                  <div className="row wrap small">
                    {selected.local_path ? (
                      <>
                        <span className="muted">目录：{String(selected.local_path)}</span>
                        <button className="btn small" onClick={() => copyPath(String(selected.local_path))}>复制路径</button>
                      </>
                    ) : null}
                    {selected.repo_link ? <a href={String(selected.repo_link)} target="_blank" rel="noreferrer">仓库 / 文档（外部链接）↗</a> : null}
                  </div>
                </div>

                <div className="card">
                  <h3>里程碑</h3>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <input className="input" style={{ flex: 1 }} placeholder="里程碑名称" value={newMilestone.name}
                      onChange={(e) => setNewMilestone((m) => ({ ...m, name: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && addMilestone()} />
                    <input className="input" type="date" style={{ width: 150 }} value={newMilestone.target_date}
                      onChange={(e) => setNewMilestone((m) => ({ ...m, target_date: e.target.value }))} />
                    <button className="btn" onClick={addMilestone}>添加</button>
                  </div>
                  {milestones.length === 0
                    ? <p className="small muted" style={{ margin: 0 }}>暂无里程碑</p>
                    : milestones.map((m) => (
                      <div className="list-item" key={m.id}>
                        <span className="title">{String(m.name)}</span>
                        {m.target_date ? <span className="badge">{String(m.target_date)}</span> : null}
                        <select className="input" style={{ width: 100 }} value={String(m.status)}
                          onChange={async (e) => {
                            await updateRow('dev_milestones', m.id, { status: e.target.value });
                            invalidateTable('dev_milestones');
                          }}>
                          {['未开始', '进行中', '已完成'].map((s) => <option key={s}>{s}</option>)}
                        </select>
                        <button className="btn small danger" onClick={() => softDelete('dev_milestones', m.id, '里程碑')}>✕</button>
                      </div>
                    ))}
                </div>

                <div className="card">
                  <h3>工作项</h3>
                  <div className="row wrap" style={{ marginBottom: 8 }}>
                    <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="添加功能 / 需求 / Bug / 技术问题"
                      value={newItem.title}
                      onChange={(e) => setNewItem((n) => ({ ...n, title: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && addItem()} />
                    <select className="input" style={{ width: 90 }} value={newItem.type} onChange={(e) => setNewItem((n) => ({ ...n, type: e.target.value }))}>
                      {DEV_ITEM_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <select className="input" style={{ width: 70 }} value={newItem.priority} onChange={(e) => setNewItem((n) => ({ ...n, priority: e.target.value }))}>
                      {PRIORITIES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <button className="btn primary" onClick={addItem}>添加</button>
                  </div>
                  <div className="row wrap small" style={{ marginBottom: 8 }}>
                    <span className="muted">筛选：</span>
                    <select className="input" style={{ width: 100 }} value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
                      <option value="">全部类型</option>
                      {DEV_ITEM_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <select className="input" style={{ width: 100 }} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                      <option value="">全部状态</option>
                      {ITEM_STATUSES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <select className="input" style={{ width: 100 }} value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}>
                      <option value="">全部优先级</option>
                      {PRIORITIES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  {items.length === 0
                    ? <p className="small muted" style={{ margin: 0 }}>没有符合条件的工作项</p>
                    : items.map((it) => (
                      <div className="list-item" key={it.id}>
                        <input type="checkbox" checked={it.status === '已完成'} onChange={async () => {
                          await updateRow('dev_work_items', it.id, { status: it.status === '已完成' ? '待处理' : '已完成' });
                          invalidateTable('dev_work_items');
                        }} />
                        <span className={'title' + (it.status === '已完成' ? ' strike' : '')}>{String(it.title)}</span>
                        <span className={'badge ' + (it.type === 'Bug' ? 'danger' : '')}>{String(it.type)}</span>
                        <span className={'badge ' + priorityBadgeClass(String(it.priority))}>{String(it.priority)}</span>
                        {it.milestone_id ? <span className="badge accent">{String(milestones.find((m) => m.id === Number(it.milestone_id))?.name || '')}</span> : null}
                        <Dropdown>
                          <button onClick={() => setItemEditor(it)}>编辑</button>
                          <button onClick={() => addToPlan({ title: String(it.title), sourceModule: 'dev_item', sourceId: it.id })}>加入今日计划</button>
                          <button className="danger" onClick={() => softDelete('dev_work_items', it.id, '工作项')}>删除</button>
                        </Dropdown>
                      </div>
                    ))}
                </div>

                <div className="card">
                  <h3>开发日志</h3>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <input className="input" style={{ flex: 1 }} placeholder="今天做了什么？回车记录"
                      value={newLog} onChange={(e) => setNewLog(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addLog()} />
                    <button className="btn" onClick={addLog}>记录</button>
                  </div>
                  {logs.length === 0
                    ? <p className="small muted" style={{ margin: 0 }}>暂无日志</p>
                    : logs.slice(0, 15).map((l) => (
                      <div className="list-item small" key={l.id}>
                        <span className="badge">{String(l.date)}</span>
                        <span className="title" style={{ whiteSpace: 'pre-wrap' }}>{String(l.content)}</span>
                        <button className="btn small" onClick={() => softDelete('dev_logs', l.id, '日志')}>✕</button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </QueryView>
      {projectEditor && (
        <ProjectEditor project={projectEditor === 'new' ? undefined : projectEditor} onClose={() => setProjectEditor(null)} />
      )}
      {itemEditor && <WorkItemEditor item={itemEditor} milestones={milestones} onClose={() => setItemEditor(null)} />}
    </div>
  );
}
