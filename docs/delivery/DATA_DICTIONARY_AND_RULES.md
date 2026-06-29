# 数据字典与审计规则说明

本文档面向业务负责人、数据负责人、审计人员和验收组，用于说明联合试点中的核心数据字段、数据来源、审计规则和处置口径。

## 1. 数据域概览

| 数据域 | 主要来源 | 典型用途 |
| --- | --- | --- |
| 任务与发现项 | 系统任务表、规则引擎输出 | 记录审计任务、风险发现、整改状态和导出结果 |
| 预算数据 | 部门预算、预算指标、项目库、预算执行表 | 判断预算控制、执行偏离、用途限制和绩效证据 |
| 采购数据 | 政府采购公告、成交公告、合同公告、验收信息 | 判断预算关联、超预算、拆分采购、证据链缺失 |
| 支付数据 | 国库集中支付、支付令、收款单位流水 | 判断无预算支付、同供应商密集支付、支付合同关联 |
| 会计凭证 | 会计凭证、账簿、附件摘要 | 判断借贷平衡、重复凭证、凭证与支付勾稽 |
| 整改数据 | 问题台账、整改备注、处置状态 | 跟踪问题闭环、复核意见和监督留痕 |
| 导出数据 | PDF 报告、密封导出包 | 验收、归档、移交和复核 |

## 2. 通用字段

| 字段 | 含义 | 是否关键 | 说明 |
| --- | --- | --- | --- |
| `id` | 系统内部记录 ID | 是 | 用于任务、发现项、导入记录内部关联 |
| `source_row` | 来源数据行号 | 建议 | 用于回查原始样本 |
| `source_document_id` | 来源文档 ID | 建议 | 关联公告、合同、凭证附件等来源 |
| `document_type` | 来源文档类型 | 建议 | 如公告、合同、验收、支付、凭证 |
| `title` | 来源文档标题 | 建议 | 验收截图和报告中可读 |
| `url` | 来源链接 | 可选 | 公开数据或内部系统链接 |
| `captured_at` | 采集或导出时间 | 建议 | 用于证据时点说明 |

## 3. 任务与风险发现字段

| 字段 | 含义 | 验收关注点 |
| --- | --- | --- |
| `task_id` | 任务编号 | 能在任务列表、任务详情、导出报告中对应 |
| `task_origin` | 任务来源 | 区分 `legacy_demo`、`v2_platform`、`v2_typed` |
| `task_kind` | 任务类型 | 区分预算、采购、支付、凭证、文件审计等 |
| `rule_code` | 规则编码 | 报告和验收清单引用的核心字段 |
| `rule_name` | 规则名称 | 业务人员可读 |
| `rule_category` | 规则类别 | 用于按风险类型归类 |
| `risk_level` | 风险等级 | `Critical`、`High`、`Medium`、`Low` 或 `Info` |
| `summary` | 命中摘要 | 简要说明发现了什么 |
| `audit_rationale` | 审计依据 | 说明为什么需要关注 |
| `recommended_action` | 建议处置 | 指导补证、复核或整改 |
| `evidence_summary` | 证据摘要 | 验收时需截图或导出 |
| `missing_evidence` | 缺失证据 | 采购链条、预算联动常用 |
| `recommended_next_data` | 建议补充数据 | 指导后续导入合同、验收、支付、凭证 |
| `finding_status` | 发现项状态 | 用于整改闭环验收 |
| `assignee` | 责任人 | 可用于分派整改 |
| `disposition_note` | 处置备注 | 验收整改闭环的关键证据 |

## 4. 预算字段

| 字段 | 含义 | 重要性 |
| --- | --- | --- |
| `period` | 期间 | 高 |
| `region` | 地区 | 中 |
| `budget_scope` | 预算口径 | 高 |
| `direction` | 收支方向 | 高 |
| `budget_unit_id` / `budget_unit_name` | 预算单位 | 高 |
| `budget_project_id` / `budget_project_name` | 预算项目 | 高 |
| `project_catalog_id` | 项目库 ID | 高，精确联动关键 |
| `indicator_document_no` | 指标文号 | 高，精确联动关键 |
| `funding_source_id` / `funding_source_name` | 资金来源 | 中 |
| `function_classification_code` | 功能分类科目 | 中 |
| `economic_classification_code` | 经济分类科目 | 中 |
| `budget_amount` | 预算金额 | 高 |
| `actual_amount` | 实际执行金额 | 高 |
| `previous_period_amount` | 上期金额 | 中 |
| `yoy_rate` | 同比变化率 | 中 |
| `policy_document_no` | 政策文件号 | 中 |
| `fund_destination` | 资金用途 | 中 |
| `prohibited_use_summary` | 禁止用途说明 | 中 |

预算联动说明：

- 公开数据通常能取得单位、项目名、预算金额和公告日期。
- 精确联动预算、采购、支付、凭证时，需要 `project_catalog_id` 或 `indicator_document_no`。
- 缺少内部主键时，系统可做候选匹配或补数建议，不应直接形成强违规结论。

## 5. 采购字段

| 字段 | 含义 | 重要性 |
| --- | --- | --- |
| `project_name` | 采购项目名称 | 高 |
| `purchaser_name` | 采购单位 | 高 |
| `announcement_type` | 公告类型 | 高 |
| `procurement_stage` | 采购阶段 | 高 |
| `project_code` | 项目编号 | 高 |
| `procurement_method` | 采购方式 | 中 |
| `published_at` | 发布时间 | 中 |
| `budget_amount` | 预算金额 | 高 |
| `award_amount` | 中标或成交金额 | 高 |
| `supplier_name` | 供应商 | 高 |
| `contract_no` | 合同编号 | 高 |
| `package_no` | 包号 | 中 |
| `package_budget_amount` | 分包预算金额 | 中 |
| `package_award_amount` | 分包中标金额 | 中 |
| `acceptance_result` | 验收结果 | 高 |
| `acceptance_summary` | 验收摘要 | 高 |
| `acceptance_result_locator` | 验收位置或链接 | 中 |
| `budget_project_id` | 关联预算项目 | 高 |

采购证据链阶段：

1. 采购意向。
2. 采购公告。
3. 中标或成交公告。
4. 合同公告。
5. 履约验收。
6. 支付或凭证。

公开数据缺少后续阶段时，应优先作为“补充数据建议”或“人工复核线索”。

## 6. 支付字段

| 字段 | 含义 | 重要性 |
| --- | --- | --- |
| `payment_order_no` | 支付单号 | 高 |
| `treasury_voucher_no` | 国库凭证号 | 高 |
| `budget_project_id` | 预算项目 | 高 |
| `procurement_project_id` | 采购项目 | 高 |
| `indicator_document_no` | 指标文号 | 高 |
| `project_catalog_id` | 项目库 ID | 高 |
| `contract_no` | 合同编号 | 高 |
| `amount` | 支付金额 | 高 |
| `paid_at` | 支付时间 | 高 |
| `counterparty` | 收款单位 | 高 |
| `supplier_name` | 供应商名称 | 中 |
| `writeback_status` | 回写状态 | 中 |
| `reconciliation_status` | 对账状态 | 中 |

支付数据验收重点：

- 支付是否可追溯到预算项目或指标文号。
- 支付是否可关联采购合同。
- 同一供应商短期密集支付是否有合理业务依据。

## 7. 会计凭证字段

| 字段 | 含义 | 重要性 |
| --- | --- | --- |
| `voucher_no` | 会计凭证号 | 高 |
| `account_code` | 会计科目编码 | 高 |
| `account_name` | 会计科目名称 | 高 |
| `debit_amount` | 借方金额 | 高 |
| `credit_amount` | 贷方金额 | 高 |
| `booked_at` | 入账时间 | 高 |
| `payment_order_no` | 支付单号 | 高 |
| `treasury_voucher_no` | 国库凭证号 | 高 |
| `contract_no` | 合同编号 | 中 |
| `counterparty` / `supplier_name` | 往来或供应商 | 中 |
| `reconciliation_status` | 对账状态 | 中 |

凭证数据验收重点：

- 借贷金额是否平衡。
- 凭证、支付单、合同是否可联查。
- 期末集中入账或冲账是否有业务说明。

## 8. 整改与处置字段

| 字段 | 含义 | 用途 |
| --- | --- | --- |
| `finding_status` | 发现项状态 | 跟踪待复核、整改中、已解决、已关闭 |
| `assignee` | 责任人 | 指定办理人员 |
| `disposition_note` | 处置备注 | 记录核查和整改过程 |
| `disposition_priority` | 处置优先级 | 区分重点问题 |
| `disposition_outcome` | 处置结果 | 形成闭环结论 |
| `remediation_due_at` | 整改期限 | 跟踪超期 |
| `reminder_flag` | 提醒标识 | 用于提醒或升级 |
| `disposed_at` | 处置时间 | 验收闭环证据 |

## 9. 导出包字段

PDF 标准报告应体现：

- 任务基础信息。
- 风险汇总。
- 规则结果。
- 证据摘要。
- 整改状态。
- 操作人和生成时间。

密封导出包 `manifest.json` 关键字段：

| 字段 | 含义 |
| --- | --- |
| `task_id` | 任务编号 |
| `exported_by` | 导出人 |
| `exported_at` | 导出时间 |
| `rule_version` | 规则版本 |
| `template_version` | 报告模板版本 |
| `files` | 包内文件和 SHA256 |
| `signature` | 清单签名 |

## 10. 审计规则清单

### 10.1 财政凭证与通用规则

| 规则编码 | 规则名称 | 风险等级 | 适用场景 | 命中口径 | 建议处置 |
| --- | --- | --- | --- | --- | --- |
| `FISCAL-BUDGET-001` | 凭证借贷失衡 | High | 会计凭证、账簿 | 借贷方向或金额勾稽不一致 | 核对原始凭证、记账分录和预算科目 |
| `FISCAL-FLOW-001` | 大额专项资金支付 | High | 专项资金、集中支付 | 支付金额超过阈值或需重点关注 | 核对资金用途、预算指标和审批链 |
| `FISCAL-DUP-001` | 疑似重复支付 | High | 支付流水、报销、拨付 | 近时点、同金额、同科目或同对象重复 | 核对支付批次、业务单据并追偿或冲销 |
| `FISCAL-TIME-001` | 支付时序倒挂 | Medium | 支付和凭证时间 | 业务、审批、支付、记账时间倒挂 | 核对是否倒签、补录或事后调整 |
| `FISCAL-TIME-002` | 支付时点异常间断 | Medium | 支付流水 | 长时间无交易后集中支付 | 核对集中列支或异常补记原因 |
| `FISCAL-DUP-002` | 整数金额集中支付 | Medium | 支付流水 | 大量整数金额或模板化金额 | 抽查合同、预算批复和支付凭证 |
| `FISCAL-FLOW-002` | 金额分布异常 | Medium | 金额总体分布 | 金额首位分布异常 | 与高风险规则结合抽样 |
| `FISCAL-FLOW-003` | 金额分布概览 | Low | 分布分析 | 作为概览提示 | 不单独作为整改依据 |
| `FISCAL-FLOW-004` | 同日同额资金回流 | High | 资金流向 | 同日同额多次流转 | 核对收付款双方和资金用途 |
| `FISCAL-TIME-003` | 期末集中支付 | High | 月末、年末支付 | 期末支付集中 | 核对预算执行节点和业务实质 |
| `FISCAL-LEDGER-001` | 高频往来科目组合 | Medium | 往来和挂账 | 高频往来组合 | 核查挂账真实性和清理情况 |
| `FISCAL-FLOW-005` | 异常金额波动 | Medium | 预算执行和支付 | 金额波动异常 | 逐笔抽查预算指标和支付审批 |

### 10.2 预算规则

| 规则编码 | 规则名称 | 风险等级 | 适用场景 | 建议处置 |
| --- | --- | --- | --- | --- |
| `BUDGET-LIMIT-001` | 预算控制异常 | High | 预算金额与执行金额 | 核对预算指标、追加调整和执行依据 |
| `BUDGET-EXEC-001` | 预算执行偏离 | High | 执行进度或金额偏离 | 核对执行原因、项目进度和审批材料 |
| `BUDGET-CLASS-001` | 预算分类异常 | Medium | 功能或经济分类 | 核对科目映射和用途说明 |
| `BUDGET-PUBLIC-TREND-001` | 公开预算趋势提示 | Low/Info | 公开预算数据 | 用于趋势研判和补充核查 |
| `BUDGET-TREND-001` | 预算趋势异常 | Medium | 多期预算或执行数据 | 核对变化原因和政策依据 |

### 10.3 采购规则

| 规则编码 | 规则名称 | 风险等级 | 适用场景 | 命中口径 | 建议处置 |
| --- | --- | --- | --- | --- | --- |
| `PROC-COMPLAINT-EXCEPTION-001` | 采购投诉和异常复核 | Review | 投诉、更正、处罚、重新采购 | 有公开投诉或监督异常证据 | 继续跟踪更正、重采、合同、验收、支付和凭证 |
| `PROC-BUDGET-001` | 预算控制证据缺口 | Medium/Info | 采购项目 | 缺少预算金额或预算关联 | 补充预算指标、采购计划和公告预算 |
| `PROC-STANDARD-001` | 中标金额超预算 | High | 采购公告和中标结果 | 中标金额大于预算金额 | 核对批准文件、合同金额和支付证据 |
| `PROC-SPLIT-001` | 疑似拆分采购 | High/Medium | 同单位相近项目 | 短期内相似项目集中出现 | 复核需求汇总、采购计划和分包理由 |
| `PROC-AMOUNT-CONSISTENCY-001` | 分包金额一致性复核 | Info | 多包采购 | 分包金额合计与声明总额不一致 | 补充合同、验收、支付公开数据 |
| `PROC-PRE-ANNOUNCEMENT-001` | 采购意向后续发现 | Info | 采购意向阶段 | 仅有采购意向，缺后续阶段 | 搜索公告、成交、合同、验收和支付 |
| `PROC-CHAIN-001` | 采购证据链缺口 | Medium/Info | 公告、成交、合同阶段 | 缺合同、验收或支付证据 | 补充后续证据后再形成强结论 |

### 10.4 支付和凭证联动规则

| 规则编码 | 规则名称 | 风险等级 | 适用场景 | 建议处置 |
| --- | --- | --- | --- | --- |
| `PAY-BUDGET-001` | 无预算项目支付 | High | 国库支付 | 补录预算项目、指标文号或项目库 ID |
| `PAY-VENDOR-001` | 同供应商短期密集支付 | Medium | 支付流水 | 复核付款计划、合同条款和支付依据 |
| `LEDGER-DUP-001` | 凭证重复风险 | Medium/High | 会计凭证 | 核对凭证号、附件和冲销记录 |
| `LEDGER-CLASS-001` | 会计分类异常 | Medium | 会计科目 | 核对科目使用和预算分类映射 |
| `LEDGER-BALANCE-001` | 会计分录平衡异常 | High | 会计凭证 | 核查借贷金额、凭证附件和调整分录 |
| `CHAIN-CLOSE-001` | 预算采购支付凭证链条未闭合 | Medium/High | 跨域联动 | 补充缺失环节并复核闭环 |
| `CHAIN-TIMING-001` | 链条时点异常 | Medium | 跨域联动 | 核对合同、支付、入账时间顺序 |
| `CHAIN-AMOUNT-001` | 链条金额异常 | Medium/High | 跨域联动 | 核对预算、合同、支付、入账金额 |

## 11. 风险等级解释

| 等级 | 含义 | 处置建议 |
| --- | --- | --- |
| `Critical` | 极高风险或严重异常 | 立即人工复核并升级处置 |
| `High` | 高风险线索 | 纳入重点复核和整改跟踪 |
| `Medium` | 中风险线索 | 结合证据补充和抽样复核 |
| `Low` | 低风险提示 | 作为背景分析或趋势观察 |
| `Info` | 信息提示或补数建议 | 不单独作为问题结论 |
| `Review` | 需人工复核 | 明确补证路径后再判断 |

## 12. 规则使用边界

- 规则命中代表线索或异常提示，不自动等同于违规结论。
- 公开数据缺少内部支付、凭证、审批和验收信息时，应采用“补充证据”口径。
- AI 输出只作为辅助解释层，不替代规则结果、业务证据和人工复核。
- 验收时应至少选取高风险规则、中风险规则、补数建议规则各一类进行演示。
