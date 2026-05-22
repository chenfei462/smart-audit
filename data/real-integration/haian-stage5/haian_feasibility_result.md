# 海安市 / 南通县市级真实公开数据联调结果

联调时间：2026-04-24  
联调实例：`http://127.0.0.1:18094`

## 导入文件

- `haian_education_budget_batch.json`
- `haian_fagai_budget_batch.json`
- `haian_procurement_batch.json`

## 实际导入结果

### 1. 海安市教育体育局项目预算绩效目标样本

- 任务 ID：`5c10aa92-a8fd-4530-bcb1-6cb2677c2663`
- 任务类型：`budget_summary`
- 数据类型：`department_execution_detail`
- 风险等级：`Medium`
- 导入结果：`3/3 accepted`

命中规则：
- `BUDGET-EXEC-001`

说明：
- 公开绩效目标表可以稳定映射到预算项目级导入。
- 即使没有 `budget_unit_code / indicator_document_no / project_catalog_id`，系统也能完成预算任务创建、规则执行和案件后续流转。

### 2. 海安市发改委部门预算样本

- 任务 ID：`a071d754-68c0-4bea-b508-a84556eb2155`
- 任务类型：`budget_summary`
- 数据类型：`public_fiscal_summary`
- 风险等级：`Medium`
- 导入结果：`4/4 accepted`

命中规则：
- `BUDGET-EXEC-001`

说明：
- 县市级部门预算公开页面可以稳定映射到财政收支汇总口径。
- 公开数据更适合趋势、结构、偏差分析，不适合做项目级精确联动。

### 3. 海安市城建开发投资集团融资报表审计服务采购项目（第二次）

- 任务 ID：`3090f5ba-a59e-43ff-84a7-ff341ef21490`
- 任务类型：`procurement_project`
- 风险等级：`Medium`
- 导入结果：`1/1 accepted`

命中规则：
- `PROC-CHAIN-001`

说明：
- 南通市公共资源交易网公告页足够支撑采购公告导入。
- 项目编号、采购方式、预算金额、发布时间都能直接进入 `procurement_project`。
- 由于公开页仍处于公告阶段，没有合同与验收闭环信息，因此命中链条不闭合规则，行为符合预期。

## 可行性结论

### 当前已经被真实公开数据验证可行

- `budget_summary`
  - `department_execution_detail`
  - `public_fiscal_summary`
- `procurement_project`
- 异常池 / 案件工作台 / 整改协同 / SLA 运营

### 公开数据验证价值高，但本轮未直接导入

- 海安市财政投资评审中心一周评审情况统计表
  - 更适合作为下一步“监督处置案件”样本，而不是当前四类导入模型之一

### 仍然无法仅靠县市公开网验证

- `treasury_payment`
- `voucher_ledger`
- 合同-支付-入账三方精确勾稽

原因：
- 公开网站缺少内部主键：
  - `payment_order_no`
  - `treasury_voucher_no`
  - `voucher_no`
  - 项目级 `indicator_document_no / project_catalog_id`

## 本轮使用的官方来源

- 海安市教育体育局项目预算绩效目标表（PDF）  
  <https://www.haian.gov.cn/truecms/attachmentController/download.do?id=fb81e222-48cd-4a2f-9352-6d8fdee079a1>

- 海安市发改委 2025 年部门预算公开  
  <https://www.haian.gov.cn/hasrmzf/bmyjs/content/0fc07786-7590-44dc-9eee-ee934d91d42c.html>

- 海安市城建开发投资集团有限公司融资报表审计服务采购项目（第二次）  
  <https://ggzyjy.nantong.gov.cn/jyxx/003009/003009001/20250714/31ad4f91-528e-4ad2-80fe-c7a9c2777d9f.html>

- 海安市财政投资评审中心一周评审情况统计表  
  <https://www.haian.gov.cn/hasczj/ggfw/content/d287afec-98ed-4005-a36b-908884102f8e.html>

## 下一步建议

1. 用海安市财政投资评审周报再做一轮“案件立案 -> 分发 -> 整改 -> 超期 -> 运营看板”联调。
2. 如果要验证第三阶段支付/会计联查，必须补一份内部支付明细或会计凭证明细，公开网本身不够。
