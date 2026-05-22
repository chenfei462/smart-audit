import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSeventeenthOfficialPublicInstancePayloads,
  summarizeSeventeenthOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round17.mjs';

test('round17 sources are new and cover service maintenance acceptance evidence', () => {
  const payloads = buildSeventeenthOfficialPublicInstancePayloads({
    capturedAt: '2026-04-28T09:20:00+08:00',
    parserVersion: 'official-public-instance-round17-v1',
  });
  const previousUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 24);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => previousUrls.has(url)).length, 0);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(payloads.collectorSummary.service_period_records >= 90);
  assert.ok(payloads.collectorSummary.maintenance_or_warranty_records >= 30);
  assert.ok(payloads.collectorSummary.acceptance_standard_records >= 60);
  assert.ok(payloads.collectorSummary.acceptance_result_locator_records >= 30);
});

test('round17 procurement records separate service maintenance evidence from payment terms', () => {
  const payloads = buildSeventeenthOfficialPublicInstancePayloads();
  const records = payloads.procurement.records;

  assert.ok(records.length >= 120);
  assert.ok(records.some((row) => row.service_period));
  assert.ok(records.some((row) => row.maintenance_period || row.warranty_period));
  assert.ok(records.some((row) => row.acceptance_standard));
  assert.ok(records.some((row) => row.acceptance_result_locator));
  assert.ok(records.some((row) => row.payment_trigger));
  assert.ok(records.every((row) => row.service_period !== row.payment_trigger));
  assert.ok(records.every((row) => row.finding_disposition !== 'substantive_violation'));
});

test('round17 fiscal and audit records keep policy and low-evidence sources out of strong conclusions', () => {
  const payloads = buildSeventeenthOfficialPublicInstancePayloads();

  assert.ok(payloads.budget.records.length >= 45);
  assert.ok(payloads.budget.records.every((row) => row.required_budget_indicator_data));
  assert.ok(payloads.budget.records.every((row) => row.required_project_performance_target_data));
  assert.ok(payloads.budget.records.every((row) => row.required_quarterly_performance_monitoring_data));
  assert.ok(payloads.budget.records.every((row) => row.required_payment_progress_data));
  assert.ok(payloads.budget.records.every((row) => row.required_voucher_attachment_data));
  assert.ok(payloads.caseSeeds.records.some((row) => row.finding_disposition === 'risk_candidate'));
  assert.ok(payloads.caseSeeds.records.some((row) => row.finding_disposition === 'knowledge_reference'));
  assert.ok(payloads.caseSeeds.records.every((row) => row.finding_disposition !== 'substantive_violation'));
});

test('round17 crawler results include chain scoring diagnostics', () => {
  const payloads = buildSeventeenthOfficialPublicInstancePayloads();
  const items = payloads.discoveryCrawler.items;

  assert.ok(items.length > 0);
  assert.ok(items.every((item) => Number.isFinite(item.chain_score)));
  assert.ok(items.every((item) => Array.isArray(item.score_reasons)));
  assert.ok(items.every((item) => 'project_code_score' in item));
  assert.ok(items.every((item) => 'package_no_score' in item));
  assert.ok(items.every((item) => 'supplier_score' in item));
  assert.ok(items.every((item) => 'service_period_score' in item));
  assert.ok(items.every((item) => 'acceptance_clause_score' in item));
  assert.ok(items.every((item) => item.crawler_status === 'matched' || item.failure_reason));
  assert.ok(items.some((item) => item.best_candidate_excerpt));
});

test('round17 summary meets regression baseline and report topic requirements', () => {
  const payloads = buildSeventeenthOfficialPublicInstancePayloads();
  const summary = summarizeSeventeenthOfficialRun({
    generatedAt: '2026-04-28T09:30:00+08:00',
    payloads,
    procurementResponse: {
      findings: [{ rule_code: 'PROC-SERVICE-MAINTENANCE-ACCEPTANCE-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
    },
    budgetResponse: payloads.budget.batches.map((batch) => ({
      findings: [{ rule_code: 'BUDGET-PERFORMANCE-CHECKLIST-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
    })),
    caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
  });

  assert.equal(summary.batch_name, 'official_public_instances_round17');
  assert.ok(summary.total_input_records >= 180);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round17_acceptance_baseline, 120);
  assert.ok(summary.report_topics.includes('service_period_maintenance_acceptance_evidence'));
});
