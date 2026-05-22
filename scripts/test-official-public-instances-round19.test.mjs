import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNineteenthOfficialPublicInstancePayloads,
  summarizeNineteenthOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round19.mjs';

test('round19 sources are new and formalize procurement complaint exception evidence', () => {
  const payloads = buildNineteenthOfficialPublicInstancePayloads({
    capturedAt: '2026-04-27T19:20:00+08:00',
    parserVersion: 'official-public-instance-round19-v1',
  });
  const previousUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 20);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => previousUrls.has(url)).length, 0);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(payloads.collectorSummary.procurement_exception_records >= 140);
  assert.ok(payloads.collectorSummary.complaint_decision_records >= 100);
  assert.ok(payloads.collectorSummary.exception_chain_queue_item_count >= 120);
  assert.equal(payloads.collectorSummary.procurement_exception_review_only_rate, 100);
});

test('round19 procurement records carry formal exception and source locator fields', () => {
  const payloads = buildNineteenthOfficialPublicInstancePayloads();
  const records = payloads.procurement.records;

  assert.ok(records.length >= 140);
  assert.ok(records.every((row) => row.procurement_exception_type));
  assert.ok(records.some((row) => row.complaint_decision_no));
  assert.ok(records.some((row) => row.complaint_handling_result));
  assert.ok(records.some((row) => row.false_material_flag));
  assert.ok(records.some((row) => row.award_invalidated_flag));
  assert.ok(records.some((row) => row.rebid_required_flag));
  assert.ok(records.some((row) => row.supervision_penalty_subject));
  assert.ok(records.every((row) => row.finding_disposition !== 'substantive_violation'));
  assert.ok(records.every((row) => row.source_evidence?.legal_basis));
  assert.ok(records.every((row) => row.source_evidence?.decision_paragraph_index));
  assert.ok(records.every((row) => row.source_evidence?.handling_result_locator_hash));
});

test('round19 exception discovery queue covers correction invalidation rebid new award and downstream evidence', () => {
  const payloads = buildNineteenthOfficialPublicInstancePayloads();
  const stages = payloads.publicDiscoveryQueue.summary.by_target_stage;

  assert.ok(stages.correction_notice > 0);
  assert.ok(stages.award_invalidated > 0);
  assert.ok(stages.rebid_notice > 0);
  assert.ok(stages.new_award > 0);
  assert.ok(stages.contract > 0);
  assert.ok(stages.acceptance > 0);
  assert.ok(stages.payment > 0);
  assert.ok(payloads.publicDiscoveryQueue.items.every((item) => item.exception_chain_reason || item.chain_discovery_reason));
  assert.ok(payloads.discoveryCrawler.items.every((item) => Number.isFinite(item.exception_chain_score)));
  assert.ok(payloads.discoveryCrawler.items.every((item) => item.crawler_status === 'matched' || item.failure_reason));
});

test('round19 summary meets expanded regression baseline and report topic requirements', () => {
  const payloads = buildNineteenthOfficialPublicInstancePayloads();
  const summary = summarizeNineteenthOfficialRun({
    generatedAt: '2026-04-27T19:30:00+08:00',
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

  assert.equal(summary.batch_name, 'official_public_instances_round19');
  assert.ok(summary.total_input_records >= 220);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round19_acceptance_baseline, 120);
  assert.ok(summary.report_topics.includes('procurement_complaint_exception_handling'));
});
