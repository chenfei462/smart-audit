import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSixthOfficialPublicInstancePayloads,
  summarizeSixthOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round6.mjs';

test('round6 payloads use newly researched official sources and cover contract/payment evidence gaps', () => {
  const payloads = buildSixthOfficialPublicInstancePayloads({
    capturedAt: '2026-04-26T23:55:00+08:00',
    parserVersion: 'official-public-instance-round6-v1',
  });
  const usedUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.equal(payloads.sourceRegister.sources.length, 14);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => usedUrls.has(url)).length, 0);
  assert.ok(payloads.sourceRegister.sources.every((source) => source.batch_id === 'official_public_instances_round6'));

  assert.ok(payloads.procurement.records.length >= 48);
  assert.ok(payloads.budget.records.length >= 24);
  assert.ok(payloads.caseSeeds.records.length >= 12);
  assert.ok(payloads.collectorSummary.total_records >= 84);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);

  assert.ok(payloads.procurement.records.some((row) => row.amount_semantic_type === 'framework_limit'));
  assert.ok(payloads.procurement.records.some((row) => row.quality_flags?.includes('unit_price_or_rate_review')));
  assert.ok(payloads.procurement.records.some((row) => row.contract_payment_condition));
  assert.ok(payloads.procurement.records.some((row) => row.source_evidence?.page_number));
  assert.ok(payloads.publicDiscoveryQueue.summary.by_target_stage.contract >= 1);
  assert.ok(payloads.publicDiscoveryQueue.summary.by_target_stage.acceptance >= 1);
  assert.ok(payloads.publicDiscoveryQueue.summary.by_target_stage.payment >= 1);
  assert.ok(payloads.caseSeeds.records.some((row) => row.audit_evidence_level === 'rectification_progress'));
});

test('round6 summary keeps regression and optimization metrics for the new official batch', () => {
  const payloads = buildSixthOfficialPublicInstancePayloads();
  const summary = summarizeSixthOfficialRun({
    generatedAt: '2026-04-26T23:58:00+08:00',
    payloads,
    procurementResponse: {
      findings: [{ rule_code: 'PROC-CHAIN-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
    },
    budgetResponse: payloads.budget.batches.map((batch) => ({
      findings: [{ rule_code: 'BUDGET-PUBLIC-TREND-001', risk_level: 'Medium' }],
      detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
    })),
    caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
  });

  assert.equal(summary.batch_name, 'official_public_instances_round6');
  assert.ok(summary.total_input_records >= 84);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.source_completeness_rate, 100);
  assert.equal(summary.round6_acceptance_baseline, 84);
  assert.ok(summary.collector_summary.procurement_chain_group_count >= 8);
  assert.ok(summary.collector_summary.discovery_queue_item_count >= 6);
  assert.ok(summary.optimization_plan.some((item) => item.area === 'contract payment evidence'));
});
