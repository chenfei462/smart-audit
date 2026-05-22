import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNinthOfficialPublicInstancePayloads,
  summarizeNinthOfficialRun,
  usedOfficialSourceUrls,
} from './test-official-public-instances-round9.mjs';

test('round9 payloads cover cross-region sources, electronic marketplace semantics and final-account PDFs', () => {
  const payloads = buildNinthOfficialPublicInstancePayloads({
    capturedAt: '2026-04-27T11:30:00+08:00',
    parserVersion: 'official-public-instance-round9-v1',
  });
  const usedUrls = usedOfficialSourceUrls();
  const urls = payloads.sourceRegister.sources.map((source) => source.url);

  assert.ok(payloads.sourceRegister.sources.length >= 16);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter((url) => usedUrls.has(url)).length, 0);
  assert.ok(payloads.sourceRegister.sources.every((source) => source.batch_id === 'official_public_instances_round9'));
  assert.ok(payloads.sourceRegister.sources.some((source) => source.source_region_scope === 'central_unit' && source.central_unit_flag === true));
  assert.ok(payloads.sourceRegister.sources.some((source) => source.source_region_scope === 'cross_province' && source.source_province === 'Hubei'));
  assert.ok(payloads.sourceRegister.sources.some((source) => source.source_region_scope === 'jiangsu_local'));

  assert.ok(payloads.procurement.records.length >= 60);
  assert.ok(payloads.budget.records.length >= 28);
  assert.ok(payloads.caseSeeds.records.length >= 12);
  assert.ok(payloads.collectorSummary.total_records >= 100);
  assert.equal(payloads.collectorSummary.previous_source_overlap_count, 0);
  assert.ok(payloads.collectorSummary.central_unit_source_count >= 1);
  assert.ok(payloads.collectorSummary.cross_province_source_count >= 1);

  const marketplaceRows = payloads.procurement.records.filter((row) => row.procurement_channel === 'electronic_marketplace');
  assert.ok(marketplaceRows.length >= 10);
  assert.ok(marketplaceRows.some((row) => row.platform_order_no && row.item_quantity && row.unit_price_amount));
  assert.ok(marketplaceRows.some((row) => row.amount_semantic_type === 'electronic_marketplace_order_total' && row.normalized_award_amount_yuan));
  assert.ok(marketplaceRows
    .filter((row) => row.amount_semantic_type === 'electronic_marketplace_unit_price')
    .every((row) => !row.normalized_award_amount_yuan));

  assert.ok(payloads.procurement.records.some((row) => row.source_region_scope === 'cross_province' && row.purchaser_region_code?.startsWith('42')));
  assert.ok(payloads.procurement.records.some((row) => row.source_region_scope === 'central_unit' && row.central_unit_flag === true));

  const finalAccountRows = payloads.budget.records.filter((row) => row.dataset_kind === 'department_final_account_summary');
  assert.ok(finalAccountRows.length >= 10);
  assert.ok(finalAccountRows.some((row) => row.department_final_account_table_type === 'final_income_expense'));
  assert.ok(finalAccountRows.some((row) => row.performance_indicator_name && row.performance_indicator_value));
  assert.ok(finalAccountRows.every((row) => row.source_evidence?.page_number && row.source_evidence?.table_title && row.source_evidence?.locator_hash));

  assert.ok(payloads.discoveryCrawler.summary.total_items >= 1);
  assert.equal(payloads.discoveryCrawler.summary.processed_count, payloads.discoveryCrawler.summary.total_items);
  assert.ok(payloads.discoveryCrawler.items.every((item) => item.crawler_status !== 'new'));
  assert.ok(payloads.discoveryCrawler.items.every((item) => item.crawler_status === 'matched' || item.failure_reason));

  assert.ok(payloads.caseSeeds.records.some((row) => row.audit_evidence_level === 'formal_audit_report' && row.finding_disposition === 'risk_candidate'));
  assert.ok(payloads.caseSeeds.records
    .filter((row) => ['special_audit_survey', 'audit_result_feedback'].includes(row.audit_evidence_level))
    .every((row) => row.finding_disposition === 'review_recommended'));
  assert.ok(payloads.caseSeeds.records
    .filter((row) => ['audit_work_update', 'work_method_reference', 'methodology_or_experience'].includes(row.audit_evidence_level))
    .every((row) => row.finding_disposition === 'knowledge_reference'));
});

test('round9 summary exposes baseline, source-scope, crawler and PDF metrics', () => {
  const payloads = buildNinthOfficialPublicInstancePayloads();
  const summary = summarizeNinthOfficialRun({
    generatedAt: '2026-04-27T11:35:00+08:00',
    payloads,
    procurementResponse: {
      findings: [{ rule_code: 'PROC-E-MARKET-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
    },
    budgetResponse: payloads.budget.batches.map((batch) => ({
      findings: [{ rule_code: 'BUDGET-FINAL-ACCOUNT-PDF-001', risk_level: 'Info' }],
      detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
    })),
    caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
  });

  assert.equal(summary.batch_name, 'official_public_instances_round9');
  assert.ok(summary.total_input_records >= 100);
  assert.equal(summary.total_accepted_records, summary.total_input_records);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.round9_acceptance_baseline, 100);
  assert.ok(summary.collector_summary.electronic_marketplace_records >= 10);
  assert.ok(summary.collector_summary.department_final_account_records >= 10);
  assert.ok(summary.collector_summary.discovery_crawler_processed_count >= 1);
  assert.ok(summary.optimization_plan.some((item) => item.area === 'real crawler scheduling and review workflow'));
});
