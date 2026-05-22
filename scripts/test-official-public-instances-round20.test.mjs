import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTwentiethOfficialPublicInstancePayloads,
  summarizeTwentiethOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round20.mjs';

test('round20 sources are new and focus on penalty and supervision abnormalities', () => {
  const payloads = buildTwentiethOfficialPublicInstancePayloads({
    capturedAt: '2026-04-27T20:20:00+08:00',
    parserVersion: 'official-public-instance-round20-v1',
  });
  const previousUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.equal(payloads.sourceRegister.sources.length, 20);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => previousUrls.has(url)).length, 0);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(payloads.collectorSummary.procurement_exception_records >= 160);
  assert.ok(payloads.collectorSummary.supervision_penalty_records >= 40);
  assert.ok(payloads.collectorSummary.false_material_records >= 40);
  assert.ok(payloads.collectorSummary.malicious_collusion_records >= 10);
  assert.equal(payloads.collectorSummary.procurement_exception_review_only_rate, 100);
});

test('round20 records preserve legal basis, penalty subject and review-only disposition', () => {
  const payloads = buildTwentiethOfficialPublicInstancePayloads();
  const records = payloads.procurement.records;

  assert.ok(records.length >= 160);
  assert.ok(records.every((row) => row.procurement_exception_type));
  assert.ok(records.some((row) => row.procurement_exception_type === 'supervision_penalty'));
  assert.ok(records.some((row) => row.complaint_handling_result.includes('administrative penalty')));
  assert.ok(records.some((row) => row.supervision_penalty_subject));
  assert.ok(records.some((row) => row.complaint_issue_summary.includes('malicious collusion')));
  assert.ok(records.every((row) => row.finding_disposition !== 'substantive_violation'));
  assert.ok(records.every((row) => row.source_evidence?.legal_basis));
  assert.ok(records.every((row) => row.source_evidence?.legal_basis_article));
  assert.ok(records.every((row) => row.source_evidence?.handling_result_locator_hash));
});

test('round20 discovery queue keeps penalty and complaint notices out of high-risk conclusions', () => {
  const payloads = buildTwentiethOfficialPublicInstancePayloads();
  const stages = payloads.publicDiscoveryQueue.summary.by_target_stage;

  assert.ok(stages.contract > 0);
  assert.ok(stages.acceptance > 0);
  assert.ok(stages.payment > 0);
  assert.ok(stages.rectification > 0);
  assert.ok(payloads.publicDiscoveryQueue.items.every((item) => item.finding_disposition !== 'risk_candidate'));
  assert.ok(payloads.discoveryCrawler.items.every((item) => item.crawler_status === 'matched' || item.failure_reason));
  assert.equal(payloads.collectorSummary.crawler_not_found_explained_count, payloads.discoveryCrawler.items.filter((item) => item.crawler_status !== 'matched').length);
});

test('round20 summary meets regression and report topic expectations', () => {
  const payloads = buildTwentiethOfficialPublicInstancePayloads();
  const summary = summarizeTwentiethOfficialRun({
    generatedAt: '2026-04-27T20:30:00+08:00',
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

  assert.equal(summary.batch_name, 'official_public_instances_round20');
  assert.ok(summary.total_input_records >= 230);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round20_acceptance_baseline, 130);
  assert.ok(summary.report_topics.includes('procurement_penalty_supervision_handling'));
});
