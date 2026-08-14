import React, { useState } from 'react';
import { addDays, createRow, invalidateTable, listRows, Row, todayStr } from '../api';
import { MEAL_TYPES } from '../constants';
import { useSoftDelete, useTable } from '../hooks';
import { useSettings } from '../settings';
import { t } from '../i18n';
import { EmptyState, Field, Modal, QueryView, useUI } from '../ui';

function GoalsCard() {
  const { settings, update } = useSettings();
  const [cal, setCal] = useState(settings.diet_calories == null ? '' : String(settings.diet_calories));
  const [protein, setProtein] = useState(settings.diet_protein == null ? '' : String(settings.diet_protein));
  const { toast } = useUI();
  return (
    <div className="card">
      <h3>{t('每日营养目标')}</h3>
      <div className="row wrap">
        <Field label={t('热量（千卡）')}>
          <input className="input" type="number" style={{ width: 120 }} value={cal} onChange={(e) => setCal(e.target.value)} />
        </Field>
        <Field label={t('蛋白质（克）')}>
          <input className="input" type="number" style={{ width: 120 }} value={protein} onChange={(e) => setProtein(e.target.value)} />
        </Field>
        <button className="btn primary" style={{ marginTop: 8 }} onClick={async () => {
          await update({
            diet_calories: cal === '' ? null : Number(cal),
            diet_protein: protein === '' ? null : Number(protein),
          });
          toast(t('目标已保存'));
        }}>{t('保存目标')}</button>
      </div>
    </div>
  );
}

function AddFoodForm(props: { onAdd: (food: { food_name: string; portion: string; calories: number | null; protein: number | null }) => void; foods: Row[] }) {
  const [name, setName] = useState('');
  const [portion, setPortion] = useState('');
  const [cal, setCal] = useState('');
  const [protein, setProtein] = useState('');

  const submit = () => {
    if (!name.trim()) return;
    props.onAdd({
      food_name: name.trim(),
      portion: portion.trim(),
      calories: cal === '' ? null : Number(cal),
      protein: protein === '' ? null : Number(protein),
    });
    setName(''); setPortion(''); setCal(''); setProtein('');
  };

  return (
    <div className="row wrap small" style={{ marginTop: 6 }}>
      <select
        className="input" style={{ width: 110 }}
        value=""
        onChange={(e) => {
          const f = props.foods.find((x) => String(x.id) === e.target.value);
          if (f) {
            setName(String(f.name));
            setPortion(String(f.portion || ''));
            setCal(f.calories == null ? '' : String(f.calories));
            setProtein(f.protein == null ? '' : String(f.protein));
          }
        }}
      >
        <option value="">{t('常用食物…')}</option>
        {props.foods.map((f) => <option key={f.id} value={f.id}>{String(f.name)}</option>)}
      </select>
      <input className="input" style={{ flex: 1, minWidth: 90 }} placeholder={t('食物名称')} value={name}
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <input className="input" style={{ width: 70 }} placeholder={t('份量')} value={portion} onChange={(e) => setPortion(e.target.value)} />
      <input className="input" style={{ width: 70 }} placeholder={t('千卡')} type="number" value={cal} onChange={(e) => setCal(e.target.value)} />
      <input className="input" style={{ width: 60 }} placeholder={t('蛋白')} type="number" value={protein} onChange={(e) => setProtein(e.target.value)} />
      <button className="btn small" onClick={submit}>{t('添加')}</button>
    </div>
  );
}

function FoodsManager(props: { foods: Row[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [portion, setPortion] = useState('');
  const [cal, setCal] = useState('');
  const [protein, setProtein] = useState('');
  const softDelete = useSoftDelete();

  const add = async () => {
    if (!name.trim()) return;
    await createRow('foods', {
      name: name.trim(),
      portion: portion.trim() || null,
      calories: cal === '' ? null : Number(cal),
      protein: protein === '' ? null : Number(protein),
    });
    invalidateTable('foods');
    setName(''); setPortion(''); setCal(''); setProtein('');
  };

  return (
    <Modal title={t('常用食物')} onClose={props.onClose}>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <input className="input" style={{ flex: 1 }} placeholder={t('名称')} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" style={{ width: 90 }} placeholder={t('默认份量')} value={portion} onChange={(e) => setPortion(e.target.value)} />
        <input className="input" style={{ width: 80 }} placeholder={t('千卡')} type="number" value={cal} onChange={(e) => setCal(e.target.value)} />
        <input className="input" style={{ width: 80 }} placeholder={t('蛋白g')} type="number" value={protein} onChange={(e) => setProtein(e.target.value)} />
        <button className="btn primary" onClick={add}>{t('添加')}</button>
      </div>
      {props.foods.length === 0
        ? <EmptyState icon="🍚" text={t('还没有常用食物')} hint={t('把经常吃的食物存起来，以后一键添加')} />
        : (
          <table className="tbl">
            <thead><tr><th>{t('名称')}</th><th>{t('份量')}</th><th>{t('千卡')}</th><th>{t('蛋白质')}</th><th /></tr></thead>
            <tbody>
              {props.foods.map((f) => (
                <tr key={f.id}>
                  <td>{String(f.name)}</td>
                  <td>{String(f.portion || '—')}</td>
                  <td>{f.calories == null ? '—' : String(f.calories)}</td>
                  <td>{f.protein == null ? '—' : String(f.protein)}</td>
                  <td><button className="btn small danger" onClick={() => softDelete('foods', f.id, '食物')}>{t('删除')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </Modal>
  );
}

export default function DietPage() {
  const [date, setDate] = useState(todayStr());
  const [foodsOpen, setFoodsOpen] = useState(false);
  const mealsQuery = useTable('meals', { date });
  const mealFoodsQuery = useTable('meal_foods');
  const foodsQuery = useTable('foods');
  const { settings, fmtDate } = useSettings();
  const { toast, confirm } = useUI();
  const softDelete = useSoftDelete();

  const meals = mealsQuery.data || [];
  const allMealFoods = mealFoodsQuery.data || [];
  const mealIds = new Set(meals.map((m) => m.id));
  const dayFoods = allMealFoods.filter((f) => mealIds.has(Number(f.meal_id)));

  const totals = (kind: string) => {
    const rows = dayFoods.filter((f) => f.kind === kind);
    return {
      cal: rows.reduce((s, f) => s + (Number(f.calories) || 0), 0),
      protein: rows.reduce((s, f) => s + (Number(f.protein) || 0), 0),
    };
  };
  const actual = totals('actual');
  const planned = totals('planned');

  const ensureMeal = async (mealType: string): Promise<Row> => {
    const found = meals.find((m) => m.meal_type === mealType);
    if (found) return found;
    const row = await createRow('meals', { date, meal_type: mealType });
    invalidateTable('meals');
    return row;
  };

  const addFood = async (mealType: string, kind: 'planned' | 'actual',
    food: { food_name: string; portion: string; calories: number | null; protein: number | null }) => {
    const meal = await ensureMeal(mealType);
    await createRow('meal_foods', { meal_id: meal.id, kind, ...food, portion: food.portion || null });
    invalidateTable('meal_foods');
  };

  const copyFrom = async (fromDate: string) => {
    const srcMeals = await listRows('meals', { date: fromDate });
    if (srcMeals.length === 0) {
      toast(t('{0} 没有餐食记录', fromDate), { error: true });
      return;
    }
    if (!(await confirm({ title: t('复制餐食'), body: t('把 {0} 的餐食复制到 {1}？', fromDate, date) }))) return;
    for (const sm of srcMeals) {
      const target = await ensureMeal(String(sm.meal_type));
      const srcFoods = allMealFoods.filter((f) => Number(f.meal_id) === sm.id);
      for (const f of srcFoods) {
        await createRow('meal_foods', {
          meal_id: target.id, kind: f.kind, food_name: f.food_name,
          portion: f.portion ?? null, calories: f.calories ?? null, protein: f.protein ?? null,
        });
      }
    }
    invalidateTable('meals', 'meal_foods');
    toast(t('已复制餐食'));
  };

  const calGoal = settings.diet_calories;
  const proteinGoal = settings.diet_protein;

  return (
    <div>
      <div className="page-head">
        <h2>{t('饮食计划')}</h2>
        <input className="input" type="date" style={{ width: 150 }} value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn" onClick={() => copyFrom(addDays(date, -1))}>{t('复制昨天餐食')}</button>
        <button className="btn" onClick={() => {
          const d = window.prompt(t('从哪一天复制？（YYYY-MM-DD）'));
          if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) copyFrom(d);
        }}>{t('从指定日期复制')}</button>
        <button className="btn" onClick={() => setFoodsOpen(true)}>{t('常用食物')}</button>
      </div>

      <GoalsCard />

      <div className="card">
        <h3>{fmtDate(date)} {t('营养汇总')} <span className="sub">{t('按已填写数据自动汇总')}</span></h3>
        <div className="stat-row">
          <div className="stat">
            <div className="num">{Math.round(actual.cal)}{calGoal ? <span className="small muted"> / {calGoal}</span> : null}</div>
            <div className="lbl">{t('实际热量（千卡）')}</div>
          </div>
          <div className="stat">
            <div className="num">{Math.round(actual.protein)}{proteinGoal ? <span className="small muted"> / {proteinGoal}g</span> : null}</div>
            <div className="lbl">{t('实际蛋白质（克）')}</div>
          </div>
          <div className="stat">
            <div className="num">{Math.round(planned.cal)}</div>
            <div className="lbl">{t('计划热量（千卡）')}</div>
          </div>
        </div>
        {calGoal ? (
          <div className="progress-bar"><div style={{ width: `${Math.min(100, Math.round((actual.cal / calGoal) * 100))}%` }} /></div>
        ) : null}
      </div>

      <QueryView query={mealsQuery}>
        {() => (
          <>
            {MEAL_TYPES.map((mt) => {
              const meal = meals.find((m) => m.meal_type === mt);
              const foodsOf = (kind: string) =>
                meal ? dayFoods.filter((f) => Number(f.meal_id) === meal.id && f.kind === kind) : [];
              return (
                <div className="card" key={mt}>
                  <h3>{t(mt)}</h3>
                  <div className="grid-2" style={{ alignItems: 'start' }}>
                    {(['planned', 'actual'] as const).map((kind) => (
                      <div key={kind}>
                        <div className="small muted" style={{ marginBottom: 4 }}>
                          {kind === 'planned' ? '📋 ' + t('计划吃什么') : '✅ ' + t('实际吃了什么')}
                        </div>
                        {foodsOf(kind).length === 0 && (
                          <p className="small muted" style={{ margin: '4px 0' }}>
                            {t(kind === 'planned' ? '未安排' : '未记录')}
                          </p>
                        )}
                        {foodsOf(kind).map((f) => (
                          <div className="list-item small" key={f.id}>
                            <span className="title">
                              {String(f.food_name)}
                              {f.portion ? <span className="muted">（{String(f.portion)}）</span> : null}
                            </span>
                            <span className="muted">
                              {f.calories != null ? `${f.calories}${t('千卡')}` : ''}
                              {f.protein != null ? ` ${f.protein}${t('g蛋白')}` : ''}
                            </span>
                            <button className="btn small" onClick={() => softDelete('meal_foods', f.id, '食物记录')}>✕</button>
                          </div>
                        ))}
                        <AddFoodForm foods={foodsQuery.data || []} onAdd={(food) => addFood(mt, kind, food)} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </QueryView>

      {foodsOpen && <FoodsManager foods={foodsQuery.data || []} onClose={() => setFoodsOpen(false)} />}
    </div>
  );
}
