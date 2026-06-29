# 脱敏测试数据集说明

本文档用于准备联合试点正式验收所需的测试数据包。测试数据包应优先复用仓库已有公开样本和脱敏内部样本说明，不写入真实敏感数据。受控真实小样本只定义接收、脱敏、导入和验证流程。

## 1. 数据包目标

- 支撑财政局业务人员完成任务创建、导入、风险查看、整改和导出。
- 支撑纪委监督人员查看线索、证据摘要和整改闭环。
- 支撑信息中心验证权限、健康检查、审计日志、备份恢复和密封包校验。
- 覆盖预算、采购、支付、凭证、整改五类核心数据。

## 2. 数据包目录建议

```text
delivery-test-data/
  README.md
  00-manifest.csv
  01-budget/
  02-procurement/
  03-treasury-payment/
  04-voucher-ledger/
  05-remediation/
  06-expected-results/
  07-screenshots/
```

`00-manifest.csv` 建议字段：

| 字段 | 说明 |
| --- | --- |
| `dataset_id` | 数据集编号 |
| `dataset_name` | 数据集名称 |
| `domain` | 预算、采购、支付、凭证、整改 |
| `source_type` | 公开样本、脱敏内部样本、人工构造样本 |
| `record_count` | 记录数 |
| `desensitization_method` | 脱敏方法 |
| `expected_rules` | 预期命中规则 |
| `acceptance_item` | 对应验收项 |
| `owner` | 数据负责人 |
| `approved_at` | 批准时间 |

## 3. 样本来源

优先使用以下已有材料：

- `data/real-integration/next-step-data-checklist.md`：预算、采购、支付、会计联查所需字段。
- `data/real-integration/internal-sample-poc/summary.md`：江苏县市脱敏内部样本 PoC 摘要。
- `data/real-integration/jiangsu-public-poc-rerun/summary.md`：公开数据 PoC 回归摘要。
- `data/real-integration/nantong-feasibility-20260426/feasibility_test_result.md`：南通公开数据可行性验证。
- `data/real-integration/jiangsu-county-feasibility-20260426/feasibility_test_result.md`：江苏县市公开数据可行性验证。
- `data/real-integration/exact_linkage_budget_template.csv`：预算联动模板。

注意：

- 上述材料可作为样本设计和预期结果参考。
- 正式客户样本应由客户数据负责人确认脱敏后交付。
- 不要将未脱敏真实样本提交到仓库。

## 4. 脱敏规则

| 数据类型 | 脱敏要求 |
| --- | --- |
| 单位名称 | 可保留单位层级口径，也可替换为“某财政局”“某采购单位” |
| 供应商名称 | 替换为“供应商 A/B/C”或保留公开公告供应商名称 |
| 个人姓名 | 删除或替换为角色名称 |
| 身份证、手机号、银行卡 | 删除或使用不可逆掩码 |
| 项目名称 | 涉密项目替换为同类虚拟名称 |
| 合同编号、支付单号、凭证号 | 可哈希或规则化重编号，保留联动关系 |
| 金额 | 可按同一比例缩放，保留相对关系和预期风险 |
| 日期 | 可整体平移，保留时序关系 |
| 附件 | 不提供原件；改用脱敏摘要、截图马赛克或结构化字段 |

脱敏后必须检查：

- 同一项目在预算、采购、支付、凭证中的关联键仍可匹配。
- 预期风险仍能命中。
- 不含真实个人敏感信息和未经批准的内部链接。

## 5. 数据集 A：预算执行样本

目标：验证预算规则、预算字段展示和预算采购支付联动基础。

建议规模：

- 最小验收：20 到 50 条。
- 推荐验收：100 到 300 条。

必备字段：

- `period`
- `budget_unit_name`
- `budget_project_name`
- `project_catalog_id` 或 `indicator_document_no`
- `budget_amount`
- `actual_amount`
- `function_classification_code`
- `economic_classification_code`

预期覆盖规则：

- `BUDGET-LIMIT-001`
- `BUDGET-EXEC-001`
- `BUDGET-CLASS-001`
- `BUDGET-TREND-001` 或 `BUDGET-PUBLIC-TREND-001`

验收结果：

- 预算样本可导入。
- 预算单位、预算项目和金额显示正常。
- 至少命中一类预算风险或趋势提示。
- 风险详情包含规则编码、审计依据和建议处置。

## 6. 数据集 B：采购项目样本

目标：验证采购规则、采购证据链、超预算、拆分采购和证据缺口提示。

建议规模：

- 最小验收：20 到 50 条。
- 推荐验收：100 到 300 条。

必备字段：

- `project_name`
- `purchaser_name`
- `announcement_type`
- `procurement_stage`
- `project_code`
- `budget_amount`
- `award_amount`
- `supplier_name`
- `contract_no`
- `acceptance_result` 或 `acceptance_summary`

预期覆盖规则：

- `PROC-BUDGET-001`
- `PROC-STANDARD-001`
- `PROC-SPLIT-001`
- `PROC-CHAIN-001`
- `PROC-PRE-ANNOUNCEMENT-001`
- `PROC-AMOUNT-CONSISTENCY-001`

验收结果：

- 采购项目可导入。
- 可展示项目编号、采购单位、预算金额、中标金额、合同和验收信息。
- 对仅有公告阶段的数据，系统输出补证建议，而不是直接强结论。
- 至少一条采购风险可追溯到样本行或来源链接。

## 7. 数据集 C：国库支付样本

目标：验证无预算支付、同供应商密集支付和预算采购支付联动。

建议规模：

- 最小验收：30 到 80 条。
- 推荐验收：300 条以上。

必备字段：

- `payment_order_no`
- `treasury_voucher_no`
- `budget_project_id` 或 `indicator_document_no` 或 `project_catalog_id`
- `contract_no`
- `amount`
- `paid_at`
- `counterparty`
- `supplier_name`

预期覆盖规则：

- `PAY-BUDGET-001`
- `PAY-VENDOR-001`
- `CHAIN-CLOSE-001`
- `CHAIN-TIMING-001`
- `CHAIN-AMOUNT-001`

验收结果：

- 支付样本可导入。
- 对缺少预算项目或指标文号的支付记录，系统能给出高风险或补证提示。
- 对同供应商多笔支付，系统能提示复核付款计划和合同依据。

## 8. 数据集 D：会计凭证样本

目标：验证凭证借贷平衡、凭证重复、会计分类和支付凭证联动。

建议规模：

- 最小验收：30 到 80 条。
- 推荐验收：300 条以上。

必备字段：

- `voucher_no`
- `account_code`
- `account_name`
- `debit_amount`
- `credit_amount`
- `booked_at`
- `payment_order_no`
- `treasury_voucher_no`
- `contract_no`

预期覆盖规则：

- `FISCAL-BUDGET-001`
- `LEDGER-BALANCE-001`
- `LEDGER-DUP-001`
- `LEDGER-CLASS-001`
- `FISCAL-TIME-003`

验收结果：

- 凭证样本可导入。
- 至少一条凭证类风险可展示借贷金额、凭证号和建议处置。
- 可通过支付单号或国库凭证号与支付数据关联。

## 9. 数据集 E：整改台账样本

目标：验证问题状态、处置备注、责任人和整改闭环。

建议规模：

- 最小验收：5 到 10 条。
- 推荐验收：20 条以上。

必备字段：

- `issue_id`
- `issue_type`
- `summary`
- `responsible_unit`
- `status`
- `related_project`
- `rule_code`
- `risk_level`
- `recommended_action`
- `due_at`
- `disposition_note`

预期结果：

- 可导入或录入整改状态。
- 风险发现可更新为整改中、已解决或已关闭。
- 处置备注保存后可复查。
- 审计日志能体现状态更新操作。

## 10. 数据集 F：权限和导出验收样本

目标：验证 `admin`、`auditor`、`viewer` 权限差异和导出能力。

样本要求：

- 至少 1 个可生成 PDF 的任务。
- 至少 1 个可生成密封导出包的任务。
- 至少 1 个 `viewer` 账号。

预期结果：

- `auditor` 可创建任务和导出报告。
- `viewer` 可查看任务，但不能创建任务或导出敏感结果。
- 密封包通过 `seal-verify` 校验。

## 11. 受控真实小样本流程

只有在客户批准后才执行。

流程：

1. 客户数据负责人确认样本范围和数据项。
2. 项目组提供字段模板和脱敏要求。
3. 客户在内网或受控环境完成脱敏。
4. 双方确认样本不含未授权敏感数据。
5. 在政府试点环境导入，不上传公网样板环境。
6. 记录导入时间、操作人、样本批次和预期验证项。
7. 完成风险查看、整改状态和报告导出。
8. 验收结束后按客户制度保留、归档或清理。

## 12. 预期结果清单

| 数据集 | 对应流程 | 预期规则 | 验收证据 |
| --- | --- | --- | --- |
| 预算执行样本 | 预算导入、预算规则 | `BUDGET-*` | 任务截图、风险详情、PDF |
| 采购项目样本 | 采购导入、证据链 | `PROC-*` | 采购风险截图、补证建议 |
| 国库支付样本 | 支付导入、支付规则 | `PAY-*`、`CHAIN-*` | 支付风险截图、联动说明 |
| 会计凭证样本 | 凭证导入、凭证规则 | `FISCAL-*`、`LEDGER-*` | 凭证风险截图 |
| 整改台账样本 | 整改闭环 | 状态更新 | 状态前后截图、审计日志 |
| 权限导出样本 | 权限、PDF、密封包 | 不限定 | 权限截图、PDF、密封包校验 |

## 13. 数据包验收签字项

| 项目 | 确认 |
| --- | --- |
| 样本已完成脱敏 |  |
| 样本不含未授权真实个人信息 |  |
| 样本不含涉密项目明细 |  |
| 样本来源和批次已登记 |  |
| 预期命中规则已登记 |  |
| 导入结果已截图 |  |
| 风险结果已截图 |  |
| 导出报告已归档 |  |
| 密封包已校验 |  |
