import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTwentyFourthOfficialPublicInstancePayloads,
  summarizeTwentyFourthOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round24.mjs';

test('round24 sources are new supplier credit and penalty instances without previous overlap', () => {
  const payloads = buildTwentyFourthOfficialPublicInstancePayloads({
    capturedAt: '2026-04-27T23:55:00+08:00',
    parserVersion: 'official-public-instance-round24-v1',
  });
  const previousUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 20);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => previousUrls.has(url)).length, 0);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(payloads.collectorSummary.total_records >= 220);
  assert.ok(payloads.collectorSummary.severe_illegal_credit_records >= 20);
  assert.ok(payloads.collectorSummary.abandoned_award_penalty_records >= 20);
  assert.ok(payloads.collectorSummary.abnormal_low_price_complaint_records >= 20);
  assert.equal(payloads.collectorSummary.procurement_exception_review_only_rate, 100);
});

test('round24 procurement records keep penalties and complaint clues as review-only evidence', () => {
  const payloads = buildTwentyFourthOfficialPublicInstancePayloads();
  const records = payloads.procurement.records;

  assert.ok(records.length >= 150);
  assert.ok(records.some((row) => row.procurement_exception_type === 'supplier_credit_restriction'));
  assert.ok(records.some((row) => row.procurement_exception_type === 'administrative_penalty'));
  assert.ok(records.some((row) => row.procurement_exception_type === 'abandoned_award_review'));
  assert.ok(records.some((row) => row.allegation_type === 'abnormal_low_price'));
  assert.ok(records.some((row) => row.allegation_type === 'false_material'));
  assert.ok(records.some((row) => row.allegation_outcome === 'rejected'));
  assert.ok(records.every((row) => row.finding_disposition !== 'substantive_violation'));
  assert.ok(records.every((row) => row.finding_disposition !== 'risk_candidate'));
  assert.ok(records.every((row) => row.source_evidence?.url));
  assert.ok(records.every((row) => row.source_evidence?.locator_hash));
});

test('round24 crawler uses registry snapshot to match penalty and follow-up chain candidates', () => {
  const payloads = buildTwentyFourthOfficialPublicInstancePayloads();
  const stages = payloads.publicDiscoveryQueue.summary.by_target_stage;

  assert.ok(stages.credit_restriction > 0);
  assert.ok(stages.credit_repair > 0);
  assert.ok(stages.contract > 0);
  assert.ok(stages.acceptance > 0);
  assert.ok(stages.payment > 0);
  assert.ok(payloads.discoveryCrawler.summary.matched_count > 0);
  assert.ok(payloads.discoveryCrawler.items.some((item) => item.crawler_status === 'matched' && item.penalty_decision_score > 0));
  assert.ok(payloads.discoveryCrawler.items.every((item) => item.crawler_status === 'matched' || item.failure_reason));
});

test('round24 summary meets regression and report expectations', () => {
  const payloads = buildTwentyFourthOfficialPublicInstancePayloads();
  const summary = summarizeTwentyFourthOfficialRun({
    generatedAt: '2026-04-27T23:58:00+08:00',
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

  assert.equal(summary.batch_name, 'official_public_instances_round24');
  assert.ok(summary.total_input_records >= 220);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round24_acceptance_baseline, 120);
  assert.ok(summary.report_topics.includes('supplier_credit_penalty_and_low_price_review'));
});
