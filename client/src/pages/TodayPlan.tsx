import React, { useEffect, useMemo, useState } from 'react';
import { addDays, createRow, invalidateTable, Row, todayStr, updateRow } from '../api';
import { PlanItemRow } from '../components/PlanItemRow';
import { PLAN_STATUSES, PRIORITIES } from '../constants';
import { useClearOpenParam, useDraft, useOpenParam, useTable } from '../hooks';
import { useSettings } from '../settings';
import { t, weekdayName } from '../i18n';
import { Drawer, EmptyState, Field, QueryView, useUI } from '../ui';

function AddPlanForm(props: { date: string }) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('');
  const [priority, setPriority] = useState('中');
  const { toast } = useUI();

  const submit = async () => {
    const v = title.trim();
    if (!v) return;
    await createRow('plan_items', {
      title: v,
      date: props.date,
      start_time: time || null,
      duration_min: duration ? Number(duration) : null,
      priority,
    });
    invalidateTable('plan_items');
    setTitle('');
    setTime('');
    setDuration('');
    toast(t('已添加计划事项'));
  };

  return (
    <div className="row wrap" style={{ marginBottom: 12 }}>
      <input
        className="input"
        style={{ flex: 2, minWidth: 180 }}
        placeholder={t('添加事项，回车创建')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <input className="input" type="time" style={{ width: 110 }} value={time} onChange={(e) => setTime(e.target.value)} title={t('开始时间（可选）')} />
      <input className="input" type="number" style={{ width: 90 }} placeholder={t('分钟')} value={duration} onChange={(e) => setDuration(e.target.value)} title={t('预计时长（分钟，可选）')} />
      <select className="input" style={{ width: 70 }} value={priority} onChange={(e) => setPriority(e.target.value)}>
        {PRIORITIES.map((p) => <option key={p} value={p}>{t(p)}</option>)}
      </select>
      <button className="btn primary" onClick={submit}>{t('添加')}</button>
    </div>
  );
}

export function PlanItemEditor(props: { item: Row; onClose: () => void }) {
  const [form, setForm] = useState({
    title: String(props.item.title || ''),
    date: String(props.item.date || todayStr()),
    start_time: String(props.item.start_time || ''),
    duration_min: props.item.duration_min ? String(props.item.duration_min) : '',
    priority: String(props.item.priority || '中'),
    status: String(props.item.status || '未开始'),
    note: String(props.item.note || ''),
  });
  const { toast } = useUI();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    await updateRow('plan_items', props.item.id, {
      title: form.title,
      date: form.date,
      start_time: form.start_time || null,
      duration_min: form.duration_min ? Number(form.duration_min) : null,
      priority: form.priority,
      status: form.status,
      completed_at: form.status === '已完成' ? props.item.completed_at || new Date().toISOString() : null,
      note: form.note || null,
    });
    invalidateTable('plan_items');
    toast(t('已保存'));
    props.onClose();
  };

  return (
    <Drawer title={t('编辑计划事项')} onClose={props.onClose}>
      <Field label={t('标题')}>
        <input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label={t('日期')}>
          <input className="input" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label={t('开始时间')}>
          <input className="input" type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} />
        </Field>
        <Field label={t('预计时长（分钟）')}>
          <input className="input" type="number" value={form.duration_min} onChange={(e) => set('duration_min', e.target.value)} />
        </Field>
        <Field label={t('优先级')}>
          <select className="input" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{t(p)}</option>)}
          </select>
        </Field>
        <Field label={t('状态')}>
          <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {PLAN_STATUSES.map((s) => <option key={s} value={s}>{t(s)}</option>)}
          </select>
        </Field>
      </div>
      <Field label={t('备注')}>
        <textarea className="input" value={form.note} onChange={(e) => set('note', e.target.value)} />
      </Field>
      {props.item.source_module ? (
        <p className="small muted">{t('该事项关联了来源记录，标题会跟随来源记录实时显示。')}</p>
      ) : null}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={props.onClose}>{t('取消')}</button>
        <button className="btn primary" onClick={save}>{t('保存')}</button>
      </div>
    </Drawer>
  );
}

/** 当日复盘卡片（自动保存草稿，顶部“手动保存”会立即提交） */
export function DailyReviewCard(props: { date: string }) {
  const query = useTable('daily_reviews', { date: props.date });
  const existing = query.data?.[0];
  const { toast } = useUI();
  const save = async (content: string) => {
    try {
      if (existing) {
        await updateRow('daily_reviews', existing.id, { content });
      } else if (content.trim()) {
        await createRow('daily_reviews', { date: props.date, content });
      }
      invalidateTable('daily_reviews');
    } catch (e) {
      toast(t('复盘保存失败：') + (e instanceof Error ? e.message : e), { error: true });
    }
  };
  const draft = useDraft(String(existing?.content || ''), save);
  return (
    <div className="card">
      <h3>{t('当日复盘')} <span className="sub">{props.date}{t('（输入后自动保存）')}</span></h3>
      <textarea
        className="input"
        rows={3}
        placeholder={t('今天完成了什么？有什么值得记录或改进的？')}
        value={draft.value}
        onChange={(e) => draft.setValue(e.target.value)}
        onBlur={draft.flush}
      />
    </div>
  );
}

export function sortPlanItems(items: Row[]): Row[] {
  return [...items].sort((a, b) => {
    const ta = a.start_time ? String(a.start_time) : '99:99';
    const tb = b.start_time ? String(b.start_time) : '99:99';
    if (ta !== tb) return ta.localeCompare(tb);
    const pOrder: Record<string, number> = { 高: 0, 中: 1, 低: 2 };
    return (pOrder[String(a.priority)] ?? 1) - (pOrder[String(b.priority)] ?? 1);
  });
}

export default function TodayPlanPage() {
  const [tab, setTab] = useState<'today' | 'week' | 'history'>('today');
  const [editing, setEditing] = useState<Row | null>(null);
  const today = todayStr();
  const { settings, fmtDate } = useSettings();
  const openParam = useOpenParam();
  const clearOpen = useClearOpenParam();

  const weekDates = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const start = settings.week_start === 1 ? (day === 0 ? -6 : 1 - day) : -day;
    return Array.from({ length: 7 }, (_, i) => addDays(today, start + i));
  }, [today, settings.week_start]);

  const todayQuery = useTable('plan_items', { date: today });
  const weekQuery = useTable('plan_items', { date_from: weekDates[0], date_to: weekDates[6] });
  const historyQuery = useTable('plan_items', { date_to: addDays(today, -1) });
  const reviewsQuery = useTable('daily_reviews');

  // 搜索或摘要跳转定位：打开对应事项的编辑抽屉
  useEffect(() => {
    if (openParam?.table === 'plan_items' && todayQuery.data) {
      const found = [...(todayQuery.data || []), ...(historyQuery.data || []), ...(weekQuery.data || [])]
        .find((r) => r.id === openParam.id);
      if (found) {
        setEditing(found);
        clearOpen();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, todayQuery.data, historyQuery.data, weekQuery.data]);

  return (
    <div>
      <div className="page-head">
        <h2>{t('今日计划')}</h2>
        <div className="tabs">
          <button className={tab === 'today' ? 'active' : ''} onClick={() => setTab('today')}>{t('今日')}</button>
          <button className={tab === 'week' ? 'active' : ''} onClick={() => setTab('week')}>{t('本周')}</button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>{t('历史')}</button>
        </div>
      </div>

      {tab === 'today' && (
        <>
          <div className="card">
            <h3>{t('今天')} <span className="sub">{fmtDate(today)}</span></h3>
            <AddPlanForm date={today} />
            <QueryView
              query={todayQuery}
              isEmpty={(rows) => rows.length === 0}
              empty={<EmptyState icon="🗓️" text={t('今天还没有安排事项')} hint={t('用上方输入框添加，或在各模块中把行动加入今日计划')} />}
            >
              {(rows) => (
                <div>
                  {sortPlanItems(rows).map((item) => (
                    <PlanItemRow key={item.id} item={item} onEdit={setEditing} />
                  ))}
                </div>
              )}
            </QueryView>
          </div>
          <DailyReviewCard date={today} />
        </>
      )}

      {tab === 'week' && (
        <QueryView query={weekQuery}>
          {(rows) => (
            <>
              {weekDates.map((d) => {
                const dayRows = rows.filter((r) => r.date === d);
                const weekday = weekdayName(new Date(d + 'T12:00:00').getDay());
                return (
                  <div className="card" key={d}>
                    <h3>
                      {fmtDate(d)} {weekday}
                      {d === today && <span className="badge accent" style={{ marginLeft: 8 }}>{t('今天')}</span>}
                      <span className="sub">{t('{0} 项', dayRows.length)}</span>
                    </h3>
                    {dayRows.length === 0
                      ? <p className="muted small" style={{ margin: 0 }}>{t('无安排')}</p>
                      : sortPlanItems(dayRows).map((item) => <PlanItemRow key={item.id} item={item} onEdit={setEditing} />)}
                  </div>
                );
              })}
            </>
          )}
        </QueryView>
      )}

      {tab === 'history' && (
        <QueryView
          query={historyQuery}
          isEmpty={(rows) => rows.length === 0}
          empty={<EmptyState icon="📜" text={t('还没有历史记录')} hint={t('过去日期的计划和复盘会显示在这里')} />}
        >
          {(rows) => {
            const byDate = new Map<string, Row[]>();
            for (const r of rows) {
              const d = String(r.date);
              if (!byDate.has(d)) byDate.set(d, []);
              byDate.get(d)!.push(r);
            }
            const dates = [...byDate.keys()].sort().reverse().slice(0, 30);
            return (
              <>
                {dates.map((d) => {
                  const dayRows = byDate.get(d)!;
                  const doneCount = dayRows.filter((r) => r.status === '已完成').length;
                  const review = reviewsQuery.data?.find((r) => r.date === d);
                  return (
                    <div className="card" key={d}>
                      <h3>{fmtDate(d)} <span className="sub">{t('完成')} {doneCount}/{dayRows.length}</span></h3>
                      {sortPlanItems(dayRows).map((item) => <PlanItemRow key={item.id} item={item} onEdit={setEditing} />)}
                      {review && String(review.content).trim() && (
                        <p className="small muted" style={{ marginBottom: 0 }}>{t('复盘：')}{String(review.content)}</p>
                      )}
                    </div>
                  );
                })}
              </>
            );
          }}
        </QueryView>
      )}

      {editing && <PlanItemEditor item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
