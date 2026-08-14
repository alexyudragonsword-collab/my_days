# My Workspace (my_days)

[中文说明 / Chinese README](README.md)

A local, single-user work & life management app. It brings your daily plans, media content creation, development work, consulting, fitness, diet and gaming into one local app. All data lives in a single SQLite file on your computer — no internet, no account, no cloud.

## Features

- **Home**: today's overview, drag-and-drop timeline, unscheduled items, quick memos, needs-attention list, module summaries
- **Today Plan**: today / week / history views, priorities, complete / cancel / postpone, daily review
- **Media**: idea → to plan → producing → to publish → published kanban, publish links and performance stats
- **Development**: projects, milestones, work items (feature / requirement / bug / tech issue), dev logs
- **Consulting**: clients, projects, communications (with duration & fees), deliverables, follow-ups
- **Fitness**: workout templates, per-set logging, last-time-same-exercise data, body metrics & trends
- **Diet**: nutrition goals, planned vs. actual meals, frequent foods, daily summary
- **Games**: status list, play timer, progress & next goals, total play time (no deadline pressure)
- **Data & Settings**: data file info, manual / daily automatic backups, safe restore, ZIP export & import, trash, preferences
- **Bilingual UI**: switch between 中文 and English in Settings → Preferences; business data is never touched by the switch
- **Four appearances**: Default, Liquid Glass, Notion Notebook and Neo-Brutalism — each with light & dark themes

## Requirements

- Node.js 18 or newer (22 recommended)
- A modern desktop browser (Chrome / Edge is the acceptance baseline)

## Getting started

Install dependencies once:

```bash
npm install
```

Then, each time:

| OS | How |
| --- | --- |
| macOS | Double-click `启动个人工作台.command` in the project root |
| Windows 10/11 | Double-click `启动个人工作台.bat` |
| Any (terminal) | `npm run app:start` |

The launcher builds on first run, starts the service in the background and opens your browser. Launching again reuses the running service instead of starting a second one. Use the “Save & exit” button in the top bar to stop the background service safely.

Manual mode: `npm run build && npm start`, then open **http://127.0.0.1:5675**. The server listens on the loopback address only and rejects cross-site requests from other web pages.

- Change the port with `MY_DAYS_PORT`
- Change the data directory with `MY_DAYS_DATA_DIR`

## Where your data lives

| OS | Default data directory |
| --- | --- |
| macOS | `~/Library/Application Support/MyDays/` |
| Windows | `%LOCALAPPDATA%\MyDays\` |
| Linux | `~/.local/share/MyDays/` |

Everything is stored in `data/my_days.db` (SQLite). Backups are independent files under `backups/`. Schema changes are managed by numbered SQL migrations in `server/migrations/` and applied automatically on first start after an upgrade.

## Backup, restore, export & import

- **Manual backup**: Data & Settings → “Back up now”.
- **Automatic backup**: once a day; up to 30 regular auto backups are kept, “keep”-flagged backups are never cleaned.
- **Restore**: a safety backup of current data is created first; corrupted backups are rejected without touching your data.
- **Export**: ZIP with machine-readable JSON plus one CSV per module.
- **Import**: restore everything from an export ZIP (for migrating to a new computer); fully replaces current data after creating a safety backup.

## Desktop app (no Node.js required)

Prefer not to install Node.js? Download the Electron desktop build from the repo's GitHub Actions "桌面版安装包" workflow (or a versioned Release): `.dmg` for macOS, `.exe` for Windows, `.AppImage` for Linux. The desktop build shares the same data directory as the source version, so you can mix both.

> The installers are not notarized / code-signed. On first launch: macOS — right-click → Open; Windows — click "Run anyway".

Build locally:

```bash
npm run build && node scripts/build-desktop.mjs
cd desktop && npm install && npx electron-builder
```

## Tests & CI

```bash
npm run verify    # build + server integration tests (against the real build output)
npm run test:e2e  # Chromium end-to-end acceptance (run `npx playwright install chromium` first)
```

Locally you can point the e2e suite at an existing Chromium with `CHROMIUM_PATH=/path/to/chrome npx playwright test`. See `docs/ACCEPTANCE.md` for the mapping between acceptance criteria and automated tests. GitHub Actions runs build + server tests on Linux, macOS and Windows, plus the browser suite on Linux.
