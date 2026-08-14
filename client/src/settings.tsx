import { useQuery } from '@tanstack/react-query';
import React, { createContext, useContext, useEffect } from 'react';
import { apiPut, queryClient } from './api';

export interface AppSettings {
  theme: 'light' | 'dark' | 'auto';
  week_start: 0 | 1;
  date_format: 'iso' | 'cn' | 'slash';
  home_summaries: Record<string, boolean>;
  diet_calories: number | null;
  diet_protein: number | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'auto',
  week_start: 1,
  date_format: 'iso',
  home_summaries: { media: true, dev: true, consult: true, fitness: true, diet: true, games: true },
  diet_calories: null,
  diet_protein: null,
};

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

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'auto') {
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'dark' : 'light';
    } else {
      root.dataset.theme = settings.theme;
    }
  }, [settings.theme]);

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

  return (
    <SettingsContext.Provider value={{ settings, update, fmtDate }}>
      {props.children}
    </SettingsContext.Provider>
  );
}
