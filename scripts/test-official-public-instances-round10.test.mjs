import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTenthOfficialPublicInstancePayloads,
  summarizeTenthOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round10.mjs';

test('round10 payloads use newly researched official sources and cover live-crawler edge cases', () => {
  const payloads = buildTenthOfficialPublicInstancePayloads({
    capturedAt: '2026-04-27T15:00:00+08:00',
    parserVersion: 'official-public-instance-round10-v1',
  });
  const usedUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 18);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => usedUrls.has(url)).length, 0);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(payloads.sourceRegister.sources.every((source) => source.batch_id === 'official_public_instances_round10'));
  assert.ok(payloads.sourceRegister.sources.some((source) => source.source_region_scope === 'central_unit'));
  assert.ok(payloads.sourceRegister.sources.some((source) => source.source_region_scope === 'cross_province'));
  assert.ok(payloads.sourceRegister.sources.some((source) => source.source_region_scope === 'jiangsu_local'));

  assert.ok(payloads.procurement.records.length >= 70);
  assert.ok(payloads.budget.records.length >= 25);
  assert.ok(payloads.caseSeeds.records.length >= 12);
  assert.ok(payloads.collectorSummary.total_records >= 110);
  assert.ok(payloads.collectorSummary.procurement_intention_records >= 5);
  assert.ok(payloads.collectorSummary.central_batch_award_records >= 10);
  assert.ok(payloads.collectorSummary.live_search_candidate_source_count >= 2);
  assert.ok(payloads.collectorSummary.source_region_scopes.central_unit >= 1);
  assert.ok(payloads.collectorSummary.source_region_scopes.cross_province >= 1);

  const intentionRows = payloads.procurement.records.filter((row) => row.procurement_stage === 'intention');
  assert.ok(intentionRows.length >= 5);
  assert.ok(intentionRows.every((row) => row.finding_disposition === 'supplemental_data_only'));

  const batchRows = payloads.procurement.records.filter((row) => row.procurement_channel === 'centralized_batch');
  assert.ok(batchRows.length >= 10);
  assert.ok(batchRows.some((row) => row.amount_semantic_type === 'award_total' && row.normalized_award_amount_yuan));

  assert.ok(payloads.procurement.records.some((row) => row.source_region_scope === 'cross_province' && !row.purchaser_region_code?.startsWith('32')));
  assert.ok(payloads.budget.records.some((row) => row.dataset_kind === 'budget_performance_policy'));
  assert.ok(payloads.budget.records.some((row) => row.dataset_kind === 'government_budget_report' && row.source_evidence?.section_title));
  assert.ok(payloads.caseSeeds.records
    .filter((row) => ['audit_work_update', 'work_method_reference', 'special_audit_survey'].includes(row.audit_evidence_level))
    .every((row) => row.finding_disposition !== 'risk_candidate'));
});

test('round10 summary reports acceptance baseline and optimization areas', () => {
  const payloads = buildTenthOfficialPublicInstancePayloads();
  const summary = summarizeTenthOfficialRun({
    generatedAt: '2026-04-27T15:05:00+08:00',
    payloads,
    procurementResponse: {
      findings: [{ rule_code: 'PROC-LIVE-DISCOVERY-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
    },
    budgetResponse: payloads.budget.batches.map((batch) => ({
      findings: [{ rule_code: 'BUDGET-PERFORMANCE-POLICY-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
    })),
    caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
  });

  assert.equal(summary.batch_name, 'official_public_instances_round10');
  assert.ok(summary.total_input_records >= 110);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round10_acceptance_baseline, 110);
  assert.ok(summary.collector_summary.live_search_candidate_source_count >= 2);
  assert.ok(summary.collector_summary.discovery_crawler_processed_count >= 1);
  assert.ok(summary.optimization_plan.some((item) => item.area === 'live official crawler sampling'));
});
