import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createRow, deleteRow, invalidateTable, listRows, restoreFromTrash, Row, todayStr, updateRow } from './api';
import { useUI } from './ui';

/** 查询某张表（带过滤），queryKey 统一为 ['t', table, filters] 便于失效 */
export function useTable<T = Row>(table: string, filters?: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ['t', table, filters || {}],
    queryFn: () => listRows<T>(table, filters),
  });
}

/** 删除记录 → 进入回收站，并弹出可撤销的提示 */
export function useSoftDelete() {
  const { toast } = useUI();
  return async (table: string, id: number, label = '记录') => {
    await deleteRow(table, id);
    invalidateTable(table);
    toast(`${label}已移入回收站`, {
      undo: async () => {
        await restoreFromTrash(table, id);
        invalidateTable(table);
      },
    });
  };
}

/** 把某个模块记录加入今日计划（只保存关联，不复制业务详情） */
export function useAddToPlan() {
  const { toast } = useUI();
  return async (opts: { title: string; sourceModule: string; sourceId: number; date?: string; startTime?: string }) => {
    await createRow('plan_items', {
      title: opts.title,
      date: opts.date || todayStr(),
      start_time: opts.startTime || null,
      source_module: opts.sourceModule,
      source_id: opts.sourceId,
    });
    invalidateTable('plan_items');
    toast('已加入今日计划');
  };
}

/** 计划事项状态操作：完成时对特定来源提供可选的同步入口，不静默修改业务数据 */
export function usePlanItemActions() {
  const { toast, confirm } = useUI();

  // 完成关联事项时，仅对下面三类来源提供“可选同步”，并且必须经确认，不静默修改业务数据
  const SOURCE_SYNC: Record<string, { ask: string; done: string; run: (id: number) => Promise<void> }> = {
    dev_item: {
      ask: '是否同时把关联的开发工作项标记为已完成？',
      done: '已同步完成开发工作项',
      run: async (id) => {
        await updateRow('dev_work_items', id, { status: '已完成' });
        invalidateTable('dev_work_items');
      },
    },
    consult_followup: {
      ask: '是否同时把关联的客户跟进标记为已完成？',
      done: '已同步完成客户跟进',
      run: async (id) => {
        await updateRow('consult_followups', id, { done: 1 });
        invalidateTable('consult_followups');
      },
    },
    consult_deliverable: {
      ask: '是否同时把关联的交付物标记为已完成？',
      done: '已同步完成交付物',
      run: async (id) => {
        await updateRow('consult_deliverables', id, { status: '已完成' });
        invalidateTable('consult_deliverables');
      },
    },
  };

  const setStatus = async (item: Row, status: string) => {
    await updateRow('plan_items', item.id, {
      status,
      completed_at: status === '已完成' ? new Date().toISOString() : null,
    });
    invalidateTable('plan_items');
    if (status !== '已完成') return;
    const sync = item.source_module ? SOURCE_SYNC[String(item.source_module)] : undefined;
    if (sync && item.source_id) {
      const yes = await confirm({ title: '事项已完成', body: sync.ask, confirmText: '同步完成' });
      if (yes) {
        try {
          await sync.run(Number(item.source_id));
          toast(sync.done);
        } catch (e) {
          toast('来源记录同步失败：' + (e instanceof Error ? e.message : e), { error: true });
        }
      }
    } else {
      toast('已完成 🎉');
    }
  };

  // 延期：原事项标记为“已延期”留在原日期，同时在目标日期生成一条待执行事项
  const postpone = async (item: Row, toDate: string) => {
    await updateRow('plan_items', item.id, { status: '已延期' });
    await createRow('plan_items', {
      title: item.title,
      date: toDate,
      start_time: item.start_time ?? null,
      duration_min: item.duration_min ?? null,
      priority: item.priority,
      source_module: item.source_module ?? null,
      source_id: item.source_id ?? null,
      note: item.note ?? null,
    });
    invalidateTable('plan_items');
    toast(`已延期到 ${toDate}`);
  };

  return { setStatus, postpone };
}

/** 读取 ?open=table:id 参数（搜索结果 / 首页摘要 / 计划来源跳转定位记录用） */
export function useOpenParam(): { table: string; id: number } | null {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const open = params.get('open');
  if (!open) return null;
  const [table, idStr] = open.split(':');
  const id = Number(idStr);
  if (!table || !id) return null;
  return { table, id };
}

export function useClearOpenParam() {
  const navigate = useNavigate();
  const location = useLocation();
  return () => navigate(location.pathname, { replace: true });
}

/** 顶部“手动保存”会广播该事件，页面用它提交尚未保存的草稿 */
export function useFlushDrafts(flush: () => void) {
  useEffect(() => {
    const handler = () => flush();
    window.addEventListener('my-days:flush-drafts', handler);
    return () => window.removeEventListener('my-days:flush-drafts', handler);
  }, [flush]);
}

/** 简单防抖自动保存草稿 */
export function useDraft(saved: string, save: (v: string) => void, delay = 800) {
  const [value, setValue] = useState(saved);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setValue(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      save(value);
      setDirty(false);
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, dirty]);
  const flush = () => {
    if (dirty) {
      save(value);
      setDirty(false);
    }
  };
  useFlushDrafts(flush);
  return {
    value,
    setValue: (v: string) => {
      setValue(v);
      setDirty(true);
    },
    flush,
    dirty,
  };
}
