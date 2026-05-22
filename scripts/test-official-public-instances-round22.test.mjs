import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTwentySecondOfficialPublicInstancePayloads,
  summarizeTwentySecondOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round22.mjs';

test('round22 sources are new complaint adjudication instances without previous registry overlap', () => {
  const payloads = buildTwentySecondOfficialPublicInstancePayloads({
    capturedAt: '2026-04-27T22:20:00+08:00',
    parserVersion: 'official-public-instance-round22-v1',
  });
  const previousUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.equal(payloads.sourceRegister.sources.length, 20);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => previousUrls.has(url)).length, 0);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(payloads.collectorSummary.procurement_complaint_adjudication_records >= 200);
  assert.ok(payloads.collectorSummary.false_material_allegation_records >= 40);
  assert.ok(payloads.collectorSummary.sme_policy_allegation_records >= 30);
  assert.ok(payloads.collectorSummary.bid_document_defect_records >= 30);
  assert.ok(payloads.collectorSummary.allegation_outcome_coverage_rate >= 95);
  assert.equal(payloads.collectorSummary.complaint_review_only_rate, 100);
});

test('round22 records separate complaint allegations from confirmed risk conclusions', () => {
  const payloads = buildTwentySecondOfficialPublicInstancePayloads();
  const records = payloads.procurement.records;

  assert.ok(records.length >= 200);
  assert.ok(records.every((row) => row.procurement_exception_type));
  assert.ok(records.some((row) => row.procurement_exception_type === 'complaint_established'));
  assert.ok(records.some((row) => row.procurement_exception_type === 'complaint_partly_established'));
  assert.ok(records.some((row) => row.procurement_exception_type === 'complaint_rejected'));
  assert.ok(records.some((row) => row.complaint_issue_summary.includes('false material allegation')));
  assert.ok(records.some((row) => row.complaint_issue_summary.includes('SME declaration allegation')));
  assert.ok(records.some((row) => row.complaint_issue_summary.includes('bid document defect allegation')));
  assert.ok(records.every((row) => row.finding_disposition !== 'substantive_violation'));
  assert.ok(records.every((row) => row.finding_disposition !== 'risk_candidate'));
  assert.ok(records.every((row) => row.source_evidence?.legal_basis));
  assert.ok(records.every((row) => row.source_evidence?.decision_paragraph_index));
  assert.ok(records.every((row) => row.source_evidence?.handling_result_locator_hash));
});

test('round22 discovery queue focuses on correction rebid new award contract acceptance and payment follow-up', () => {
  const payloads = buildTwentySecondOfficialPublicInstancePayloads();
  const stages = payloads.publicDiscoveryQueue.summary.by_target_stage;

  assert.ok(stages.correction_notice > 0);
  assert.ok(stages.award_invalidated > 0);
  assert.ok(stages.rebid_notice > 0);
  assert.ok(stages.new_award > 0);
  assert.ok(stages.contract > 0);
  assert.ok(stages.acceptance > 0);
  assert.ok(stages.payment > 0);
  assert.ok(payloads.publicDiscoveryQueue.items.every((item) => item.finding_disposition !== 'risk_candidate'));
  assert.ok(payloads.discoveryCrawler.items.every((item) => item.crawler_status === 'matched' || item.failure_reason));
  assert.equal(payloads.collectorSummary.crawler_not_found_explained_count, payloads.discoveryCrawler.items.filter((item) => item.crawler_status !== 'matched').length);
});

test('round22 summary meets regression and optimization report expectations', () => {
  const payloads = buildTwentySecondOfficialPublicInstancePayloads();
  const summary = summarizeTwentySecondOfficialRun({
    generatedAt: '2026-04-27T22:30:00+08:00',
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

  assert.equal(summary.batch_name, 'official_public_instances_round22');
  assert.ok(summary.total_input_records >= 280);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round22_acceptance_baseline, 140);
  assert.ok(summary.report_topics.includes('procurement_complaint_adjudication_outcomes'));
});
