# API 参考

本地 REST API，默认地址 `http://127.0.0.1:5675`（端口由 `MY_DAYS_PORT` 控制）。所有响应为 JSON。

安全约束：服务只监听回环地址；携带 `Origin` 且非 `http://127.0.0.1[:port]` / `http://localhost[:port]` 的请求一律 403（防其他网页跨站调用本机服务）。

## 错误格式

失败响应为非 2xx，负载：

```json
{ "error": "人类可读消息（中文）", "code": "稳定错误码", "detail": "可选补充" }
```

**所有**失败响应都带稳定 `code`：错误码清单定义在 `server/src/errors.ts`，未登记的底层异常（如文件系统错误）统一归一为 `INTERNAL_ERROR`，原始信息放入 `detail`。客户端按 `code` 做双语翻译（`client/src/i18n.tsx` 的 `SERVER_ERRORS`），两侧一致性由 `tests/server.test.mjs` 校验。

| 错误码 | HTTP | 含义 |
| --- | --- | --- |
| `NOT_FOUND` | 404 | 记录不存在或已删除 |
| `UNKNOWN_TABLE` | 404 / 400 | 表名未在 `tables.ts` 注册 |
| `NO_FIELDS` | 400 | PATCH 没有可更新字段 |
| `BAD_REQUEST` | 400 | 请求参数或 JSON 体无效（含中间件抛出的解析错误） |
| `INVALID_ORIGIN` | 403 | 跨站来源 |
| `BACKUP_KEPT` | 400 | 备份已标记长期保留，不能直接删除 |
| `BACKUP_MISSING` | 400 | 备份文件不存在 |
| `BACKUP_INVALID` | 400 | 备份文件损坏，已拒绝恢复 |
| `BACKUP_FAILED` | 500 | 创建备份失败 |
| `RESTORE_FAILED` | 500 | 覆盖主库失败（安全备份已保留） |
| `INTEGRITY_FAIL` | 500 | `quick_check` 未通过 |
| `IMPORT_INVALID` | 400 | 导入文件不是本应用的导出 ZIP |
| `IMPORT_NEWER_SCHEMA` | 400 | 导入数据来自更新版本 |
| `IMPORT_FAILED` | 500 | 导入事务失败（已回滚，当前数据未变） |
| `EXPORT_FAILED` | 500 | 导出失败 |
| `PAYLOAD_TOO_LARGE` | 413 | 请求体超过上限 |
| `INTERNAL_ERROR` | 500 | 未归类的服务端异常 |

## 通用业务表 CRUD：`/api/t/<table>`

`<table>` 为 `server/src/tables.ts` 注册的表名（见 `docs/DATA_MODEL.md`）。可写字段以注册表的 `columns` 白名单为准，其余字段被忽略。

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/t/<table>` | 列表（未删除的行，按 id 倒序，上限 2000）。查询参数：任意业务列的等值过滤（如 `?date=2026-08-14&status=未开始`）；有 `date` 列的表支持 `date_from` / `date_to`；所有表支持 `since`（`created_at >= since`） |
| `GET /api/t/<table>/<id>` | 单条；不存在或已删除返回 404 |
| `POST /api/t/<table>` | 新建，返回 `{ ok, row }` |
| `PATCH /api/t/<table>/<id>` | 部分更新，返回 `{ ok, row }`；空补丁返回 400 `NO_FIELDS` |
| `DELETE /api/t/<table>/<id>` | 软删除（进回收站），返回 `{ ok, trash: { table, id } }` |

特殊行为：`plan_items` 的读取会实时解析来源记录，附加 `source_title`（来源标题）与 `source_exists` 字段。

## 回收站

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/trash` | 全部已软删除记录（每表最多 200 条），含 `table`、`id`、`title`、`moduleLabel`、`label`、`deleted_at` |
| `POST /api/trash/restore` | body `{ table, id }`，恢复 |
| `DELETE /api/trash/<table>/<id>` | 永久删除 |
| `POST /api/trash/empty` | 清空回收站（永久删除全部） |

## 搜索

`GET /api/search?q=<关键词>` → `{ groups: [{ module, moduleLabel, results: [{ table, label, id, title }] }], mode }`，每表最多 20 条。

- `mode: "fts"`：关键词 ≥ 3 个字符时走 SQLite FTS5 索引（`search_fts`，trigram 分词器，支持中文任意位置子串匹配），按相关度取候选后回表过滤软删除记录。
- `mode: "like"`：关键词不足 3 个字符时回退为 `LIKE` 查询（trigram 索引以三字符为单位，短词无法命中）。
- 索引由数据库触发器与业务表同步，新增可搜索表时需在迁移中补触发器（见 `docs/DEVELOPMENT.md`）。

## 首页“需要关注”

`GET /api/home/attention?today=YYYY-MM-DD` → `{ items: [{ key, table, id, title, reason, args, level }], today }`。

服务端跨表聚合逾期计划、临期跟进与交付、当日未完成训练、已到计划发布日期的内容。`today` 缺省时用服务端本地日期；`reason` 为原因代码（如 `PLAN_OVERDUE`、`DELIVERABLE_DUE`），文案由客户端按当前语言渲染，`args` 为占位符参数；`level` 为 `danger` / `warn`。

## 统计报表

`GET /api/report?from=YYYY-MM-DD&to=YYYY-MM-DD` → 区间汇总：

```json
{
  "from": "...", "to": "...",
  "plan": { "total": 0, "done": 0, "pending": 0, "cancelled": 0, "postponed": 0,
            "rate": 0, "plannedMinutes": 0, "doneMinutes": 0 },
  "daily": [{ "date": "...", "done": 0, "total": 0 }],
  "modules": {
    "games": { "minutes": 0, "sessions": 0 },
    "consult": { "minutes": 0, "comms": 0, "fee": 0, "settledFee": 0 },
    "fitness": { "sessions": 0, "completed": 0, "sets": 0, "volume": 0 },
    "media": { "published": 0 },
    "dev": { "logs": 0, "itemsDone": 0 },
    "diet": { "days": 0, "avgCalories": 0, "avgProtein": 0 },
    "body": { "first": 0, "last": 0, "count": 0 }
  }
}
```

- `plan.rate` 的分母排除已取消 / 已延期事项。
- `modules.dev.itemsDone` 没有完成时间字段，按 `updated_at` 近似统计（界面已标注）。
- `modules.body` 在区间内没有体重记录时为 `null`。
- 区间非法（格式错误或 `from > to`）返回 400 `BAD_REQUEST`。

## 设置

- `GET /api/settings` → 键值对象（值为 JSON 解析结果）
- `PUT /api/settings`，body 为要合并写入的键值对象 → `{ ok }`

## 状态与保存

- `GET /api/status` → `{ dataFile: { path, size, mtime } | null, backup: { lastBackupAt, lastBackupType, lastError, lastErrorAt } }`
- `POST /api/save` → WAL checkpoint + `quick_check`，成功 `{ ok, checkedAt }`，失败 500 `INTEGRITY_FAIL`

## 备份

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/backups` | `{ backups: [{ file, type: auto\|manual\|safety, created_at, size, note, keep }], status }` |
| `POST /api/backups` | 创建手动备份（`VACUUM INTO` 一致快照），body 可带 `{ note }` |
| `PATCH /api/backups/<file>` | 更新 `{ note?, keep? }`（存于主库外的 manifest.json） |
| `DELETE /api/backups/<file>` | 删除备份文件；`keep` 标记的返回 400 `BACKUP_KEPT` |
| `POST /api/backups/<file>/restore` | 恢复：校验完整性与核心表 → 先建 safety 备份 → 覆盖主库 → 重开连接。返回 `{ ok, safetyBackup }`；无效备份 400 `BACKUP_INVALID` 且不动当前数据 |

自动备份：服务启动时与每小时检查，当天无自动备份则创建；普通自动备份保留最近 30 份，`keep` 的不清理。

## 导出与导入

- `GET /api/export` → 下载 ZIP：`manifest.json`（含 `schema_version`）+ `all-data.json`（全部未删除记录与设置）+ `csv/<table>.csv`（带 BOM）。不修改主数据。
- `POST /api/import`，body 为导出 ZIP 的原始字节（`Content-Type: application/zip`，上限 200MB）。校验 manifest 与 schema 版本（更新版本拒绝，`IMPORT_NEWER_SCHEMA`）→ 自动创建 safety 备份 → 事务内**整体替换**全部业务数据与设置。返回 `{ ok, imported, safetyBackup }`。

## 系统

- `GET /api/health` → `{ status: 'ok', app: 'my-days', buildId, instanceId, pid }`（启动器与桌面壳据 `buildId` 判断版本）
- `POST /api/system/exit` → 落盘校验后安全关闭服务（响应发出后约 200ms 退出进程）
- `POST /api/system/open-data-dir` → 用系统文件管理器打开数据目录，返回 `{ ok, dir }`
