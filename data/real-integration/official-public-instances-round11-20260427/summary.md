# Round 11 Official Public Instance Test

Generated at: 2026-04-27T05:14:09.121Z

## Test Result
- Input records: 134
- Accepted records: 134
- Import success rate: 100%
- Source count: 21
- Previous source URL overlap: 0
- Stable crawler processed: 248
- Live sample size: 20
- Live sample baseline impact: false

## Coverage
- Pre-announcement records: 12
- Centralized batch total / lot records: 10 / 18
- Fiscal policy supplemental coverage: 100%
- Audit evidence levels: rectification_progress 3, special_audit_survey 3, audit_work_update 3, work_method_reference 3, audit_result_feedback 2

## Official Sources
- [China Government Procurement Network] PBOC Credit Reference Center 2026 second batch procurement intention: https://www.ccgp.gov.cn/cggg/zygg/qtgg/202602/t20260225_26247224.htm
- [China Government Procurement Network] Chinese Academy of Geological Sciences 2026 procurement intention: https://www.ccgp.gov.cn/cggg/zygg/qtgg/202602/t20260219_26218211.htm
- [China Government Procurement Network] Central laboratory equipment 2026 procurement intention: https://www.ccgp.gov.cn/cggg/zygg/qtgg/202602/t20260217_26204648.htm
- [China Government Procurement Network] Central IT platform 2026 procurement intention: https://www.ccgp.gov.cn/cggg/zygg/qtgg/202602/t20260219_26222022.htm
- [China Government Procurement Network] Central state organs monitor batch procurement award notice: https://www.ccgp.gov.cn/cggg/zygg/zbgg/202512/t20251211_25910180.htm
- [China Government Procurement Network] Central state organs printer batch procurement award notice: https://www.ccgp.gov.cn/cggg/zygg/zbgg/202511/t20251117_25710229.htm
- [China Government Procurement Network] Central state organs desktop batch procurement award detail: https://www.ccgp.gov.cn/cggg/zygg/zbgg/202512/t20251211_25910172.htm
- [China Government Procurement Network] Central state organs air conditioner batch procurement award notice: https://www.ccgp.gov.cn/cggg/zygg/zbgg/202512/t20251211_25909615.htm
- [China Government Procurement Network] Central state organs copier batch procurement award notice: https://www.ccgp.gov.cn/cggg/zygg/zbgg/202511/t20251118_25717548.htm
- [China Government Procurement Network] Central state organs server batch procurement award notice: https://www.ccgp.gov.cn/cggg/zygg/zbgg/202511/t20251118_25717545.htm
- [Jiangsu Department of Finance] Jiangsu finance budget performance standard policy update: https://czt.jiangsu.gov.cn/art/2025/3/27/art_8063_11530180.html
- [Jiangsu Department of Finance] Jiangsu zero-based budget reform policy update: https://czt.jiangsu.gov.cn/art/2025/4/2/art_8063_11534037.html
- [Jiangsu Department of Finance] Jiangsu fiscal expenditure standard and performance management update: https://czt.jiangsu.gov.cn/art/2025/8/8/art_8063_11637957.html
- [Jiangsu Department of Finance] Jiangsu budget management policy release: https://czt.jiangsu.gov.cn/art/2025/1/3/art_8063_11465082.html
- [Jiangsu Department of Finance] Jiangsu performance target management policy update: https://czt.jiangsu.gov.cn/art/2025/6/27/art_8063_11604234.html
- [Jiangsu Department of Finance] Jiangsu fiscal payment and voucher supervision policy update: https://czt.jiangsu.gov.cn/art/2025/9/18/art_8063_11667491.html
- [Jiangsu Audit Office] Jiangsu audit rectification progress 2025 update: https://jssjt.jiangsu.gov.cn/art/2025/2/7/art_995_11487931.html
- [Jiangsu Audit Office] Jiangsu audit special survey work update: https://jssjt.jiangsu.gov.cn/art/2025/6/24/art_1105_11598239.html
- [Jiangsu Audit Office] Jiangsu audit work dynamic update: https://jssjt.jiangsu.gov.cn/art/2025/5/20/art_1104_11576603.html
- [Jiangsu Audit Office] Jiangsu audit method and experience reference: https://jssjt.jiangsu.gov.cn/art/2025/2/20/art_1104_11500391.html
- [Jiangsu Audit Office] Jiangsu audit result feedback meeting update: https://jssjt.jiangsu.gov.cn/art/2024/10/21/art_1104_11362390.html

## Further Optimization Plan
- P0 pre-announcement discovery lifecycle: Keep procurement intention records in pre_announcement stage and generate downstream discovery tasks for announcement, award, contract, acceptance, and payment sources. Reason: Intentions are planning disclosures; planned budget should not become budget variance or split-procurement evidence.
- P0 centralized batch amount controls: Use batch_month, product category, manufacturer, model, and lot fields before allowing batch lot amounts into amount consistency checks. Reason: Central batch totals aggregate many products and should not be compared as a single project award.
- P1 live crawler sampling isolation: Run live crawler on a fixed 10-20 item sample with a stable seed and persist only live_crawl_summary/live_crawler_results. Reason: Network volatility should be visible but must not change deterministic accepted baselines.
- P1 policy supplemental data chain: Carry fiscal policy rows into required budget indicator, performance target, payment detail, and voucher abstract checklists. Reason: Policy disclosures are context and data requirements, not direct audit findings.
