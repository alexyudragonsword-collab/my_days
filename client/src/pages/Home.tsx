import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, createRow, invalidateTable, Row, todayStr, updateRow } from '../api';
import { routeForRecord } from '../App';
import { PlanItemRow } from '../components/PlanItemRow';
import { useSoftDelete, useTable } from '../hooks';
import { useSettings } from '../settings';
import { PlanItemEditor, sortPlanItems } from './TodayPlan';
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
    toast(`已调整到 ${hour}:${minutes}`);
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
      <p className="small muted" style={{ marginBottom: 0 }}>拖动卡片到某一小时可调整时间，点击标题可编辑详情。</p>
    </div>
  );
}

// ---- 快速备忘 ----
function MemoPanel() {
  const memosQuery = useTable('memos', { status: 'active' });
  const [text, setText] = useState('');
  const softDelete = useSoftDelete();
  const { toast } = useUI();
  const navigate = useNavigate();

  const add = async () => {
    const t = text.trim();
    if (!t) return;
    await createRow('memos', { content: t, status: 'active' });
    invalidateTable('memos');
    setText('');
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
    toast('已转换，备忘已标记为已处理');
    if (type !== 'plan') navigate(routeForRecord(convertedTable, convertedId));
  };

  return (
    <div className="card">
      <h3>快速备忘</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          className="input"
          placeholder="随手记录，回车保存"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          onBlur={() => text.trim() && add()}
        />
      </div>
      <QueryView query={memosQuery} isEmpty={(rows) => rows.length === 0}
        empty={<p className="small muted" style={{ margin: 0 }}>暂无备忘，想到什么就记下来。</p>}>
        {(rows) => (
          <div>
            {rows.map((m) => (
              <div className="list-item" key={m.id}>
                <span className="title">{String(m.content)}</span>
                <Dropdown>
                  <button onClick={() => convert(m, 'plan')}>转为今日事项</button>
                  <button onClick={() => convert(m, 'media')}>转为自媒体灵感</button>
                  <button onClick={() => convert(m, 'game')}>转为游戏/娱乐项目</button>
                  <button onClick={() => convert(m, 'food')}>转为常用食物</button>
                  <button onClick={async () => {
                    await updateRow('memos', m.id, { status: 'archived' });
                    invalidateTable('memos');
                    toast('已归档');
                  }}>归档</button>
                  <button className="danger" onClick={() => softDelete('memos', m.id, '备忘')}>删除</button>
                </Dropdown>
              </div>
            ))}
          </div>
        )}
      </QueryView>
    </div>
  );
}

// ---- 需要关注 ----
function AttentionPanel() {
  const today = todayStr();
  const navigate = useNavigate();
  const overdueQuery = useTable('plan_items', { date_to: addDays(today, -1) });
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
        reason: `${r.date} 的计划未完成`,
        route: routeForRecord('plan_items', r.id),
        level: 'danger',
      });
    }
  }
  for (const f of followupsQuery.data || []) {
    const t = String(f.next_time || '').slice(0, 10);
    if (t && t <= addDays(today, 2)) {
      items.push({
        key: 'f' + f.id,
        text: String(f.content) || '客户跟进',
        reason: t <= today ? `跟进时间 ${t} 已到` : `${t} 需跟进`,
        route: routeForRecord('consult_followups', f.id),
        level: t <= today ? 'danger' : 'warn',
      });
    }
  }
  for (const d of deliverablesQuery.data || []) {
    const due = String(d.due_date || '');
    if (d.status !== '已完成' && due && due <= addDays(today, 3)) {
      items.push({
        key: 'd' + d.id,
        text: String(d.name),
        reason: due < today ? `交付已于 ${due} 到期` : `交付截止 ${due}`,
        route: routeForRecord('consult_deliverables', d.id),
        level: due <= today ? 'danger' : 'warn',
      });
    }
  }
  for (const s of sessionsQuery.data || []) {
    if (s.status !== '已完成') {
      items.push({
        key: 's' + s.id,
        text: String(s.name) || '今日训练',
        reason: '今天计划的训练还未完成',
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
        reason: `计划发布日期 ${pd} 已到`,
        route: routeForRecord('media_contents', m.id),
        level: 'warn',
      });
    }
  }

  return (
    <div className="card">
      <h3>需要关注</h3>
      {items.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>暂时没有需要特别关注的事项 ✅</p>
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
  const sessions = useTable('fitness_sessions');
  const meals = useTable('meals', { date: today });
  const mealFoods = useTable('meal_foods');
  const games = useTable('games');
  const planItems = useTable('plan_items', { date: today });

  const cards: { key: string; title: string; route: string; lines: { text: string; route?: string }[] }[] = [];

  if (show.media !== false) {
    const list = (media.data || []).filter((m) => m.stage === '制作中' || m.stage === '待发布').slice(0, 3);
    cards.push({
      key: 'media', title: '🎬 自媒体', route: '/media',
      lines: list.length
        ? list.map((m) => ({ text: `[${m.stage}] ${m.title}`, route: routeForRecord('media_contents', m.id) }))
        : [{ text: '没有制作中或待发布的内容' }],
    });
  }
  if (show.dev !== false) {
    const lines: { text: string; route?: string }[] = [];
    const activeProjects = (devProjects.data || []).filter((p) => p.status === '进行中');
    if (activeProjects.length) lines.push({ text: `进行中项目：${activeProjects.map((p) => p.name).join('、')}`, route: '/dev' });
    for (const ms of (devMilestones.data || []).filter((m) => m.status !== '已完成' && m.target_date && String(m.target_date) <= addDays(today, 14)).slice(0, 2)) {
      lines.push({ text: `里程碑 ${ms.name} 目标 ${ms.target_date}`, route: routeForRecord('dev_milestones', ms.id) });
    }
    for (const it of (devItems.data || []).filter((i) => i.priority === '高' && i.status !== '已完成').slice(0, 2)) {
      lines.push({ text: `[${it.type}] ${it.title}`, route: routeForRecord('dev_work_items', it.id) });
    }
    cards.push({ key: 'dev', title: '💻 开发工作', route: '/dev', lines: lines.length ? lines : [{ text: '暂无进行中的项目或高优先级问题' }] });
  }
  if (show.consult !== false) {
    const lines: { text: string; route?: string }[] = [];
    for (const c of (consultComms.data || []).filter((c) => String(c.time || '') >= today).slice(0, 2)) {
      lines.push({ text: `会议/沟通 ${String(c.time).replace('T', ' ')}`, route: routeForRecord('consult_comms', c.id) });
    }
    for (const d of (consultDeliverables.data || []).filter((d) => d.status !== '已完成' && d.due_date).slice(0, 2)) {
      lines.push({ text: `交付 ${d.name}（${d.due_date} 截止）`, route: routeForRecord('consult_deliverables', d.id) });
    }
    for (const f of (consultFollowups.data || []).slice(0, 2)) {
      lines.push({ text: `跟进：${f.content}`, route: routeForRecord('consult_followups', f.id) });
    }
    cards.push({ key: 'consult', title: '💼 咨询工作', route: '/consult', lines: lines.length ? lines : [{ text: '暂无近期会议、交付或跟进' }] });
  }
  if (show.fitness !== false) {
    const todaySessions = (sessions.data || []).filter((s) => s.date === today);
    const recent = (sessions.data || []).filter((s) => s.status === '已完成' && String(s.date) >= addDays(today, -7));
    cards.push({
      key: 'fitness', title: '💪 健身计划', route: '/fitness',
      lines: [
        todaySessions.length
          ? { text: `今日训练：${todaySessions.map((s) => `${s.name}（${s.status}）`).join('、')}`, route: routeForRecord('fitness_sessions', todaySessions[0].id) }
          : { text: '今天没有安排训练' },
        { text: `近 7 天完成训练 ${recent.length} 次` },
      ],
    });
  }
  if (show.diet !== false) {
    const hour = new Date().getHours();
    const nextMeal = hour < 10 ? '早餐' : hour < 14 ? '午餐' : hour < 20 ? '晚餐' : '加餐';
    const todayMealIds = new Set((meals.data || []).map((m) => m.id));
    const actual = (mealFoods.data || []).filter((f) => f.kind === 'actual' && todayMealIds.has(Number(f.meal_id)));
    const cal = actual.reduce((s, f) => s + (Number(f.calories) || 0), 0);
    const protein = actual.reduce((s, f) => s + (Number(f.protein) || 0), 0);
    const calGoal = settings.diet_calories;
    const proteinGoal = settings.diet_protein;
    cards.push({
      key: 'diet', title: '🥗 饮食计划', route: '/diet',
      lines: [
        { text: `下一餐：${nextMeal}` },
        { text: `今日已记录 ${Math.round(cal)} 千卡${calGoal ? ` / 目标 ${calGoal}` : ''}，蛋白质 ${Math.round(protein)}g${proteinGoal ? ` / ${proteinGoal}g` : ''}` },
      ],
    });
  }
  if (show.games !== false) {
    const playing = (games.data || []).filter((g) => g.status === '正在进行').slice(0, 2);
    const planned = (planItems.data || []).filter((p) => p.source_module === 'game');
    const lines: { text: string; route?: string }[] = playing.length
      ? playing.map((g) => ({ text: `${g.name}${g.next_goal ? `：${g.next_goal}` : ''}`, route: routeForRecord('games', g.id) }))
      : [{ text: '当前没有正在进行的游戏' }];
    if (planned.length) lines.push({ text: `今天安排了 ${planned.length} 段娱乐时间` });
    cards.push({ key: 'games', title: '🎮 游戏娱乐', route: '/games', lines });
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
          <h3>今日概况 <span className="sub">{fmtDate(today)}</span></h3>
          <div className="stat-row">
            <div className="stat"><div className="num">{doneCount} / {active.length}</div><div className="lbl">已完成 / 总事项</div></div>
            <div className="stat"><div className="num">{progress}%</div><div className="lbl">完成进度</div></div>
            <div className="stat"><div className="num">{scheduledMin ? fmtMinutes(scheduledMin) : '—'}</div><div className="lbl">预计已安排时间</div></div>
          </div>
          <div className="progress-bar"><div style={{ width: `${progress}%` }} /></div>
        </div>

        <div className="card">
          <h3>今日时间线</h3>
          <QueryView query={todayQuery}>
            {() =>
              timed.length === 0 ? (
                <EmptyState icon="🕒" text="还没有安排具体时间的事项" hint="给事项设置开始时间后会显示在时间线上" />
              ) : (
                <Timeline items={timed} onEdit={setEditing} />
              )
            }
          </QueryView>
        </div>

        <div className="card">
          <h3>待安排事项 <span className="sub">属于今天但未设置具体时间</span></h3>
          {untimed.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>没有待安排的事项</p>
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
