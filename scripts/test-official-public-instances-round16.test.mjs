import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSixteenthOfficialPublicInstancePayloads,
  summarizeSixteenthOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round16.mjs';

test('round16 sources are new and cover procurement service periods, fiscal performance and audit follow-up', () => {
  const payloads = buildSixteenthOfficialPublicInstancePayloads({
    capturedAt: '2026-04-28T00:20:00+08:00',
    parserVersion: 'official-public-instance-round16-v1',
  });
  const previousUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 24);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => previousUrls.has(url)).length, 0);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(payloads.collectorSummary.procurement_service_period_records >= 80);
  assert.equal(payloads.collectorSummary.fiscal_policy_supplemental_coverage_rate, 100);
  assert.ok(payloads.collectorSummary.audit_followup_or_review_records >= 12);
});

test('round16 procurement records keep service period, acceptance, maintenance and policy terms review-only', () => {
  const payloads = buildSixteenthOfficialPublicInstancePayloads();
  const records = payloads.procurement.records;

  assert.ok(records.length >= 100);
  assert.ok(records.some((row) => row.contract_performance_period?.includes('service')));
  assert.ok(records.some((row) => row.payment_trigger));
  assert.ok(records.some((row) => row.acceptance_plan));
  assert.ok(records.some((row) => row.acceptance_issue_summary?.includes('maintenance')));
  assert.ok(records.every((row) => row.finding_disposition !== 'substantive_violation'));
});

test('round16 fiscal and audit samples stay supplemental unless formal evidence is present', () => {
  const payloads = buildSixteenthOfficialPublicInstancePayloads();

  assert.ok(payloads.budget.records.length >= 45);
  assert.ok(payloads.budget.records.every((row) => row.required_budget_indicator_data));
  assert.ok(payloads.budget.records.every((row) => row.required_performance_target_data));
  assert.ok(payloads.budget.records.every((row) => row.required_payment_data));
  assert.ok(payloads.budget.records.every((row) => row.required_voucher_data));
  assert.ok(payloads.caseSeeds.records.some((row) => row.finding_disposition === 'risk_candidate'));
  assert.ok(payloads.caseSeeds.records.some((row) => row.finding_disposition === 'review_recommended'));
  assert.ok(payloads.caseSeeds.records.every((row) => row.finding_disposition !== 'substantive_violation'));
});

test('round16 summary meets expanded regression baseline and optimization plan requirements', () => {
  const payloads = buildSixteenthOfficialPublicInstancePayloads();
  const summary = summarizeSixteenthOfficialRun({
    generatedAt: '2026-04-28T00:30:00+08:00',
    payloads,
    procurementResponse: {
      findings: [{ rule_code: 'PROC-SERVICE-ACCEPTANCE-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
    },
    budgetResponse: payloads.budget.batches.map((batch) => ({
      findings: [{ rule_code: 'BUDGET-PERFORMANCE-NEXT-DATA-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
    })),
    caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
  });

  assert.equal(summary.batch_name, 'official_public_instances_round16');
  assert.ok(summary.total_input_records >= 180);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round16_acceptance_baseline, 170);
  assert.ok(summary.optimization_plan.some((item) => item.area === 'service period acceptance and maintenance evidence'));
});
