# AuditLens 修复与优化计划

生成日期：2026-05-06
作者范围：基于 `docs/FULLSTACK_TEST_REPORT_2026-05-06.md`、`.tmp/fullstack-test-report.json`、`.tmp/followup-test-report.json`、`docs/FUTURE_IMPROVEMENTS.md`、`docs/POC_ACCEPTANCE_CHECKLIST.md`、`docs/GOVERNMENT_POC_PACKAGE.md`，以及当前 `src/`、`static/`、`scripts/`、`config/` 实际代码状态。

文档目标：把所有"已发现问题 + 已识别长期改进"统一编排为一份可执行清单，按优先级、模块、负责人、验收标准列出，可直接拿去排期或下发。

---

## 0. 一图速览

| 优先级 | 主题 | 条目数 | 主要交付物 |
| --- | --- | --- | --- |
| P0 阻断 | v2 任务密封导出 / demo 任务详情 / 默认端口 | 3 | 修复 v2 sealing、统一任务详情、Windows 默认端口 |
| P1 必修 | 自动化测试中暴露的真实缺陷（异常池、案件种子、自动化计划、UI 重复 H1 等） | 6 | 修复后自动化报告 0 fail |
| P2 PoC 必备 | PoC 部署策略基线、Web 页面缺失入口、安全 / 数据来源 / 规则解释 | 8 | `runtime.poc.json` 一键基线 + UI 入口齐备 |
| P3 工程化 | 后端拆分、前端模块化、CI、可观测性、文档 | 6 | 长期演进路线 |

总计 **23 条**，建议分 4 个迭代滚动交付，详见第 6 节路线图。

---

## 1. P0 — 必须先修复（阻断 PoC 验收）

### P0-1：v2 导入任务密封导出 404

- **现象**：`POST /api/tasks/{task_id}/seal` 对多类型导入工作台生成的 v2 任务返回 `404 task not found`，但旧 demo 任务可以。
- **根因**（已经在代码中定位）：`src/web/mod.rs:3453` 的 `seal_task_export` 走 `context.platform.get_task(&identity, &task_id)`，该方法仅查 v2 平台任务库；而失败的 v2 任务实际上在 `v2_store` 中按 `procurement_project / budget / treasury / voucher` 等 `task_kind` 分别存储，未通过 `get_task` 暴露的统一视图返回。
- **修复方案**：
  1. 在 `platform/v2_store.rs` 提供一个统一的 `find_any_task(identity, task_id)`，按以下顺序查找：legacy demo task → v2 platform task → v2 typed task（procurement / budget / treasury / voucher / file / database / batch）。
  2. `seal_task_export` 改用该方法获取任务，并基于 `task_kind` 选择对应的密封 payload（不要直接 `serde_json::to_string_pretty(&task)`，需要把规则结果 + 关联预算 + 证据摘要 + 整改状态打包）。
  3. 在密封包中加入 manifest（文件哈希、生成时间、生成人、规则版本、模板版本）以满足 P2-3 的"密封导出增强"。
  4. 新增 Rust 集成测试 `tests/seal_v2_task.rs`：四类导入分别建任务 → 调用 seal → 解密验签 → 比对字段。
- **验收**：`.tmp/fullstack-test-report.json` 中"sealed export package matches inspection"以及 `followup` 中"sealed export package content inspected"两条均通过；密封文件大小不再 < 阈值。
- **影响范围**：`src/web/mod.rs`、`src/platform/v2_store.rs`、`src/encryption/`、`tests/`。
- **预估工作量**：2 ~ 3 人日。

### P0-2：demo 任务与 v2 任务详情接口割裂

- **现象**：`POST /api/tasks/demo` 返回的 `task_id`，再调 `GET /api/tasks/{task_id}` 返回 404。但同一个 id 可以做 PDF / seal 导出。
- **根因**：demo 任务保留在 legacy 路径中（按 `RuleEngineResult` 序列化），`get_task` 没有查 legacy 表。
- **修复方案**：与 P0-1 共用 `find_any_task`。`get_task` 路由也统一走它。返回结构需要附 `task_origin: "legacy_demo" | "v2_platform" | "v2_typed"` 字段，前端可据此做兼容。
- **验收**：`fullstack-test-report.json` 中"task detail loads via GET /api/tasks/{demo_task_id}"通过；前端任务详情页能直接打开 demo 任务。
- **预估**：与 P0-1 合并 1 人日。

### P0-3：Windows 默认端口 8081 / 8090 启动失败

- **现象**：本机 Windows 10 绑定默认端口报 `os error 10013 / WinError 10013`，文档说 8081 / 8090，实际只能跑 18080 / 18090。
- **根因**：Windows 上 `8081 / 8090` 被 `Hyper-V / WSL / IIS` 等保留端口段命中，普通用户进程无法绑定。
- **修复方案**：
  1. `scripts/init-local.cmd` 增加端口探测：依次尝试 `8081 → 18080 → 28080`，把可用端口写入 `config/runtime.local.json`。
  2. `scripts/start-local.cmd` 启动后输出实际端口与 URL；`scripts/check-health.cmd` 读取配置而不是硬编码端口。
  3. 在 `README.md` 与 `docs/DEPLOYMENT.md` 标注 Windows 保留端口排查命令：`netsh interface ipv4 show excludedportrange protocol=tcp`。
- **验收**：在干净的 Windows 上执行 `./scripts/init-local.cmd && ./scripts/start-local.cmd`，不再因为端口问题报错；`/api/health` 返回 ok。
- **预估**：0.5 人日。

---

## 2. P1 — 自动化测试暴露的真实缺陷

### P1-1：异常池批量更新前端 payload 缺 `task_id`

- **来源**：`.tmp/followup-test-report.json` → `exceptions/status 400 missing field task_id`。
- **根因**：`bulk_update_task_exceptions`（`src/web/mod.rs:3140`）要求 `targets[].task_id` 必填且与路径上的 `task_id` 一致；前端 `static/app/exceptions.js` 在批量更新时只传了路径参数，没有把每个 target 的 `task_id` 一起带上。
- **修复方案**：
  - 后端：当 `targets[].task_id` 缺省时，使用 path 中的 `task_id` 兜底，仅当 target 显式传入与 path 不一致时才返回 `task_id mismatch`。
  - 前端：在生成 payload 时把当前 task id 同时填到每个 target 上（为后续支持跨任务批量更新留接口）。
  - 增加针对 `exceptions/status` 的 Rust 集成测试与前端 `node --test` 用例。
- **预估**：0.5 人日。

### P1-2：案件种子导入 payload 缺 `records` 字段

- **来源**：`fullstack-test-report.json` → `case-seeds/import 400 missing field records`。
- **现象**：补测脚本在同一接口已通过，说明前端正确 payload 是 `{ records: [...] }`，但 fullstack 自动化脚本在 first round 用了不同字段。
- **修复方案**：
  - 后端：在反序列化失败时返回更具体的提示（哪一字段缺失、期望的 JSON 形态示例），方便排错。
  - 前端：在 `static/app/cases.js` 上传 case-seed 模板时强校验"行数不为 0、字段映射齐全"再提交。
  - 文档：`docs/API.md` 补全 `case-seeds/import` payload schema，附最小可运行示例。
- **预估**：0.5 人日。

### P1-3：自动化计划不再支持 `manual` kind

- **来源**：`fullstack-test-report.json` → `automation/schedules 400 unsupported automation schedule kind manual`；followup 用 `manual_only` 通过。
- **修复方案**：
  - 二选一：① 后端补 `manual` 作为 `manual_only` 的别名；② 前端 `static/app/configuration.js` 与文档全面替换为 `manual_only`。推荐 ②，并在 API 接到旧值时返回 400 + 明确错误信息。
  - 在 `docs/API.md` 列出全部合法 `schedule_kind` 枚举（cron / interval / manual_only / 其他），并在前端 select 中明确展示。
- **验收**：`fullstack` 测试中"import profile, assignment dictionary, automation schedule APIs"通过；前端 `#automationScheduleKind` 选项与文档一致。
- **预估**：0.5 人日。

### P1-4：UI 出现两个 `<h1>`，违反语义化与无障碍

- **来源**：`fullstack-test-report.json` → `locator('h1') resolved to 2 elements`，分别是 `AuditLens 政府审计工作台样板环境` 与 `政府审计场景样板环境`。
- **影响**：屏幕阅读器、SEO、Playwright 严格模式定位都会出错。
- **修复方案**：保留站点级 `<h1>`，把第二处降级为 `<h2>` 或 `aria-label`；同时给主区域加 `id="main-content"` 以支持跳过链接。
- **预估**：0.25 人日。

### P1-5：任务详情页 `networkidle` 永不结束

- **来源**：`fullstack-test-report.json` → `page.reload procurement_project ... waiting for networkidle timeout 30s`。
- **可能根因**：页面存在持续轮询接口（任务执行进度 / 通知），networkidle 永远等不到。
- **修复方案**：
  - 前端：把高频轮询切到 SSE 或长轮询窗口，或使用 `requestIdleCallback` 批处理；同时给所有轮询的 `fetch` 加 `cache: "no-store"` 与重试上限。
  - 测试：所有 Playwright `reload` 改用 `domcontentloaded` 而不是 `networkidle`。
  - 监控：在前端侧添加"接口调用次数 / 错误率"埋点，便于持续观测。
- **预估**：1 人日。

### P1-6：`#automationScheduleKind` 选择器找不到

- **来源**：`fullstack-test-report.json` → `locator('#automationScheduleKind') timeout 30s`。
- **根因**：自动化配置面板在某些权限或路径下并未渲染该字段。
- **修复方案**：
  - 在 `static/app/configuration.js` 中确认无论哪种角色都渲染只读版本；非授权角色只是禁用而不是不渲染。
  - 给所有重要 form control 加稳定的 `data-testid`，避免 ID 与 CSS 选择器耦合。
- **预估**：0.5 人日。

---

## 3. P2 — PoC 验收必备的产品 / 安全 / 体验补齐

### P2-1：一键 PoC 策略基线切换

- **现象**：当前 `runtime.local.json` 是公开样板配置（`publicDemoMode=true`、`aiEnabled=true`、`secureCookies=false`），不符合政府 PoC 默认要求。
- **修复**：
  - 新增 `config/runtime.poc.json` 与 `config/runtime.public.json` 两个基线模板。
  - `scripts/switch-profile.cmd <poc|public>`：复制对应模板到 `runtime.local.json`，并打印生效配置摘要。
  - 在管理后台的"部署策略"页直接显示"当前基线 / 偏离项"，非 PoC 合规配置时给出黄条提示。
- **验收**：`config/runtime.poc.json` 中 `secureCookies=true / aiEnabled=false / publicDemoMode=false / allowPublicRegistration=false`；切换后 `bootstrap` 接口字段一致。
- **预估**：0.5 人日。

### P2-2：Web 页面补齐 PDF / 密封 / AI / 证据附件入口

- **来源**：`FULLSTACK_TEST_REPORT_2026-05-06.md` 第 7.3 节 P2 问题。
- **修复**：在任务详情页增加按钮组：
  - 导出 PDF（调用 `/api/tasks/{id}/report.pdf`）
  - 生成密封包（调用 `/api/tasks/{id}/seal`，下载并展示哈希）
  - AI 辅助解释（受 `aiEnabled` 策略控制，禁用时按钮置灰并解释原因）
  - 上传图片 / 音频证据 + 查看 OCR / ASR 识别结果与置信度
- **验收**：viewer 角色按钮可见但禁用；auditor 可正常使用；所有按钮触发的请求在 `audit_log` 中可追溯。
- **预估**：3 人日（含设计、前后端联调）。

### P2-3：密封包 manifest + 校验工具

- **修复**：
  - 密封包根目录加 `manifest.json`：`{ task_id, exported_by, exported_at, rule_version, template_version, files: [{name, sha256}], signature }`。
  - 提供 `tools/seal-verify`（Rust binary）独立校验包完整性，便于第三方（如审计办内部 IT）核验。
- **验收**：第三方使用 `seal-verify <package>` 输出 `OK` 或具体的不一致行。
- **预估**：1.5 人日。

### P2-4：审计日志保留策略与高风险操作扩展

- **目标**：满足 `FUTURE_IMPROVEMENTS.md §1` 安全合规要求。
- **修复**：
  - 在 `audit_log` 中显式记录：登录失败、密码重置、AI 配置变更、连接器配置变更、密封导出、PDF 导出、case 状态切换、用户禁用。
  - 增加 `audit_log_retention_days` 配置；定时任务把过期日志归档到 `data/archive/audit_log/yyyy-mm.jsonl.gz` 并写哈希。
  - 管理后台审计日志页支持按操作类型 / 操作人 / 时间范围 / 对象类型筛选与导出 CSV。
- **预估**：2 人日。

### P2-5：登录与会话安全加固

- **修复**：
  - 登录失败 5 次锁 10 分钟（按用户名 + 来源 IP），可由管理员解锁。
  - 弱密码策略：长度 ≥ 10，必须含数字 + 字母 + 符号；管理员重置后 `must_change_password=true`，下一次登录强制改密。
  - 会话过期：sliding window 30 分钟空闲过期，强制登出；sessionSecret 周期轮换脚本。
  - HTTPS 强制：`secureCookies=true` 时检查请求 scheme，否则返回 421。
- **预估**：2 人日。

### P2-6：数据来源可追溯（导入批次 + 解析器版本）

- **目标**：`FUTURE_IMPROVEMENTS.md §2` 数据接入可信度。
- **修复**：
  - 在所有导入接口（file / batch / connector / 公告抓取）写入 `import_batch_id`、`source_uri`、`parser_version`、`field_mapping_version`、`row_checksum`。
  - 任务详情页显示"数据来源批次"卡片：批次 id、来源、导入人、时间、记录数、解析器版本。
  - 任意 finding 都能反查到来源 row 与原始字段。
- **预估**：3 人日。

### P2-7：规则解释字段统一

- **目标**：`FUTURE_IMPROVEMENTS.md §3` 规则解释与误报控制。
- **修复**：
  - 给 `rule_engine` 中每条规则增加 `purpose / hit_condition / risk_level / scenario / suggested_action / reference_doc` 字段。
  - 任务详情和 PDF 报告同时展示业务解释，而不是只有技术字段。
  - 增加"误报标记 + 原因"按钮，记录到 audit_log 并在规则报表中聚合。
- **预估**：3 人日。

### P2-8：南京商务局样本回归用例固化为 CI

- **目标**：规则与 evidence linkage 不被无意改坏。
- **修复**：
  - 将现有 `evidence-linkage-regression` 样本沉淀为 `tests/regression/nanjing_commerce.rs`，断言关键指标：`evidence_auto_linked_procurement_projects = 34`、`exact = 0`、`unlinked = 939` 等。
  - CI 加入这条最小回归门禁。
- **预估**：1 人日。

---

## 4. P3 — 工程化与长期演进

### P3-1：后端按领域拆分

- 当前 `src/web/mod.rs` 4282 行、`src/platform/v2_store.rs` 10770 行、`src/platform/v2.rs` 3382 行，已经是单文件巨胖。
- 建议拆为：`web/routes/{auth,tasks,cases,exceptions,connectors,admin,public}.rs` + `platform/services/*` + `platform/repositories/*`，并引入轻量服务层。
- 数据库迁移用 `refinery` 或 `sqlx-migrate` 管理版本号，不再依赖启动时隐式 `ALTER TABLE`。
- **预估**：长期 5 ~ 8 人日（可分批做）。

### P3-2：前端模块化与统一交互

- 按视图模块拆 `static/app/*.js`，把通用控件（按钮、表格、对话框、空状态、错误条）抽到 `static/app/ui/`。
- 引入轻量构建（esbuild 或 vite）以支持 import map，但保持单文件部署能力。
- 表单错误信息全部走 `aria-live="polite"`，提升无障碍。
- **预估**：长期 5 人日。

### P3-3：测试与 CI

- 在 GitHub Actions 或本地脚本里固化一条命令：`cargo test && node --check static/app/*.js && node --test scripts/*.test.mjs && fullstack smoke`。
- Playwright smoke 选取最关键 8 步（登录、四类导入、任务列表筛选、PDF、密封、案件分派、整改保存、密封校验）。
- **预估**：3 人日。

### P3-4：可观测性

- 健康检查从 `/api/health` 拓展为 `/api/health/details`：DB / OCR / ASR / AI / 连接器分项状态。
- 结构化 JSON 日志，附 `request_id`、`tenant_id`、`user_id`、`route`、`elapsed_ms`、`outcome`。
- Prometheus 指标：导入耗时、规则评估耗时、密封导出耗时、AI 调用耗时与失败率。
- **预估**：3 人日。

### P3-5：备份恢复演练脚本

- `scripts/backup-platform-db.cmd` + `scripts/restore-platform-db.cmd`：包含 sqlite VACUUM、文件 hash、目标路径校验。
- 一份"备份恢复演练"操作手册放到 `docs/OPERATIONS.md`，并给出最小演练频率（建议每月一次）。
- **预估**：1.5 人日。

### P3-6：文档校准

- `README.md` 中默认端口与本次实测 18080 / 18090 对齐（或指向 `init-local.cmd` 自动探测）。
- `docs/API.md` 补完 `seal`、`exceptions/status`、`automation/schedules`、`case-seeds/import` 的请求 / 响应 schema。
- 在 `docs/DEPLOYMENT.md` 加 Windows 端口排查与反向代理 (Nginx / IIS) 模板。
- **预估**：1 人日。

---

## 5. 跨条目共性建议（适用于所有修复）

1. **改一个接口，先补一条集成测试**：每条 P0 / P1 修复进 PR 时必须附带 `tests/` 中的覆盖用例，并在 PR 描述里贴自动化跑通截图或日志。
2. **错误信息可读性**：所有 400 / 404 必须返回 `{ error, hint, expected_schema_url }`，而不是只有 `task not found`。
3. **审计日志默认开**：高风险操作（导出、密封、AI 配置变更、用户禁用）默认写日志，且日志包含 before/after 摘要。
4. **不要在生产环境出现"靠口头说明才能走通"的流程**：每个修复都问一句"用户能不能只看 UI 走完？"

---

## 6. 路线图建议

| 迭代 | 时长 | 主要目标 | 入口任务 |
| --- | --- | --- | --- |
| Sprint A | 1 周 | P0 全部修复 + P1 自动化测试归零 | P0-1, P0-2, P0-3, P1-1 ~ P1-6 |
| Sprint B | 1 周 | PoC 基线 + 页面入口齐 + manifest | P2-1, P2-2, P2-3, P2-8 |
| Sprint C | 2 周 | 安全加固 + 数据来源 + 规则解释 | P2-4, P2-5, P2-6, P2-7 |
| Sprint D | 持续 | 后端拆分、前端模块化、CI、可观测性 | P3-1 ~ P3-6 |

完成 Sprint A + B 后，可以重新跑 `.tmp/fullstack-test.mjs`，目标是 0 fail，并把 `runtime.poc.json` 切到 PoC 基线再跑一遍。完成 Sprint C 后，可以承接首个真实政府 PoC。

---

## 7. 立即可做的"今日清单"

- [ ] 起一条 `feature/seal-v2-tasks` 分支，落地 P0-1 + P0-2（合并实现）。
- [ ] 在 `scripts/init-local.cmd` 加端口探测，解决 P0-3（最快 1 小时）。
- [ ] 把 `.tmp/fullstack-test.mjs` 中"manual / records / task_id"等过时 payload 同步到 followup 标准。
- [ ] 创建 `config/runtime.poc.json` 模板，立刻可以演示策略切换（P2-1 第一步）。
- [ ] 在 `static/app/main.js` 把第二个 `<h1>` 改为 `<h2>`（P1-4 5 分钟改完）。

完成以上 5 件事，本次报告里 80% 的"血点"会立刻收敛。
