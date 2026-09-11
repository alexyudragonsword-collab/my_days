import React, { useEffect, useState } from 'react';
import { createRow, hardDeleteRow, invalidateTable, queryClient, Row, todayStr, updateRow } from '../api';
import { useAddToPlan, useClearOpenParam, useOpenParam, useSoftDelete, useTable } from '../hooks';
import { useSettings } from '../settings';
import { t, weekdayCharLabel } from '../i18n';
import { Drawer, Dropdown, EmptyState, Field, Modal, QueryView, useUI } from '../ui';

function TrendSvg(props: { points: { label: string; value: number }[]; unit?: string; color?: string }) {
  const pts = props.points;
  if (pts.length < 2) return <p className="small muted">{t('数据不足两条，暂无法绘制趋势')}</p>;
  const w = 320, h = 100, pad = 6;
  const values = pts.map((p) => p.value);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (w - pad * 2)) / (pts.length - 1);
  const y = (v: number) => h - pad - ((v - min) * (h - pad * 2)) / span;
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  return (
    <div>
      <svg className="trend-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <path d={d} fill="none" stroke={props.color || 'var(--accent)'} strokeWidth={2} />
        {pts.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={2.5} fill={props.color || 'var(--accent)'}>
            <title>{p.label}: {p.value}{props.unit || ''}</title>
          </circle>
        ))}
      </svg>
      <div className="row small muted" style={{ justifyContent: 'space-between' }}>
        <span>{pts[0].label}</span>
        <span>{t('最新')} {pts[pts.length - 1].value}{props.unit || ''}</span>
      </div>
    </div>
  );
}

interface ExerciseDraft { name: string; target_sets: string; target_reps: string; target_weight: string; rest_sec: string }
const emptyExercise = (): ExerciseDraft => ({ name: '', target_sets: '3', target_reps: '10', target_weight: '', rest_sec: '90' });

function TemplateEditor(props: { template?: Row; exercises: Row[]; onClose: () => void }) {
  const tpl = props.template;
  const [name, setName] = useState(String(tpl?.name || ''));
  const [weekdays, setWeekdays] = useState<string[]>(String(tpl?.weekdays || '').split(',').filter(Boolean));
  const [rows, setRows] = useState<ExerciseDraft[]>(
    tpl
      ? props.exercises
          .filter((e) => Number(e.template_id) === tpl.id)
          .sort((a, b) => Number(a.sort) - Number(b.sort))
          .map((e) => ({
            name: String(e.name),
            target_sets: String(e.target_sets ?? ''),
            target_reps: String(e.target_reps ?? ''),
            target_weight: String(e.target_weight ?? ''),
            rest_sec: String(e.rest_sec ?? ''),
          }))
      : [emptyExercise()]
  );
  const { toast } = useUI();
  const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

  const save = async () => {
    if (!name.trim()) { toast(t('请填写模板名称'), { error: true }); return; }
    let templateId: number;
    if (tpl) {
      await updateRow('fitness_templates', tpl.id, { name: name.trim(), weekdays: weekdays.join(',') });
      templateId = tpl.id;
      // 编辑时重建动作列表：旧动作行彻底删除（派生数据，不进回收站）
      for (const e of props.exercises.filter((e) => Number(e.template_id) === tpl.id)) {
        await hardDeleteRow('fitness_template_exercises', e.id);
      }
    } else {
      const row = await createRow('fitness_templates', { name: name.trim(), weekdays: weekdays.join(',') });
      templateId = row.id;
    }
    let sort = 0;
    for (const r of rows) {
      if (!r.name.trim()) continue;
      await createRow('fitness_template_exercises', {
        template_id: templateId,
        name: r.name.trim(),
        target_sets: r.target_sets ? Number(r.target_sets) : null,
        target_reps: r.target_reps ? Number(r.target_reps) : null,
        target_weight: r.target_weight ? Number(r.target_weight) : null,
        rest_sec: r.rest_sec ? Number(r.rest_sec) : null,
        sort: sort++,
      });
    }
    invalidateTable('fitness_templates', 'fitness_template_exercises');
    toast(t('模板已保存'));
    props.onClose();
  };

  return (
    <Modal title={tpl ? t('编辑训练模板') : t('新建训练模板')} onClose={props.onClose} width={640}>
      <Field label={t('模板名称')}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('例如：推力日 / 腿部训练')} />
      </Field>
      <Field label={t('计划星期')}>
        <div className="row wrap">
          {WEEKDAYS.map((d) => (
            <label key={d} className="row small" style={{ gap: 4 }}>
              <input
                type="checkbox"
                checked={weekdays.includes(d)}
                onChange={(e) => setWeekdays((w) => (e.target.checked ? [...w, d] : w.filter((x) => x !== d)))}
              />
              {weekdayCharLabel(d)}
            </label>
          ))}
        </div>
      </Field>
      <Field label={t('动作（名称 / 组数 / 次数 / 重量kg / 休息秒）')}>
        <div>
          {rows.map((r, i) => (
            <div className="row" key={i} style={{ marginBottom: 6 }}>
              <input className="input" style={{ flex: 2 }} placeholder={t('动作名称')} value={r.name}
                onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
              <input className="input" style={{ width: 60 }} type="number" placeholder={t('组')} value={r.target_sets}
                onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, target_sets: e.target.value } : y)))} />
              <input className="input" style={{ width: 60 }} type="number" placeholder={t('次')} value={r.target_reps}
                onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, target_reps: e.target.value } : y)))} />
              <input className="input" style={{ width: 70 }} type="number" placeholder="kg" value={r.target_weight}
                onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, target_weight: e.target.value } : y)))} />
              <input className="input" style={{ width: 70 }} type="number" placeholder={t('休息')} value={r.rest_sec}
                onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, rest_sec: e.target.value } : y)))} />
              <button className="btn small" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button className="btn small" onClick={() => setRows((x) => [...x, emptyExercise()])}>＋ {t('添加动作')}</button>
        </div>
      </Field>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={props.onClose}>{t('取消')}</button>
        <button className="btn primary" onClick={save}>{t('保存模板')}</button>
      </div>
    </Modal>
  );
}

function SessionDetail(props: { session: Row; onClose: () => void }) {
  const s = props.session;
  const setsQuery = useTable('fitness_session_sets');
  const [notes, setNotes] = useState(String(s.notes || ''));
  const { toast } = useUI();
  const allSets = setsQuery.data || [];
  const sets = allSets.filter((x) => Number(x.session_id) === s.id).sort((a, b) => a.id - b.id);
  const exercises = [...new Set(sets.map((x) => String(x.exercise_name)))];

  /** 上一次同动作数据（其他训练中该动作已完成组） */
  const lastOf = (exercise: string): string => {
    const prev = allSets
      .filter((x) => Number(x.session_id) !== s.id && String(x.exercise_name) === exercise && x.done)
      .sort((a, b) => b.id - a.id);
    if (prev.length === 0) return t('首次记录该动作');
    const bySession = prev.filter((x) => x.session_id === prev[0].session_id);
    return t('上次：') + bySession.reverse().map((x) => t('{0}次×{1}kg', String(x.reps ?? '?'), String(x.weight ?? '?'))).join(t('，'));
  };

  const recordSet = async (set: Row, reps: string, weight: string) => {
    await updateRow('fitness_session_sets', set.id, {
      reps: reps === '' ? null : Number(reps),
      weight: weight === '' ? null : Number(weight),
      done: 1,
    });
    invalidateTable('fitness_session_sets');
  };

  const finish = async () => {
    const doneSets = sets.filter((x) => x.done);
    const volume = doneSets.reduce((sum, x) => sum + (Number(x.reps) || 0) * (Number(x.weight) || 0), 0);
    await updateRow('fitness_sessions', s.id, { status: '已完成', notes: notes || null });
    invalidateTable('fitness_sessions');
    toast(t('训练完成！共 {0} 组，总容量 {1} kg 🎉', doneSets.length, Math.round(volume)));
    props.onClose();
  };

  return (
    <Drawer title={`${s.name || '训练'} · ${s.date}`} onClose={props.onClose}>
      <p className="small muted">{t('状态：')}{t(String(s.status))}{t('。逐组填写实际次数和重量后点击 ✓。')}</p>
      {exercises.map((ex) => (
        <div key={ex} style={{ marginBottom: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{ex}</strong>
            <span className="small muted">{lastOf(ex)}</span>
          </div>
          {sets.filter((x) => String(x.exercise_name) === ex).map((set) => (
            <SetRow key={set.id} set={set} onRecord={recordSet} />
          ))}
        </div>
      ))}
      <Field label={t('训练感受 / 备注')}>
        <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {s.status !== '已完成' && (
          <button className="btn" onClick={async () => {
            await updateRow('fitness_sessions', s.id, { status: '进行中' });
            invalidateTable('fitness_sessions');
          }}>{t('标记进行中')}</button>
        )}
        <button className="btn primary" onClick={finish}>{t('完成训练')}</button>
      </div>
    </Drawer>
  );
}

function SetRow(props: { set: Row; onRecord: (set: Row, reps: string, weight: string) => void }) {
  const { set } = props;
  const [reps, setReps] = useState(set.reps == null ? String(set.target_reps ?? '') : String(set.reps));
  const [weight, setWeight] = useState(set.weight == null ? String(set.target_weight ?? '') : String(set.weight));
  return (
    <div className="row small" style={{ marginTop: 4 }}>
      <span style={{ width: 50 }} className="muted">{t('第{0}组', String(set.set_no))}</span>
      <input className="input" style={{ width: 70 }} type="number" placeholder={t('次数')} value={reps} onChange={(e) => setReps(e.target.value)} />
      <span className="muted">{t('次')} ×</span>
      <input className="input" style={{ width: 70 }} type="number" placeholder="kg" value={weight} onChange={(e) => setWeight(e.target.value)} />
      <span className="muted">kg</span>
      <button
        className={'btn small' + (set.done ? ' primary' : '')}
        onClick={() => props.onRecord(set, reps, weight)}
        title={set.done ? t('已记录，点击更新') : t('记录本组')}
      >✓</button>
    </div>
  );
}

function BodyMetricsCard() {
  const query = useTable('body_metrics');
  const [weight, setWeight] = useState('');
  const [measurements, setMeasurements] = useState('');
  const softDelete = useSoftDelete();
  const { toast } = useUI();
  const rows = [...(query.data || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const add = async () => {
    if (!weight && !measurements) return;
    await createRow('body_metrics', {
      date: todayStr(),
      weight: weight === '' ? null : Number(weight),
      measurements: measurements || null,
    });
    invalidateTable('body_metrics');
    setWeight(''); setMeasurements('');
    toast(t('身体数据已记录'));
  };

  return (
    <div className="card">
      <h3>{t('身体数据')}</h3>
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <input className="input" style={{ width: 110 }} type="number" placeholder={t('体重 kg')} value={weight} onChange={(e) => setWeight(e.target.value)} />
        <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder={t('围度等（如 腰围82cm）')} value={measurements} onChange={(e) => setMeasurements(e.target.value)} />
        <button className="btn primary" onClick={add}>{t('记录')}</button>
      </div>
      <TrendSvg
        points={rows.filter((r) => r.weight != null).slice(-20).map((r) => ({ label: String(r.date), value: Number(r.weight) }))}
        unit="kg"
      />
      {rows.slice(-5).reverse().map((r) => (
        <div className="list-item small" key={r.id}>
          <span className="title">{String(r.date)}</span>
          <span>{r.weight != null ? `${r.weight}kg` : ''} {String(r.measurements || '')}</span>
          <button className="btn small" onClick={() => softDelete('body_metrics', r.id, '身体数据')}>✕</button>
        </div>
      ))}
    </div>
  );
}

export default function FitnessPage() {
  const templatesQuery = useTable('fitness_templates');
  const exercisesQuery = useTable('fitness_template_exercises');
  const sessionsQuery = useTable('fitness_sessions');
  const setsQuery = useTable('fitness_session_sets');
  const [editingTemplate, setEditingTemplate] = useState<Row | null | 'new'>(null);
  const [activeSession, setActiveSession] = useState<Row | null>(null);
  const { toast, prompt } = useUI();
  const addToPlan = useAddToPlan();
  const softDelete = useSoftDelete();
  const openParam = useOpenParam();
  const clearOpen = useClearOpenParam();

  useEffect(() => {
    if (openParam?.table === 'fitness_sessions' && sessionsQuery.data) {
      const found = sessionsQuery.data.find((r) => r.id === openParam.id);
      if (found) { setActiveSession(found); clearOpen(); }
    }
    if (openParam?.table === 'fitness_templates' && templatesQuery.data) {
      const found = templatesQuery.data.find((r) => r.id === openParam.id);
      if (found) { setEditingTemplate(found); clearOpen(); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, sessionsQuery.data, templatesQuery.data]);

  /** 从模板创建训练：安排到某天（status=计划中）或立即开始（status=进行中） */
  const startFromTemplate = async (template: Row, date: string, begin: boolean) => {
    const session = await createRow('fitness_sessions', {
      date,
      template_id: template.id,
      name: String(template.name),
      status: begin ? '进行中' : '计划中',
    });
    const exs = (exercisesQuery.data || [])
      .filter((e) => Number(e.template_id) === template.id)
      .sort((a, b) => Number(a.sort) - Number(b.sort));
    for (const ex of exs) {
      const setCount = Number(ex.target_sets) || 3;
      for (let i = 1; i <= setCount; i++) {
        await createRow('fitness_session_sets', {
          session_id: session.id,
          exercise_name: String(ex.name),
          set_no: i,
          target_reps: ex.target_reps ?? null,
          target_weight: ex.target_weight ?? null,
        });
      }
    }
    invalidateTable('fitness_sessions', 'fitness_session_sets');
    if (begin) {
      setActiveSession(session);
      toast(t('训练开始，加油！'));
    } else {
      toast(t('已安排到 {0}', date));
    }
  };

  /** 复制模板：连同动作一起复制一份，复制后直接打开编辑（“复制一份再改”比重建快） */
  const duplicateTemplate = async (template: Row) => {
    const name = await prompt({
      title: t('复制训练模板'),
      label: t('新模板名称'),
      defaultValue: `${String(template.name)} ${t('副本')}`,
      validate: (v) => (v.trim() ? null : t('请填写模板名称')),
    });
    if (!name) return;
    const copy = await createRow('fitness_templates', {
      name: name.trim(),
      weekdays: template.weekdays ?? null,
    });
    const exs = (exercisesQuery.data || [])
      .filter((e) => Number(e.template_id) === template.id)
      .sort((a, b) => Number(a.sort) - Number(b.sort));
    for (const ex of exs) {
      await createRow('fitness_template_exercises', {
        template_id: copy.id,
        name: ex.name,
        target_sets: ex.target_sets ?? null,
        target_reps: ex.target_reps ?? null,
        target_weight: ex.target_weight ?? null,
        rest_sec: ex.rest_sec ?? null,
        sort: ex.sort ?? 0,
      });
    }
    invalidateTable('fitness_templates', 'fitness_template_exercises');
    // 必须等动作列表刷新到位再打开编辑器：编辑器保存时会按当前列表重建动作，
    // 若此时拿到的还是旧数据，复制过来的动作会被清空。
    await queryClient.refetchQueries({ queryKey: ['t', 'fitness_template_exercises'] });
    toast(t('已复制 {0} 个动作，可直接修改', exs.length));
    setEditingTemplate(copy);
  };

  const sessions = [...(sessionsQuery.data || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const allSets = setsQuery.data || [];
  const completed = sessions.filter((s) => s.status === '已完成');
  const volumeOf = (sessionId: number) =>
    allSets.filter((x) => Number(x.session_id) === sessionId && x.done)
      .reduce((sum, x) => sum + (Number(x.reps) || 0) * (Number(x.weight) || 0), 0);

  return (
    <div>
      <div className="page-head">
        <h2>{t('健身计划')}</h2>
        <button className="btn primary" onClick={() => setEditingTemplate('new')}>＋ {t('新建训练模板')}</button>
      </div>

      <div className="card">
        <h3>{t('训练模板')}</h3>
        <QueryView
          query={templatesQuery}
          isEmpty={(rows) => rows.length === 0}
          empty={<EmptyState icon="💪" text={t('还没有训练模板')} hint={t('先建一个模板（例如“推力日”），之后可以一键开始训练')}
            action={<button className="btn primary" onClick={() => setEditingTemplate('new')}>{t('新建模板')}</button>} />}
        >
          {(rows) => (
            <>
              {rows.map((tpl) => {
                const exs = (exercisesQuery.data || []).filter((e) => Number(e.template_id) === tpl.id);
                return (
                  <div className="list-item" key={tpl.id}>
                    <span className="title">
                      {String(tpl.name)}
                      <span className="small muted">
                        {tpl.weekdays ? `（${String(tpl.weekdays).split(',').map(weekdayCharLabel).join(t('、'))}）` : ''} · {t('{0} 个动作', exs.length)}
                      </span>
                    </span>
                    <button className="btn small primary" onClick={() => startFromTemplate(tpl, todayStr(), true)}>{t('开始训练')}</button>
                    <Dropdown>
                      <button onClick={() => setEditingTemplate(tpl)}>{t('编辑模板')}</button>
                      <button onClick={() => startFromTemplate(tpl, todayStr(), false)}>{t('安排到今天')}</button>
                      <button onClick={async () => {
                        const d = await prompt({
                          title: t('安排训练'),
                          label: t('安排到哪一天'),
                          inputType: 'date',
                          defaultValue: todayStr(),
                          validate: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? null : t('请选择有效日期')),
                        });
                        if (d) startFromTemplate(tpl, d, false);
                      }}>{t('安排到指定日期…')}</button>
                      <button onClick={() => duplicateTemplate(tpl)}>{t('复制模板…')}</button>
                      <button onClick={() => addToPlan({ title: t('训练：') + String(tpl.name), sourceModule: 'fitness_template', sourceId: tpl.id })}>
                        {t('加入今日计划')}
                      </button>
                      <button className="danger" onClick={() => softDelete('fitness_templates', tpl.id, '模板')}>{t('删除')}</button>
                    </Dropdown>
                  </div>
                );
              })}
            </>
          )}
        </QueryView>
      </div>

      <div className="card">
        <h3>{t('训练记录')}</h3>
        {sessions.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>{t('还没有训练记录，从模板开始第一次训练吧。')}</p>
        ) : (
          sessions.slice(0, 12).map((s) => (
            <div className="list-item" key={s.id}>
              <span className="title clickable" onClick={() => setActiveSession(s)}>
                {String(s.date)} {String(s.name)}
              </span>
              <span className={'badge ' + (s.status === '已完成' ? 'ok' : s.status === '进行中' ? 'warn' : '')}>{t(String(s.status))}</span>
              {s.status === '已完成' && <span className="small muted">{t('容量')} {Math.round(volumeOf(s.id))}kg</span>}
              <Dropdown>
                <button onClick={() => setActiveSession(s)}>{t('打开 / 记录')}</button>
                <button onClick={() => addToPlan({ title: t('训练：') + String(s.name), sourceModule: 'fitness_session', sourceId: s.id, date: String(s.date) })}>
                  {t('加入当天计划')}
                </button>
                <button className="danger" onClick={() => softDelete('fitness_sessions', s.id, '训练记录')}>{t('删除')}</button>
              </Dropdown>
            </div>
          ))
        )}
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>{t('训练趋势')} <span className="sub">{t('每次完成训练的总容量')}</span></h3>
          <TrendSvg
            points={[...completed].reverse().slice(-15).map((s) => ({ label: String(s.date), value: Math.round(volumeOf(s.id)) }))}
            unit="kg"
            color="var(--ok)"
          />
          <p className="small muted" style={{ marginBottom: 0 }}>{t('近 30 天完成训练')} {completed.filter((s) => {
            const d = new Date(String(s.date) + 'T12:00:00');
            return Date.now() - d.getTime() < 30 * 24 * 3600 * 1000;
          }).length} {t('次')}</p>
        </div>
        <BodyMetricsCard />
      </div>

      {editingTemplate && (
        <TemplateEditor
          template={editingTemplate === 'new' ? undefined : editingTemplate}
          exercises={exercisesQuery.data || []}
          onClose={() => setEditingTemplate(null)}
        />
      )}
      {activeSession && <SessionDetail session={activeSession} onClose={() => setActiveSession(null)} />}
    </div>
  );
}
