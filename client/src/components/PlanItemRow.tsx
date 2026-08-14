import React from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, Row, todayStr } from '../api';
import { routeForRecord } from '../App';
import { priorityBadgeClass, SOURCE_INFO } from '../constants';
import { usePlanItemActions, useSoftDelete } from '../hooks';
import { Dropdown, fmtMinutes } from '../ui';

/** 今日计划事项行：首页与今日计划页共用 */
export function PlanItemRow(props: {
  item: Row;
  onEdit?: (item: Row) => void;
  showDate?: boolean;
}) {
  const { item } = props;
  const { setStatus, postpone } = usePlanItemActions();
  const softDelete = useSoftDelete();
  const navigate = useNavigate();
  const status = String(item.status);
  const done = status === '已完成';
  const closed = done || status === '已取消' || status === '已延期';
  const source = item.source_module ? SOURCE_INFO[String(item.source_module)] : undefined;

  const postponeToDate = async () => {
    const d = window.prompt('延期到哪一天？（格式 YYYY-MM-DD）', addDays(todayStr(), 1));
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) await postpone(item, d);
  };

  return (
    <div className="list-item">
      <input
        type="checkbox"
        checked={done}
        disabled={status === '已取消' || status === '已延期'}
        onChange={() => setStatus(item, done ? '未开始' : '已完成')}
        title={done ? '恢复为未完成' : '标记完成'}
      />
      <span className={'title' + (closed ? ' strike' : '')}>
        {String((item.source_title as string) ?? item.title) || '（无标题）'}
      </span>
      {props.showDate && <span className="badge">{String(item.date)}</span>}
      {!!item.start_time && <span className="badge accent">{String(item.start_time)}</span>}
      {!!item.duration_min && <span className="badge">{fmtMinutes(Number(item.duration_min))}</span>}
      <span className={'badge ' + priorityBadgeClass(String(item.priority))}>{String(item.priority)}</span>
      {status !== '未开始' && <span className={'badge ' + (done ? 'ok' : '')}>{status}</span>}
      {source && (
        <span
          className="badge accent clickable"
          title="打开来源记录"
          onClick={() => navigate(routeForRecord(source.table, Number(item.source_id)))}
        >
          {source.label} ↗
        </span>
      )}
      <Dropdown>
        {props.onEdit && <button onClick={() => props.onEdit!(item)}>编辑</button>}
        {status !== '进行中' && !closed && <button onClick={() => setStatus(item, '进行中')}>开始</button>}
        {!done && <button onClick={() => setStatus(item, '已完成')}>标记完成</button>}
        {!closed && <button onClick={() => setStatus(item, '已取消')}>取消</button>}
        {closed && <button onClick={() => setStatus(item, '未开始')}>恢复为未开始</button>}
        {!closed && <button onClick={() => postpone(item, addDays(String(item.date), 1))}>延期到明天</button>}
        {!closed && <button onClick={postponeToDate}>延期到指定日期</button>}
        {source && (
          <button onClick={() => navigate(routeForRecord(source.table, Number(item.source_id)))}>打开来源记录</button>
        )}
        <button className="danger" onClick={() => softDelete('plan_items', item.id, '计划事项')}>删除</button>
      </Dropdown>
    </div>
  );
}
