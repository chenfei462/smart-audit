import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSeventhOfficialPublicInstancePayloads,
  summarizeSeventhOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round7.mjs';

test('round7 payloads add payment conditions and consume the round6 discovery queue', () => {
  const payloads = buildSeventhOfficialPublicInstancePayloads({
    capturedAt: '2026-04-26T23:59:00+08:00',
    parserVersion: 'official-public-instance-round7-v1',
  });
  const usedUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 14);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => usedUrls.has(url)).length, 0);
  assert.ok(payloads.sourceRegister.sources.every((source) => source.batch_id === 'official_public_instances_round7'));

  assert.ok(payloads.procurement.records.length >= 50);
  assert.ok(payloads.budget.records.length >= 28);
  assert.ok(payloads.caseSeeds.records.length >= 12);
  assert.ok(payloads.collectorSummary.total_records >= 90);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);

  assert.ok(payloads.procurement.records.some((row) => row.settlement_basis));
  assert.ok(payloads.procurement.records.some((row) => row.payment_trigger));
  assert.ok(payloads.procurement.records.some((row) => row.payment_deadline));
  assert.ok(payloads.procurement.records.some((row) => row.payment_condition_source));
  assert.ok(payloads.procurement.records
    .filter((row) => ['discount_rate', 'unit_price', 'framework_limit'].includes(row.amount_semantic_type))
    .every((row) => !row.normalized_award_amount_yuan));

  assert.equal(payloads.previousDiscoveryQueue.summary.total_items, 61);
  assert.equal(payloads.discoveryCrawler.summary.total_items, 61);
  assert.equal(payloads.discoveryCrawler.summary.processed_count, 61);
  assert.ok(payloads.discoveryCrawler.summary.by_status.matched >= 1);
  assert.ok(payloads.discoveryCrawler.items.every((item) => item.crawler_status !== 'new'));
  assert.ok(payloads.discoveryCrawler.items.every((item) => item.crawler_status === 'matched' || item.failure_reason));

  assert.ok(payloads.budget.records.some((row) => row.required_payment_data?.length));
  assert.ok(payloads.budget.records.some((row) => row.required_voucher_data?.length));
  assert.ok(payloads.budget.records.some((row) => row.performance_evidence_required === true));
  assert.ok(payloads.caseSeeds.records.every((row) => row.audit_evidence_weight >= 60 || row.finding_disposition !== 'risk_candidate'));
});

test('round7 summary exposes crawler and payment-condition metrics', () => {
  const payloads = buildSeventhOfficialPublicInstancePayloads();
  const summary = summarizeSeventhOfficialRun({
    generatedAt: '2026-04-27T00:02:00+08:00',
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

  assert.equal(summary.batch_name, 'official_public_instances_round7');
  assert.ok(summary.total_input_records >= 90);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round7_acceptance_baseline, 90);
  assert.equal(summary.collector_summary.discovery_crawler_processed_count, 61);
  assert.ok(summary.collector_summary.payment_condition_records >= 1);
  assert.ok(summary.optimization_plan.some((item) => item.area === 'crawler queue productionization'));
});
