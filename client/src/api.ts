import { QueryClient } from '@tanstack/react-query';
import { serverErrorMessage } from './i18n';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5_000, refetchOnWindowFocus: false },
  },
});

// ---- 全局保存状态：保存中 / 已保存 / 保存失败 ----
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SaveListener = (s: SaveState, error?: string) => void;
const saveListeners = new Set<SaveListener>();
let pending = 0;

export function onSaveState(fn: SaveListener): () => void {
  saveListeners.add(fn);
  return () => saveListeners.delete(fn);
}

function emit(s: SaveState, error?: string) {
  saveListeners.forEach((fn) => fn(s, error));
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isWrite = method !== 'GET';
  if (isWrite) {
    pending++;
    emit('saving');
  }
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let msg = `请求失败（${res.status}）`;
      try {
        const data = await res.json();
        msg = serverErrorMessage(data?.code, data?.detail) || data?.error || msg;
      } catch {
        /* 保留默认错误信息 */
      }
      throw new Error(msg);
    }
    const data = (await res.json()) as T;
    if (isWrite) {
      pending--;
      if (pending <= 0) emit('saved');
    }
    return data;
  } catch (e) {
    if (isWrite) {
      pending--;
      emit('error', e instanceof Error ? e.message : String(e));
    }
    throw e;
  }
}

export const apiGet = <T>(url: string) => request<T>('GET', url);
export const apiPost = <T>(url: string, body?: unknown) => request<T>('POST', url, body);
export const apiPatch = <T>(url: string, body?: unknown) => request<T>('PATCH', url, body);
export const apiPut = <T>(url: string, body?: unknown) => request<T>('PUT', url, body);
export const apiDelete = <T>(url: string) => request<T>('DELETE', url);

// ---- 通用表操作 ----
export interface Row {
  id: number;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export function listRows<T = Row>(table: string, filters?: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters || {})) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return apiGet<{ rows: T[] }>(`/api/t/${table}${qs ? '?' + qs : ''}`).then((r) => r.rows);
}

export function createRow<T = Row>(table: string, data: Record<string, unknown>) {
  return apiPost<{ row: T }>(`/api/t/${table}`, data).then((r) => r.row);
}

export function updateRow<T = Row>(table: string, id: number, data: Record<string, unknown>) {
  return apiPatch<{ row: T }>(`/api/t/${table}/${id}`, data).then((r) => r.row);
}

export function deleteRow(table: string, id: number) {
  return apiDelete<{ ok: boolean; trash: { table: string; id: number } }>(`/api/t/${table}/${id}`);
}

/** 彻底删除（软删除后立即从回收站清除），用于模板动作等派生数据，避免污染回收站 */
export async function hardDeleteRow(table: string, id: number) {
  await deleteRow(table, id);
  await apiDelete(`/api/trash/${table}/${id}`);
}

export function restoreFromTrash(table: string, id: number) {
  return apiPost<{ ok: boolean }>(`/api/trash/restore`, { table, id });
}

/** 使指定表的查询缓存失效（表数据变化后调用） */
export function invalidateTable(...tables: string[]) {
  for (const t of tables) {
    queryClient.invalidateQueries({ queryKey: ['t', t] });
  }
  // 首页“需要关注”与统计由服务端跨表聚合，任一业务表变化后都需刷新
  queryClient.invalidateQueries({ queryKey: ['attention'] });
  queryClient.invalidateQueries({ queryKey: ['report'] });
}

export function todayStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return todayStr(d);
}
