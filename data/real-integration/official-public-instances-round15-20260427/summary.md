# Round 15 Official Public Instance Test

Generated at: 2026-04-27T08:55:50.044Z

## Test Result
- Input records: 156
- Accepted records: 156
- Import success rate: 100%
- Source count: 24
- Previous source URL overlap: 0

## Fulfillment Acceptance And Payment Conditions
- Procurement records: 96
- Fulfillment acceptance records: 44
- Missing acceptance plan/opinion/archive: 11/10/4
- Payment condition records: 96
- Payment conditions missing explicit deadline: 80

## Fiscal Policy Supplemental Checklist
- Fiscal policy records: 42
- Policy checklist types: fiscal_policy_supplemental_checklist 21, special_fund_supplemental_checklist 7, township_budget_performance_checklist 7, debt_current_account_checklist 7
- Policy supplemental data coverage: 100%

## Audit PDF And Evidence Locator
- Audit evidence levels: audit_report_interpretation 3, formal_audit_report 3, special_audit_survey 2, work_method_reference 2, audit_work_update 6, rectification_progress 2
- Complete audit locator count: 18
- Audit low-weight records: 13

## Discovery Provider Diagnostics
- Discovery queue items: 94
- Crawler statuses: not_found 87, manual_review 7
- Not-found or review results with explanation: 87

## Further Optimization Plan
- P0 fulfillment acceptance and payment condition topic: Keep acceptance plan, acceptance opinion, archive locator, contract performance period and payment trigger in one procurement-chain topic for reports and front-end chain views. Reason: Round 15 records show acceptance and payment clauses explain public-chain gaps without supporting a substantive violation conclusion by themselves.
- P0 provider-backed crawler diagnostics: Promote provider query terms, search URL, candidate URLs, candidate stage scores and not-found reasons into the public discovery queue output. Reason: A not-found result needs enough diagnostic evidence to explain whether the crawler searched the right project, package, purchaser, supplier and target stage.
- P1 fiscal policy supplemental checklist: Keep transfer-payment monitoring, township performance, debt/current-account and expenditure-standard policies as next-data checklists for budget indicators, performance targets, payments and vouchers. Reason: Policy text is useful to define missing internal evidence, but it should not become a risk finding without payment and voucher proof.
