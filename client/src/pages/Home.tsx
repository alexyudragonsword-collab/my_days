import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, createRow, invalidateTable, Row, todayStr, updateRow } from '../api';
import { routeForRecord } from '../App';
import { PlanItemRow } from '../components/PlanItemRow';
import { useSoftDelete, useTable } from '../hooks';
import { useSettings } from '../settings';
import { PlanItemEditor, sortPlanItems } from './TodayPlan';
import { t } from '../i18n';
import { Dropdown, EmptyState, fmtMinutes, QueryView, useUI } from '../ui';

// ---- 今日时间线（拖拽到小时槽调整时间；菜单编辑作为替代） ----
function Timeline(props: { items: Row[]; onEdit: (item: Row) => void }) {
  const [dragOver, setDragOver] = useState<number | null>(null);
  const { toast } = useUI();
  const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 6:00 - 23:00

  const drop = async (e: React.DragEvent, hour: number) => {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData('text/plan-item'));
    if (!id) return;
    const item = props.items.find((x) => x.id === id);
    if (!item) return;
    const minutes = String(item.start_time || '').split(':')[1] || '00';
    await updateRow('plan_items', id, { start_time: `${String(hour).padStart(2, '0')}:${minutes}` });
    invalidateTable('plan_items');
    toast(t('已调整到 {0}', `${hour}:${minutes}`));
  };

  return (
    <div>
      {hours.map((h) => {
        const slotItems = props.items.filter((it) => Number(String(it.start_time).split(':')[0]) === h);
        return (
          <div
            key={h}
            className={'timeline-slot' + (dragOver === h ? ' drag-over' : '')}
            onDragOver={(e) => { e.preventDefault(); setDragOver(h); }}
            onDragLeave={() => setDragOver((d) => (d === h ? null : d))}
            onDrop={(e) => drop(e, h)}
          >
            <div className="hour">{String(h).padStart(2, '0')}:00</div>
            <div className="slot-items">
              {slotItems.map((it) => {
                const done = it.status === '已完成';
                return (
                  <div
                    key={it.id}
                    className={'timeline-card' + (done ? ' done' : '')}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plan-item', String(it.id))}
                  >
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={async () => {
                        await updateRow('plan_items', it.id, {
                          status: done ? '未开始' : '已完成',
                          completed_at: done ? null : new Date().toISOString(),
                        });
                        invalidateTable('plan_items');
                      }}
                    />
                    <span className={'title clickable' + (done ? ' strike' : '')} onClick={() => props.onEdit(it)}>
                      {String((it.source_title as string) ?? it.title)}
                    </span>
                    <span className="small muted">{String(it.start_time)}{it.duration_min ? ` · ${fmtMinutes(Number(it.duration_min))}` : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="small muted" style={{ marginBottom: 0 }}>{t('拖动卡片到某一小时可调整时间，点击标题可编辑详情。')}</p>
    </div>
  );
}

// ---- 快速备忘 ----
function MemoPanel() {
  const memosQuery = useTable('memos');
  const [text, setText] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const addingRef = useRef(false);
  const softDelete = useSoftDelete();
  const { toast } = useUI();
  const navigate = useNavigate();

  const add = async () => {
    const v = text.trim();
    // 回车与失焦可能同时触发，用标志位避免重复提交
    if (!v || addingRef.current) return;
    addingRef.current = true;
    try {
      await createRow('memos', { content: v, status: 'active' });
      invalidateTable('memos');
      setText('');
    } finally {
      addingRef.current = false;
    }
  };

  const convert = async (memo: Row, type: 'plan' | 'media' | 'game' | 'food') => {
    const content = String(memo.content);
    let convertedTable = '';
    let convertedId = 0;
    if (type === 'plan') {
      const row = await createRow('plan_items', { title: content, date: todayStr(), source_module: 'memo', source_id: memo.id });
      convertedTable = 'plan_items'; convertedId = row.id;
    } else if (type === 'media') {
      const row = await createRow('media_contents', { title: content, stage: '灵感' });
      convertedTable = 'media_contents'; convertedId = row.id;
    } else if (type === 'game') {
      const row = await createRow('games', { name: content, status: '想玩' });
      convertedTable = 'games'; convertedId = row.id;
    } else {
      const row = await createRow('foods', { name: content });
      convertedTable = 'foods'; convertedId = row.id;
    }
    await updateRow('memos', memo.id, { status: 'converted', converted_type: convertedTable, converted_id: convertedId });
    invalidateTable('memos', 'plan_items', convertedTable);
    toast(t('已转换，备忘已标记为已处理'));
    if (type !== 'plan') navigate(routeForRecord(convertedTable, convertedId));
  };

  return (
    <div className="card">
      <h3>{t('快速备忘')}</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          className="input"
          placeholder={t('随手记录，回车保存')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          onBlur={() => text.trim() && add()}
        />
      </div>
      <QueryView query={memosQuery} isEmpty={(rows) => rows.filter((m) => m.status === 'active').length === 0 && !showInactive}
        empty={
          <div>
            <p className="small muted" style={{ margin: 0 }}>{t('暂无备忘，想到什么就记下来。')}</p>
            <InactiveMemosToggle rows={memosQuery.data || []} show={showInactive} setShow={setShowInactive} />
          </div>
        }>
        {(rows) => (
          <div>
            {rows.filter((m) => m.status === 'active').map((m) => (
              <div className="list-item" key={m.id}>
                <span className="title">{String(m.content)}</span>
                <Dropdown>
                  <button onClick={() => convert(m, 'plan')}>{t('转为今日事项')}</button>
                  <button onClick={() => convert(m, 'media')}>{t('转为自媒体灵感')}</button>
                  <button onClick={() => convert(m, 'game')}>{t('转为游戏/娱乐项目')}</button>
                  <button onClick={() => convert(m, 'food')}>{t('转为常用食物')}</button>
                  <button onClick={async () => {
                    await updateRow('memos', m.id, { status: 'archived' });
                    invalidateTable('memos');
                    toast(t('已归档'));
                  }}>{t('归档')}</button>
                  <button className="danger" onClick={() => softDelete('memos', m.id, '备忘')}>{t('删除')}</button>
                </Dropdown>
              </div>
            ))}
            <InactiveMemosToggle rows={rows} show={showInactive} setShow={setShowInactive} />
          </div>
        )}
      </QueryView>
    </div>
  );
}

/** 已归档 / 已转换备忘：默认折叠，可恢复、可打开转换目标（保留来源，避免重复处理） */
function InactiveMemosToggle(props: { rows: Row[]; show: boolean; setShow: (v: boolean) => void }) {
  const navigate = useNavigate();
  const softDelete = useSoftDelete();
  const { toast } = useUI();
  const inactive = props.rows.filter((m) => m.status === 'archived' || m.status === 'converted');
  if (inactive.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <button className="btn small" onClick={() => props.setShow(!props.show)}>
        {props.show ? '▾' : '▸'} {t('已归档 / 已转换')}（{inactive.length}）
      </button>
      {props.show && inactive.map((m) => (
        <div className="list-item small" key={m.id}>
          <span className="title muted">{String(m.content)}</span>
          <span className="badge">{m.status === 'converted' ? t('已转换') : t('已归档')}</span>
          {m.status === 'converted' && m.converted_type && m.converted_id ? (
            <button className="btn small" onClick={() => navigate(routeForRecord(String(m.converted_type), Number(m.converted_id)))}>
              {t('打开目标')}
            </button>
          ) : (
            <button className="btn small" onClick={async () => {
              await updateRow('memos', m.id, { status: 'active' });
              invalidateTable('memos');
              toast(t('已恢复为活动备忘'));
            }}>{t('恢复')}</button>
          )}
          <button className="btn small" onClick={() => softDelete('memos', m.id, '备忘')}>✕</button>
        </div>
      ))}
    </div>
  );
}

// ---- 需要关注 ----
function AttentionPanel() {
  const today = todayStr();
  const navigate = useNavigate();
  // 限定 90 天窗口，避免数据积累后全量拉取
  const overdueQuery = useTable('plan_items', { date_from: addDays(today, -90), date_to: addDays(today, -1) });
  const followupsQuery = useTable('consult_followups', { done: 0 });
  const deliverablesQuery = useTable('consult_deliverables');
  const sessionsQuery = useTable('fitness_sessions', { date: today });
  const mediaQuery = useTable('media_contents', { archived: 0 });

  const items: { key: string; text: string; reason: string; route: string; level: 'warn' | 'danger' }[] = [];
  for (const r of overdueQuery.data || []) {
    if (r.status === '未开始' || r.status === '进行中') {
      items.push({
        key: 'p' + r.id,
        text: String((r.source_title as string) ?? r.title),
        reason: t('{0} 的计划未完成', String(r.date)),
        route: routeForRecord('plan_items', r.id),
        level: 'danger',
      });
    }
  }
  for (const f of followupsQuery.data || []) {
    const ft = String(f.next_time || '').slice(0, 10);
    if (ft && ft <= addDays(today, 2)) {
      items.push({
        key: 'f' + f.id,
        text: String(f.content) || t('客户跟进'),
        reason: ft <= today ? t('跟进时间 {0} 已到', ft) : t('{0} 需跟进', ft),
        route: routeForRecord('consult_followups', f.id),
        level: ft <= today ? 'danger' : 'warn',
      });
    }
  }
  for (const d of deliverablesQuery.data || []) {
    const due = String(d.due_date || '');
    if (d.status !== '已完成' && due && due <= addDays(today, 3)) {
      items.push({
        key: 'd' + d.id,
        text: String(d.name),
        reason: due < today ? t('交付已于 {0} 到期', due) : t('交付截止 {0}', due),
        route: routeForRecord('consult_deliverables', d.id),
        level: due <= today ? 'danger' : 'warn',
      });
    }
  }
  for (const s of sessionsQuery.data || []) {
    if (s.status !== '已完成') {
      items.push({
        key: 's' + s.id,
        text: String(s.name) || t('今日训练'),
        reason: t('今天计划的训练还未完成'),
        route: routeForRecord('fitness_sessions', s.id),
        level: 'warn',
      });
    }
  }
  for (const m of mediaQuery.data || []) {
    const pd = String(m.planned_date || '');
    if (m.stage !== '已发布' && pd && pd <= today) {
      items.push({
        key: 'm' + m.id,
        text: String(m.title),
        reason: t('计划发布日期 {0} 已到', pd),
        route: routeForRecord('media_contents', m.id),
        level: 'warn',
      });
    }
  }

  return (
    <div className="card">
      <h3>{t('需要关注')}</h3>
      {items.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>{t('暂时没有需要特别关注的事项 ✅')}</p>
      ) : (
        items.slice(0, 8).map((it) => (
          <div className="list-item clickable" key={it.key} onClick={() => navigate(it.route)}>
            <span className={'badge ' + it.level}>!</span>
            <span className="title">{it.text}</span>
            <span className="small muted">{it.reason}</span>
          </div>
        ))
      )}
    </div>
  );
}

// ---- 模块摘要 ----
function SummaryCards() {
  const { settings } = useSettings();
  const navigate = useNavigate();
  const today = todayStr();
  const show = settings.home_summaries;

  const media = useTable('media_contents', { archived: 0 });
  const devProjects = useTable('dev_projects', { archived: 0 });
  const devItems = useTable('dev_work_items');
  const devMilestones = useTable('dev_milestones');
  const consultDeliverables = useTable('consult_deliverables');
  const consultFollowups = useTable('consult_followups', { done: 0 });
  const consultComms = useTable('consult_comms');
  const sessions = useTable('fitness_sessions', { date_from: addDays(today, -7), date_to: today });
  const meals = useTable('meals', { date: today });
  const mealFoods = useTable('meal_foods', { since: addDays(today, -2) });
  const games = useTable('games');
  const planItems = useTable('plan_items', { date: today });

  const cards: { key: string; title: string; route: string; lines: { text: string; route?: string }[] }[] = [];

  if (show.media !== false) {
    const list = (media.data || []).filter((m) => m.stage === '制作中' || m.stage === '待发布').slice(0, 3);
    cards.push({
      key: 'media', title: '🎬 ' + t('自媒体'), route: '/media',
      lines: list.length
        ? list.map((m) => ({ text: `[${t(String(m.stage))}] ${m.title}`, route: routeForRecord('media_contents', m.id) }))
        : [{ text: t('没有制作中或待发布的内容') }],
    });
  }
  if (show.dev !== false) {
    const lines: { text: string; route?: string }[] = [];
    const activeProjects = (devProjects.data || []).filter((p) => p.status === '进行中');
    if (activeProjects.length) lines.push({ text: t('进行中项目：') + activeProjects.map((p) => p.name).join(t('、')), route: '/dev' });
    for (const ms of (devMilestones.data || []).filter((m) => m.status !== '已完成' && m.target_date && String(m.target_date) <= addDays(today, 14)).slice(0, 2)) {
      lines.push({ text: t('里程碑 {0} 目标 {1}', String(ms.name), String(ms.target_date)), route: routeForRecord('dev_milestones', ms.id) });
    }
    for (const it of (devItems.data || []).filter((i) => i.priority === '高' && i.status !== '已完成').slice(0, 2)) {
      lines.push({ text: `[${t(String(it.type))}] ${it.title}`, route: routeForRecord('dev_work_items', it.id) });
    }
    cards.push({ key: 'dev', title: '💻 ' + t('开发工作'), route: '/dev', lines: lines.length ? lines : [{ text: t('暂无进行中的项目或高优先级问题') }] });
  }
  if (show.consult !== false) {
    const lines: { text: string; route?: string }[] = [];
    for (const c of (consultComms.data || []).filter((c) => String(c.time || '') >= today).slice(0, 2)) {
      lines.push({ text: t('会议/沟通') + ' ' + String(c.time).replace('T', ' '), route: routeForRecord('consult_comms', c.id) });
    }
    for (const d of (consultDeliverables.data || []).filter((d) => d.status !== '已完成' && d.due_date).slice(0, 2)) {
      lines.push({ text: t('交付 {0}（{1} 截止）', String(d.name), String(d.due_date)), route: routeForRecord('consult_deliverables', d.id) });
    }
    for (const f of (consultFollowups.data || []).slice(0, 2)) {
      lines.push({ text: t('跟进：') + String(f.content), route: routeForRecord('consult_followups', f.id) });
    }
    cards.push({ key: 'consult', title: '💼 ' + t('咨询工作'), route: '/consult', lines: lines.length ? lines : [{ text: t('暂无近期会议、交付或跟进') }] });
  }
  if (show.fitness !== false) {
    const todaySessions = (sessions.data || []).filter((s) => s.date === today);
    const recent = (sessions.data || []).filter((s) => s.status === '已完成' && String(s.date) >= addDays(today, -7));
    cards.push({
      key: 'fitness', title: '💪 ' + t('健身计划'), route: '/fitness',
      lines: [
        todaySessions.length
          ? { text: t('今日训练：') + todaySessions.map((s) => `${s.name}（${t(String(s.status))}）`).join(t('、')), route: routeForRecord('fitness_sessions', todaySessions[0].id) }
          : { text: t('今天没有安排训练') },
        { text: t('近 7 天完成训练 {0} 次', recent.length) },
      ],
    });
  }
  if (show.diet !== false) {
    const hour = new Date().getHours();
    const nextMeal = t(hour < 10 ? '早餐' : hour < 14 ? '午餐' : hour < 20 ? '晚餐' : '加餐');
    const todayMealIds = new Set((meals.data || []).map((m) => m.id));
    const actual = (mealFoods.data || []).filter((f) => f.kind === 'actual' && todayMealIds.has(Number(f.meal_id)));
    const cal = actual.reduce((s, f) => s + (Number(f.calories) || 0), 0);
    const protein = actual.reduce((s, f) => s + (Number(f.protein) || 0), 0);
    const calGoal = settings.diet_calories;
    const proteinGoal = settings.diet_protein;
    cards.push({
      key: 'diet', title: '🥗 ' + t('饮食计划'), route: '/diet',
      lines: [
        { text: t('下一餐：') + nextMeal },
        { text: t('今日已记录 {0} 千卡', Math.round(cal)) + (calGoal ? t(' / 目标 {0}', calGoal) : '') + t('，蛋白质 {0}g', Math.round(protein)) + (proteinGoal ? ` / ${proteinGoal}g` : '') },
      ],
    });
  }
  if (show.games !== false) {
    const playing = (games.data || []).filter((g) => g.status === '正在进行').slice(0, 2);
    const planned = (planItems.data || []).filter((p) => p.source_module === 'game');
    const lines: { text: string; route?: string }[] = playing.length
      ? playing.map((g) => ({ text: `${g.name}${g.next_goal ? `: ${g.next_goal}` : ''}`, route: routeForRecord('games', g.id) }))
      : [{ text: t('当前没有正在进行的游戏') }];
    if (planned.length) lines.push({ text: t('今天安排了 {0} 段娱乐时间', planned.length) });
    cards.push({ key: 'games', title: '🎮 ' + t('游戏娱乐'), route: '/games', lines });
  }

  return (
    <>
      {cards.map((c) => (
        <div className="card" key={c.key}>
          <h3 className="clickable" onClick={() => navigate(c.route)}>{c.title} ›</h3>
          {c.lines.map((l, i) => (
            <div key={i} className={'small' + (l.route ? ' list-item clickable' : ' muted')}
              style={l.route ? { padding: '4px 6px' } : { padding: '2px 0' }}
              onClick={l.route ? () => navigate(l.route!) : undefined}>
              {l.text}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export default function HomePage() {
  const today = todayStr();
  const { fmtDate } = useSettings();
  const todayQuery = useTable('plan_items', { date: today });
  const [editing, setEditing] = useState<Row | null>(null);

  const items = todayQuery.data || [];
  const active = items.filter((i) => i.status !== '已取消' && i.status !== '已延期');
  const doneCount = active.filter((i) => i.status === '已完成').length;
  const progress = active.length ? Math.round((doneCount / active.length) * 100) : 0;
  const scheduledMin = active.reduce((s, i) => s + (Number(i.duration_min) || 0), 0);
  const timed = active.filter((i) => i.start_time);
  const untimed = active.filter((i) => !i.start_time);

  return (
    <div className="home-grid">
      <div>
        <div className="card">
          <h3>{t('今日概况')} <span className="sub">{fmtDate(today)}</span></h3>
          <div className="stat-row">
            <div className="stat"><div className="num">{doneCount} / {active.length}</div><div className="lbl">{t('已完成 / 总事项')}</div></div>
            <div className="stat"><div className="num">{progress}%</div><div className="lbl">{t('完成进度')}</div></div>
            <div className="stat"><div className="num">{scheduledMin ? fmtMinutes(scheduledMin) : '—'}</div><div className="lbl">{t('预计已安排时间')}</div></div>
          </div>
          <div className="progress-bar"><div style={{ width: `${progress}%` }} /></div>
        </div>

        <div className="card">
          <h3>{t('今日时间线')}</h3>
          <QueryView query={todayQuery}>
            {() =>
              timed.length === 0 ? (
                <EmptyState icon="🕒" text={t('还没有安排具体时间的事项')} hint={t('给事项设置开始时间后会显示在时间线上')} />
              ) : (
                <Timeline items={timed} onEdit={setEditing} />
              )
            }
          </QueryView>
        </div>

        <div className="card">
          <h3>{t('待安排事项')} <span className="sub">{t('属于今天但未设置具体时间')}</span></h3>
          {untimed.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>{t('没有待安排的事项')}</p>
          ) : (
            sortPlanItems(untimed).map((item) => <PlanItemRow key={item.id} item={item} onEdit={setEditing} />)
          )}
        </div>
      </div>

      <div>
        <MemoPanel />
        <AttentionPanel />
        <SummaryCards />
      </div>

      {editing && <PlanItemEditor item={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
