import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEleventhOfficialPublicInstancePayloads,
  summarizeEleventhOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round11.mjs';

test('round11 payloads model procurement intentions as pre-announcement discovery-only records', () => {
  const payloads = buildEleventhOfficialPublicInstancePayloads({
    capturedAt: '2026-04-27T17:30:00+08:00',
    parserVersion: 'official-public-instance-round11-v1',
  });
  const previousUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 18);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => previousUrls.has(url)).length, 0);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(payloads.sourceRegister.sources.every((source) => source.batch_id === 'official_public_instances_round11'));

  assert.ok(payloads.procurement.records.length >= 80);
  assert.ok(payloads.budget.records.length >= 28);
  assert.ok(payloads.caseSeeds.records.length >= 12);
  assert.ok(payloads.collectorSummary.total_records >= 120);

  const intentions = payloads.procurement.records.filter((row) => row.procurement_intention_flag);
  assert.ok(intentions.length >= 10);
  assert.ok(intentions.every((row) => row.procurement_stage === 'pre_announcement'));
  assert.ok(intentions.every((row) => row.intention_budget_amount));
  assert.ok(intentions.every((row) => row.intention_expected_procurement_at));
  assert.ok(intentions.every((row) => row.intention_followup_status === 'queued_for_discovery'));
  assert.ok(intentions.every((row) => row.finding_disposition === 'supplemental_data_only'));
  assert.ok(intentions.every((row) => !row.normalized_award_amount_yuan));
});

test('round11 payloads separate centralized batch totals from lot-level amounts', () => {
  const payloads = buildEleventhOfficialPublicInstancePayloads();
  const batchRows = payloads.procurement.records.filter((row) => row.procurement_channel === 'centralized_batch');
  const batchTotals = batchRows.filter((row) => row.amount_semantic_type === 'centralized_batch_total');
  const batchLots = batchRows.filter((row) => row.amount_semantic_type === 'centralized_batch_lot_amount');

  assert.ok(batchRows.length >= 24);
  assert.ok(batchTotals.length >= 8);
  assert.ok(batchLots.length >= 8);
  assert.ok(batchRows.every((row) => row.batch_month && row.product_category && row.manufacturer && row.model));
  assert.ok(batchRows.every((row) => row.batch_lot_no));
  assert.ok(batchTotals.every((row) => row.batch_total_amount && !row.normalized_award_amount_yuan));
  assert.ok(batchLots.every((row) => row.lot_award_amount && row.normalized_award_amount_yuan));
  assert.ok(batchTotals.every((row) => row.finding_disposition === 'review_recommended'));
});

test('round11 budget policy and audit rows stay supplemental or knowledge-only', () => {
  const payloads = buildEleventhOfficialPublicInstancePayloads();
  const policyRows = payloads.budget.records.filter((row) => row.dataset_kind === 'fiscal_policy_reference');
  assert.ok(policyRows.length >= 20);
  assert.ok(policyRows.every((row) => row.required_budget_indicator_data));
  assert.ok(policyRows.every((row) => row.required_performance_target_data));
  assert.ok(policyRows.every((row) => row.required_payment_data));
  assert.ok(policyRows.every((row) => row.required_voucher_data));
  assert.equal(payloads.collectorSummary.policy_supplemental_data_coverage_rate, 100);

  const lowEvidenceRows = payloads.caseSeeds.records.filter((row) => Number(row.audit_evidence_weight || 0) < 60);
  assert.ok(lowEvidenceRows.length >= 8);
  assert.ok(lowEvidenceRows.every((row) => row.finding_disposition !== 'risk_candidate'));
  assert.ok(lowEvidenceRows.every((row) => row.requires_manual_verification));
});

test('round11 summary reports stable baseline and independent live crawl sampling', () => {
  const payloads = buildEleventhOfficialPublicInstancePayloads();
  const summary = summarizeEleventhOfficialRun({
    generatedAt: '2026-04-27T17:35:00+08:00',
    payloads,
    procurementResponse: {
      findings: [{ rule_code: 'PROC-PRE-ANNOUNCEMENT-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
    },
    budgetResponse: payloads.budget.batches.map((batch) => ({
      findings: [{ rule_code: 'BUDGET-POLICY-SUPPLEMENTAL-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
    })),
    caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
  });

  assert.equal(summary.batch_name, 'official_public_instances_round11');
  assert.ok(summary.total_input_records >= 120);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round11_acceptance_baseline, 120);
  assert.equal(summary.collector_summary.live_sample_mode, true);
  assert.equal(summary.collector_summary.live_stable_baseline_impact, false);
  assert.equal(summary.live_crawl_summary.sample_size, 20);
  assert.ok(summary.optimization_plan.some((item) => item.area === 'pre-announcement discovery lifecycle'));
});
