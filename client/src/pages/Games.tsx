import React, { useEffect, useState } from 'react';
import { createRow, invalidateTable, Row, todayStr, updateRow } from '../api';
import { GAME_STATUSES } from '../constants';
import { useAddToPlan, useClearOpenParam, useOpenParam, useSoftDelete, useTable } from '../hooks';
import { t } from '../i18n';
import { Drawer, Dropdown, EmptyState, Field, fmtDateTime, fmtMinutes, QueryView, useUI } from '../ui';

function GameEditor(props: { game: Row; sessions: Row[]; onClose: () => void }) {
  const g = props.game;
  const [form, setForm] = useState({
    name: String(g.name || ''),
    platform: String(g.platform || ''),
    status: String(g.status || '想玩'),
    progress: String(g.progress || ''),
    next_goal: String(g.next_goal || ''),
    notes: String(g.notes || ''),
    rating: g.rating == null ? '' : String(g.rating),
    completed_date: String(g.completed_date || ''),
  });
  const { toast } = useUI();
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const sessions = props.sessions.filter((s) => Number(s.game_id) === g.id);
  const totalMin = sessions.reduce((s, x) => s + (Number(x.duration_min) || 0), 0);

  const save = async () => {
    await updateRow('games', g.id, {
      name: form.name,
      platform: form.platform || null,
      status: form.status,
      progress: form.progress || null,
      next_goal: form.next_goal || null,
      notes: form.notes || null,
      rating: form.rating === '' ? null : Number(form.rating),
      completed_date: form.completed_date || null,
    });
    invalidateTable('games');
    toast(t('已保存'));
    props.onClose();
  };

  return (
    <Drawer title={t('游戏 / 娱乐详情')} onClose={props.onClose}>
      <Field label={t('名称')}><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <div className="grid-2">
        <Field label={t('平台 / 活动类型')}>
          <input className="input" value={form.platform} onChange={(e) => set('platform', e.target.value)} placeholder={t('PC / Switch / 桌游…')} />
        </Field>
        <Field label={t('状态')}>
          <select className="input" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {GAME_STATUSES.map((s) => <option key={s} value={s}>{t(s)}</option>)}
          </select>
        </Field>
        <Field label={t('个人评分（1-10）')}>
          <input className="input" type="number" min={1} max={10} value={form.rating} onChange={(e) => set('rating', e.target.value)} />
        </Field>
        <Field label={t('完成日期')}>
          <input className="input" type="date" value={form.completed_date} onChange={(e) => set('completed_date', e.target.value)} />
        </Field>
      </div>
      <Field label={t('当前进度')}>
        <input className="input" value={form.progress} onChange={(e) => set('progress', e.target.value)} placeholder={t('例如：第三章 / 45 级')} />
      </Field>
      <Field label={t('下一次目标')}>
        <input className="input" value={form.next_goal} onChange={(e) => set('next_goal', e.target.value)} placeholder={t('例如：打完水神殿')} />
      </Field>
      <Field label={t('攻略 / 个人笔记')}>
        <textarea className="input" rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3>{t('游玩记录')} <span className="sub">{t('累计')} {fmtMinutes(totalMin) || t('0分钟')}</span></h3>
        {sessions.length === 0
          ? <p className="small muted" style={{ margin: 0 }}>{t('还没有游玩记录')}</p>
          : sessions.slice(0, 8).map((s) => (
            <div className="small list-item" key={s.id}>
              <span className="title">{fmtDateTime(String(s.start_time))}</span>
              <span className="muted">{s.end_time ? fmtMinutes(Number(s.duration_min)) : t('进行中…')}</span>
            </div>
          ))}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={props.onClose}>{t('取消')}</button>
        <button className="btn primary" onClick={save}>{t('保存')}</button>
      </div>
    </Drawer>
  );
}

export default function GamesPage() {
  const gamesQuery = useTable('games');
  const sessionsQuery = useTable('game_sessions');
  const [editing, setEditing] = useState<Row | null>(null);
  const [name, setName] = useState('');
  const { toast } = useUI();
  const addToPlan = useAddToPlan();
  const softDelete = useSoftDelete();
  const openParam = useOpenParam();
  const clearOpen = useClearOpenParam();

  useEffect(() => {
    if (openParam?.table === 'games' && gamesQuery.data) {
      const found = gamesQuery.data.find((r) => r.id === openParam.id);
      if (found) { setEditing(found); clearOpen(); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, gamesQuery.data]);

  const sessions = sessionsQuery.data || [];
  const runningByGame = new Map<number, Row>();
  for (const s of sessions) {
    if (!s.end_time) runningByGame.set(Number(s.game_id), s);
  }
  const totalByGame = new Map<number, number>();
  for (const s of sessions) {
    const gid = Number(s.game_id);
    totalByGame.set(gid, (totalByGame.get(gid) || 0) + (Number(s.duration_min) || 0));
  }

  const add = async () => {
    const v = name.trim();
    if (!v) return;
    await createRow('games', { name: v, status: '想玩' });
    invalidateTable('games');
    setName('');
    toast(t('已加入清单'));
  };

  const startPlay = async (g: Row) => {
    await createRow('game_sessions', { game_id: g.id, start_time: new Date().toISOString() });
    if (g.status === '想玩' || g.status === '暂停') {
      await updateRow('games', g.id, { status: '正在进行' });
    }
    invalidateTable('game_sessions', 'games');
    toast(t('开始游玩「{0}」，尽情享受！', String(g.name)));
  };

  const finishPlay = async (g: Row) => {
    const running = runningByGame.get(g.id);
    if (!running) return;
    const start = new Date(String(running.start_time)).getTime();
    const duration = Math.max(1, Math.round((Date.now() - start) / 60000));
    await updateRow('game_sessions', running.id, {
      end_time: new Date().toISOString(),
      duration_min: duration,
    });
    invalidateTable('game_sessions');
    toast(t('本次游玩 {0}，记得更新进度～', fmtMinutes(duration)));
    setEditing(g);
  };

  return (
    <div>
      <div className="page-head">
        <h2>{t('游戏娱乐')}</h2>
        <input
          className="input" style={{ width: 260 }}
          placeholder={t('添加游戏或娱乐项目，回车保存')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
      </div>
      <QueryView
        query={gamesQuery}
        isEmpty={(rows) => rows.length === 0}
        empty={<EmptyState icon="🎮" text={t('清单还是空的')} hint={t('把想玩的游戏或想做的娱乐活动加进来，没有截止日期，慢慢享受')} />}
      >
        {(rows) => (
          <>
            {GAME_STATUSES.map((status) => {
              const list = rows.filter((r) => r.status === status);
              if (list.length === 0) return null;
              return (
                <div className="card" key={status}>
                  <h3>{t(status)} <span className="sub">{t('{0} 项', list.length)}</span></h3>
                  {list.map((g) => {
                    const running = runningByGame.get(g.id);
                    return (
                      <div className="list-item" key={g.id}>
                        <span className="title clickable" onClick={() => setEditing(g)}>
                          {String(g.name)}
                          {g.platform ? <span className="muted small">（{String(g.platform)}）</span> : null}
                        </span>
                        {g.next_goal ? <span className="small muted">{t('下一步：')}{String(g.next_goal)}</span> : null}
                        {totalByGame.get(g.id) ? <span className="badge">{fmtMinutes(totalByGame.get(g.id)!)}</span> : null}
                        {g.rating != null && <span className="badge accent">★{String(g.rating)}</span>}
                        {running ? (
                          <button className="btn small primary" onClick={() => finishPlay(g)}>{t('结束本次游玩')}</button>
                        ) : (
                          <button className="btn small" onClick={() => startPlay(g)}>{t('开始游玩')}</button>
                        )}
                        <Dropdown>
                          <button onClick={() => setEditing(g)}>{t('编辑 / 更新进度')}</button>
                          {GAME_STATUSES.filter((s) => s !== status).map((s) => (
                            <button key={s} onClick={async () => {
                              await updateRow('games', g.id, {
                                status: s,
                                completed_date: s === '已完成' ? String(g.completed_date || '') || todayStr() : g.completed_date ?? null,
                              });
                              invalidateTable('games');
                            }}>{t('标记为「{0}」', t(s))}</button>
                          ))}
                          <button onClick={() => addToPlan({ title: t('娱乐时间：') + String(g.name), sourceModule: 'game', sourceId: g.id })}>
                            {t('把娱乐时间加入今日计划')}
                          </button>
                          <button className="danger" onClick={() => softDelete('games', g.id, '项目')}>{t('删除')}</button>
                        </Dropdown>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </QueryView>
      {editing && <GameEditor game={editing} sessions={sessions} onClose={() => setEditing(null)} />}
    </div>
  );
}
