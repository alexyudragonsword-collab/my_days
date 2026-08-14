import { useQuery } from '@tanstack/react-query';
import React, { createContext, useContext, useEffect } from 'react';
import { apiPut, queryClient } from './api';
import { setLang } from './i18n';

export type Appearance = 'default' | 'glass' | 'notion' | 'brutal';

export interface AppSettings {
  theme: 'light' | 'dark' | 'auto';
  appearance: Appearance;
  language: 'zh' | 'en';
  week_start: 0 | 1;
  date_format: 'iso' | 'cn' | 'slash';
  home_summaries: Record<string, boolean>;
  diet_calories: number | null;
  diet_protein: number | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'auto',
  appearance: 'default',
  language: 'zh',
  week_start: 1,
  date_format: 'iso',
  home_summaries: { media: true, dev: true, consult: true, fitness: true, diet: true, games: true },
  diet_calories: null,
  diet_protein: null,
};

export const APPEARANCES: { key: Appearance; label: string; desc: string }[] = [
  { key: 'default', label: '默认', desc: '简洁明快的标准界面' },
  { key: 'glass', label: '流光玻璃', desc: '环境色、透明材质和柔和空间层级' },
  { key: 'notion', label: 'Notion 笔记', desc: '紧凑画布、纯平表面和低饱和状态标记' },
  { key: 'brutal', label: 'Neo-Brutalism', desc: '多色印刷、硬边框和机械反馈' },
];

interface SettingsContextValue {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  fmtDate: (dateStr: string) => string;
}

const SettingsContext = createContext<SettingsContextValue>(null!);
export const useSettings = () => useContext(SettingsContext);

export function SettingsProvider(props: { children: React.ReactNode }) {
  const query = useQuery({
    queryKey: ['settings'],
    queryFn: () => fetch('/api/settings').then((r) => r.json()),
  });
  const settings: AppSettings = { ...DEFAULT_SETTINGS, ...(query.data || {}) };
  // 在渲染子组件之前设定当前语言，保证所有 t() 调用拿到正确语言
  setLang(settings.language === 'en' ? 'en' : 'zh');

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'auto') {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'dark' : 'light';
    } else {
      root.dataset.theme = settings.theme;
    }
    // 外观只切换界面样式属性，不涉及任何业务数据
    root.dataset.appearance = settings.appearance || 'default';
  }, [settings.theme, settings.appearance]);

  const update = async (patch: Partial<AppSettings>) => {
    await apiPut('/api/settings', patch);
    queryClient.invalidateQueries({ queryKey: ['settings'] });
  };

  const fmtDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return dateStr;
    switch (settings.date_format) {
      case 'cn':
        return `${y}年${m}月${d}日`;
      case 'slash':
        return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
      default:
        return dateStr;
    }
  };

  // 设置加载完成前不渲染页面，避免语言与主题闪烁
  if (query.isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>…</div>;
  }

  return (
    <SettingsContext.Provider value={{ settings, update, fmtDate }}>
      {props.children}
    </SettingsContext.Provider>
  );
}
