import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { apiGet, apiPost, onSaveState, queryClient, SaveState, todayStr } from './api';
import { t } from './i18n';
import { SettingsProvider, useSettings } from './settings';
import { fmtDateTime, Modal, UIProvider, useUI } from './ui';
import ConsultPage from './pages/Consult';
import DevPage from './pages/Dev';
import DietPage from './pages/Diet';
import FitnessPage from './pages/Fitness';
import GamesPage from './pages/Games';
import HomePage from './pages/Home';
import MediaPage from './pages/Media';
import SettingsPage from './pages/SettingsPage';
import TodayPlanPage from './pages/TodayPlan';
import { QuickAddModal } from './QuickAdd';

const NAV_GROUPS = [
  {
    title: '日常',
    items: [
      { to: '/', label: '首页总览', icon: '🏠' },
      { to: '/plan', label: '今日计划', icon: '🗓️' },
    ],
  },
  {
    title: '工作',
    items: [
      { to: '/media', label: '自媒体', icon: '🎬' },
      { to: '/dev', label: '开发工作', icon: '💻' },
      { to: '/consult', label: '咨询工作', icon: '💼' },
    ],
  },
  {
    title: '生活',
    items: [
      { to: '/fitness', label: '健身计划', icon: '💪' },
      { to: '/diet', label: '饮食计划', icon: '🥗' },
      { to: '/games', label: '游戏娱乐', icon: '🎮' },
    ],
  },
  {
    title: '系统',
    items: [{ to: '/settings', label: '数据与设置', icon: '⚙️' }],
  },
];

/** 搜索结果跳转到对应模块页面并带上记录定位参数 */
export function routeForRecord(table: string, id: number): string {
  const map: Record<string, string> = {
    memos: '/', plan_items: '/plan', daily_reviews: '/plan',
    media_contents: '/media',
    dev_projects: '/dev', dev_milestones: '/dev', dev_work_items: '/dev', dev_logs: '/dev',
    consult_clients: '/consult', consult_projects: '/consult', consult_comms: '/consult',
    consult_deliverables: '/consult', consult_followups: '/consult',
    fitness_templates: '/fitness', fitness_sessions: '/fitness', fitness_session_sets: '/fitness',
    fitness_template_exercises: '/fitness', body_metrics: '/fitness',
    foods: '/diet', meals: '/diet', meal_foods: '/diet',
    games: '/games', game_sessions: '/games',
  };
  const base = map[table] || '/';
  return `${base}?open=${table}:${id}`;
}

function SearchPalette(props: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['search', q],
    queryFn: () => apiGet<{ groups: { module: string; moduleLabel: string; results: any[] }[] }>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
  });
  return (
    <div className="overlay" style={{ alignItems: 'flex-start', paddingTop: '12vh' }}
      onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="palette">
        <input
          autoFocus
          placeholder={t('搜索全部模块的记录…（Esc 关闭）')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && props.onClose()}
        />
        <div className="results">
          {!q.trim() && <div className="state-box small">{t('输入关键词，搜索计划、备忘、自媒体、开发、咨询、健身、饮食和游戏记录')}</div>}
          {q.trim() && query.isLoading && <div className="state-box"><span className="spinner" /></div>}
          {q.trim() && query.data && query.data.groups.length === 0 && (
            <div className="state-box">{t('没有找到与“{0}”相关的记录', q)}</div>
          )}
          {query.data?.groups.map((g) => (
            <div key={g.module}>
              <div className="group-title">{t(g.moduleLabel)}</div>
              {g.results.map((r) => (
                <div
                  key={r.table + r.id}
                  className="list-item clickable"
                  onClick={() => {
                    navigate(routeForRecord(r.table, r.id));
                    props.onClose();
                  }}
                >
                  <span className="badge">{t(r.label)}</span>
                  <span className="title">{r.title}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopBar(props: { onSearch: () => void; onQuickAdd: () => void }) {
  const { fmtDate } = useSettings();
  const { toast, confirm } = useUI();
  const [exited, setExited] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  useEffect(() => onSaveState((s, err) => { setSaveState(s); setSaveError(err || ''); }), []);
  const statusQuery = useQuery({
    queryKey: ['status'],
    queryFn: () => apiGet<any>('/api/status'),
    refetchInterval: 60_000,
  });
  const backup = statusQuery.data?.backup;

  const manualSave = async () => {
    // 先让页面提交尚未落库的草稿（快速备忘 / 当日复盘）
    window.dispatchEvent(new CustomEvent('my-days:flush-drafts'));
    await new Promise((r) => setTimeout(r, 150));
    try {
      await apiPost('/api/save');
      queryClient.invalidateQueries({ queryKey: ['status'] });
      toast(t('已保存到本地数据文件'));
    } catch (e) {
      toast(t('保存失败：') + (e instanceof Error ? e.message : e), { error: true });
    }
  };

  const saveAndExit = async () => {
    const ok = await confirm({
      title: t('保存并退出'),
      body: t('将提交所有草稿并把数据写入本地文件，然后关闭后台服务。下次使用时重新运行启动文件即可。'),
      confirmText: t('保存并退出'),
    });
    if (!ok) return;
    window.dispatchEvent(new CustomEvent('my-days:flush-drafts'));
    await new Promise((r) => setTimeout(r, 200));
    try {
      await apiPost('/api/system/exit');
      setExited(true);
    } catch (e) {
      toast(t('退出失败：') + (e instanceof Error ? e.message : e), { error: true });
    }
  };

  if (exited) {
    return (
      <div className="topbar">
        <span className="badge ok">{t('数据已安全保存，后台服务已退出，可以关闭此页面')}</span>
      </div>
    );
  }

  const saveBadge = {
    idle: null,
    saving: <span className="badge">{t('保存中…')}</span>,
    saved: <span className="badge ok">{t('已保存')}</span>,
    error: <span className="badge danger" title={saveError}>{t('保存失败')}</span>,
  }[saveState];

  return (
    <div className="topbar">
      <span className="date">{fmtDate(todayStr())}</span>
      <button className="search-trigger" onClick={props.onSearch}>
        🔍 {t('搜索…')} <span className="small muted">Ctrl+K</span>
      </button>
      <div className="spacer" />
      {saveBadge}
      {backup?.lastError ? (
        <span className="badge danger" title={backup.lastError}>{t('备份失败')}</span>
      ) : backup?.lastBackupAt ? (
        <span className="badge small" title={t('最近备份：') + fmtDateTime(backup.lastBackupAt)}>
          {t('备份')} {fmtDateTime(backup.lastBackupAt).slice(5)}
        </span>
      ) : null}
      <button className="btn" onClick={manualSave} title={t('立即提交草稿并把数据写入本地数据文件')}>{t('手动保存')}</button>
      <button className="btn" onClick={saveAndExit} title={t('保存全部数据并关闭本地后台服务')}>{t('保存并退出')}</button>
      <button className="btn primary" onClick={props.onQuickAdd}>＋ {t('快速新增')}</button>
    </div>
  );
}

function Shell() {
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="layout">
      <div className={'sidebar' + (collapsed ? ' collapsed' : '')}>
        <div className="brand">📋 {!collapsed && t('个人工作台')}</div>
        {NAV_GROUPS.map((g) => (
          <div className="nav-group" key={g.title}>
            {!collapsed && <div className="nav-group-title">{t(g.title)}</div>}
            {g.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
                title={t(item.label)}
              >
                <span>{item.icon}</span>
                {!collapsed && <span>{t(item.label)}</span>}
              </NavLink>
            ))}
          </div>
        ))}
        <button className="collapse-btn" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? '»' : '« ' + t('收起导航')}
        </button>
      </div>
      <div className="main">
        <TopBar onSearch={() => setSearchOpen(true)} onQuickAdd={() => setQuickAddOpen(true)} />
        <div className="content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/plan" element={<TodayPlanPage />} />
            <Route path="/media" element={<MediaPage />} />
            <Route path="/dev" element={<DevPage />} />
            <Route path="/consult" element={<ConsultPage />} />
            <Route path="/fitness" element={<FitnessPage />} />
            <Route path="/diet" element={<DietPage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </div>
      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
      {quickAddOpen && <QuickAddModal onClose={() => setQuickAddOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <UIProvider>
        <Shell />
      </UIProvider>
    </SettingsProvider>
  );
}
