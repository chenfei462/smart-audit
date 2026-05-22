import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFifthOfficialPublicInstancePayloads,
  summarizeFifthOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round5.mjs';

test('round5 payloads cover township fiscal, procurement chain and audit evidence levels', () => {
  const payloads = buildFifthOfficialPublicInstancePayloads({
    capturedAt: '2026-04-26T23:20:00+08:00',
    parserVersion: 'official-public-instance-round5-v1',
  });
  const usedUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.equal(payloads.sourceRegister.sources.length, 12);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => usedUrls.has(url)).length, 0);
  assert.ok(payloads.sourceRegister.sources.every((source) => source.batch_id === 'official_public_instances_round5'));
  assert.ok(payloads.sourceRegister.sources.every((source) => source.review_status === 'reviewed'));

  assert.ok(payloads.procurement.records.length >= 40);
  assert.ok(payloads.budget.records.length >= 30);
  assert.equal(payloads.caseSeeds.records.length, 12);
  assert.ok(payloads.collectorSummary.total_records >= 80);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);

  assert.ok(payloads.budget.records.some((row) => row.dataset_kind === undefined));
  assert.ok(payloads.budget.batches.some((batch) => batch.dataset_kind === 'township_fiscal_execution_summary'));
  assert.ok(payloads.budget.batches.some((batch) => batch.records.every((row) => row.source_evidence.locator_hash)));
  assert.ok(payloads.procurement.records.some((row) => row.procurement_stage === 'contract'));
  assert.ok(payloads.procurement.records.some((row) => row.procurement_stage === 'acceptance'));
  assert.ok(payloads.procurement.records.some((row) => row.procurement_stage === 'payment'));
  assert.ok(payloads.procurement.records.some((row) => row.amount_consistency_status === 'review_needed'));
  assert.ok(payloads.procurementChainClosure.summary.group_count >= 8);
  assert.ok(payloads.procurementChainClosure.summary.closed_group_count >= 8);
  assert.equal(payloads.publicDiscoveryQueue.items.every((item) => item.review_status === 'new'), true);
  assert.ok(payloads.publicDiscoveryQueue.summary.by_target_stage.rectification >= 1);
  assert.ok(payloads.publicDiscoveryQueue.summary.by_target_stage.contract >= 1);
  assert.ok(payloads.publicDiscoveryQueue.summary.by_target_stage.acceptance >= 1);
  assert.ok(payloads.publicDiscoveryQueue.summary.by_target_stage.payment >= 1);
  assert.ok(payloads.caseSeeds.records.some((row) => row.audit_evidence_level === 'rectification_progress'));
  assert.ok(payloads.caseSeeds.records.some((row) => row.conclusion_strength === 'supplemental_data_only'));
});

test('round5 summary keeps baseline counts and optimization metrics', () => {
  const payloads = buildFifthOfficialPublicInstancePayloads();
  const summary = summarizeFifthOfficialRun({
    generatedAt: '2026-04-26T23:30:00+08:00',
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

  assert.equal(summary.batch_name, 'official_public_instances_round5');
  assert.ok(summary.total_input_records >= 80);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.source_completeness_rate, 100);
  assert.equal(summary.round5_acceptance_baseline, 80);
  assert.ok(summary.collector_summary.township_fiscal_records >= 24);
  assert.ok(summary.collector_summary.package_amount_check_records >= 10);
  assert.ok(summary.collector_summary.procurement_chain_group_count >= 8);
  assert.ok(summary.collector_summary.discovery_queue_item_count >= 1);
  assert.ok(summary.optimization_plan.some((item) => item.area === 'procurement chain closure'));
});
