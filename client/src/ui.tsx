import { UseQueryResult } from '@tanstack/react-query';
import { fmtMinutesI18n, t } from './i18n';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ---- 弹窗 ----
export function Modal(props: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal" style={props.width ? { width: `min(${props.width}px, 92vw)` } : undefined}>
        <h3>{props.title}</h3>
        {props.children}
      </div>
    </div>
  );
}

export function Drawer(props: { title: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="drawer-overlay" onMouseDown={props.onClose} />
      <div className="drawer">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>{props.title}</h3>
          <button className="btn small" onClick={props.onClose}>{t('关闭')}</button>
        </div>
        {props.children}
      </div>
    </>
  );
}

// ---- 全局 Toast + 确认 ----
interface ToastItem {
  id: number;
  message: string;
  error?: boolean;
  undo?: () => void;
}
interface ConfirmOptions {
  title: string;
  body?: React.ReactNode;
  confirmText?: string;
  danger?: boolean;
}
interface PromptOptions {
  title: string;
  label?: string;
  hint?: React.ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  /** 输入框类型，例如 date；默认普通文本 */
  inputType?: string;
  multiline?: boolean;
  /** 返回错误文案表示校验不通过，返回空表示通过 */
  validate?: (value: string) => string | null;
}
interface UIContextValue {
  toast: (message: string, opts?: { error?: boolean; undo?: () => void }) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** 应用内输入弹窗：取代 window.prompt（Electron 桌面版不支持 window.prompt） */
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const UIContext = createContext<UIContextValue>(null!);
export const useUI = () => useContext(UIContext);

let toastId = 0;

/** 输入弹窗内容：自带草稿状态与回车提交 */
function PromptDialog(props: { options: PromptOptions; onDone: (value: string | null) => void }) {
  const { options } = props;
  const [value, setValue] = useState(options.defaultValue ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const message = options.validate ? options.validate(value) : null;
    if (message) {
      setError(message);
      return;
    }
    props.onDone(value);
  };

  return (
    <Modal title={options.title} onClose={() => props.onDone(null)} width={460}>
      <Field label={options.label ?? ''}>
        {options.multiline ? (
          <textarea
            className="input"
            autoFocus
            rows={4}
            value={value}
            placeholder={options.placeholder}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
          />
        ) : (
          <input
            className="input"
            autoFocus
            type={options.inputType || 'text'}
            value={value}
            placeholder={options.placeholder}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') props.onDone(null);
            }}
          />
        )}
      </Field>
      {options.hint && <p className="small muted" style={{ marginTop: 0 }}>{options.hint}</p>}
      {error && <p className="small" style={{ color: 'var(--danger)', marginTop: 0 }}>{error}</p>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={() => props.onDone(null)}>{t('取消')}</button>
        <button className="btn primary" onClick={submit}>{options.confirmText || t('确定')}</button>
      </div>
    </Modal>
  );
}

export function UIProvider(props: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [promptState, setPromptState] = useState<(PromptOptions & { resolve: (v: string | null) => void }) | null>(null);

  const toast = useCallback((message: string, opts?: { error?: boolean; undo?: () => void }) => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, message, ...opts }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts?.undo ? 6000 : 3000);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve }));
  }, []);

  const prompt = useCallback((opts: PromptOptions) => {
    return new Promise<string | null>((resolve) => setPromptState({ ...opts, resolve }));
  }, []);

  const closeConfirm = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  const closePrompt = (v: string | null) => {
    promptState?.resolve(v);
    setPromptState(null);
  };

  return (
    <UIContext.Provider value={{ toast, confirm, prompt }}>
      {props.children}
      <div className="toasts">
        {toasts.map((item) => (
          <div key={item.id} className={'toast' + (item.error ? ' error' : '')}>
            <span>{item.message}</span>
            {item.undo && (
              <button
                className="btn small"
                onClick={() => {
                  item.undo!();
                  setToasts((x) => x.filter((y) => y.id !== item.id));
                }}
              >
                {t('撤销')}
              </button>
            )}
          </div>
        ))}
      </div>
      {confirmState && (
        <Modal title={confirmState.title} onClose={() => closeConfirm(false)}>
          {confirmState.body && <div style={{ marginBottom: 16 }}>{confirmState.body}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => closeConfirm(false)}>{t('取消')}</button>
            <button className={'btn ' + (confirmState.danger ? 'danger' : 'primary')} onClick={() => closeConfirm(true)}>
              {confirmState.confirmText || t('确认')}
            </button>
          </div>
        </Modal>
      )}
      {promptState && (
        <PromptDialog key={promptState.title} options={promptState} onDone={closePrompt} />
      )}
    </UIContext.Provider>
  );
}

// ---- 查询状态包装：加载中 / 出错 / 空数据 ----
export function QueryView<T>(props: {
  query: UseQueryResult<T>;
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  const { query } = props;
  if (query.isLoading) {
    return (
      <div className="state-box">
        <span className="spinner" /> <span style={{ marginLeft: 8 }}>{t('加载中…')}</span>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="state-box">
        <div className="icon">⚠️</div>
        <div>{t('加载失败：')}{query.error instanceof Error ? query.error.message : t('未知错误')}</div>
        <button className="btn" style={{ marginTop: 10 }} onClick={() => query.refetch()}>{t('重试')}</button>
      </div>
    );
  }
  const data = query.data as T;
  if (props.isEmpty && props.isEmpty(data)) {
    return <>{props.empty ?? <EmptyState text={t('暂无数据')} />}</>;
  }
  return <>{props.children(data)}</>;
}

export function EmptyState(props: { icon?: string; text: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="state-box">
      <div className="icon">{props.icon || '🗒️'}</div>
      <div>{props.text}</div>
      {props.hint && <div className="small" style={{ marginTop: 4 }}>{props.hint}</div>}
      {props.action && <div style={{ marginTop: 12 }}>{props.action}</div>}
    </div>
  );
}

// ---- 下拉菜单（点击操作的统一替代入口） ----
export function Dropdown(props: { label?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div className={'menu-anchor ' + (props.className || '')} ref={ref}>
      <button className="btn small" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        {props.label ?? '⋯'}
      </button>
      {open && (
        <div className="menu" style={{ right: 0, top: '110%' }} onClick={() => setOpen(false)}>
          {props.children}
        </div>
      )}
    </div>
  );
}

// ---- 表单小工具 ----
export function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{props.label}</label>
      {props.children}
    </div>
  );
}

export function fmtMinutes(min: number | null | undefined): string {
  return fmtMinutesI18n(min);
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
