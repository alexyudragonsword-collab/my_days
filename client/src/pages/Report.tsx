import { useQuery } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { addDays, apiGet, todayStr } from '../api';
import { t, weekdayName } from '../i18n';
import { useSettings } from '../settings';
import { EmptyState, fmtMinutes, QueryView } from '../ui';

interface ReportData {
  from: string;
  to: string;
  plan: {
    total: number; done: number; pending: number; cancelled: number; postponed: number;
    rate: number; plannedMinutes: number; doneMinutes: number;
  };
  daily: { date: string; done: number; total: number }[];
  modules: {
    games: { minutes: number; sessions: number };
    consult: { minutes: number; comms: number; fee: number; settledFee: number };
    fitness: { sessions: number; completed: number; sets: number; volume: number };
    media: { published: number };
    dev: { logs: number; itemsDone: number };
    diet: { days: number; avgCalories: number; avgProtein: number };
    body: { first: number; last: number; count: number } | null;
  };
}

type Mode = 'week' | 'month';

/** 按当前周期模式与偏移量算出统计区间（周起始日跟随偏好设置） */
function computeRange(mode: Mode, offset: number, weekStart: 0 | 1): { from: string; to: string } {
  if (mode === 'week') {
    const today = todayStr();
    const day = new Date(today + 'T12:00:00').getDay();
    const from = addDays(today, -((day - weekStart + 7) % 7) + offset * 7);
    return { from, to: addDays(from, 6) };
  }
  const base = new Date();
  const first = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const last = new Date(base.getFullYear(), base.getMonth() + offset + 1, 0);
  return { from: todayStr(first), to: todayStr(last) };
}

function Stat(props: { num: React.ReactNode; label: string; hint?: string }) {
  return (
    <div className="stat">
      <div className="num">{props.num}</div>
      <div className="lbl">{props.label}</div>
      {props.hint && <div className="lbl muted">{props.hint}</div>}
    </div>
  );
}

/** 每日完成柱状图：每天一根柱，高度按当日事项数，深色部分为已完成 */
function DailyBars(props: { daily: ReportData['daily']; from: string; to: string }) {
  const byDate = new Map(props.daily.map((d) => [d.date, d]));
  const days: string[] = [];
  for (let cursor = props.from; cursor <= props.to; cursor = addDays(cursor, 1)) days.push(cursor);
  const max = Math.max(1, ...props.daily.map((d) => d.total));
  if (days.length === 0) return null;

  return (
    <div className="report-bars">
      {days.map((date) => {
        const row = byDate.get(date);
        const total = row?.total || 0;
        const done = row?.done || 0;
        const weekday = new Date(date + 'T12:00:00').getDay();
        return (
          <div className="report-bar" key={date} title={t('{0}：完成 {1} / {2}', date, done, total)}>
            <div className="bar-track">
              <div className="bar-total" style={{ height: `${(total / max) * 100}%` }}>
                <div className="bar-done" style={{ height: total ? `${(done / total) * 100}%` : '0%' }} />
              </div>
            </div>
            <div className="bar-label">{days.length > 14 ? date.slice(8) : weekdayName(weekday)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function ReportPage() {
  const { settings, fmtDate } = useSettings();
  const [mode, setMode] = useState<Mode>('week');
  const [offset, setOffset] = useState(0);
  const range = useMemo(() => computeRange(mode, offset, settings.week_start), [mode, offset, settings.week_start]);
  const query = useQuery({
    queryKey: ['report', range.from, range.to],
    queryFn: () => apiGet<ReportData>(`/api/report?from=${range.from}&to=${range.to}`),
  });

  const periodLabel = offset === 0
    ? t(mode === 'week' ? '本周' : '本月')
    : `${fmtDate(range.from)} ~ ${fmtDate(range.to)}`;

  return (
    <div>
      <div className="page-head">
        <h2>{t('统计报表')}</h2>
        <div className="tabs">
          {(['week', 'month'] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? 'active' : ''} onClick={() => { setMode(m); setOffset(0); }}>
              {t(m === 'week' ? '周报' : '月报')}
            </button>
          ))}
        </div>
        <div className="row">
          <button className="btn small" onClick={() => setOffset((o) => o - 1)}>‹ {t(mode === 'week' ? '上一周' : '上一月')}</button>
          <button className="btn small" disabled={offset >= 0} onClick={() => setOffset((o) => Math.min(0, o + 1))}>
            {t(mode === 'week' ? '下一周' : '下一月')} ›
          </button>
          {offset !== 0 && <button className="btn small" onClick={() => setOffset(0)}>{t('回到当前')}</button>}
        </div>
        <div className="spacer" />
        <span className="small muted">{periodLabel}　{fmtDate(range.from)} ~ {fmtDate(range.to)}</span>
      </div>

      <QueryView query={query}>
        {(data) => {
          const m = data.modules;
          const nothing = data.plan.total === 0 && m.games.sessions === 0 && m.consult.comms === 0
            && m.fitness.sessions === 0 && m.media.published === 0 && m.dev.logs === 0
            && m.dev.itemsDone === 0 && m.diet.days === 0 && !m.body;
          if (nothing) {
            return (
              <EmptyState
                icon="📊"
                text={t('这个区间还没有可统计的记录')}
                hint={t('安排计划、记录训练或游玩时长后，这里会汇总完成率与各模块投入。')}
              />
            );
          }
          return (
            <>
              <div className="card">
                <h3>{t('计划完成情况')}</h3>
                <div className="stat-row">
                  <Stat num={`${data.plan.rate}%`} label={t('完成率')} hint={t('不计已取消 / 已延期')} />
                  <Stat num={`${data.plan.done} / ${data.plan.done + data.plan.pending}`} label={t('已完成 / 有效事项')} />
                  <Stat num={data.plan.plannedMinutes ? fmtMinutes(data.plan.plannedMinutes) : '—'} label={t('计划投入时间')} />
                  <Stat num={data.plan.doneMinutes ? fmtMinutes(data.plan.doneMinutes) : '—'} label={t('已完成事项时长')} />
                  <Stat num={data.plan.postponed} label={t('已延期')} />
                  <Stat num={data.plan.cancelled} label={t('已取消')} />
                </div>
                <div className="progress-bar"><div style={{ width: `${data.plan.rate}%` }} /></div>
              </div>

              <div className="card">
                <h3>{t('每日完成')} <span className="sub">{t('浅色为当日事项总数，深色为已完成')}</span></h3>
                <DailyBars daily={data.daily} from={data.from} to={data.to} />
              </div>

              <div className="card">
                <h3>{t('各模块投入')}</h3>
                <div className="stat-row">
                  <Stat num={m.games.minutes ? fmtMinutes(m.games.minutes) : '—'} label={t('游玩时长')} hint={t('{0} 次', m.games.sessions)} />
                  <Stat num={m.consult.minutes ? fmtMinutes(m.consult.minutes) : '—'} label={t('咨询时长')} hint={t('{0} 次沟通', m.consult.comms)} />
                  <Stat num={m.fitness.completed} label={t('完成训练')} hint={t('共安排 {0} 次', m.fitness.sessions)} />
                  <Stat
                    num={m.fitness.volume ? Math.round(m.fitness.volume).toLocaleString() : '—'}
                    label={t('训练容量')}
                    hint={t('{0} 组 · 次数 × 重量累计', m.fitness.sets)}
                  />
                  <Stat num={m.media.published} label={t('发布内容')} />
                  <Stat num={m.dev.itemsDone} label={t('完成工作项')} hint={t('按最近更新时间统计')} />
                  <Stat num={m.dev.logs} label={t('开发日志')} />
                </div>
              </div>

              <div className="card">
                <h3>{t('饮食与身体')}</h3>
                <div className="stat-row">
                  <Stat num={m.diet.days} label={t('有记录的天数')} />
                  <Stat num={m.diet.avgCalories || '—'} label={t('日均热量（千卡）')} />
                  <Stat num={m.diet.avgProtein || '—'} label={t('日均蛋白质（g）')} />
                  {m.body ? (
                    <Stat
                      num={`${m.body.last}`}
                      label={t('最近体重')}
                      // 只有一条记录时没有“变化”可言，避免展示 0.0 造成误解
                      hint={m.body.count > 1
                        ? t('区间内 {0} 次记录，变化 {1}', m.body.count,
                          `${m.body.last - m.body.first > 0 ? '+' : ''}${(m.body.last - m.body.first).toFixed(1)}`)
                        : t('区间内 1 次记录')}
                    />
                  ) : (
                    <Stat num="—" label={t('最近体重')} hint={t('区间内没有身体数据')} />
                  )}
                </div>
              </div>

              {m.consult.fee > 0 && (
                <div className="card">
                  <h3>{t('咨询费用')} <span className="sub">{t('仅汇总沟通记录中已填写的费用')}</span></h3>
                  <div className="stat-row">
                    <Stat num={m.consult.fee.toLocaleString()} label={t('费用合计')} />
                    <Stat num={m.consult.settledFee.toLocaleString()} label={t('已结算')} />
                    <Stat num={(m.consult.fee - m.consult.settledFee).toLocaleString()} label={t('未结算')} />
                  </div>
                </div>
              )}
            </>
          );
        }}
      </QueryView>
    </div>
  );
}
