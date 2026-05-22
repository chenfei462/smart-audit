# 南京市商务局预算联动官方来源清单

日期：2026-04-24

## 目标

为第二阶段“预算执行 / 财政收支模式与采购预算联动”保留一组可重复验证的南京市商务局官方公开样本，并说明每份文件在联调中的用途。

## 官方页面

1. 南京市商务局财政预算栏目
   - <https://www.nanjing.gov.cn/xxgkn/czzj/nanjingshishangwuju/czys/>

2. 南京市商务局 2025 年度部门及单位预算公开页面
   - <https://swj.nanjing.gov.cn/njsswj/202502/t20250221_5080118.html>

3. 南京市商务局 2025 年度预算部门整体支出绩效目标公开页面
   - <https://swj.nanjing.gov.cn/njsswj/202502/t20250221_5080120.html>

4. 南京市商务局 2025 年度预算运转类-其他项目支出绩效目标公开页面
   - <https://swj.nanjing.gov.cn/njsswj/202502/t20250221_5080121.html>

5. 南京市商务局 2025 年度运转类（特定目标类）项目支出绩效目标表页面
   - <https://swj.nanjing.gov.cn/njsswj/202511/t20251107_5684709.html>

6. 南京采购公告页面
   - <https://njgc.jfh.com/purchase/detail?id=48705&type=1>

## 官方附件直链

1. 南京市商务局 2025 年度部门预算公开 PDF
   - <https://swj.nanjing.gov.cn/njsswj/202502/P020250221536416794902.pdf>
   - 本地文件：`D:\Desktop\P020250221536416794902.pdf`

2. 南京市商务局 2025 年度单位预算公开 PDF
   - <https://swj.nanjing.gov.cn/njsswj/202502/P020250221536417037184.pdf>
   - 本地文件：`D:\Desktop\P020250221536417037184.pdf`

3. 南京市商务局（本级）2025 年度部门整体绩效目标表公开 XLSX
   - <https://swj.nanjing.gov.cn/njsswj/202502/P020250513544692288963.xlsx>
   - 本地文件：`D:\Desktop\P020250513544692288963.xlsx`

4. 南京市商务局（本级）2025 年度运转类其他项目绩效目标公开（16 项）XLSX
   - <https://swj.nanjing.gov.cn/njsswj/202502/P020250819564826576290.xlsx>
   - 本地文件：`D:\Desktop\P020250819564826576290(1).xlsx`

5. 南京市商务局（本级）2025 年度运转类（特定目标类）项目支出绩效目标表 XLSX
   - <https://swj.nanjing.gov.cn/njsswj/202511/P020251217567256049339.xlsx>
   - 本地文件：`D:\Desktop\P020251217567256049339.xlsx`

6. 南京采购公告招标文件 DOCX
   - <https://njgc.jfh.com/provider/filef8fa36be06b946708d8d64ebbd9c125d.docx>
   - 本地文件：`D:\Desktop\filef8fa36be06b946708d8d64ebbd9c125d.docx`

## 当前联调样本

1. 采购批量导入样本
   - `D:\Desktop\smart-audit\data\real-integration\nanjing_samecity_procurement_batch.json`
   - 采购项目：`2025—2026年度南京市冻猪肉政府性储备项目`
   - 采购单位：`南京市商务局`

2. 预算批量导入样本
   - `D:\Desktop\smart-audit\data\real-integration\nanjing_swj_cailanzi_budget_batch.json`
   - 预算项目：`2025年菜篮子发展专项-肉菜储备`
   - 预算单位：`南京市商务局`
   - 业务证据：`冻猪肉储备量3000吨`

## 核心结论

1. 当前公开数据可以稳定证明：
   - 同一预算单位：`南京市商务局`
   - 同一业务域：`菜篮子 / 肉菜储备 / 冻猪肉政府性储备`
   - 可形成高可信“业务证据匹配”

2. 当前公开数据仍然缺失：
   - `项目库ID`
   - 可直接映射采购公告的 `指标文号`

3. 因此当前系统应输出：
   - `exact`：仅用于主键级或确定性规则命中
   - `evidence_auto`：用于高分业务证据自动关联
   - `evidence_candidate`：用于中分证据候选关联
