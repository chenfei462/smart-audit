# 系统管理员手册

适用对象：信息中心、系统管理员、项目运维人员。

适用范围：联合试点正式交付环境。本文档覆盖试点验收所需的部署策略、账号权限、备份恢复、健康检查、审计日志和能力开关，不替代客户生产运维制度。

## 1. 部署与环境策略

推荐拓扑：

- HTTPS 反向代理或网关。
- AuditLens 应用节点。
- 本地状态库 `data/platform.db`。
- 可选受控数据库连接。
- 可选本地 OCR/ASR 桥接服务。
- 可选 AI 服务，仅在审批后启用。

政府试点环境基线：

| 配置项 | 建议值 | 说明 |
| --- | --- | --- |
| `environmentMode` | `government_poc` | 标识政府试点环境 |
| `secureCookies` | `true` | HTTPS 后启用安全 Cookie |
| `allowPublicRegistration` | `false` | 初始化后关闭公开注册 |
| `publicDemoMode` | `false` | 私有试点不使用公网样板限制 |
| `aiEnabled` | `false` | 未批准前关闭 AI |
| `ocrEnabled` / `speechEnabled` | 按需启用 | 需要本地 OCR/ASR 桥接服务 |
| `AUDITLENS_SESSION_SECRET` | 环境变量注入 | 不写入 JSON 配置 |

反向代理要求：

- 对外访问必须使用 HTTPS。
- 代理需要转发 `X-Forwarded-Proto=https`。
- 非本机 HTTP 访问在政府试点模式下应被拒绝。

## 2. 启动与巡检

启动前检查：

1. 确认 `config/runtime.local.json` 不含 secret 明文。
2. 确认 `config/runtime.local.env` 或平台密钥管理已注入 `AUDITLENS_SESSION_SECRET`。
3. 确认 `platformDataDir` 指向可写目录。
4. 确认反向代理地址和应用端口匹配。
5. 如启用 OCR/ASR，先启动本地桥接服务。

日常巡检：

| 检查项 | 方法 | 正常结果 |
| --- | --- | --- |
| 基础健康检查 | `GET /api/health` | 返回 `ok` |
| 组件健康检查 | `GET /api/health/details` | 数据库为 `ok`，AI/OCR/连接器状态符合策略 |
| 策略检查 | 管理后台查看部署策略 | 与政府试点基线一致 |
| 日志检查 | 查看启动日志 | 有配置指纹，无 secret 原文 |
| 任务检查 | 创建或查看样板任务 | 任务能正常完成 |
| 导出检查 | 导出 PDF 和密封包 | 文件生成成功 |
| 审计日志 | 管理后台查看 | 登录、导出、配置、上传等关键操作有记录 |

## 3. 账号与权限管理

角色模型：

- `admin`：环境配置、AI 策略、用户创建、密码重置、数据库来源审计、审计日志查看。
- `auditor`：文件审计、任务复核、整改更新、报告导出。
- `viewer`：只读查看任务结果。

建议账号设置：

| 用户组 | 推荐角色 | 数量建议 | 用途 |
| --- | --- | --- | --- |
| 信息中心管理员 | `admin` | 2 个 | 主备管理员，避免单点人员风险 |
| 财政局业务人员 | `auditor` | 按部门配置 | 创建任务、复核风险、导出报告 |
| 纪委监督人员 | `viewer` | 按验收组配置 | 查看线索、整改状态和留痕 |
| 项目交付人员 | 临时 `auditor` 或 `viewer` | 验收期使用 | 培训和验收辅助，验收后停用 |

管理要求：

- 禁止多人共用管理员账号。
- 密码重置应记录原因和操作人。
- 项目交付临时账号应设置回收日期。
- 验收结束后删除或停用临时账号。

## 4. 数据和备份恢复

需要备份的对象：

- `data/platform.db` 或实际 `platformDataDir` 下的状态库。
- `config/runtime.local.json`，作为部署策略备份。
- `config/runtime.local.env` 或平台密钥配置，作为敏感配置备份。
- 必要时备份导出报告、密封导出包和验收证据目录。

备份命令：

```powershell
./scripts/backup-platform-db.cmd
```

恢复演练命令：

```powershell
./scripts/restore-platform-db.cmd .\data\backup\platform-YYYYMMDD-HHMMSS.db .\tmp\restore-drill
```

恢复流程：

1. 通知业务人员暂停操作。
2. 停止应用服务。
3. 备份当前故障现场文件。
4. 恢复最近一次有效 `platform.db`。
5. 确认 `AUDITLENS_SESSION_SECRET` 与原环境一致。
6. 启动服务。
7. 执行 `/api/health` 和任务抽查。
8. 记录恢复时间、恢复点、操作人和验证结果。

演练频率：

- 试点期至少演练一次备份恢复。
- 正式运行前建议每月执行一次恢复演练。

## 5. 审计日志与留痕

高风险操作应重点检查：

- 登录成功和失败。
- 密码重置。
- AI profile 变更。
- 连接器配置。
- PDF 导出。
- 密封导出。
- 证据上传。
- 问题状态更新。
- 批量处置。
- 自动化计划变更。

留痕要求：

- 验收期间每类关键操作至少保留一条截图或导出记录。
- 日志保留建议不少于 180 天。
- 日志归档应包含月份分区文件和 SHA256 校验文件。

归档命令：

```powershell
./scripts/archive-audit-log.cmd -All
```

按保留期归档：

```powershell
./scripts/archive-audit-log.cmd -RetentionDays 180
```

## 6. AI、OCR、ASR 和连接器开关

AI 策略：

- 政府试点默认关闭 AI。
- 启用前需客户审批，明确供应商、网络出口、数据范围和日志要求。
- AI 只作为辅助解释层，规则发现仍为系统记录依据。
- 管理后台不应保存或回显 AI secret，只显示 secret 是否已配置。

OCR/ASR 策略：

- 仅在需要图片、扫描件或音频证据识别时启用。
- 本地桥接服务默认地址为 `http://127.0.0.1:8090`。
- 识别失败不应阻断规则审计主流程。

连接器策略：

- 数据库审计只能通过白名单模板和批准表名执行。
- 连接器凭据应通过环境变量或受控密钥注入。
- 连接失败时先检查模板、网络、凭据、白名单表名和只读权限。

## 7. 交付验收时管理员需提供的证据

- 部署策略截图或配置摘录，隐藏 secret。
- `/api/health` 和 `/api/health/details` 结果。
- 账号角色列表截图。
- `viewer` 权限限制验证截图。
- 备份文件和恢复演练输出。
- 启动日志配置指纹截图，确认无 secret 原文。
- 审计日志截图，覆盖登录、导出、整改状态更新、管理员配置操作。
- AI 关闭策略截图；如启用 AI，提供审批记录和辅助解释说明。
