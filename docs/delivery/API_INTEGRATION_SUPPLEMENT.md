# API 接口补充文档

本文档面向联合试点中的信息中心和外部集成厂商，用于说明现有 API 的集成口径。接口契约以 `docs/API.md` 为准，本文档只做分组、权限、错误处理和验收使用补充，不新增接口。

## 1. 集成原则

- 政府试点环境仅允许在客户批准的网络范围内访问接口。
- 所有任务和管理接口均需登录会话。
- 公共线索接口不需要登录，但不得用于上传真实业务数据。
- 数据库来源审计仅允许 `admin` 操作，并且必须使用白名单模板和批准表名。
- 文件审计、证据上传、报告导出由 `admin` 或 `auditor` 执行。
- `viewer` 只能查看结果，不能创建审计任务或导出敏感结果。
- AI 可被部署策略硬关闭；集成方不得绕过服务端直接调用 AI provider。

## 2. 认证与会话

| 接口 | 用途 | 权限 |
| --- | --- | --- |
| `GET /api/bootstrap` | 获取前端启动配置和部署策略 | 公开 |
| `POST /api/auth/register` | 首次或允许注册时创建账号 | 受部署策略限制 |
| `POST /api/auth/login` | 登录并建立会话 | 公开 |
| `POST /api/auth/logout` | 退出登录 | 已登录用户 |
| `GET /api/auth/me` | 获取当前登录用户 | 已登录用户 |

集成注意事项：

- 试点初始化完成后应保持 `allowPublicRegistration=false`。
- 会话 Cookie 应通过 HTTPS 使用；政府试点应启用 `secureCookies=true`。
- 服务重启后如会话大量失效，应检查 `AUDITLENS_SESSION_SECRET` 是否保持一致。

## 3. 部署策略和健康检查

| 接口 | 用途 | 验收关注点 |
| --- | --- | --- |
| `GET /api/bootstrap` | 返回部署策略 | `government_poc`、AI/OCR/ASR 开关、公开注册策略 |
| `GET /api/health` | 基础健康检查 | 返回 `ok` |
| `GET /api/health/details` | 组件健康检查 | 数据库、OCR、ASR、AI、连接器状态 |

`GET /api/health/details` 示例：

```json
{
  "status": "ok",
  "db": "ok",
  "ocr": "enabled",
  "asr": "enabled",
  "ai": "disabled_by_policy",
  "connectors": "configured"
}
```

验收建议：

- 基础验收使用 `/api/health`。
- 运维验收使用 `/api/health/details`。
- AI 关闭时 `ai` 可显示 `disabled_by_policy`，这不是故障。

## 4. 任务流程接口

| 接口 | 用途 | 权限 |
| --- | --- | --- |
| `GET /api/tasks` | 查询任务列表 | 已登录用户，结果受角色限制 |
| `POST /api/tasks/demo` | 创建财政监督样板任务 | `admin`、`auditor` |
| `POST /api/tasks/file` | 创建文件审计任务 | `admin`、`auditor` |
| `POST /api/tasks/database` | 创建数据库来源审计任务 | `admin` |
| `GET /api/tasks/{task_id}` | 查看任务详情 | 已登录用户 |
| `POST /api/tasks/{task_id}/findings/{finding_id}` | 更新发现项状态或备注 | `admin`、`auditor` |
| `POST /api/tasks/{task_id}/ai` | AI 辅助分析 | 受部署策略和账号权限限制 |

任务详情返回 `task_origin`，用于区分任务来源：

- `legacy_demo`
- `v2_platform`
- `v2_typed`

缺失任务返回示例：

```json
{
  "error": "task not found",
  "hint": "Use a task id returned by POST /api/tasks/demo, a v2 import task, or GET /api/tasks.",
  "expected_schema_url": "/docs/API.md#task-detail"
}
```

## 5. 证据、报告和密封导出

| 接口 | 用途 | 权限 |
| --- | --- | --- |
| `GET /api/tasks/{task_id}/artifacts` | 查看任务证据附件 | 已登录用户 |
| `POST /api/tasks/{task_id}/artifacts/image` | 上传图片证据 | `admin`、`auditor` |
| `POST /api/tasks/{task_id}/artifacts/audio` | 上传音频证据 | `admin`、`auditor` |
| `POST /api/tasks/{task_id}/artifacts/{artifact_id}/retry` | 重试证据识别 | `admin`、`auditor` |
| `POST /api/tasks/{task_id}/export/pdf` | 生成 PDF 报告 | `admin`、`auditor` |
| `GET /api/tasks/{task_id}/report.pdf` | 下载 PDF 报告 | `admin`、`auditor` |
| `POST /api/tasks/{task_id}/seal` | 生成密封导出包 | `admin`、`auditor` |

密封包包含：

- `manifest.json`
- `encrypted_payload.json`

密封包验收：

```powershell
cargo run --bin seal-verify -- path\to\sealed-package.zip
```

期望输出：

```text
OK
```

如出现哈希或签名不一致，应重新导出并保留失败信息用于排查。

## 6. 批量导入和线索导入

| 接口 | 用途 | 权限 |
| --- | --- | --- |
| `POST /api/case-seeds/import` | 导入监督评审台账或案件种子 | `admin`、`auditor` |

最小请求示例：

```json
{
  "title": "监督评审台账导入",
  "template_kind": "investment_review",
  "mapping_overrides": [],
  "assignment_rules": [],
  "records": [
    {
      "case_no": "NJ-001",
      "title": "项目复核",
      "unit": "南京商务局"
    }
  ]
}
```

错误示例：

```json
{
  "error": "missing field records",
  "hint": "Expected JSON shape: { \"records\": [ ... ] }",
  "expected_schema_url": "/docs/API.md#case-seed-import"
}
```

集成建议：

- 统一使用 UTF-8。
- 批量导入前先用脱敏样例验证字段映射。
- 导入记录应保留来源系统、导出时间、脱敏方式和导入批次。

## 7. 自动化计划

| 接口 | 用途 | 权限 |
| --- | --- | --- |
| `POST /api/automation/schedules` | 创建自动化计划 | `admin` 或授权用户，按系统策略执行 |

合法 `schedule_kind`：

- `manual_only`
- `hourly`
- `daily`
- `weekly`
- `cron`
- `interval`

旧值 `manual` 会被拒绝，集成方应使用 `manual_only`。

## 8. 管理后台接口

| 接口 | 用途 | 权限 |
| --- | --- | --- |
| `GET /api/admin/overview` | 管理概览、线索、部署策略 | `admin` |
| `POST /api/admin/users` | 创建用户 | `admin` |
| `POST /api/admin/users/{user_id}/reset-password` | 重置密码 | `admin` |
| `POST /api/admin/ai-profile` | 配置 AI profile | `admin`，且受部署策略限制 |

安全要求：

- 管理后台不保存或回显 AI / 连接器 secret 原文。
- 密码重置和 AI profile 变更应进入审计日志。
- 生产或试点环境应禁用公开注册。

## 9. 权限矩阵

| 能力 | `admin` | `auditor` | `viewer` |
| --- | --- | --- | --- |
| 登录 | 是 | 是 | 是 |
| 查看任务 | 是 | 是 | 是 |
| 创建样板任务 | 是 | 是 | 否 |
| 文件审计 | 是 | 是 | 否 |
| 数据库来源审计 | 是 | 否 | 否 |
| 上传证据 | 是 | 是 | 否 |
| 更新整改状态 | 是 | 是 | 否 |
| PDF 导出 | 是 | 是 | 否 |
| 密封包导出 | 是 | 是 | 否 |
| 用户管理 | 是 | 否 | 否 |
| AI profile 配置 | 是 | 否 | 否 |
| 查看审计日志 | 是 | 否；如需业务留痕由管理员展示或导出 | 否；如需监督留痕由管理员展示或导出 |

## 10. 错误处理约定

集成方应优先展示：

- `error`：错误摘要。
- `hint`：用户或集成方可执行的修复建议。
- `expected_schema_url`：接口文档定位。

常见错误处理：

| 场景 | 处理 |
| --- | --- |
| 401 或未登录 | 重新登录 |
| 403 或权限不足 | 检查账号角色 |
| 400 schema 错误 | 按 `hint` 修正请求体 |
| 任务不存在 | 使用任务列表重新获取任务 ID |
| AI 被策略关闭 | 不重试 AI，继续规则审计主流程 |
| 密封包校验失败 | 重新导出，必要时检查文件传输完整性 |

## 11. 联合试点接口验收证据

- `/api/health` 返回 `ok`。
- `/api/health/details` 返回组件状态。
- `GET /api/bootstrap` 显示政府试点策略。
- `POST /api/tasks/demo` 创建任务成功。
- `GET /api/tasks/{task_id}` 返回任务详情和风险发现。
- `POST /api/tasks/{task_id}/export/pdf` 或 PDF 下载成功。
- `POST /api/tasks/{task_id}/seal` 生成密封包且校验 `OK`。
- `viewer` 调用创建或导出接口被拒绝。
