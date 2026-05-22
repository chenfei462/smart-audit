# Round 23 Official Public Instances Test Result

Generated at: 2026-04-27T14:09:16.325Z
Batch: official_public_instances_round23

## Source Coverage

- Official sources: 20
- Previous source overlap: 0
- Input / accepted: 320 / 320
- Source traceability: 100%

## Procurement Complaint Adjudication Outcomes

- Complaint adjudication records: 230
- False material allegation records: 39
- SME policy allegation records: 39
- Bid document defect records: 38
- Established / partly / rejected: 78 / 76 / 76
- Confirmed fact records: 154
- Remedy required records: 154
- Allegation weight coverage: 100%
- Allegation outcome coverage: 100%
- Review-only rate: 100%
- Complaint chain matched: 1101
- Queue stages: correction_notice 230, award_invalidated 78, new_award 78, rebid_notice 39, contract 230, acceptance 230, payment 230, rectification 9

## Further Optimization Plan

- P0 complaint allegation outcome model: Add structured allegation_type, allegation_outcome, confirmed_fact_flag and remedy_action fields so allegations are not treated as confirmed violations. Reason: Round 23 sources mix false-material allegations, SME-policy allegations, bid-document defects and rejected complaints in the same document family.
- P0 complaint-to-remedy chain discovery: Generate correction, award invalidation, rebid, new award, contract, acceptance and payment discovery tasks based on complaint outcome and affected package. Reason: Complaint decisions need downstream remedy evidence before any strong risk candidate.
- P1 reporting topic: Add a complaint adjudication outcome block separating established, partly established, rejected and evidence-insufficient decisions. Reason: PoC delivery needs to explain why complaint documents are review-only rather than audit conclusions.

## Sources

- [China Government Procurement Network] MOF procurement information notice 3315 correction after complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26462001.htm
- [China Government Procurement Network] MOF procurement information notice 3316 award invalidated after complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26462002.htm
- [China Government Procurement Network] MOF procurement information notice 3317 rebid after complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26462003.htm
- [China Government Procurement Network] MOF procurement information notice 3318 new award after complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26462004.htm
- [China Government Procurement Network] MOF procurement information notice 3319 contract after complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26462005.htm
- [China Government Procurement Network] MOF procurement information notice 3320 acceptance after complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26462006.htm
- [China Government Procurement Network] MOF procurement information notice 3321 payment after complaint adjudication: https://www.ccgp.gov.cn/gg/202604/t20260427_26462007.htm
- [China Government Procurement Network] MOF procurement information notice 3322 complaint established false material: https://www.ccgp.gov.cn/gg/202604/t20260427_26462008.htm
- [China Government Procurement Network] MOF procurement information notice 3323 SME declaration complaint partly established: https://www.ccgp.gov.cn/gg/202604/t20260427_26462009.htm
- [China Government Procurement Network] MOF procurement information notice 3324 bid document defect complaint: https://www.ccgp.gov.cn/gg/202604/t20260427_26462010.htm
- [China Government Procurement Network] MOF procurement information notice 3325 qualification issue complaint: https://www.ccgp.gov.cn/gg/202604/t20260427_26462021.htm
- [China Government Procurement Network] MOF procurement information notice 3326 evaluation process complaint: https://www.ccgp.gov.cn/gg/202604/t20260427_26462012.htm
- [China Government Procurement Network] MOF procurement information notice 3327 procurement document complaint rejected: https://www.ccgp.gov.cn/gg/202604/t20260427_26462013.htm
- [China Government Procurement Network] MOF procurement information notice 3328 evidence insufficient complaint: https://www.ccgp.gov.cn/gg/202604/t20260427_26462014.htm
- [China Government Procurement Network] MOF procurement information notice 3329 contract review required: https://www.ccgp.gov.cn/gg/202604/t20260427_26462015.htm
- [China Government Procurement Network] MOF procurement information notice 3330 correction package follow-up: https://www.ccgp.gov.cn/gg/202604/t20260427_26462016.htm
- [China Government Procurement Network] MOF procurement information notice 3331 rebid package follow-up: https://www.ccgp.gov.cn/gg/202604/t20260427_26462017.htm
- [China Government Procurement Network] MOF procurement information notice 3332 new award package follow-up: https://www.ccgp.gov.cn/gg/202604/t20260427_26462018.htm
- [China Government Procurement Network] MOF procurement information notice 3333 acceptance package follow-up: https://www.ccgp.gov.cn/gg/202604/t20260427_26462019.htm
- [China Government Procurement Network] MOF procurement information notice 3334 payment package follow-up: https://www.ccgp.gov.cn/gg/202604/t20260427_26462020.htm
