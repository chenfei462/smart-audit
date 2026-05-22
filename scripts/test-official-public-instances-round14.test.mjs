import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFourteenthOfficialPublicInstancePayloads,
  summarizeFourteenthOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round14.mjs';

test('round14 payloads use new official sources without registry overlap', () => {
  const payloads = buildFourteenthOfficialPublicInstancePayloads({
    capturedAt: '2026-04-27T22:20:00+08:00',
    parserVersion: 'official-public-instance-round14-v1',
  });
  const previousUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 22);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => previousUrls.has(url)).length, 0);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(payloads.collectorSummary.official_web_research_source_count >= 22);
  assert.ok(payloads.collectorSummary.fulfillment_acceptance_policy_records >= 1);
  assert.ok(payloads.collectorSummary.transfer_payment_monitoring_records >= 1);
});

test('round14 procurement records model fulfillment, payment terms and policy clauses as review-only evidence', () => {
  const payloads = buildFourteenthOfficialPublicInstancePayloads();
  const records = payloads.procurement.records;

  assert.ok(records.length >= 105);
  assert.ok(records.some((row) => row.acceptance_management_flag));
  assert.ok(records.some((row) => row.settlement_basis));
  assert.ok(records.some((row) => row.payment_trigger));
  assert.ok(records.some((row) => row.contract_performance_period));
  assert.ok(records.some((row) => row.government_purchase_service_flag));
  assert.ok(records.some((row) => row.sme_policy_requirement));
  assert.ok(records.some((row) => row.joint_bid_allowed_flag === false));
  assert.ok(records.every((row) => row.finding_disposition !== 'substantive_violation'));
  assert.ok(records.every((row) => row.recommended_next_data?.includes('contract performance evidence')));
});

test('round14 fiscal policy rows produce payment and voucher supplemental checklists', () => {
  const payloads = buildFourteenthOfficialPublicInstancePayloads();
  const budgetRows = payloads.budget.records;

  assert.ok(budgetRows.length >= 50);
  assert.ok(budgetRows.some((row) => row.dataset_kind === 'transfer_payment_monitoring_policy'));
  assert.ok(budgetRows.some((row) => row.dataset_kind === 'township_budget_performance_policy'));
  assert.ok(budgetRows.some((row) => row.dataset_kind === 'debt_or_current_account_management_policy'));
  assert.equal(payloads.collectorSummary.policy_supplemental_data_coverage_rate, 100);
  assert.ok(budgetRows.every((row) => row.required_budget_indicator_data));
  assert.ok(budgetRows.every((row) => row.required_performance_target_data));
  assert.ok(budgetRows.every((row) => row.required_payment_data));
  assert.ok(budgetRows.every((row) => row.required_voucher_data));
});

test('round14 audit evidence classification keeps low-weight sources out of risk candidates', () => {
  const payloads = buildFourteenthOfficialPublicInstancePayloads();
  const caseRows = payloads.caseSeeds.records;

  assert.ok(caseRows.length >= 24);
  assert.ok(caseRows.some((row) => row.audit_evidence_level === 'special_audit_survey'));
  assert.ok(caseRows.some((row) => row.audit_evidence_level === 'work_method_reference'));
  assert.ok(caseRows.filter((row) => Number(row.audit_evidence_weight || 0) < 60)
    .every((row) => !['risk_candidate', 'substantive_violation'].includes(row.finding_disposition)));
});

test('round14 summary captures acceptance baseline and follow-up optimization plan', () => {
  const payloads = buildFourteenthOfficialPublicInstancePayloads();
  const summary = summarizeFourteenthOfficialRun({
    generatedAt: '2026-04-27T22:30:00+08:00',
    payloads,
    procurementResponse: {
      findings: [{ rule_code: 'PROC-FULFILLMENT-PAYMENT-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
    },
    budgetResponse: payloads.budget.batches.map((batch) => ({
      findings: [{ rule_code: 'BUDGET-POLICY-NEXT-DATA-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
    })),
    caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
  });

  assert.equal(summary.batch_name, 'official_public_instances_round14');
  assert.ok(summary.total_input_records >= 150);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round14_acceptance_baseline, 150);
  assert.ok(summary.optimization_plan.some((item) => item.area === 'fulfillment acceptance chain'));
  assert.ok(summary.optimization_plan.some((item) => item.area === 'transfer payment monitoring'));
});
