# 数据模型

单个 SQLite 文件（`<数据目录>/data/my_days.db`，WAL 模式，`synchronous=FULL`）。结构由 `server/migrations/` 按序迁移管理，已应用版本记录在 `schema_migrations` 表。

**通用约定**：除 `settings` / `schema_migrations` 外，所有业务表都有
`id`（自增主键）、`created_at` / `updated_at`（ISO 时间串）、`deleted_at`（非空即"在回收站"，全部查询默认过滤）。

**枚举以中文规范值存储**（界面按语言翻译显示）。日期为 `YYYY-MM-DD` 字符串，时间为 `HH:MM`。

## 系统表

| 表 | 字段与说明 |
| --- | --- |
| `settings` | `key`（主键）、`value`（JSON 字符串）。存主题、外观、语言、每周起始日、日期格式、首页摘要开关与顺序（`home_summaries` / `home_summary_order`）、饮食目标（`diet_calories`/`diet_protein`）等 |
| `schema_migrations` | `version`（迁移文件名）、`applied_at` |
| `search_fts` 全局搜索索引 | FTS5 虚拟表（trigram 分词器），列：`text`（参与搜索的字段拼接）、`table_name` / `row_id`（UNINDEXED，指回业务行）。由每张可搜索表的 `<表名>_fts_ai/au/ad` 触发器维护，软删除行在查询时按 `deleted_at` 过滤，不单独维护索引 |

## 日常

| 表 | 字段与说明 |
| --- | --- |
| `memos` 快速备忘 | `content`；`status`：`active` / `archived` / `converted`；转换后 `converted_type`（目标表名）+ `converted_id` 记录去向 |
| `plan_items` 计划事项 | `title`、`date`、`start_time`（可空，空=待安排）、`duration_min`、`priority`（高/中/低）、`status`（未开始/进行中/已完成/已取消/已延期）、`note`、`completed_at`；**来源关联**：`source_module`（见下）+ `source_id`，只存指针不复制业务数据，读取时服务端实时解析 `source_title` |
| `daily_reviews` 当日复盘 | `date`（未删除行内唯一）、`content` |

`source_module` 取值 → 目标表（`server/src/tables.ts` 的 `SOURCE_TABLES`）：
`media`→media_contents，`dev_project`→dev_projects，`dev_item`→dev_work_items，`consult_project`→consult_projects，`consult_deliverable`→consult_deliverables，`consult_followup`→consult_followups，`consult_comm`→consult_comms，`fitness_session`→fitness_sessions，`fitness_template`→fitness_templates，`meal`→meals，`game`→games，`memo`→memos。

## 自媒体

| 表 | 字段与说明 |
| --- | --- |
| `media_contents` | `title`、`platform`、`form`（内容形式）、`stage`（灵感/待策划/制作中/待发布/已发布）、`planned_date` / `actual_date`（计划/实际发布日）、`notes`（文案）、`asset_path`（本地素材位置）、`publish_link`、`views` / `likes` / `comments`（手动记录的表现数据）、`archived`（0/1） |

## 开发工作

| 表 | 字段与说明 |
| --- | --- |
| `dev_projects` | `name`、`description`、`status`（进行中/暂停/已完成）、`local_path`、`repo_link`、`archived` |
| `dev_milestones` | `project_id`、`name`、`target_date`、`status`（未开始/进行中/已完成） |
| `dev_work_items` | `project_id`、`milestone_id`（可空）、`title`、`type`（功能/需求/Bug/技术问题）、`priority`（高/中/低）、`status`（待处理/进行中/已完成） |
| `dev_logs` | `project_id`、`date`、`content` |

## 咨询工作

| 表 | 字段与说明 |
| --- | --- |
| `consult_clients` | `name`、`note`、`archived` |
| `consult_projects` | `client_id`、`name`、`requirement`（当前需求）、`status`、`archived` |
| `consult_comms` 沟通/会议 | `project_id`、`time`（datetime-local 串）、`form`（线上会议/电话/当面/微信\/消息/邮件）、`notes`、`duration_min`（咨询时长）、`fee_amount`（可空）、`settled`（0/1 是否结算） |
| `consult_deliverables` | `project_id`、`name`、`due_date`、`status`（进行中/已完成） |
| `consult_followups` | `project_id`、`next_time`（下次跟进日期）、`content`、`done`（0/1） |

## 健身计划

| 表 | 字段与说明 |
| --- | --- |
| `fitness_templates` | `name`、`weekdays`（计划星期，逗号分隔的 `一`…`日` 字符） |
| `fitness_template_exercises` | `template_id`、`name`、`target_sets` / `target_reps` / `target_weight` / `rest_sec`（目标组/次/kg/休息秒）、`sort`。编辑模板时整组重建（旧行彻底删除，不进回收站） |
| `fitness_sessions` 一次训练 | `date`、`template_id`、`name`、`status`（计划中/进行中/已完成）、`notes`（训练感受） |
| `fitness_session_sets` 训练组 | `session_id`、`exercise_name`、`set_no`、`target_reps` / `target_weight`（来自模板）、`reps` / `weight`（实际）、`done`（0/1）。"上次同动作数据"按 `exercise_name` 跨训练检索 |
| `body_metrics` | `date`、`weight`（kg）、`measurements`（围度等自由文本）、`note` |

## 饮食计划

| 表 | 字段与说明 |
| --- | --- |
| `foods` 常用食物 | `name`、`portion`（默认份量）、`calories`、`protein` |
| `meals` | `date`、`meal_type`（早餐/午餐/晚餐/加餐）、`name`。同一天同餐次按需惰性创建 |
| `meal_foods` | `meal_id`、`kind`（`planned` 计划 / `actual` 实际——两类分开存储与汇总）、`food_name`、`portion`、`calories`、`protein`（未掌握可空，汇总只计已填写值） |
| `meal_templates` 餐食模板 | `name`、`meal_type`（建议餐次，可跨餐次套用）。删除时只软删除模板本身，模板食物保留，撤销可整体恢复 |
| `meal_template_foods` | `template_id`、`food_name`、`portion`、`calories`、`protein`、`sort`。套用模板 = 把这些行追加成目标餐次的 `meal_foods` |

## 游戏娱乐

| 表 | 字段与说明 |
| --- | --- |
| `games` | `name`、`platform`、`status`（想玩/正在进行/暂停/已完成）、`progress`（当前进度）、`next_goal`（下一次目标）、`notes`、`rating`（1-10 可空）、`completed_date` |
| `game_sessions` 游玩记录 | `game_id`、`start_time` / `end_time`（ISO 时间）、`duration_min`、`note`。`end_time` 为空 = 计时进行中；累计时长为 `duration_min` 求和 |

## 主库之外的文件

| 文件 | 说明 |
| --- | --- |
| `backups/*.db` | 独立备份文件，命名 `auto|manual|safety-YYYYMMDD-HHMMSS.db` |
| `backups/manifest.json` | 备份的备注与"长期保留"标记（存主库外，恢复覆盖主库时不丢失） |
| `logs/app.log` | 启动器方式运行时的服务日志 |
| `my_days.pid` | 服务进程记录（启动器识别旧服务用） |

桌面版另有一份**外壳偏好**（`desktop-prefs.json`，存于 Electron 的 userData 目录）：只记录"关闭窗口时保留在托盘"等窗口行为，不含任何业务数据；开机自启由系统登录项管理，不落本地文件。
