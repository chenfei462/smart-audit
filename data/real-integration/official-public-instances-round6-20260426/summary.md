# Round 6 Official Public Instance Test

- Batch: official_public_instances_round6
- Official sources: 14
- Total input records: 86
- Total accepted records: 86
- Import success rate: 100%
- Source completeness rate: 100%
- Registry overlap with previous batches: 0
- Procurement chain groups: 21
- Discovery queue items: 61
- Framework limit records: 5
- Contract payment condition records: 8

## Official Sources
- [中国政府采购网] 江苏省物业管理服务封闭式框架协议采购项目入围公告: https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202501/t20250114_24066186.htm
- [中国政府采购网] 苏州市土地储备中心地块土壤污染状况调查报告技术评估采购公告: https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202505/t20250528_24687933.htm
- [中国政府采购网] 2026年金坛区数据局信息系统软硬件运维项目采购公告（二）: https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202601/t20260119_26089827.htm
- [中国政府采购网] 2025年至2026年6月环评与污染排放管理技术支撑服务竞争性磋商公告: https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202412/t20241225_23956712.htm
- [南京公共采购信息网] 2025—2026年度南京市冻猪肉政府性储备项目采购公告: https://njgc.jfh.com/purchase/detail?id=48705&type=1
- [南京市商务局] 2025—2026年度政府性储备肉菜质量公检购买服务项目公开询价结果公示: https://swj.nanjing.gov.cn/njsswj/202508/t20250822_5633874.html
- [国家税务总局江苏省税务局] 国家税务总局江苏省税务局食堂配送服务政府采购招标文件: https://jiangsu.chinatax.gov.cn/module/download/downfile.jsp?classid=0&filename=f0c990dc5a0241c688fbd564f28ae3e1.pdf
- [江苏省财政厅] （苏财农〔2024〕108号）江苏省财政厅 江苏省水利厅关于提前下达2025年中央水利发展资金预算的通知: https://czt.jiangsu.gov.cn/art/2024/12/18/art_77314_11449431.html
- [江苏省财政厅] 关于印发《江苏省省级财政专项资金信用管理办法》的通知（苏财规〔2024〕8号）: https://czt.jiangsu.gov.cn/art/2025/1/2/art_77684_11461939.html
- [江苏省财政厅] 2025年度江苏省财政厅（机关）单位预算公开: https://czt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=e3ba4b0b5d4d4da5a649f699e0184d53.pdf
- [江苏省财政厅财政信息管理中心] 2025年度江苏省财政厅财政信息管理中心单位预算公开: https://czt.jiangsu.gov.cn/attach/0/fff602ac98b2465f93774977780ea0ac.pdf
- [江苏省审计厅] 省交通综合执法局开展2024年度财务收支和预算执行审计问题整改“回头看”: https://jssjt.jiangsu.gov.cn/art/2025/5/23/art_995_11572326.html
- [江苏省审计厅] 江苏省2023年度省级预算执行和其他财政收支审计查出问题整改情况: https://jssjt.jiangsu.gov.cn/art/2025/4/8/art_80119_11536685.html
- [江苏省审计厅] 以高质量审计服务保障全省改革发展大局: https://jssjt.jiangsu.gov.cn/art/2025/9/5/art_80120_11635893.html

## Discovery Queue
- Target stages: acceptance 21, payment 18, contract 10, rectification 12
- Priorities: P0 31, P1 22, P2 8
- Queue items are supplement/review recommendations, not substantive violation conclusions.

## Rule Hits
- BUDGET-EXEC-001: 20
- PROC-AMOUNT-CONSISTENCY-001: 6
- PROC-CHAIN-001: 47
- PROC-SPLIT-001: 5

## Optimization Plan
- P0 contract payment evidence: 把招标文件、合同公告里的付款条件、结算口径、履约期限抽成 contract_payment_condition、settlement_basis、payment_trigger 三个字段。 Reason: 8 条记录已经出现“预算为测算金额、按实际发生结算”等付款/结算条款。
- P0 framework quote semantics: 继续把优惠率、详见征集文件、服务范围限额、单价报价从成交总金额中拆出，框架协议默认进入补数或复核建议。 Reason: 5 条框架/报价语义记录不适合直接参与预算差异高风险比较。
- P1 discovery queue automation: 为合同、验收、支付、整改公告建立可配置关键词模板，按项目编号、包号、采购单位和供应商自动生成检索任务。 Reason: 第六批生成 61 个待发现项，覆盖 acceptance、payment、contract、rectification。
- P1 special fund policy to payment chain: 专项资金政策字段继续补预算科目、资金去向、禁止用途、绩效期限，并预留支付/凭证核验字段。 Reason: 8 条专项资金记录已经结构化，适合下一步接支付和凭证链路。
- P2 audit interpretation downgrade: 审计报告解读、专项调查、工作方法类来源要保留 evidence weight，低权重内容只生成复核建议或知识参考。 Reason: 本批审计来源层级分布为 {"rectification_progress":8,"formal_audit_report":4}。
