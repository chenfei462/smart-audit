# 第三阶段联调样本说明

这组样本用于验证 `采购项目 -> 国库支付 -> 会计凭证` 三段链路。

## 来源边界

- 采购项目主体来自南京本地公开采购：
  - 项目名称：`2025—2026年度南京市冻猪肉政府性储备项目`
  - 采购人：`南京市商务局`
  - 项目编号：`JSZC-320100-JSZB-G2025-0002`
  - 公告页：`https://njgc.jfh.com/purchase/detail?id=48705&type=1`
- 支付明细和会计凭证不是公开政府网站原始文件：
  - 它们是为了第三阶段联调，根据公开采购项目和前面预算联调样本派生的内部业务样本。
  - 合同号、支付单号、国库凭证号、凭证号、供应商名称都属于联调标识，不代表真实生产编号。

## 文件

- `phase3_nanjing_pork_reserve_procurement_batch.json`
- `phase3_nanjing_pork_reserve_treasury_batch.json`
- `phase3_nanjing_pork_reserve_voucher_batch.json`

## 设计意图

- 三份数据使用同一组联动键：
  - `contract_no = NJSWJ-CLZ-2025-HT-001`
  - `indicator_document_no = NJSWJ-CLZ-2025-001`
  - `project_catalog_id = NJSWJ-PORK-RESERVE-2025`
- 支付与凭证各两笔，金额一一对应，便于验证：
  - 国库支付导入
  - 会计凭证导入
  - `payment_order_no` / `treasury_voucher_no` 勾稽
  - 合同、支付、入账三段链路展示
