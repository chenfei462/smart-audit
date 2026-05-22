# Round 19 Official Public Instances Test Result

Generated at: 2026-04-27T11:09:21.248Z
Batch: official_public_instances_round19

## Source Coverage

- Official sources: 20
- Previous source overlap: 0
- Input / accepted: 225 / 225
- Source traceability: 100%

## Procurement Complaint And Exception Handling

- Exception procurement records: 150
- Complaint decision records: 150
- Exception queue items: 856
- Review-only rate: 100%
- Queue stages: correction_notice 131, award_invalidated 72, rebid_notice 76, new_award 94, contract 150, acceptance 150, payment 150, rectification 40

## Further Optimization Plan

- P0 procurement complaint and supervision exceptions: Keep complaint decision number, issue summary, handling result, false material flag, award invalidation, rebid requirement, correction notice, penalty subject and affected package as first-class procurement fields. Reason: Round 19 official notices show these fields are needed to explain review status without overstating a violation.
- P0 exception chain discovery: Continue crawler expansion from complaint or supervision notice to correction, award invalidation, rebid, new award, contract, acceptance, payment and rectification candidates. Reason: The public evidence chain changes after a complaint, so downstream stages must be discovered before any risk candidate is formed.
- P1 legal basis locator evidence: Persist legal basis, article, decision paragraph, affected package and handling result locator hash in report evidence blocks. Reason: Formal PoC reports need exact decision-location evidence for manual review.

## Sources

- [China Government Procurement Network] MOF procurement information notice 3294 complaint handling decision: https://www.ccgp.gov.cn/gg/202604/t20260427_26461544.htm
- [China Government Procurement Network] MOF procurement information notice 3293 supervision handling result: https://www.ccgp.gov.cn/gg/202604/t20260427_26461511.htm
- [China Government Procurement Network] MOF procurement information notice 3292 complaint partly established: https://www.ccgp.gov.cn/gg/202604/t20260427_26461484.htm
- [China Government Procurement Network] MOF procurement information notice 3291 complaint rejected: https://www.ccgp.gov.cn/gg/202604/t20260427_26461470.htm
- [China Government Procurement Network] MOF procurement information notice 3290 correction and rebid handling: https://www.ccgp.gov.cn/gg/202604/t20260427_26461460.htm
- [China Government Procurement Network] MOF procurement information notice 3289 award invalidated handling: https://www.ccgp.gov.cn/gg/202604/t20260427_26461454.htm
- [China Government Procurement Network] MOF procurement information notice 3288 rebid required handling: https://www.ccgp.gov.cn/gg/202604/t20260427_26461440.htm
- [China Government Procurement Network] MOF procurement information notice 3287 complaint handling with affected package: https://www.ccgp.gov.cn/gg/202604/t20260427_26461433.htm
- [China Government Procurement Network] MOF procurement information notice 3286 false material supervision review: https://www.ccgp.gov.cn/gg/202604/t20260427_26461419.htm
- [China Government Procurement Network] MOF procurement information notice 3285 complaint handling decision: https://www.ccgp.gov.cn/gg/202604/t20260427_26461414.htm
- [China Government Procurement Network] MOF procurement information notice 3283 complaint handling decision: https://www.ccgp.gov.cn/gg/202604/t20260407_26367326.htm
- [China Government Procurement Network] MOF procurement information notice 3282 supervision notice: https://www.ccgp.gov.cn/gg/202604/t20260407_26367321.htm
- [China Government Procurement Network] MOF procurement information notice 3281 complaint partly established: https://www.ccgp.gov.cn/gg/202604/t20260407_26367273.htm
- [China Government Procurement Network] MOF procurement information notice 3280 correction notice: https://www.ccgp.gov.cn/gg/202604/t20260407_26367237.htm
- [China Government Procurement Network] MOF procurement information notice 3279 award invalidated: https://www.ccgp.gov.cn/gg/202604/t20260407_26367231.htm
- [China Government Procurement Network] MOF procurement information notice 3278 rebid notice: https://www.ccgp.gov.cn/gg/202604/t20260407_26367224.htm
- [China Government Procurement Network] MOF procurement information notice 3277 complaint rejected: https://www.ccgp.gov.cn/gg/202604/t20260407_26367218.htm
- [China Government Procurement Network] MOF procurement information notice 3276 supervision penalty: https://www.ccgp.gov.cn/gg/202604/t20260407_26367210.htm
- [China Government Procurement Network] MOF procurement information notice 3275 false material review: https://www.ccgp.gov.cn/gg/202604/t20260407_26367197.htm
- [China Government Procurement Network] MOF procurement information notice 3274 complaint handling: https://www.ccgp.gov.cn/gg/202604/t20260407_26367191.htm
