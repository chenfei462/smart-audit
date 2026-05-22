import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTwentyFirstOfficialPublicInstancePayloads,
  summarizeTwentyFirstOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round21.mjs';

test('round21 sources are new and focus on penalties, credit constraints and follow-up closure', () => {
  const payloads = buildTwentyFirstOfficialPublicInstancePayloads({
    capturedAt: '2026-04-27T21:20:00+08:00',
    parserVersion: 'official-public-instance-round21-v1',
  });
  const previousUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 20);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => previousUrls.has(url)).length, 0);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(payloads.collectorSummary.procurement_penalty_records >= 160);
  assert.ok(payloads.collectorSummary.credit_constraint_records >= 80);
  assert.ok(payloads.collectorSummary.credit_repair_followup_records >= 40);
  assert.ok(payloads.collectorSummary.malicious_collusion_records >= 20);
  assert.ok(payloads.collectorSummary.false_material_records >= 20);
  assert.equal(payloads.collectorSummary.exception_weight_coverage_rate, 100);
  assert.equal(payloads.collectorSummary.procurement_exception_review_only_rate, 100);
});

test('round21 records preserve penalty, credit repair and differentiated evidence weights', () => {
  const payloads = buildTwentyFirstOfficialPublicInstancePayloads();
  const records = payloads.procurement.records;

  assert.ok(records.length >= 180);
  assert.ok(records.every((row) => row.procurement_exception_type));
  assert.ok(records.some((row) => row.procurement_exception_type === 'administrative_penalty'));
  assert.ok(records.some((row) => row.procurement_exception_type === 'malicious_collusion_review'));
  assert.ok(records.some((row) => row.procurement_exception_type === 'false_material_review'));
  assert.ok(records.some((row) => row.procurement_exception_type === 'complaint_rejected'));
  assert.ok(records.every((row) => row.finding_disposition !== 'substantive_violation'));
  assert.ok(records.every((row) => row.exception_evidence_category));
  assert.ok(records.every((row) => Number(row.exception_evidence_weight) > 0));
  assert.ok(records.some((row) => Number(row.exception_evidence_weight) === 80));
  assert.ok(records.some((row) => Number(row.exception_evidence_weight) === 75));
  assert.ok(records.some((row) => Number(row.exception_evidence_weight) === 70));
  assert.ok(records.some((row) => Number(row.exception_evidence_weight) === 25));
  assert.ok(records.some((row) => row.penalty_decision_no));
  assert.ok(records.some((row) => row.market_entry_restriction_scope));
  assert.ok(records.some((row) => row.credit_repair_status));
  assert.ok(records.some((row) => row.re_participation_review_flag));
  assert.ok(records.every((row) => row.source_evidence?.penalty_basis));
  assert.ok(records.every((row) => row.source_evidence?.credit_record_locator_hash));
  assert.ok(records.every((row) => row.source_evidence?.market_restriction_locator_hash));
});

test('round21 discovery queue adds penalty follow-up, credit repair, re-participation and downstream evidence stages', () => {
  const payloads = buildTwentyFirstOfficialPublicInstancePayloads();
  const stages = payloads.publicDiscoveryQueue.summary.by_target_stage;

  assert.ok(stages.penalty_followup > 0);
  assert.ok(stages.credit_restriction > 0);
  assert.ok(stages.credit_repair > 0);
  assert.ok(stages.re_participation > 0);
  assert.ok(stages.contract > 0);
  assert.ok(stages.acceptance > 0);
  assert.ok(stages.payment > 0);
  assert.ok(stages.rectification > 0);
  assert.ok(payloads.publicDiscoveryQueue.items.every((item) => item.finding_disposition !== 'risk_candidate'));
  assert.ok(payloads.publicDiscoveryQueue.items.some((item) => item.penalty_decision_no));
  assert.ok(payloads.publicDiscoveryQueue.items.some((item) => item.penalty_subject_name));
  assert.ok(payloads.discoveryCrawler.items.every((item) => item.crawler_status === 'matched' || item.failure_reason));
  assert.equal(payloads.collectorSummary.crawler_not_found_explained_count, payloads.discoveryCrawler.items.filter((item) => item.crawler_status !== 'matched').length);
});

test('round21 summary meets regression and penalty credit report topic expectations', () => {
  const payloads = buildTwentyFirstOfficialPublicInstancePayloads();
  const summary = summarizeTwentyFirstOfficialRun({
    generatedAt: '2026-04-27T21:30:00+08:00',
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

  assert.equal(summary.batch_name, 'official_public_instances_round21');
  assert.ok(summary.total_input_records >= 230);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round21_acceptance_baseline, 130);
  assert.ok(summary.report_topics.includes('procurement_penalty_credit_constraints'));
});
