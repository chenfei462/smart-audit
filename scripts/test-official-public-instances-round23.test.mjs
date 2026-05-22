import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTwentyThirdOfficialPublicInstancePayloads,
  summarizeTwentyThirdOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round23.mjs';

test('round23 sources are new complaint remedy-chain instances without previous registry overlap', () => {
  const payloads = buildTwentyThirdOfficialPublicInstancePayloads({
    capturedAt: '2026-04-27T23:20:00+08:00',
    parserVersion: 'official-public-instance-round23-v1',
  });
  const previousUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 20);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => previousUrls.has(url)).length, 0);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(payloads.collectorSummary.procurement_complaint_adjudication_records >= 180);
  assert.ok(payloads.collectorSummary.confirmed_fact_records >= 40);
  assert.ok(payloads.collectorSummary.remedy_required_records >= 80);
  assert.ok(payloads.collectorSummary.allegation_weight_coverage_rate >= 95);
  assert.equal(payloads.collectorSummary.complaint_review_only_rate, 100);
});

test('round23 records split complaint allegations, outcomes and remedy actions', () => {
  const payloads = buildTwentyThirdOfficialPublicInstancePayloads();
  const records = payloads.procurement.records;

  assert.ok(records.length >= 220);
  assert.ok(records.every((row) => row.allegation_type));
  assert.ok(records.every((row) => row.allegation_outcome));
  assert.ok(records.every((row) => row.remedy_action));
  assert.ok(records.some((row) => row.allegation_type === 'false_material'));
  assert.ok(records.some((row) => row.allegation_type === 'sme_declaration'));
  assert.ok(records.some((row) => row.allegation_type === 'bid_document_defect'));
  assert.ok(records.some((row) => row.allegation_outcome === 'established'));
  assert.ok(records.some((row) => row.allegation_outcome === 'insufficient_evidence'));
  assert.ok(records.some((row) => row.remedy_action === 'rebid_required'));
  assert.ok(records.some((row) => row.remedy_action === 'contract_review'));
  assert.ok(records.every((row) => row.finding_disposition !== 'substantive_violation'));
  assert.ok(records.every((row) => row.finding_disposition !== 'risk_candidate'));
  assert.ok(records.every((row) => Number(row.allegation_evidence_weight) > 0));
});

test('round23 discovery crawler matches some complaint remedy-chain follow-up sources', () => {
  const payloads = buildTwentyThirdOfficialPublicInstancePayloads();
  const stages = payloads.publicDiscoveryQueue.summary.by_target_stage;

  assert.ok(stages.correction_notice > 0);
  assert.ok(stages.award_invalidated > 0);
  assert.ok(stages.rebid_notice > 0);
  assert.ok(stages.new_award > 0);
  assert.ok(stages.contract > 0);
  assert.ok(stages.acceptance > 0);
  assert.ok(stages.payment > 0);
  assert.ok(payloads.publicDiscoveryQueue.items.every((item) => item.finding_disposition !== 'risk_candidate'));
  assert.ok(payloads.publicDiscoveryQueue.items.some((item) => item.complaint_chain_reason));
  assert.ok(payloads.discoveryCrawler.summary.matched_count > 0);
  assert.ok(payloads.discoveryCrawler.items.some((item) => item.crawler_status === 'matched' && item.remedy_action_score > 0));
  assert.ok(payloads.discoveryCrawler.items.every((item) => item.crawler_status === 'matched' || item.failure_reason));
});

test('round23 summary meets regression and report expectations', () => {
  const payloads = buildTwentyThirdOfficialPublicInstancePayloads();
  const summary = summarizeTwentyThirdOfficialRun({
    generatedAt: '2026-04-27T23:30:00+08:00',
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

  assert.equal(summary.batch_name, 'official_public_instances_round23');
  assert.ok(summary.total_input_records >= 300);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round23_acceptance_baseline, 140);
  assert.ok(summary.report_topics.includes('procurement_complaint_adjudication_outcomes'));
});
