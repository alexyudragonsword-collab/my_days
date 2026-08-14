import React, { useEffect, useState } from 'react';
import { createRow, invalidateTable, Row, todayStr, updateRow } from '../api';
import { MEDIA_STAGES } from '../constants';
import { useAddToPlan, useClearOpenParam, useOpenParam, useSoftDelete, useTable } from '../hooks';
import { Drawer, Dropdown, EmptyState, Field, QueryView, useUI } from '../ui';

function MediaEditor(props: { item: Row; onClose: () => void }) {
  const it = props.item;
  const [form, setForm] = useState({
    title: String(it.title || ''),
    platform: String(it.platform || ''),
    form: String(it.form || ''),
    stage: String(it.stage || '灵感'),
    planned_date: String(it.planned_date || ''),
    actual_date: String(it.actual_date || ''),
    notes: String(it.notes || ''),
    asset_path: String(it.asset_path || ''),
    publish_link: String(it.publish_link || ''),
    views: it.views == null ? '' : String(it.views),
    likes: it.likes == null ? '' : String(it.likes),
    comments: it.comments == null ? '' : String(it.comments),
  });
  const { toast } = useUI();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    await updateRow('media_contents', it.id, {
      title: form.title,
      platform: form.platform || null,
      form: form.form || null,
      stage: form.stage,
      planned_date: form.planned_date || null,
      actual_date: form.actual_date || null,
      notes: form.notes || null,
      asset_path: form.asset_path || null,
      publish_link: form.publish_link || null,
      views: form.views === '' ? null : Number(form.views),
      likes: form.likes === '' ? null : Number(form.likes),
      comments: form.comments === '' ? null : Number(form.comments),
    });
    invalidateTable('media_contents');
    toast('已保存');
    props.onClose();
  };

  return (
    <Drawer title="内容详情" onClose={props.onClose}>
      <Field label="标题"><input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
      <div className="grid-2">
        <Field label="发布平台">
          <input className="input" value={form.platform} onChange={(e) => set('platform', e.target.value)} placeholder="B站 / 抖音 / 公众号…" />
        </Field>
        <Field label="内容形式">
          <input className="input" value={form.form} onChange={(e) => set('form', e.target.value)} placeholder="视频 / 图文 / 直播…" />
        </Field>
        <Field label="制作阶段">
          <select className="input" value={form.stage} onChange={(e) => set('stage', e.target.value)}>
            {MEDIA_STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="计划发布日期">
          <input className="input" type="date" value={form.planned_date} onChange={(e) => set('planned_date', e.target.value)} />
        </Field>
        <Field label="实际发布日期">
          <input className="input" type="date" value={form.actual_date} onChange={(e) => set('actual_date', e.target.value)} />
        </Field>
      </div>
      <Field label="文案 / 内容笔记">
        <textarea className="input" rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <Field label="素材本地位置">
        <input className="input" value={form.asset_path} onChange={(e) => set('asset_path', e.target.value)} placeholder="例如 D:\素材\第12期" />
      </Field>
      <Field label="发布链接">
        <input className="input" value={form.publish_link} onChange={(e) => set('publish_link', e.target.value)} placeholder="发布后粘贴链接" />
      </Field>
      <div className="grid-2">
        <Field label="播放/阅读量"><input className="input" type="number" value={form.views} onChange={(e) => set('views', e.target.value)} /></Field>
        <Field label="点赞数"><input className="input" type="number" value={form.likes} onChange={(e) => set('likes', e.target.value)} /></Field>
        <Field label="评论数"><input className="input" type="number" value={form.comments} onChange={(e) => set('comments', e.target.value)} /></Field>
      </div>
      {form.publish_link && (
        <p className="small"><a href={form.publish_link} target="_blank" rel="noreferrer">打开发布链接（外部链接）↗</a></p>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={props.onClose}>取消</button>
        <button className="btn primary" onClick={save}>保存</button>
      </div>
    </Drawer>
  );
}

export default function MediaPage() {
  const query = useTable('media_contents', { archived: 0 });
  const [editing, setEditing] = useState<Row | null>(null);
  const [quick, setQuick] = useState('');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const { toast, confirm } = useUI();
  const addToPlan = useAddToPlan();
  const softDelete = useSoftDelete();
  const openParam = useOpenParam();
  const clearOpen = useClearOpenParam();

  useEffect(() => {
    if (openParam?.table === 'media_contents' && query.data) {
      const found = query.data.find((r) => r.id === openParam.id);
      if (found) {
        setEditing(found);
        clearOpen();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, query.data]);

  const addIdea = async () => {
    const t = quick.trim();
    if (!t) return;
    await createRow('media_contents', { title: t, stage: '灵感' });
    invalidateTable('media_contents');
    setQuick('');
    toast('灵感已记录');
  };

  const moveStage = async (item: Row, stage: string) => {
    const patch: Record<string, unknown> = { stage };
    if (stage === '已发布' && !item.actual_date) patch.actual_date = todayStr();
    await updateRow('media_contents', item.id, patch);
    invalidateTable('media_contents');
  };

  const markPublished = async (item: Row) => {
    const link = window.prompt('发布链接（可留空）', String(item.publish_link || ''));
    await updateRow('media_contents', item.id, {
      stage: '已发布',
      actual_date: String(item.actual_date || '') || todayStr(),
      publish_link: link || null,
    });
    invalidateTable('media_contents');
    toast('已标记为已发布');
  };

  const archive = async (item: Row) => {
    if (!(await confirm({ title: '归档内容', body: `归档后「${item.title}」将不再显示在看板中。` }))) return;
    await updateRow('media_contents', item.id, { archived: 1 });
    invalidateTable('media_contents');
    toast('已归档');
  };

  return (
    <div>
      <div className="page-head">
        <h2>自媒体</h2>
        <input
          className="input"
          style={{ width: 280 }}
          placeholder="💡 快速记录灵感，回车保存"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addIdea()}
        />
      </div>
      <QueryView
        query={query}
        isEmpty={(rows) => rows.length === 0}
        empty={<EmptyState icon="🎬" text="还没有自媒体内容" hint="从记录一个灵感开始你的创作流程"
          action={<button className="btn primary" onClick={() => { setQuick('我的第一个灵感'); }}>先记录一个灵感</button>} />}
      >
        {(rows) => (
          <div className="kanban">
            {MEDIA_STAGES.map((stage) => (
              <div
                key={stage}
                className={'kanban-col' + (dragOver === stage ? ' drag-over' : '')}
                onDragOver={(e) => { e.preventDefault(); setDragOver(stage); }}
                onDragLeave={() => setDragOver((d) => (d === stage ? null : d))}
                onDrop={async (e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = Number(e.dataTransfer.getData('text/media-id'));
                  const item = rows.find((r) => r.id === id);
                  if (item && item.stage !== stage) await moveStage(item, stage);
                }}
              >
                <h4>{stage}（{rows.filter((r) => r.stage === stage).length}）</h4>
                {rows.filter((r) => r.stage === stage).map((item) => (
                  <div
                    key={item.id}
                    className="kanban-card"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/media-id', String(item.id))}
                  >
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="clickable" style={{ flex: 1 }} onClick={() => setEditing(item)}>{String(item.title)}</span>
                      <Dropdown>
                        <button onClick={() => setEditing(item)}>编辑详情</button>
                        {MEDIA_STAGES.filter((s) => s !== stage).map((s) => (
                          <button key={s} onClick={() => moveStage(item, s)}>移到「{s}」</button>
                        ))}
                        <button onClick={() => markPublished(item)}>标记已发布…</button>
                        <button onClick={() => addToPlan({ title: `推进内容：${item.title}`, sourceModule: 'media', sourceId: item.id })}>
                          加入今日计划
                        </button>
                        <button onClick={() => archive(item)}>归档</button>
                        <button className="danger" onClick={() => softDelete('media_contents', item.id, '内容')}>删除</button>
                      </Dropdown>
                    </div>
                    <div className="small muted" style={{ marginTop: 4 }}>
                      {[item.platform, item.form].filter(Boolean).join(' · ')}
                      {item.planned_date ? ` · 计划 ${item.planned_date}` : ''}
                      {item.stage === '已发布' && item.views != null ? ` · ${item.views} 播放` : ''}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </QueryView>
      {editing && <MediaEditor item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
