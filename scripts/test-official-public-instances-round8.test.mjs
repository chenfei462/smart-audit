import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEighthOfficialPublicInstancePayloads,
  summarizeEighthOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round8.mjs';

test('round8 payloads use newly researched official web sources and broaden cross-region cases', () => {
  const payloads = buildEighthOfficialPublicInstancePayloads({
    capturedAt: '2026-04-27T10:00:00+08:00',
    parserVersion: 'official-public-instance-round8-v1',
  });
  const usedUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 12);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => usedUrls.has(url)).length, 0);
  assert.ok(payloads.sourceRegister.sources.every((source) => source.batch_id === 'official_public_instances_round8'));

  assert.ok(payloads.procurement.records.length >= 46);
  assert.ok(payloads.budget.records.length >= 24);
  assert.ok(payloads.caseSeeds.records.length >= 10);
  assert.ok(payloads.collectorSummary.total_records >= 80);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);

  assert.ok(payloads.procurement.records.some((row) => row.region === '湖北省'));
  assert.ok(payloads.procurement.records.some((row) => row.package_no && row.package_budget_amount));
  assert.ok(payloads.procurement.records.some((row) => row.payment_trigger));
  assert.ok(payloads.procurement.records
    .filter((row) => ['discount_rate', 'unit_price', 'framework_limit'].includes(row.amount_semantic_type))
    .every((row) => !row.normalized_award_amount_yuan));

  assert.ok(payloads.budget.records.some((row) => row.source_evidence?.page_number));
  assert.ok(payloads.budget.records.some((row) => row.performance_evidence_required === true));
  assert.ok(payloads.caseSeeds.records.some((row) => row.audit_evidence_level === 'rectification_progress'));
  assert.ok(payloads.caseSeeds.records.some((row) => row.audit_evidence_level === 'special_audit_survey'));
  assert.ok(payloads.caseSeeds.records.every((row) => row.audit_evidence_weight >= 60 || row.finding_disposition !== 'risk_candidate'));
});

test('round8 summary exposes web-research and cross-region risk-control metrics', () => {
  const payloads = buildEighthOfficialPublicInstancePayloads();
  const summary = summarizeEighthOfficialRun({
    generatedAt: '2026-04-27T10:05:00+08:00',
    payloads,
    procurementResponse: {
      findings: [{ rule_code: 'PROC-AMOUNT-CONSISTENCY-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
    },
    budgetResponse: payloads.budget.batches.map((batch) => ({
      findings: [{ rule_code: 'BUDGET-PUBLIC-TREND-001', risk_level: 'Medium' }],
      detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
    })),
    caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
  });

  assert.equal(summary.batch_name, 'official_public_instances_round8');
  assert.ok(summary.total_input_records >= 80);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round8_acceptance_baseline, 80);
  assert.ok(summary.collector_summary.cross_region_procurement_records >= 1);
  assert.ok(summary.collector_summary.pdf_performance_records >= 1);
  assert.ok(summary.optimization_plan.some((item) => item.area === 'cross-region official source normalization'));
});
