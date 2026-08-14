# API 参考

本地 REST API，默认地址 `http://127.0.0.1:5675`（端口由 `MY_DAYS_PORT` 控制）。所有响应为 JSON。

安全约束：服务只监听回环地址；携带 `Origin` 且非 `http://127.0.0.1[:port]` / `http://localhost[:port]` 的请求一律 403（防其他网页跨站调用本机服务）。

## 错误格式

失败响应为非 2xx，负载：

```json
{ "error": "人类可读消息（中文）", "code": "稳定错误码", "detail": "可选补充" }
```

客户端按 `code` 做双语翻译（`client/src/i18n.tsx` 的 `SERVER_ERRORS`）。当前错误码：
`NOT_FOUND`、`UNKNOWN_TABLE`、`NO_FIELDS`、`BACKUP_KEPT`、`BACKUP_MISSING`、`BACKUP_INVALID`、`INTEGRITY_FAIL`、`INVALID_ORIGIN`、`IMPORT_INVALID`、`IMPORT_NEWER_SCHEMA`。

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

`GET /api/search?q=<关键词>` → `{ groups: [{ module, moduleLabel, results: [{ table, label, id, title }] }] }`。按注册表 `searchFields` 做 LIKE 匹配，每表最多 20 条。

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
| `POST /api/backups/<file>/restore` | 恢复：校验完整性与核心表 → 先建 safety 备份 → 覆盖主库 → 重开连接。返回 `{ ok, safetyBackup }`；无效备份 500 `BACKUP_INVALID` 且不动当前数据 |

自动备份：服务启动时与每小时检查，当天无自动备份则创建；普通自动备份保留最近 30 份，`keep` 的不清理。

## 导出与导入

- `GET /api/export` → 下载 ZIP：`manifest.json`（含 `schema_version`）+ `all-data.json`（全部未删除记录与设置）+ `csv/<table>.csv`（带 BOM）。不修改主数据。
- `POST /api/import`，body 为导出 ZIP 的原始字节（`Content-Type: application/zip`，上限 200MB）。校验 manifest 与 schema 版本（更新版本拒绝，`IMPORT_NEWER_SCHEMA`）→ 自动创建 safety 备份 → 事务内**整体替换**全部业务数据与设置。返回 `{ ok, imported, safetyBackup }`。

## 系统

- `GET /api/health` → `{ status: 'ok', app: 'my-days', buildId, instanceId, pid }`（启动器与桌面壳据 `buildId` 判断版本）
- `POST /api/system/exit` → 落盘校验后安全关闭服务（响应发出后约 200ms 退出进程）
- `POST /api/system/open-data-dir` → 用系统文件管理器打开数据目录，返回 `{ ok, dir }`
