# Round 22 Official Public Instances Test Result

Generated at: 2026-04-27T13:49:32.312Z
Batch: official_public_instances_round22

## Source Coverage

- Official sources: 20
- Previous source overlap: 0
- Input / accepted: 300 / 300
- Source traceability: 100%

## Procurement Complaint Adjudication Outcomes

- Complaint adjudication records: 210
- False material allegation records: 42
- SME policy allegation records: 42
- Bid document defect records: 42
- Established / partly / rejected: 53 / 53 / 104
- Allegation outcome coverage: 100%
- Review-only rate: 100%
- Queue stages: correction_notice 210, award_invalidated 126, rebid_notice 106, new_award 106, contract 210, acceptance 210, payment 210, rectification 9

## Further Optimization Plan

- P0 complaint allegation outcome model: Add structured allegation_type, allegation_outcome, confirmed_fact_flag and remedy_action fields so allegations are not treated as confirmed violations. Reason: Round 22 sources mix false-material allegations, SME-policy allegations, bid-document defects and rejected complaints in the same document family.
- P0 complaint-to-remedy chain discovery: Generate correction, award invalidation, rebid, new award, contract, acceptance and payment discovery tasks based on complaint outcome and affected package. Reason: Complaint decisions need downstream remedy evidence before any strong risk candidate.
- P1 reporting topic: Add a complaint adjudication outcome block separating established, partly established, rejected and evidence-insufficient decisions. Reason: PoC delivery needs to explain why complaint documents are review-only rather than audit conclusions.

## Sources

- [China Government Procurement Network] MOF procurement information notice 3309 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461840.htm
- [China Government Procurement Network] MOF procurement information notice 3308 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461826.htm
- [China Government Procurement Network] MOF procurement information notice 3307 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461815.htm
- [China Government Procurement Network] MOF procurement information notice 3306 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461794.htm
- [China Government Procurement Network] MOF procurement information notice 3304 correction and complaint follow-up: https://www.ccgp.gov.cn/gg/202604/t20260427_26461778.htm
- [China Government Procurement Network] MOF procurement information notice 3303 award invalidation follow-up: https://www.ccgp.gov.cn/gg/202604/t20260427_26461758.htm
- [China Government Procurement Network] MOF procurement information notice 3302 rebid follow-up: https://www.ccgp.gov.cn/gg/202604/t20260427_26461738.htm
- [China Government Procurement Network] MOF procurement information notice 3301 new award follow-up: https://www.ccgp.gov.cn/gg/202604/t20260427_26461721.htm
- [China Government Procurement Network] MOF procurement information notice 3298 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461625.htm
- [China Government Procurement Network] MOF procurement information notice 3297 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461590.htm
- [China Government Procurement Network] MOF procurement information notice 3295 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461532.htm
- [China Government Procurement Network] MOF procurement information notice 3294 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461506.htm
- [China Government Procurement Network] MOF procurement information notice 3293 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461478.htm
- [China Government Procurement Network] MOF procurement information notice 3291 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461398.htm
- [China Government Procurement Network] MOF procurement information notice 3290 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461356.htm
- [China Government Procurement Network] MOF procurement information notice 3289 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461255.htm
- [China Government Procurement Network] MOF procurement information notice 3288 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461208.htm
- [China Government Procurement Network] MOF procurement information notice 3287 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461194.htm
- [China Government Procurement Network] MOF procurement information notice 3286 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461083.htm
- [China Government Procurement Network] MOF procurement information notice 3285 complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26461013.htm
