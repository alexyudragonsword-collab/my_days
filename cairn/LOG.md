# Project Cairn 日志

本文件按倒序记录实质性进展——最新条目在最上方、紧跟本行之下。每条保持简短——只写摘要与指针；结论沉淀到 `cairn/<topic>.md`。

## 2026-09-11 · v1.1.0：清空 ROADMAP 候选清单

- 完成原 `ROADMAP.md` §1 中除「签名公证」外的全部 13 项：统计报表（周报/月报）、首页摘要排序、键盘快捷键、训练模板复制、餐食模板、咨询收入统计、自媒体平台筛选、FTS5 搜索、需要关注服务端聚合、错误码全覆盖、桌面版图标 / 自动更新 / 托盘与开机自启。
- 两个顺带修掉的真问题：9 处 `window.prompt` 在 Electron 桌面版中无效（已换成应用内 `prompt()`）；复制训练模板后立即打开编辑器会因查询缓存未刷新而丢动作（已改为先等 refetch）。
- 新增 `scripts/check-i18n.mjs` 并接入 `npm run verify`，把「漏补英文词典」从人工纪律变成自动校验。
- 依赖只做了 semver 范围内升级；大版本升级（React 19 / Vite 8 / Express 5 / Electron 44 / TS 7）留在 `ROADMAP.md` §2 单独评估。
- 详情见 `CHANGELOG.md` v1.1.0；测试 21 服务端 + 18 e2e 全绿。

## 2026-08-16 · Project Cairn 初始化

- 初始化 Project Cairn 结构（git_policy: track，provider 暂缓对接，文档语言中文）。
- 历史迁移模式：`start_fresh`。项目既有历史见根目录 `CHANGELOG.md`（v1.0.0 五个 PR 的完整演进）。
- 原 `CLAUDE.md` 的项目硬性约定并入 `AGENTS.md`「本项目硬性约定」一节，`CLAUDE.md` 改为一行 `@AGENTS.md` 桩。
- 详情见 `AGENTS.md` 与 `.cairn/config.yaml`。
