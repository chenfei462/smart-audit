import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFifteenthOfficialPublicInstancePayloads,
  summarizeFifteenthOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round15.mjs';

test('round15 sources are new and focus fulfillment acceptance, policy checklist and audit PDF evidence', () => {
  const payloads = buildFifteenthOfficialPublicInstancePayloads({
    capturedAt: '2026-04-27T23:10:00+08:00',
    parserVersion: 'official-public-instance-round15-v1',
  });
  const previousUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 20);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => previousUrls.has(url)).length, 0);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(payloads.collectorSummary.fulfillment_acceptance_records >= 30);
  assert.ok(payloads.collectorSummary.policy_supplemental_data_coverage_rate === 100);
  assert.ok(payloads.collectorSummary.audit_pdf_locator_complete_count >= 6);
});

test('round15 procurement records expose acceptance archive and payment condition fields', () => {
  const payloads = buildFifteenthOfficialPublicInstancePayloads();
  const records = payloads.procurement.records;

  assert.ok(records.length >= 90);
  assert.ok(records.some((row) => row.acceptance_plan));
  assert.ok(records.some((row) => row.acceptance_opinion));
  assert.ok(records.some((row) => row.acceptance_archive_status));
  assert.ok(records.some((row) => row.acceptance_archive_locator));
  assert.ok(records.every((row) => row.finding_disposition !== 'substantive_violation'));
});

test('round15 discovery provider diagnostics explain not_found results', () => {
  const payloads = buildFifteenthOfficialPublicInstancePayloads();
  const items = payloads.discoveryCrawler.items;

  assert.ok(items.length >= 40);
  assert.ok(items.every((item) => item.provider_id));
  assert.ok(items.every((item) => Array.isArray(item.query_terms)));
  assert.ok(items.every((item) => item.search_url));
  assert.ok(items.every((item) => Array.isArray(item.candidate_urls)));
  assert.ok(items.every((item) => Array.isArray(item.candidate_titles)));
  assert.ok(items.every((item) => item.crawler_status !== 'not_found' || item.not_found_reason));
});

test('round15 summary meets acceptance baseline and report topic requirements', () => {
  const payloads = buildFifteenthOfficialPublicInstancePayloads();
  const summary = summarizeFifteenthOfficialRun({
    generatedAt: '2026-04-27T23:20:00+08:00',
    payloads,
    procurementResponse: {
      findings: [{ rule_code: 'PROC-FULFILLMENT-ACCEPTANCE-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
    },
    budgetResponse: payloads.budget.batches.map((batch) => ({
      findings: [{ rule_code: 'BUDGET-POLICY-CHECKLIST-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
    })),
    caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
  });

  assert.equal(summary.batch_name, 'official_public_instances_round15');
  assert.ok(summary.total_input_records >= 150);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round15_acceptance_baseline, 150);
  assert.ok(summary.optimization_plan.some((item) => item.area === 'fulfillment acceptance and payment condition topic'));
});
