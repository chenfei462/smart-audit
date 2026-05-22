# 第四批正式公开实例测试结果

生成时间：2026-04-26T13:18:37.017Z
测试服务：http://127.0.0.1:18080

## 数据来源与覆盖

- 新来源数量：20
- 与前三批URL重合：0
- 输入记录：64 条（采购 7、财政/统计 50、审计线索 7）
- 导入成功率：100%
- 来源可追溯率：100%
- 金额语义：award_total 3, budget_amount 4
- 专项资金/民生支出结构化覆盖率：24%
- 审计证据等级：special_audit_survey 4, audit_work_update 2, work_method_reference 1
- 审计证据权重：special_audit_survey 60, audit_work_update 35, work_method_reference 20

主要来源：
- [中国政府采购网] 江苏省消防救援总队2025-2026年度信息化及卫星通信网运维服务项目中标公告：https://www.ccgp.gov.cn/cggg/zygg/zbgg/202505/t20250530_24694632.htm
- [中国政府采购网] 盐城市消防救援支队2024年度目录外器材装备采购项目（第一批）（分包二）中标公告：https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202503/t20250317_24307833.htm
- [湖北省成套招标股份有限公司] 长江南京航道局2026年6艘船舶进厂维修项目公开招标公告：https://www.hubeibidding.com/view/45757.html
- [淮安市政府采购网] 盱眙县汽车站设施设备维修改造工程采购公告：https://czj.huaian.gov.cn/col/17116_223664/content/17566560/ff80808199161b88019917c06b81000d.html
- [江阴市月城镇人民政府] 2024年度财政决算和2025年上半年财政预算执行情况：https://www.jiangyin.gov.cn/doc/2025/12/09/1369861.shtml
- [如皋市长江镇人民政府办公室] 长江镇2024年财政决算情况、2025年上半年财政预算执行情况和2025年财政预算调整方案的报告：https://www.rugao.gov.cn/rgscjz/bmyjs/content/67bc88dd-399e-4ead-9c5e-2d38f22f2c81.html
- [如皋市丁堰镇人民政府] 丁堰镇2024年财政决算情况和2025年上半年财政预算执行情况：https://www.rugao.gov.cn/rgsdyz/bmyjs/content/2a040b38-2532-4ee7-bba6-aef81b4f94b5.html
- [如皋经济技术开发区] 开发区（城北街道）2024年财政决算、2025年上半年财政预算执行情况的报告：https://www.rugao.gov.cn/rgskfq/bmyjs/content/b704e76e-c30a-4a8d-b8c8-8ab88f8aa1f0.html
- [如皋市江安镇人民政府] 关于江安镇2024年财政决算（草案）和2025年上半年财政预算执行情况的报告：https://www.rugao.gov.cn/rgsjaz/bmyjs/content/a61e7f26-a3ea-4084-a81a-1e290faa7287.html
- [如皋市发展和改革委员会] 关于如皋市2025年上半年国民经济和社会发展计划执行情况的报告：https://www.rugao.gov.cn/rgsfgw/dissgwngh/content/41e24a4b-459b-409a-984d-a429f568cd99.html
- [无锡市惠山区人民政府] 关于无锡市惠山区2024年国民经济及社会发展计划执行情况和2025年国民经济及社会发展计划安排（草案）的报告：https://www.huishan.gov.cn/doc/2025/01/09/4558049.shtml
- [无锡市锡山区人民政府] 区政府召开党组（扩大）会议暨理论学习中心组学习会和五届第64次常务会议：https://www.jsxishan.gov.cn/doc/2025/09/23/4652453.shtml
- [江苏省人大常委会公报] 关于江苏省2025年上半年预算执行情况的报告：https://www.jsrd.gov.cn/qwfb/cwhgb/202505/202512/P020260226561389403257.pdf
- [江苏省审计厅] 江苏组织开展高水平科技创新平台建设运行情况专项审计调查：https://jssjt.jiangsu.gov.cn/art/2025/4/27/art_995_11554202.html
- [江苏省审计厅] 江苏开展全省社会保障卡建设管理情况专项审计调查：https://jssjt.jiangsu.gov.cn/art/2025/4/3/art_995_11534020.html
- [江苏省审计厅] 江苏开展全省工程建设领域规范管理和风险防控情况专项审计调查：https://jssjt.jiangsu.gov.cn/art/2025/8/6/art_1053_11618961.html
- [江苏省审计厅] 江苏省审计厅开展“两新”政策落实情况专项审计调查：https://jssjt.jiangsu.gov.cn/art/2025/8/20/art_1053_11626392.html
- [江苏省审计厅] 江苏省审计厅2025年度审计项目计划：https://jssjt.jiangsu.gov.cn/art/2025/1/23/art_80112_11477987.html
- [江苏省审计厅] 南通审计人的二十四节气︱立秋禾熟 厚积薄发：https://jssjt.jiangsu.gov.cn/art/2025/8/7/art_1053_11618200.html
- [江苏省审计厅] 省级部门整体绩效自评价表：https://jssjt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=299621393aac49e5a11e4655a4906f12.pdf

## 规则命中

- BUDGET-PUBLIC-TREND-001: 1
- PROC-BUDGET-001: 3
- PROC-CHAIN-001: 3

## 进一步优化方案

- P0 第四批来源入库与回归基线：把第四批20个新来源迁入统一 source registry，并增加跨批次正文哈希和标题相似度去重的验收输出。 原因：本批20个来源与前三批URL重合0个，可作为新增回归基线。
- P0 乡镇财政预算执行结构化：把乡镇级预算执行报告拆成收入、支出、完成率、民生专项支出、财政专户资金等结构字段，并保留报告口径。 原因：江阴月城、如皋长江镇、丁堰镇、江安镇等来源显示乡镇报告粒度更细，适合验证县区财政内网样本字段映射。
- P1 审计调查证据权重细分：将专项审计调查与审计项目计划、工作动态、绩效自评继续分层，专项调查只生成复核建议，计划和动态不进入实质违规线索。 原因：第四批审计来源多为调查启动和项目计划，证据强度低于正式审计结果公告。
- P1 采购多包件金额处理：采购项目需识别同一项目多分包金额、总中标金额和最高限价，报告中展示分包合计与公告总额差异。 原因：江苏消防信息化项目存在两个分包金额，长江南京航道局项目同时给出预算金额、最高限价和分标段金额。
- P2 PDF公报抽取：江苏人大常委会公报 PDF 应接入页码、段落、表格标题抽取；无法抽表时至少保留页码快照和原文定位。 原因：省级上半年预算执行报告以公报 PDF 形式发布，适合作为正式交付报告证据定位样本。
