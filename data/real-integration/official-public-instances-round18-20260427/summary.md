# Round 18 Official Public Instance Test

Generated at: 2026-04-27T10:30:21.409Z

## Test Result
- Input records: 216
- Accepted records: 216
- Import success rate: 100%
- Source count: 20
- Previous source URL overlap: 0

## Procurement Complaint And Exception Evidence
- Procurement exception records: 140
- Complaint or supervision records: 140
- Correction notice records: 41
- False material records: 44
- Award invalidated records: 40
- Rebid required records: 60
- Review-only rate: 100%

## Fiscal Policy And Audit Evidence
- Fiscal policy records: 50
- Fiscal supplemental coverage: 100%
- Audit evidence levels: procurement_supervision_notice=25, audit_work_update=1
- Low evidence records: 26

## Exception Chain Discovery
- Discovery queue items: 168
- Crawler statuses: matched=48, manual_review=120
- Chain-scored items: 168
- Not-found or review explanations: 120

## Optimization Plan
- P0 procurement complaint and exception evidence: Add first-class fields for complaint decision number, handling result, false material flag, award invalidation, rebid requirement, correction notice and penalty subject. Reason: Round 18 official sources show that complaint handling and supervision notices are evidence for review workflows, not direct audit conclusions.
- P0 exception chain discovery: Extend crawler chain discovery from correction and complaint notices to invalidation, rebid, contract, acceptance, payment and rectification candidates. Reason: A complaint may change the procurement result, but the next public evidence is often a correction notice or rebid announcement.
- P1 legal basis and locator evidence: Persist legal basis, decision number, affected package, paragraph index and locator hash in report-ready evidence blocks. Reason: Complaint decisions require precise source positioning before they can be used in a PoC delivery report.
