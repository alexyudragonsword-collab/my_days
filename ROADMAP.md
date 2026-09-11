# 路线图与候选清单

这份文档记录"想到但还没做"的事情，是想法的落脚点，不是承诺。
已完成的内容记录在 [`CHANGELOG.md`](CHANGELOG.md)；范围护栏见 §3「明确不做」。

想到新点子就往 §1 里加一条；开始做某一项时把它移入当前开发分支，做完后从这里删除并写进 CHANGELOG。

## 1. 候选功能（Backlog，不承诺时间）

v1.1.0 清空了原有的技术、统计与模块增强条目（见 [`CHANGELOG.md`](CHANGELOG.md)），目前只剩下需要外部条件的一项。

### 桌面版体验

- [ ] macOS 公证 / Windows 代码签名（消除"未知开发者"提示）。**需要付费开发者账号与证书**：Apple Developer Program 每年 99 美元，Windows OV/EV 代码签名证书每年数百美元起。证书就绪后的改动本身不大：在 `release.yml` 中配置签名密钥（macOS 还需 `notarytool` 的 App 专用密码），并去掉 `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`

### 暂时想到的下一批

- [ ] 统计报表按模块下钻（点击"游玩时长"查看具体记录）
- [ ] 自定义统计区间（任意起止日期，而不只是整周 / 整月）
- [ ] 周报导出为图片或 Markdown，方便贴到别处

## 2. 维护性事项（例行）

- [ ] 依赖大版本升级评估（`npm outdated` 于 2026-09-11 检查，semver 范围内的已升级）：
      React 18 → 19、Vite 5 → 8、Express 4 → 5、TypeScript 5 → 7、better-sqlite3 11 → 13、
      Electron 33 → 44、electron-builder 25 → 26。都属于破坏性升级，需要单独一轮验证，不与功能改动混做
- [ ] 依赖升级：每季度过一遍 `npm outdated`
- [ ] Playwright 与 CI 镜像版本跟进
- [ ] 数据库体积观察：长期使用后检查 `VACUUM` 是否需要定期化；FTS5 索引可用 `INSERT INTO search_fts(search_fts) VALUES('optimize')` 整理

## 3. 明确不做（范围护栏）

继承自 [`PRD.md`](PRD.md) 第 8 节，本应用的价值在"本地、简单、可控"，以下方向除非重新立项否则不做：

- 用户注册、登录、多用户与协作
- 云同步、云数据库、多设备同步、公网部署、局域网共享
- 手机 App 或专门的移动端适配
- 自媒体平台数据自动抓取；GitHub、日历、邮箱等第三方集成
- AI 自动规划、自动写文案、智能营养识别
- 完整的 CRM / 财务 / 开票 / 会计系统
- 可穿戴设备与健康平台同步；在线食物营养数据库、扫码识别
- 消息推送、审批、共享；复杂自定义仪表盘与报表
