# my_days — AI 协作须知

本地单机版个人工作生活管理 App。Express + better-sqlite3 后端（仅监听 127.0.0.1），React + Vite 前端，数据存单个 SQLite 文件。需求见 `PRD.md`，架构与约定详见 `docs/DEVELOPMENT.md`（改代码前先读它）。

## 命令

```bash
npm run dev            # 开发（server :5675 + vite :5173）
npm run verify         # 构建 + 服务端集成测试（改动后必须全绿）
CHROMIUM_PATH=<chrome> npx playwright test   # 浏览器 e2e
```

## 硬性约定（违反会破坏现有功能）

1. **i18n**：所有界面文字写 `t('中文')`，并在 `client/src/i18n.tsx` 的 `DICT` 补英文；
   业务枚举值（未开始/灵感/早餐…）以中文存库，只在显示层翻译，`<option>` 必须显式
   `value={规范值}`。不要声明会遮蔽 `t` 的局部变量（`const t = ...`、`.map((t) => ...)`）。
2. **数据库**：结构变更只能新增 `server/migrations/NNN_xxx.sql`，不修改已有迁移；
   新表需含 `id/created_at/updated_at/deleted_at` 并在 `server/src/tables.ts` 注册
   （通用 CRUD / 搜索 / 回收站 / 导入导出全由注册表驱动）。
3. **删除即回收站**：业务记录用软删除；派生数据用 `hardDeleteRow`。
4. **安全**：保持 127.0.0.1 监听与 Origin 校验；新增服务端错误带稳定 `code` 并在
   `i18n.tsx` 的 `SERVER_ERRORS` 登记。
5. **外观/语言/主题切换不得触碰业务数据**；新组件样式用现有 CSS 变量以适配四种外观。
6. 服务端从环境变量取路径：`MY_DAYS_DATA_DIR` / `MY_DAYS_PORT` / `MY_DAYS_MIGRATIONS_DIR` / `MY_DAYS_WEB_DIR`（桌面版依赖后两者，勿写死）。

## 文档同步

改接口更新 `docs/API.md`；改表结构更新 `docs/DATA_MODEL.md`；影响验收项更新 `docs/ACCEPTANCE.md`；用户可见变化更新 `README.md` + `README.en.md` 与 `CHANGELOG.md`；完成 `ROADMAP.md` 中的候选项后将其从该清单移除。
