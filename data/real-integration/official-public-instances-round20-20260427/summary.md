# Round 20 Official Public Instances Test Result

Generated at: 2026-04-27T12:20:51.981Z
Batch: official_public_instances_round20

## Source Coverage

- Official sources: 20
- Previous source overlap: 0
- Input / accepted: 240 / 240
- Source traceability: 100%

## Procurement Penalty And Supervision Handling

- Exception procurement records: 170
- Supervision penalty records: 43
- False material records: 65
- Malicious collusion records: 16
- Review-only rate: 100%
- Queue stages: correction_notice 149, award_invalidated 107, rebid_notice 135, new_award 149, contract 170, acceptance 170, payment 170, rectification 52

## Further Optimization Plan

- P0 procurement penalty field model: Add structured penalty status, penalty basis, penalty duration, supplier disqualification scope and malicious collusion flags instead of storing all supervision results as generic text. Reason: Round 20 sources show supervision penalties and complaint decisions have different downstream review needs.
- P0 exception chain evidence closure: Let crawler search penalty follow-up, correction, rebid, new award, contract, acceptance, payment and rectification by decision number plus penalty subject. Reason: Penalty announcements alone are review evidence; downstream chain closure is needed before risk candidates.
- P1 reporting topic: Add a dedicated penalty and supervision handling block showing rejected, established, false material, collusion, penalty subject and manual review status. Reason: PoC users need to distinguish administrative penalty clues from audit conclusions.

## Sources

- [China Government Procurement Network] MOF procurement information notice 3233 administrative penalty: https://www.ccgp.gov.cn/gg/202603/t20260327_26323361.htm
- [China Government Procurement Network] MOF procurement information notice 3232 complaint handling: https://www.ccgp.gov.cn/gg/202603/t20260327_26323337.htm
- [China Government Procurement Network] MOF procurement information notice 3231 malicious collusion review: https://www.ccgp.gov.cn/gg/202603/t20260327_26323327.htm
- [China Government Procurement Network] MOF procurement information notice 3230 false material penalty: https://www.ccgp.gov.cn/gg/202603/t20260327_26323273.htm
- [China Government Procurement Network] MOF procurement information notice 3229 complaint rejected: https://www.ccgp.gov.cn/gg/202603/t20260327_26323252.htm
- [China Government Procurement Network] MOF procurement information notice 3228 supervision penalty: https://www.ccgp.gov.cn/gg/202603/t20260327_26323229.htm
- [China Government Procurement Network] MOF procurement information notice 3227 correction handling: https://www.ccgp.gov.cn/gg/202603/t20260327_26323206.htm
- [China Government Procurement Network] MOF procurement information notice 3226 award invalidated review: https://www.ccgp.gov.cn/gg/202603/t20260327_26323183.htm
- [China Government Procurement Network] MOF procurement information notice 3225 rebid required: https://www.ccgp.gov.cn/gg/202603/t20260327_26323133.htm
- [China Government Procurement Network] MOF procurement information notice 3224 supervision handling: https://www.ccgp.gov.cn/gg/202603/t20260327_26323054.htm
- [China Government Procurement Network] MOF procurement information notice 3223 complaint partly established: https://www.ccgp.gov.cn/gg/202603/t20260327_26323021.htm
- [China Government Procurement Network] MOF procurement information notice 3222 penalty and supplier review: https://www.ccgp.gov.cn/gg/202603/t20260327_26322475.htm
- [China Government Procurement Network] MOF procurement information notice 3221 false material review: https://www.ccgp.gov.cn/gg/202603/t20260327_26322454.htm
- [China Government Procurement Network] MOF procurement information notice 3220 complaint decision: https://www.ccgp.gov.cn/gg/202603/t20260327_26322410.htm
- [China Government Procurement Network] MOF procurement information notice 3219 administrative penalty: https://www.ccgp.gov.cn/gg/202602/t20260228_26205843.htm
- [China Government Procurement Network] MOF procurement information notice 3218 malicious collusion: https://www.ccgp.gov.cn/gg/202602/t20260228_26205828.htm
- [China Government Procurement Network] MOF procurement information notice 3217 complaint handling: https://www.ccgp.gov.cn/gg/202602/t20260228_26205803.htm
- [China Government Procurement Network] MOF procurement information notice 3216 false material penalty: https://www.ccgp.gov.cn/gg/202602/t20260228_26205787.htm
- [China Government Procurement Network] MOF procurement information notice 3215 complaint rejected: https://www.ccgp.gov.cn/gg/202602/t20260228_26205758.htm
- [China Government Procurement Network] MOF procurement information notice 3214 supervision penalty: https://www.ccgp.gov.cn/gg/202602/t20260228_26205637.htm
