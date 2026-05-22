# 海安市 / 南通县市级真实公开数据联调说明

本目录样本基于 2026-04-24 从江苏南通海安市官方公开页面提取的真实公开信息整理。

## 来源

- 海安市教育体育局项目预算绩效目标表（PDF）
  - https://www.haian.gov.cn/truecms/attachmentController/download.do?id=fb81e222-48cd-4a2f-9352-6d8fdee079a1
- 海安市发改委 2025 年部门预算公开
  - https://www.haian.gov.cn/hasrmzf/bmyjs/content/0fc07786-7590-44dc-9eee-ee934d91d42c.html
- 海安市城建开发投资集团有限公司融资报表审计服务采购项目（第二次）
  - https://ggzyjy.nantong.gov.cn/jyxx/003009/003009001/20250714/31ad4f91-528e-4ad2-80fe-c7a9c2777d9f.html
- 海安市财政投资评审中心一周评审情况统计表
  - https://www.haian.gov.cn/hasczj/ggfw/content/d287afec-98ed-4005-a36b-908884102f8e.html

## 样本说明

- `haian_education_budget_batch.json`
  - 对应 `budget_summary`
  - 数据类型：`department_execution_detail`
  - 采用公开 PDF 中可直接识别的项目名称、年度总预算、当年计划支出
- `haian_fagai_budget_batch.json`
  - 对应 `budget_summary`
  - 数据类型：`public_fiscal_summary`
  - 采用部门预算公开中的支出分类金额
- `haian_procurement_batch.json`
  - 对应 `procurement_project`
  - 采用南通市公共资源交易网公告页中可直接识别的项目编号、采购方式、预算金额
- 为了避免本地 Windows 终端在 UTF-8/GBK 之间切换导致 JSON 失真，三个导入样本使用了英文翻译字段；金额、日期、项目编号和官方链接仍然保持真实公开数据。

## 约束

- 海安市公开网数据可以直接验证预算导入、采购公告导入和异常/案件流转。
- 海安市公开网数据不足以直接验证 `treasury_payment` 和 `voucher_ledger`，因为公开源没有 `payment_order_no`、`treasury_voucher_no`、`voucher_no` 这类内部主键。
- 海安市财政投资评审周报更适合下一步作为“监督处置案件”扩展样本，而不是当前四类主导入模型的直接输入。
