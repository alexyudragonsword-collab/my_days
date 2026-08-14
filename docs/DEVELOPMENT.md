# 开发文档

面向修改本项目代码的人（包括未来的自己和 AI 协作会话）。使用说明见 `README.md`，需求见 `PRD.md`，接口见 `docs/API.md`，表结构见 `docs/DATA_MODEL.md`。

## 1. 仓库结构

```
my_days/
├── server/                 # 后端（Express + better-sqlite3，全 TypeScript）
│   ├── src/
│   │   ├── index.ts        # 入口：监听 127.0.0.1、Origin 校验、健康检查、系统接口、静态托管
│   │   ├── routes.ts       # 全部 REST 路由：通用 CRUD、搜索、回收站、备份、导入导出
│   │   ├── tables.ts       # ★ 业务表注册中心（见 §3）
│   │   ├── db.ts           # 打开数据库、执行迁移、checkpoint
│   │   ├── backup.ts       # 备份创建/校验/恢复/清理，manifest 管理
│   │   └── platform.ts     # 平台标准数据目录、打开目录命令
│   └── migrations/         # ★ 按序号命名的 SQL 迁移（见 §4）
├── client/                 # 前端（React 18 + Vite + TanStack Query）
│   └── src/
│       ├── App.tsx         # 布局、导航、顶栏、搜索面板、路由
│       ├── i18n.tsx        # ★ 双语支持与词典（见 §5）
│       ├── settings.tsx    # 设置上下文（主题/外观/语言在渲染前生效）
│       ├── api.ts          # fetch 封装、保存状态广播、通用表操作
│       ├── hooks.tsx       # useTable / 软删除 / 加入今日计划 / 计划事项操作
│       ├── constants.ts    # 枚举规范值与来源模块映射
│       ├── ui.tsx          # Modal/Drawer/Toast/确认/空态/下拉菜单
│       ├── styles.css      # 全局样式 + 四种外观皮肤（见 §6）
│       └── pages/          # 九个页面
├── scripts/                # 启动器（start-app.mjs）、桌面打包（build-desktop.mjs）、e2e 服务
├── desktop/                # Electron 壳与 electron-builder 配置
├── tests/                  # 服务端集成测试（node:test）+ Playwright e2e
└── docs/                   # 本目录
```

## 2. 常用命令

```bash
npm install            # 首次
npm run dev            # 开发模式：server(tsx watch, :5675) + client(vite, :5173)
npm run build          # server tsc + client vite build
npm start              # 生产模式（单进程托管 API + 前端，:5675）
npm run app:start      # 启动器（后台运行 + 自动开浏览器）
npm test               # 服务端集成测试（先 build）
npm run verify         # build + test
CHROMIUM_PATH=... npx playwright test   # 浏览器 e2e（CI 里用 playwright install）
node scripts/build-desktop.mjs          # 生成桌面版资源（先 build）
```

## 3. 加一张新业务表的完整步骤

后端的通用 CRUD、全局搜索、回收站、导出、导入全部由 `server/src/tables.ts` 的注册表驱动。新增表：

1. **写迁移**：在 `server/migrations/` 新增 `NNN_xxx.sql`（见 §4），表必须包含
   `id INTEGER PRIMARY KEY AUTOINCREMENT`、`created_at`、`updated_at`、`deleted_at`（软删除即回收站）。
2. **注册**：在 `tables.ts` 的 `TABLES` 数组中添加定义——`name`（表名即 API 路径 `/api/t/<name>`）、
   `module`/`moduleLabel`（搜索分组）、`label`、`titleField`（搜索与回收站显示的标题字段）、
   `searchFields`（参与全局搜索的字段，空数组则不进搜索）、`columns`（允许读写的业务字段白名单）。
3. **前端**：用 `useTable('<name>', filters)` 查询、`createRow/updateRow/deleteRow` 写入；
   界面文字全部过 `t()` 并在 `i18n.tsx` 词典中补英文（见 §5）。
4. 若记录可"加入今日计划"，在 `tables.ts` 的 `SOURCE_TABLES` 和 `client/src/constants.ts`
   的 `SOURCE_INFO` 中登记来源键 → 表的映射。

删除语义：`DELETE /api/t/<name>/:id` 是软删除（进回收站）；派生数据（如模板动作行）用
`hardDeleteRow()`（软删后立即从回收站清除），避免污染回收站。

## 4. 数据库迁移

- 迁移文件按文件名排序依次执行，通过 `schema_migrations` 表记录已应用版本，每个迁移在独立事务中执行。
- **只增不改**：已发布的迁移文件不要再编辑，任何结构变更都新增一个 `NNN_xxx.sql`。
- `001_initial.sql` 使用 `CREATE TABLE IF NOT EXISTS`，保证早期未启用迁移机制的数据库也能无缝接入。
- 导入功能会比较导出包的 `schema_version`（最新迁移文件名）与当前版本，导入更新版本的数据会被拒绝。

## 5. 双语（i18n）纪律 ⚠️ 最容易被破坏的约定

实现在 `client/src/i18n.tsx`，规则：

1. **中文原文就是翻译键**。界面上任何用户可见文字必须写成 `t('中文')`，并在 `i18n.tsx`
   的 `DICT` 中补一条英文翻译。忘补词典的后果是英文模式下显示中文。
2. **业务枚举值以中文规范值存库**（如 `未开始`、`灵感`、`早餐`）。显示时用 `t(value)` 翻译，
   `<option>` 必须显式写 `value={规范值}`，翻译只放在标签位置——**绝不能把英文写进数据库**。
3. 带参数用 `{0} {1}` 占位：`t('已延期到 {0}', date)`。
4. 服务端不做翻译：错误响应带稳定 `code`（如 `NOT_FOUND`），客户端 `serverErrorMessage()`
   查 `SERVER_ERRORS` 映射后再走词典；新增服务端错误要同时加 code、中文文案和英文词条。
5. 语言由 `SettingsProvider` 在渲染子树前 `setLang()` 设定，切换语言整页重载，
   因此组件直接用模块级 `t()` 即可，不需要订阅。
6. **小心变量遮蔽**：不要写 `const t = ...` 或 `.map((t) => ...)`，会遮蔽翻译函数（历史上已踩过三次）。
7. 星期、时长有专用函数：`weekdayName()` / `weekdayCharLabel()` / `fmtMinutes()`。

## 6. 界面外观（皮肤）

- 外观由 `<html data-appearance="default|glass|notion|brutal">` 驱动，与 `data-theme`（light/dark）正交。
- 全部实现是纯 CSS：`styles.css` 末尾按外观分区，先覆盖 `:root` 令牌（颜色/圆角/阴影），
  再做少量组件级覆盖；深色变体用 `[data-appearance='x'][data-theme='dark']` 提升优先级。
- 新增组件时优先用既有 CSS 变量（`--panel`、`--accent`、`--radius` 等），这样四种外观自动适配。
- 切换外观/语言/主题都**不得触碰业务数据**。

## 7. 关键机制速查

- **来源关联**：`plan_items.source_module + source_id` 指向业务记录；服务端在返回计划事项时
  实时解析 `source_title`（`routes.ts` 的 `resolveSource`），因此来源改名两处同步、不复制数据。
  完成关联事项时仅对开发工作项 / 咨询跟进 / 交付物提供**经确认的**可选同步（`hooks.tsx` 的 `SOURCE_SYNC`）。
- **保存状态**：`api.ts` 对所有写请求计数并广播 `保存中/已保存/保存失败`；顶栏「手动保存」
  广播 `my-days:flush-drafts` 事件让草稿组件提交，然后调 `POST /api/save`（checkpoint + 完整性检查）。
- **备份**：`VACUUM INTO` 生成一致快照；备注与"长期保留"标记存在主库之外的
  `backups/manifest.json`（恢复覆盖主库时不丢失）；恢复前自动建 safety 备份并校验目标文件。
- **启动器**（`scripts/start-app.mjs`）：健康检查复用已运行服务（比对 buildId）、`O_EXCL`
  启动锁防并发、旧版本服务先安全退出（PID 身份验证，不误杀他人进程）。
- **桌面版**：esbuild 把服务端打成 `desktop/bundle/server.cjs`（`better-sqlite3` external，
  由 electron-builder 按 Electron ABI 重建）；服务端用 `MY_DAYS_MIGRATIONS_DIR` /
  `MY_DAYS_WEB_DIR` 环境变量定位资源。数据目录与源码版一致（`platform.ts`）。

## 8. 测试

- `tests/server.test.mjs`：node:test，针对 `npm run build` 的真实产物起服务，覆盖持久化、
  联动、备份恢复、导入导出、Origin 防护等（对应 `docs/ACCEPTANCE.md`）。
- `tests/e2e/acceptance.spec.ts`：Playwright，每次运行用全新数据目录
  （`scripts/e2e-server.mjs` 清空 `.e2e-data/`），测试按 serial 顺序执行、彼此有数据依赖，
  新增测试注意插入位置。
- CI（`.github/workflows/ci.yml`）：三系统 `npm run verify` + Linux e2e。
  安装包构建（`release.yml`）：`v*` 标签、手动触发、或 main 上桌面打包相关文件变更时。

## 9. 修改代码的硬性检查单

- [ ] 新界面文字过 `t()` 且词典有英文？枚举 `<option>` 带规范值 `value`？
- [ ] 新表/新字段走了新迁移文件且在 `tables.ts` 注册？
- [ ] 删除走软删除（或派生数据用 `hardDeleteRow`）？
- [ ] 不破坏 127.0.0.1 监听与 Origin 校验？
- [ ] `npm run verify` 与 e2e 全绿？
