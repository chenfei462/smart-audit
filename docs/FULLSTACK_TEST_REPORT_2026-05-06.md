# AuditLens 全栈功能测试报告

测试日期：2026-05-06  
测试对象：`D:\Desktop\smart-audit`  
测试方式：本地全栈启动、API 自动化、Chrome/Playwright 页面点击、Rust/Node 回归测试  
测试依据：

- `README.md`
- `docs/POC_ACCEPTANCE_CHECKLIST.md`
- `docs/GOVERNMENT_POC_PACKAGE.md`
- `docs/API.md`
- `docs/OPERATIONS.md`
- `docs/SALES_PLAYBOOK.md`
- `docs/superpowers/plans/2026-04-24-evidence-budget-linkage.md`
- `docs/superpowers/specs/2026-04-24-evidence-budget-linkage-design.md`

## 1. 总体结论

AuditLens 当前本地全栈环境可以运行，核心财政监督主流程可用。

已验证通过的主流程包括：

- 公开样板首页、`预约汇报 / 申请 PoC` 线索提交
- 管理员登录、用户创建、角色权限隔离
- auditor 创建财政监督样板任务
- viewer 只读访问与敏感导出拦截
- 采购、预算、国库支付、会计凭证四类文件导入
- 四类标准批量 payload 导入
- 重点风险识别、规则结果展示、任务列表筛选
- PDF 标准报告导出
- 财政监督 demo 任务密封导出
- 案件种子导入、案件分派、案件流转、异常池批量更新
- 管理后台部署策略、项目申请、用户、审计留痕、AI 配置、连接档案查看
- 连接器 profile 创建、预检、入库
- 导入方案、分派字典、自动化计划 API
- Evidence linkage 南京商务局样本回归

存在 3 个需要修复或产品补齐的问题：

1. 多类型导入工作台生成的 v2 任务调用 `POST /api/tasks/{task_id}/seal` 返回 `404 task not found`，密封导出覆盖不完整。
2. `POST /api/tasks/demo` 生成的财政监督 demo 任务可以 PDF/密封导出，但 `GET /api/tasks/{demo_task_id}` 返回 `404`，旧 demo 任务与 v2 任务详情接口不一致。
3. Web 页面未明显暴露 PDF 导出、密封导出、AI 分析、证据附件上传入口，部分能力只能通过 API 验证。

## 2. 运行环境

原 README 默认端口：

- Web：`http://127.0.0.1:8081`
- OCR / ASR bridge：`http://127.0.0.1:8090`

本机实际启动端口：

- Web：`http://127.0.0.1:18080`
- OCR / ASR bridge：`http://127.0.0.1:18090`

端口调整原因：

- 绑定 `8081` 和 `8090` 时 Windows 返回 `os error 10013 / WinError 10013`
- 改用高位端口 `18080`、`18090` 后服务启动正常

当前 `config/runtime.local.json` 关键策略：

| 配置项 | 当前值 | 测试结论 |
| --- | --- | --- |
| `host` | `127.0.0.1` | 通过 |
| `port` | `18080` | 通过 |
| `ocrApiUrl` | `http://127.0.0.1:18090/ocr` | 通过 |
| `speechApiUrl` | `http://127.0.0.1:18090/speech` | 通过 |
| `secureCookies` | `false` | 本地可接受；PoC/HTTPS 环境不满足验收建议 |
| `allowPublicRegistration` | `false` | 通过 |
| `aiEnabled` | `true` | 公开样板可接受；政府 PoC 默认应关闭 |
| `publicDemoMode` | `true` | 公开样板可接受；政府 PoC 应为 `false` |
| `ocrEnabled` | `true` | 通过 |
| `speechEnabled` | `true` | 通过 |

## 3. 测试证据

自动化报告：

- `.tmp/fullstack-test-report.json`
- `.tmp/followup-test-report.json`

第一轮自动化：

- 通过：35
- 失败：9
- 失败中多数为测试脚本对象或 payload 选择不当，已在补测中纠正

补测：

- 通过：5
- 失败：2
- 失败项确认为真实覆盖问题或再次确认的测试 payload 问题

验证命令：

```powershell
C:\Users\CYL\.cargo\bin\cargo.exe test
```

结果：

- 93 passed
- 0 failed

```powershell
node --check static\app\report.js
node --check static\app\state.js
node --check static\app\tasks.js
node --check static\app\admin.js
node --check static\app\configuration.js
node --check static\app\exceptions.js
node --check static\app\cases.js
node --check static\app\rectification.js
node --check static\app\operations.js
```

结果：全部通过。

```powershell
node --test scripts\test-chart-data.test.mjs scripts\test-task-list-view.test.mjs scripts\test-procurement-chain-closure.test.mjs
```

结果：

- 16 passed
- 0 failed

健康检查：

- Web `/api/health`：`{"status":"ok","version":"0.3.0"}`
- OCR / ASR bridge `/health`：`{"status":"ok"}`

## 4. 按验收清单逐项核对

### 4.1 部署

| 验收项 | 结果 | 说明 |
| --- | --- | --- |
| 目标私有环境中服务可以正常启动 | 部分通过 | 本地服务可启动；默认端口被系统拒绝，已改用 `18080/18090` |
| HTTPS 后 `secureCookies=true` 已启用 | 未验证 | 当前为本地 HTTP，`secureCookies=false` |
| 初始化后 `allowPublicRegistration=false` | 通过 | bootstrap 返回 false |
| PoC 环境使用 `publicDemoMode=false` | 未满足 | 当前为公开样板模式 `true` |
| 未明确批准前 `aiEnabled=false` | 未满足 | 当前为公开样板配置 `true` |

结论：本地样板环境可运行；正式政府 PoC 前需要切换策略基线。

### 4.2 访问控制

| 验收项 | 结果 | 说明 |
| --- | --- | --- |
| `admin` 可以登录并管理用户 | 通过 | `admin / Admin123` 登录成功，创建 auditor/viewer 成功 |
| `auditor` 可以创建任务和导出报告 | 通过 | auditor 创建财政监督 demo 任务成功 |
| `viewer` 只能查看结果 | 通过 | viewer 可列出任务 |
| `viewer` 不能创建任务 | 通过 | 创建任务被拒绝 |
| `viewer` 不能导出敏感结果 | 通过 | PDF 导出被拒绝 |

### 4.3 数据验证

| 验收项 | 结果 | 说明 |
| --- | --- | --- |
| 脱敏财政监督样例数据可导入并处理 | 通过 | 财政监督 demo 与内部样例导入均通过 |
| 受控真实数据小样本导入 | 通过 | 南京商务局公开样本 payload 成功导入 |
| 数据库审计仅能通过白名单模板和批准表名执行 | 通过 | 非白名单表 `not_whitelisted` 被拒绝 |

### 4.4 审计流程

| 验收项 | 结果 | 说明 |
| --- | --- | --- |
| 创建财政监督样板任务 | 通过 | `/api/tasks/demo` 成功 |
| 创建文件审计任务 | 通过 | 采购、预算、国库支付、会计凭证四类 CSV 预检和入库成功 |
| 创建批量 payload 任务 | 通过 | 四类 batch API 均成功 |
| 识别重点财政风险 | 通过 | 规则 findings、风险等级、异常池均有结果 |
| 保存整改状态和备注 | 通过 | finding 更新、案件流转、异常池批量更新均通过 |

### 4.5 输出结果

| 验收项 | 结果 | 说明 |
| --- | --- | --- |
| PDF 标准报告导出 | 通过 | demo/v2 任务 PDF API 可生成内容 |
| 密封导出包生成 | 部分通过 | demo 任务可生成；v2 导入任务返回 404 |
| 管理后台可查看审计留痕 | 通过 | admin overview 返回 logs，页面可见审计留痕区域 |

### 4.6 运维

| 验收项 | 结果 | 说明 |
| --- | --- | --- |
| `/api/health` 返回 ok | 通过 | Web 与 bridge 均返回 ok |
| `data/platform.db` 可备份和恢复 | 未做破坏性恢复演练 | 已确认数据库文件存在并持续写入 |
| 服务重启后同一 `sessionSecret` 正常运行 | 未完整重启验证 | 当前配置保留 sessionSecret，服务运行正常 |

### 4.7 AI 策略

| 验收项 | 结果 | 说明 |
| --- | --- | --- |
| AI 关闭时主流程仍可运行 | 未切换验证 | 当前配置为 `aiEnabled=true` |
| AI 启用时界面标注为辅助解释层 | 通过 | 页面展示“AI 仅用于辅助解释与摘要生成，规则结论仍以系统规则为准” |
| AI API 策略受控且不阻断主流程 | 通过 | AI endpoint 返回受控结果，不影响导入/报告/整改 |

## 5. Web 页面点击覆盖

已使用 Chrome/Playwright 点击或操作：

- 首页加载
- `预约汇报`
- `申请 PoC`
- 公开线索表单填写和提交
- 登录表单
- 四类导入类型卡片
- 文件导入、批量 payload、公告页采集、连接器导入 tab
- 下载模板按钮
- 文件上传预检
- 确认入库
- 批量 payload 创建任务
- 任务刷新
- 任务组展开/折叠
- 任务搜索
- 任务类型、来源、风险筛选
- 任务详情选择
- 案件种子模板下载
- 案件种子配置保存
- 导入方案保存
- 责任分派字典保存
- 自动化计划创建与刷新
- 管理后台新增用户
- AI 配置保存
- 连接档案创建
- 移动端视口冒烟检查

页面点击结论：

- 主要可见控件可以点击并触发对应请求
- 部分导出/AI/附件能力页面没有明显入口，只能通过 API 验证

## 6. Evidence Linkage 专项核对

计划书要求：

- 保留精确匹配
- 新增 `evidence_auto` 和 `evidence_candidate`
- 前端明确展示关联模式、分数、证据摘要
- 南京商务局“菜篮子 / 冻猪肉储备”样本应自动证据关联

测试结果：

| 指标 | 结果 |
| --- | --- |
| `exact_linked_procurement_projects` | 0 |
| `evidence_auto_linked_procurement_projects` | 34 |
| `candidate_procurement_projects` | 0 |
| `unlinked_procurement_projects` | 939 |
| `ambiguous_matches` | 0 |

结论：

- 南京商务局公开样本已命中 evidence auto linkage
- 候选关联与自动关联计数分离
- 后端 linkage summary 已返回
- 页面任务详情可展示预算关联摘要，但建议后续强化“关联模式、分数、证据摘要”的显式 UI 呈现

## 7. 发现的问题

### P1：v2 导入任务密封导出失败

现象：

- 多类型导入工作台生成的 v2 任务调用：

```http
POST /api/tasks/{task_id}/seal
```

返回：

```json
{"error":"task not found"}
```

影响：

- docs 要求“密封导出包生成成功”
- 当前只对旧 demo 任务验证通过，对 v2 导入任务覆盖不足

建议：

- 统一 `seal_task_export` 的任务读取逻辑，支持 v2 `PlatformTask`
- 或为 v2 任务提供独立密封导出接口，并在页面暴露入口

### P1：demo 任务详情接口不一致

现象：

- `POST /api/tasks/demo` 创建成功
- 同一 task id 调用：

```http
GET /api/tasks/{demo_task_id}
```

返回：

```json
{"error":"task not found"}
```

影响：

- demo 任务可以 PDF/密封导出，但不能通过统一任务详情接口查看
- 前端和 API 测试容易出现任务模型割裂

建议：

- 将 demo task 纳入统一任务查询
- 或明确区分 legacy demo task 与 v2 platform task，并在 API 文档中说明

### P2：部分 API 能力缺少页面入口

现象：

- PDF 导出、密封导出、AI 分析、证据附件上传 API 存在
- 当前页面未发现明显按钮或操作入口

影响：

- 用户无法只通过 Web 页面完成 docs 中要求的完整交付闭环

建议：

- 在任务详情页增加：
  - 导出 PDF
  - 生成密封包
  - AI 辅助解释
  - 上传图片/音频证据
  - 查看 OCR/ASR 识别结果

### P2：PoC 策略基线需切换

现象：

- 当前本地配置为公开样板环境：
  - `publicDemoMode=true`
  - `aiEnabled=true`
  - `secureCookies=false`

影响：

- 不符合政府 PoC 默认配置要求

建议：

- 增加 `runtime.poc.json` 或脚本参数，一键切换：
  - `secureCookies=true`
  - `allowPublicRegistration=false`
  - `publicDemoMode=false`
  - `aiEnabled=false`

## 8. 最终结论

AuditLens 已具备政府财政监督工作台的核心可演示能力，主流程已经跑通。

当前适合作为“公开样板环境 / 本地演示环境”继续使用。若要作为“政府 PoC 验收环境”，建议先修复 v2 任务密封导出与 demo/v2 任务详情接口不一致问题，并补齐 Web 页面上的导出、密封、AI、证据附件入口，然后切换 PoC 部署策略基线。

