import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRow, invalidateTable, todayStr } from './api';
import { Field, Modal, useUI } from './ui';

const TYPES = [
  { key: 'plan', label: '今日事项' },
  { key: 'memo', label: '快速备忘' },
  { key: 'media', label: '自媒体灵感' },
  { key: 'game', label: '游戏/娱乐项目' },
  { key: 'food', label: '常用食物' },
];

export function QuickAddModal(props: { onClose: () => void }) {
  const [type, setType] = useState('plan');
  const [text, setText] = useState('');
  const [time, setTime] = useState('');
  const { toast } = useUI();
  const navigate = useNavigate();

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    try {
      if (type === 'plan') {
        await createRow('plan_items', { title: t, date: todayStr(), start_time: time || null });
        invalidateTable('plan_items');
        toast('已加入今日计划');
      } else if (type === 'memo') {
        await createRow('memos', { content: t, status: 'active' });
        invalidateTable('memos');
        toast('已记录备忘');
      } else if (type === 'media') {
        await createRow('media_contents', { title: t, stage: '灵感' });
        invalidateTable('media_contents');
        toast('已记录自媒体灵感');
        navigate('/media');
      } else if (type === 'game') {
        await createRow('games', { name: t, status: '想玩' });
        invalidateTable('games');
        toast('已加入游戏清单');
        navigate('/games');
      } else if (type === 'food') {
        await createRow('foods', { name: t });
        invalidateTable('foods');
        toast('已加入常用食物');
        navigate('/diet');
      }
      props.onClose();
    } catch (e) {
      toast('新增失败：' + (e instanceof Error ? e.message : e), { error: true });
    }
  };

  return (
    <Modal title="快速新增" onClose={props.onClose}>
      <Field label="类型">
        <div className="tabs" style={{ display: 'inline-flex' }}>
          {TYPES.map((t) => (
            <button key={t.key} className={type === t.key ? 'active' : ''} onClick={() => setType(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </Field>
      <Field label={type === 'memo' ? '备忘内容' : '标题'}>
        <input
          className="input"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="输入后按回车即可创建"
        />
      </Field>
      {type === 'plan' && (
        <Field label="开始时间（可选）">
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={props.onClose}>取消</button>
        <button className="btn primary" onClick={submit}>创建</button>
      </div>
    </Modal>
  );
}
