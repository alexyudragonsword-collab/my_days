import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRow, invalidateTable, todayStr } from './api';
import { t } from './i18n';
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
    const v = text.trim();
    if (!v) return;
    try {
      if (type === 'plan') {
        await createRow('plan_items', { title: v, date: todayStr(), start_time: time || null });
        invalidateTable('plan_items');
        toast(t('已加入今日计划'));
      } else if (type === 'memo') {
        await createRow('memos', { content: v, status: 'active' });
        invalidateTable('memos');
        toast(t('已记录备忘'));
      } else if (type === 'media') {
        await createRow('media_contents', { title: v, stage: '灵感' });
        invalidateTable('media_contents');
        toast(t('已记录自媒体灵感'));
        navigate('/media');
      } else if (type === 'game') {
        await createRow('games', { name: v, status: '想玩' });
        invalidateTable('games');
        toast(t('已加入游戏清单'));
        navigate('/games');
      } else if (type === 'food') {
        await createRow('foods', { name: v });
        invalidateTable('foods');
        toast(t('已加入常用食物'));
        navigate('/diet');
      }
      props.onClose();
    } catch (e) {
      toast(t('新增失败：') + (e instanceof Error ? e.message : e), { error: true });
    }
  };

  return (
    <Modal title={t('快速新增')} onClose={props.onClose}>
      <Field label={t('类型')}>
        <div className="tabs" style={{ display: 'inline-flex' }}>
          {TYPES.map((x) => (
            <button key={x.key} className={type === x.key ? 'active' : ''} onClick={() => setType(x.key)}>
              {t(x.label)}
            </button>
          ))}
        </div>
      </Field>
      <Field label={type === 'memo' ? t('备忘内容') : t('标题')}>
        <input
          className="input"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={t('输入后按回车即可创建')}
        />
      </Field>
      {type === 'plan' && (
        <Field label={t('开始时间（可选）')}>
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={props.onClose}>{t('取消')}</button>
        <button className="btn primary" onClick={submit}>{t('创建')}</button>
      </div>
    </Modal>
  );
}
