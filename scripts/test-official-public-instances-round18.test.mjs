import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEighteenthOfficialPublicInstancePayloads,
  summarizeEighteenthOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round18.mjs';

test('round18 sources are new and cover procurement complaint exception evidence', () => {
  const payloads = buildEighteenthOfficialPublicInstancePayloads({
    capturedAt: '2026-04-27T18:20:00+08:00',
    parserVersion: 'official-public-instance-round18-v1',
  });
  const previousUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 18);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => previousUrls.has(url)).length, 0);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(payloads.collectorSummary.complaint_or_supervision_records >= 100);
  assert.ok(payloads.collectorSummary.correction_notice_records >= 10);
  assert.ok(payloads.collectorSummary.false_material_records >= 20);
  assert.ok(payloads.collectorSummary.award_invalidated_records >= 20);
  assert.ok(payloads.collectorSummary.rebid_required_records >= 20);
});

test('round18 procurement exception records stay review-only without internal evidence', () => {
  const payloads = buildEighteenthOfficialPublicInstancePayloads();
  const records = payloads.procurement.records;

  assert.ok(records.length >= 130);
  assert.ok(records.every((row) => row.procurement_exception_type));
  assert.ok(records.some((row) => row.complaint_decision_no));
  assert.ok(records.some((row) => row.false_material_flag));
  assert.ok(records.some((row) => row.award_invalidated_flag));
  assert.ok(records.some((row) => row.rebid_required_flag));
  assert.ok(records.some((row) => row.correction_notice_flag));
  assert.ok(records.every((row) => row.finding_disposition !== 'substantive_violation'));
  assert.ok(records.every((row) => Array.isArray(row.recommended_next_data)));
});

test('round18 fiscal and audit records keep policies and low-evidence sources out of strong conclusions', () => {
  const payloads = buildEighteenthOfficialPublicInstancePayloads();

  assert.ok(payloads.budget.records.length >= 45);
  assert.ok(payloads.budget.records.every((row) => row.required_budget_indicator_data));
  assert.ok(payloads.budget.records.every((row) => row.required_project_performance_target_data));
  assert.ok(payloads.budget.records.every((row) => row.required_payment_progress_data));
  assert.ok(payloads.budget.records.every((row) => row.required_voucher_attachment_data));
  assert.ok(payloads.caseSeeds.records.some((row) => row.audit_evidence_level === 'procurement_supervision_notice'));
  assert.ok(payloads.caseSeeds.records.some((row) => row.finding_disposition === 'review_recommended'));
  assert.ok(payloads.caseSeeds.records.some((row) => row.finding_disposition === 'knowledge_reference'));
  assert.ok(payloads.caseSeeds.records.every((row) => row.finding_disposition !== 'substantive_violation'));
});

test('round18 crawler results include exception-chain diagnostics', () => {
  const payloads = buildEighteenthOfficialPublicInstancePayloads();
  const items = payloads.discoveryCrawler.items;

  assert.ok(items.length > 0);
  assert.ok(items.every((item) => Number.isFinite(item.chain_score)));
  assert.ok(items.every((item) => Array.isArray(item.score_reasons)));
  assert.ok(items.every((item) => 'project_code_score' in item));
  assert.ok(items.every((item) => 'package_no_score' in item));
  assert.ok(items.every((item) => 'supplier_score' in item));
  assert.ok(items.every((item) => item.chain_discovery_reason));
  assert.ok(items.every((item) => item.crawler_status === 'matched' || item.failure_reason));
  assert.ok(items.some((item) => item.best_candidate_excerpt));
});

test('round18 summary meets expanded regression baseline and optimization plan requirements', () => {
  const payloads = buildEighteenthOfficialPublicInstancePayloads();
  const summary = summarizeEighteenthOfficialRun({
    generatedAt: '2026-04-27T18:30:00+08:00',
    payloads,
    procurementResponse: {
      findings: [{ rule_code: 'PROC-COMPLAINT-EXCEPTION-001', risk_level: 'Review' }],
      detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
    },
    budgetResponse: payloads.budget.batches.map((batch) => ({
      findings: [{ rule_code: 'BUDGET-POLICY-CHECKLIST-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
    })),
    caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
  });

  assert.equal(summary.batch_name, 'official_public_instances_round18');
  assert.ok(summary.total_input_records >= 190);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round18_acceptance_baseline, 130);
  assert.ok(summary.report_topics.includes('procurement_complaint_exception_evidence'));
  assert.ok(summary.optimization_plan.some((item) => item.area === 'procurement complaint and exception evidence'));
});
