# 海安市财政投资评审周报场景案件闭环验证

验证实例：`http://127.0.0.1:18095`  
验证时间：2026-04-24

## 背景

本轮没有把海安市财政投资评审周报直接塞进现有四类导入模型。原因很直接：

- 周报数据更像“监督评审台账”
- 它天然适合作为第五阶段 `case` 层的案件种子
- 不适合硬套到 `budget_summary / procurement_project / treasury_payment / voucher_ledger`

因此这轮采用两步验证：

1. 把周报整理成案件种子文件  
   - `haian_investment_review_case_seed.csv`
   - `haian_investment_review_case_seed.md`
2. 用系统里现有案件跑完整闭环，验证第五阶段工单流是否可承接这类监督场景

## 本轮实际闭环的案件

- `case_id`: `ef211a70-41b5-4641-af6f-b7b5b4cb67b7`
- `case_no`: `CASE-20260424-fb472310`

## 实际跑通的流程

1. 审计侧分发
   - `assign_updated = 1`
   - `source_department = Haian Investment Review Center`
   - `target_department = Haian Finance Supervision Unit`
   - `sla_due_at = 2026-05-20`

2. 整改用户可见
   - `rectification_visible = true`
   - 说明整改门户的单位边界过滤是生效的

3. 整改提交
   - `rectification_submission_id = 44252b37-57eb-467c-94a8-7eb0f5740655`
   - 提交了整改说明
   - 同时生成延期申请，状态 `pending`

4. 催办
   - `reminder_ok = true`
   - 案件累计 `reminder_count = 2`

5. 复核
   - `review_decision = approved`

6. 关闭
   - `close_updated = 1`
   - 最终：
     - `current_stage = Closed`
     - `case_status = closed`
     - `closed_at = 2026-04-24 23:29:05`

## 回读详情

从 `/api/cases/{id}` 回读确认：

- `visibility_scope = rectification_unit`
- `priority = P2`
- `first_assigned_at = 2026-04-24 23:29:05`
- `first_response_at = 2026-04-24 23:29:05`
- `submitted_for_review_at = 2026-04-24 23:29:05`
- `closed_at = 2026-04-24 23:29:05`
- `notification_summary.total_deliveries = 4`

## 时间线事件

实际落库的时间线包含 6 条关键事件：

1. `case_created`
2. `assigned`
3. `rectification_submitted`
4. `reminder`
5. `review`
6. `transition` -> `Closed`

## 通知投递

站内通知已实际生成 4 条：

1. 分发通知
2. 整改提交通知
3. 催办通知
4. 复核结果通知

## 结论

海安市财政投资评审周报这类公开监督数据，当前系统的真实可行路径是：

- 不作为四类导入模型之一强行入库
- 而是转成第五阶段 `case` 层的案件种子
- 然后进入：
  - 分发
  - 整改提交
  - 催办
  - 复核
  - 关闭
  - SLA 与通知统计

这条路径已经在 `18095` 当前代码实例上跑通。

## 下一步建议

下一步最值得做的是新增一个正式入口：

- `监督评审台账 / 案件种子导入`

这样像海安市财政投资评审周报、审减额周报、处罚台账、专项检查问题清单这类政府监督数据，就能直接进入第五阶段案件层，而不是依赖先造一条规则异常。
