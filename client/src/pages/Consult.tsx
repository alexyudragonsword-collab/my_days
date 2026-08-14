import React, { useEffect, useState } from 'react';
import { addDays, createRow, invalidateTable, Row, todayStr, updateRow } from '../api';
import { useAddToPlan, useClearOpenParam, useOpenParam, useSoftDelete, useTable } from '../hooks';
import { t } from '../i18n';
import { Dropdown, EmptyState, Field, fmtDateTime, fmtMinutes, Modal, QueryView, useUI } from '../ui';

function CommForm(props: { projectId: number; onDone: () => void }) {
  const [form, setForm] = useState({
    time: new Date().toISOString().slice(0, 16),
    form: '线上会议',
    notes: '',
    duration_min: '',
    fee_amount: '',
    settled: false,
  });
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v as never }));
  const { toast } = useUI();

  const save = async () => {
    await createRow('consult_comms', {
      project_id: props.projectId,
      time: form.time,
      form: form.form,
      notes: form.notes || null,
      duration_min: form.duration_min === '' ? null : Number(form.duration_min),
      fee_amount: form.fee_amount === '' ? null : Number(form.fee_amount),
      settled: form.settled ? 1 : 0,
    });
    invalidateTable('consult_comms');
    toast(t('沟通记录已保存'));
    props.onDone();
  };

  return (
    <Modal title={t('记录沟通 / 会议')} onClose={props.onDone}>
      <div className="grid-2">
        <Field label={t('时间')}>
          <input className="input" type="datetime-local" value={form.time} onChange={(e) => set('time', e.target.value)} />
        </Field>
        <Field label={t('形式')}>
          <select className="input" value={form.form} onChange={(e) => set('form', e.target.value)}>
            {['线上会议', '电话', '当面', '微信/消息', '邮件'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
          </select>
        </Field>
        <Field label={t('咨询时长（分钟）')}>
          <input className="input" type="number" value={form.duration_min} onChange={(e) => set('duration_min', e.target.value)} />
        </Field>
        <Field label={t('费用金额（可空）')}>
          <input className="input" type="number" value={form.fee_amount} onChange={(e) => set('fee_amount', e.target.value)} />
        </Field>
      </div>
      <Field label={t('沟通内容 / 会议记录')}>
        <textarea className="input" rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <label className="row small" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={form.settled} onChange={(e) => set('settled', e.target.checked)} />
        {t('费用已结算')}
      </label>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={props.onDone}>{t('取消')}</button>
        <button className="btn primary" onClick={save}>{t('保存')}</button>
      </div>
    </Modal>
  );
}

export default function ConsultPage() {
  const clientsQuery = useTable('consult_clients');
  const projectsQuery = useTable('consult_projects');
  const commsQuery = useTable('consult_comms');
  const deliverablesQuery = useTable('consult_deliverables');
  const followupsQuery = useTable('consult_followups');
  const [clientId, setClientId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [commOpen, setCommOpen] = useState(false);
  const [newClient, setNewClient] = useState('');
  const [newProject, setNewProject] = useState('');
  const [newDeliverable, setNewDeliverable] = useState({ name: '', due_date: '' });
  const [newFollowup, setNewFollowup] = useState({ next_time: '', content: '' });
  const { toast, confirm } = useUI();
  const addToPlan = useAddToPlan();
  const softDelete = useSoftDelete();
  const openParam = useOpenParam();
  const clearOpen = useClearOpenParam();

  const clients = (clientsQuery.data || []).filter((c) => !c.archived);
  const client = clients.find((c) => c.id === clientId) || clients[0] || null;
  const projects = (projectsQuery.data || []).filter((p) => !p.archived && client && Number(p.client_id) === client.id);
  const project = projects.find((p) => p.id === projectId) || projects[0] || null;
  const allProjects = projectsQuery.data || [];

  useEffect(() => {
    if (!openParam) return;
    const focusProject = (pid: number | null) => {
      const p = allProjects.find((x) => x.id === pid);
      if (p) {
        setClientId(Number(p.client_id));
        setProjectId(p.id);
      }
    };
    if (openParam.table === 'consult_clients' && clientsQuery.data) {
      setClientId(openParam.id);
      clearOpen();
    } else if (openParam.table === 'consult_projects' && allProjects.length) {
      focusProject(openParam.id);
      clearOpen();
    } else if (['consult_comms', 'consult_deliverables', 'consult_followups'].includes(openParam.table)) {
      const source = { consult_comms: commsQuery.data, consult_deliverables: deliverablesQuery.data, consult_followups: followupsQuery.data }[openParam.table];
      const rec = source?.find((r) => r.id === openParam.id);
      if (rec && allProjects.length) {
        focusProject(Number(rec.project_id));
        clearOpen();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, clientsQuery.data, allProjects, commsQuery.data, deliverablesQuery.data, followupsQuery.data]);

  const comms = (commsQuery.data || []).filter((c) => project && Number(c.project_id) === project.id)
    .sort((a, b) => String(b.time).localeCompare(String(a.time)));
  const deliverables = (deliverablesQuery.data || []).filter((d) => project && Number(d.project_id) === project.id);
  const followups = (followupsQuery.data || []).filter((f) => project && Number(f.project_id) === project.id)
    .sort((a, b) => String(a.next_time).localeCompare(String(b.next_time)));

  const totalMinutes = comms.reduce((s, c) => s + (Number(c.duration_min) || 0), 0);
  const totalFee = comms.reduce((s, c) => s + (Number(c.fee_amount) || 0), 0);
  const unsettled = comms.filter((c) => c.fee_amount != null && !c.settled).reduce((s, c) => s + Number(c.fee_amount), 0);

  const addClient = async () => {
    if (!newClient.trim()) return;
    const row = await createRow('consult_clients', { name: newClient.trim() });
    invalidateTable('consult_clients');
    setClientId(row.id);
    setNewClient('');
  };

  const addProject = async () => {
    if (!client || !newProject.trim()) return;
    const row = await createRow('consult_projects', { client_id: client.id, name: newProject.trim() });
    invalidateTable('consult_projects');
    setProjectId(row.id);
    setNewProject('');
  };

  return (
    <div>
      <div className="page-head">
        <h2>{t('咨询工作')}</h2>
        <input className="input" style={{ width: 180 }} placeholder={t('添加客户，回车保存')} value={newClient}
          onChange={(e) => setNewClient(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addClient()} />
      </div>
      <QueryView
        query={clientsQuery}
        isEmpty={() => clients.length === 0}
        empty={<EmptyState icon="💼" text={t('还没有客户')} hint={t('先添加一个客户，再为客户建立咨询项目')} />}
      >
        {() => (
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, alignItems: 'start' }}>
            <div className="card" style={{ padding: 10 }}>
              {clients.map((c) => (
                <div key={c.id} className="list-item clickable"
                  style={client?.id === c.id ? { background: 'var(--accent-soft)' } : undefined}
                  onClick={() => { setClientId(c.id); setProjectId(null); }}>
                  <span className="title">{String(c.name)}</span>
                </div>
              ))}
            </div>

            {client && (
              <div>
                <div className="card">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0 }}>{String(client.name)}</h3>
                    <div className="row">
                      <button className="btn small" onClick={async () => {
                        const note = window.prompt(t('客户备注'), String(client.note || ''));
                        if (note !== null) {
                          await updateRow('consult_clients', client.id, { note: note || null });
                          invalidateTable('consult_clients');
                        }
                      }}>{t('编辑备注')}</button>
                      <Dropdown>
                        <button onClick={async () => {
                          if (await confirm({ title: t('归档客户'), body: t('归档「{0}」及其显示？', String(client.name)) })) {
                            await updateRow('consult_clients', client.id, { archived: 1 });
                            invalidateTable('consult_clients');
                          }
                        }}>{t('归档客户')}</button>
                        <button className="danger" onClick={() => softDelete('consult_clients', client.id, '客户')}>{t('删除客户')}</button>
                      </Dropdown>
                    </div>
                  </div>
                  {client.note ? <p className="small muted" style={{ marginBottom: 0 }}>{String(client.note)}</p> : null}
                  <div className="row" style={{ marginTop: 10 }}>
                    <input className="input" style={{ flex: 1 }} placeholder={t('为该客户添加咨询项目，回车保存')} value={newProject}
                      onChange={(e) => setNewProject(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addProject()} />
                  </div>
                  <div className="row wrap" style={{ marginTop: 8 }}>
                    {projects.map((p) => (
                      <button key={p.id} className={'btn small' + (project?.id === p.id ? ' primary' : '')} onClick={() => setProjectId(p.id)}>
                        {String(p.name)}
                      </button>
                    ))}
                    {projects.length === 0 && <span className="small muted">{t('该客户暂无咨询项目')}</span>}
                  </div>
                </div>

                {project && (
                  <>
                    <div className="card">
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <h3 style={{ margin: 0 }}>{String(project.name)} <span className="sub">{t(String(project.status))}</span></h3>
                        <div className="row">
                          <button className="btn small" onClick={async () => {
                            const req = window.prompt(t('当前需求'), String(project.requirement || ''));
                            if (req !== null) {
                              await updateRow('consult_projects', project.id, { requirement: req || null });
                              invalidateTable('consult_projects');
                            }
                          }}>{t('编辑需求')}</button>
                          <select className="input" style={{ width: 100 }} value={String(project.status)} onChange={async (e) => {
                            await updateRow('consult_projects', project.id, { status: e.target.value });
                            invalidateTable('consult_projects');
                          }}>
                            {['进行中', '暂停', '已完成'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
                          </select>
                          <Dropdown>
                            <button onClick={() => addToPlan({ title: t('咨询：') + String(project.name), sourceModule: 'consult_project', sourceId: project.id })}>{t('加入今日计划')}</button>
                            <button onClick={async () => {
                              if (await confirm({ title: t('归档项目'), body: t('归档「{0}」？', String(project.name)) })) {
                                await updateRow('consult_projects', project.id, { archived: 1 });
                                invalidateTable('consult_projects');
                              }
                            }}>{t('归档项目')}</button>
                            <button className="danger" onClick={() => softDelete('consult_projects', project.id, '咨询项目')}>{t('删除项目')}</button>
                          </Dropdown>
                        </div>
                      </div>
                      {project.requirement ? <p className="small muted">{String(project.requirement)}</p> : null}
                      <div className="stat-row">
                        <div className="stat"><div className="num">{fmtMinutes(totalMinutes) || '0'}</div><div className="lbl">{t('累计咨询时长')}</div></div>
                        <div className="stat"><div className="num">￥{totalFee.toFixed(0)}</div><div className="lbl">{t('累计费用')}</div></div>
                        <div className="stat"><div className="num">￥{unsettled.toFixed(0)}</div><div className="lbl">{t('未结算')}</div></div>
                      </div>
                    </div>

                    <div className="card">
                      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <h3 style={{ margin: 0 }}>{t('沟通 / 会议')}</h3>
                        <button className="btn primary small" onClick={() => setCommOpen(true)}>＋ {t('记录沟通')}</button>
                      </div>
                      {comms.length === 0
                        ? <p className="small muted" style={{ margin: 0 }}>{t('暂无沟通记录')}</p>
                        : comms.slice(0, 10).map((c) => (
                          <div className="list-item small" key={c.id}>
                            <span className="badge">{fmtDateTime(String(c.time))}</span>
                            <span className="badge accent">{t(String(c.form || ''))}</span>
                            <span className="title">{String(c.notes || '')}</span>
                            {c.duration_min ? <span className="muted">{fmtMinutes(Number(c.duration_min))}</span> : null}
                            {c.fee_amount != null ? (
                              <span className={'badge ' + (c.settled ? 'ok' : 'warn')}>￥{String(c.fee_amount)}{c.settled ? ' ' + t('已结') : ' ' + t('未结')}</span>
                            ) : null}
                            <Dropdown>
                              {c.fee_amount != null && !c.settled && (
                                <button onClick={async () => {
                                  await updateRow('consult_comms', c.id, { settled: 1 });
                                  invalidateTable('consult_comms');
                                }}>{t('标记已结算')}</button>
                              )}
                              <button onClick={() => addToPlan({ title: t('会议：') + String(project.name), sourceModule: 'consult_comm', sourceId: c.id })}>{t('加入今日计划')}</button>
                              <button className="danger" onClick={() => softDelete('consult_comms', c.id, '沟通记录')}>{t('删除')}</button>
                            </Dropdown>
                          </div>
                        ))}
                    </div>

                    <div className="card">
                      <h3>{t('交付物')}</h3>
                      <div className="row" style={{ marginBottom: 8 }}>
                        <input className="input" style={{ flex: 1 }} placeholder={t('交付物名称')} value={newDeliverable.name}
                          onChange={(e) => setNewDeliverable((d) => ({ ...d, name: e.target.value }))} />
                        <input className="input" type="date" style={{ width: 150 }} value={newDeliverable.due_date}
                          onChange={(e) => setNewDeliverable((d) => ({ ...d, due_date: e.target.value }))} />
                        <button className="btn" onClick={async () => {
                          if (!newDeliverable.name.trim()) return;
                          await createRow('consult_deliverables', { project_id: project.id, name: newDeliverable.name.trim(), due_date: newDeliverable.due_date || null });
                          invalidateTable('consult_deliverables');
                          setNewDeliverable({ name: '', due_date: '' });
                        }}>{t('添加')}</button>
                      </div>
                      {deliverables.length === 0
                        ? <p className="small muted" style={{ margin: 0 }}>{t('暂无交付物')}</p>
                        : deliverables.map((d) => (
                          <div className="list-item" key={d.id}>
                            <input type="checkbox" checked={d.status === '已完成'} onChange={async () => {
                              await updateRow('consult_deliverables', d.id, { status: d.status === '已完成' ? '进行中' : '已完成' });
                              invalidateTable('consult_deliverables');
                            }} />
                            <span className={'title' + (d.status === '已完成' ? ' strike' : '')}>{String(d.name)}</span>
                            {d.due_date ? (
                              <span className={'badge ' + (String(d.due_date) < todayStr() && d.status !== '已完成' ? 'danger' : '')}>
                                {t('截止')} {String(d.due_date)}
                              </span>
                            ) : null}
                            <Dropdown>
                              <button onClick={async () => {
                                const nd = window.prompt(t('延期到（YYYY-MM-DD）'), String(d.due_date || addDays(todayStr(), 7)));
                                if (nd && /^\d{4}-\d{2}-\d{2}$/.test(nd)) {
                                  await updateRow('consult_deliverables', d.id, { due_date: nd });
                                  invalidateTable('consult_deliverables');
                                  toast(t('已延期'));
                                }
                              }}>{t('延期…')}</button>
                              <button onClick={() => addToPlan({ title: t('交付：') + String(d.name), sourceModule: 'consult_deliverable', sourceId: d.id })}>{t('加入今日计划')}</button>
                              <button className="danger" onClick={() => softDelete('consult_deliverables', d.id, '交付物')}>{t('删除')}</button>
                            </Dropdown>
                          </div>
                        ))}
                    </div>

                    <div className="card">
                      <h3>{t('跟进')}</h3>
                      <div className="row" style={{ marginBottom: 8 }}>
                        <input className="input" type="date" style={{ width: 150 }} value={newFollowup.next_time}
                          onChange={(e) => setNewFollowup((f) => ({ ...f, next_time: e.target.value }))} />
                        <input className="input" style={{ flex: 1 }} placeholder={t('跟进内容')} value={newFollowup.content}
                          onChange={(e) => setNewFollowup((f) => ({ ...f, content: e.target.value }))} />
                        <button className="btn" onClick={async () => {
                          if (!newFollowup.content.trim()) return;
                          await createRow('consult_followups', { project_id: project.id, next_time: newFollowup.next_time || todayStr(), content: newFollowup.content.trim() });
                          invalidateTable('consult_followups');
                          setNewFollowup({ next_time: '', content: '' });
                        }}>{t('添加')}</button>
                      </div>
                      {followups.length === 0
                        ? <p className="small muted" style={{ margin: 0 }}>{t('暂无跟进安排')}</p>
                        : followups.map((f) => (
                          <div className="list-item" key={f.id}>
                            <input type="checkbox" checked={!!f.done} onChange={async () => {
                              await updateRow('consult_followups', f.id, { done: f.done ? 0 : 1 });
                              invalidateTable('consult_followups');
                            }} />
                            <span className={'title' + (f.done ? ' strike' : '')}>{String(f.content)}</span>
                            <span className={'badge ' + (!f.done && String(f.next_time) <= todayStr() ? 'danger' : '')}>{String(f.next_time)}</span>
                            <Dropdown>
                              <button onClick={() => addToPlan({ title: t('跟进：') + String(f.content), sourceModule: 'consult_followup', sourceId: f.id })}>{t('加入今日计划')}</button>
                              <button className="danger" onClick={() => softDelete('consult_followups', f.id, '跟进')}>{t('删除')}</button>
                            </Dropdown>
                          </div>
                        ))}
                    </div>
                  </>
                )}
                {commOpen && project && <CommForm projectId={project.id} onDone={() => setCommOpen(false)} />}
              </div>
            )}
          </div>
        )}
      </QueryView>
    </div>
  );
}
