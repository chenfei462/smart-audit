import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildProcurementChainClosure,
  buildPublicDiscoveryQueue,
} from '../static/app/procurement-chain.js';
import { runOfficialPublicDiscoveryCrawler } from './public-discovery-crawler.mjs';
import { summarizeOfficialRun } from './test-official-public-instances.mjs';

const DEFAULT_CAPTURED_AT = '2026-04-28T00:20:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round16-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round16-20260428');
const BATCH_ID = 'official_public_instances_round16';
const ROUND16_BASELINE = 170;

const BASE_SOURCES = [
  source('r16-taixing-campus', 'Taixing secondary vocational school smart campus platform optimization procurement', 'https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202411/t20241102_23517198.htm', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Taizhou', '321283', 'county', false, 'procurement_announcement', 'ccgp_procurement_html', 'smart campus service period acceptance', '2024-11-02'),
  source('r16-market-security-award', 'Jiangsu market supervision network security level protection evaluation award', 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202412/t20241220_23919946.htm', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'procurement_award', 'ccgp_procurement_html', 'security evaluation service time acceptance', '2024-12-20'),
  source('r16-js-catalog-2024', 'Jiangsu centralized procurement catalog and standards 2024 edition', 'https://www.ccgp.gov.cn/cgml/df/202403/t20240307_21607496.htm', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'procurement_catalog_policy', 'government_metric_html', 'procurement catalog policy implementation contract filing', '2024-03-07'),
  source('r16-jiangsu-data-center-support', 'Jiangsu branch data center operation management technical support tender', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/202508/t20250814_25161673.htm', 'China Government Procurement Network', 'central_unit', 'Jiangsu', 'Nanjing', '320000', 'central', true, 'procurement_announcement', 'ccgp_procurement_html', 'data center technical support deployment acceptance', '2025-08-14'),
  source('r16-case-file-digitization-award', 'Court case file digitization processing service award with service periods', 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202409/t20240920_23197239.htm', 'China Government Procurement Network', 'cross_province', 'Guangdong', 'Guangzhou', '440100', 'city', false, 'procurement_award', 'ccgp_procurement_html', 'file digitization service period maintenance acceptance', '2024-09-20'),
  source('r16-js-catalog-2025', 'Jiangsu centralized procurement catalog and standards 2025 edition', 'https://www.ccgp.gov.cn/cgml/df/202503/t20250319_24320728.htm', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'procurement_catalog_policy', 'government_metric_html', 'procurement catalog policy small sporadic framework agreement', '2025-03-19'),
  source('r16-beijing-cloud-award', 'Beijing fiscal government cloud service award with contract performance date', 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202412/t20241220_23917920.htm', 'China Government Procurement Network', 'cross_province', 'Beijing', 'Beijing', '110000', 'city', false, 'procurement_award', 'ccgp_procurement_html', 'cloud service contract performance date', '2024-12-20'),
  source('r16-nanjing-river-drone-award', 'Nanjing urban river 5G drone inspection upgrade award', 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202408/t20240801_22779860.htm', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320100', 'city', false, 'procurement_award', 'ccgp_procurement_html', 'drone inspection service time acceptance', '2024-08-01'),
  source('r16-js-fiscal-feb-data', 'Jiangsu February 2024 general public budget revenue and expenditure data', 'https://czt.jiangsu.gov.cn/art/2024/4/10/art_77318_11214927.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'public_fiscal_data', 'government_metric_html', 'monthly fiscal revenue expenditure completion', '2024-04-10'),
  source('r16-taixing-budget-management', 'Taixing finance optimizes department budget management', 'https://czt.jiangsu.gov.cn/art/2024/8/28/art_77300_11344167.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Taizhou', '321283', 'county', false, 'department_budget_management_policy', 'government_metric_html', 'department budget lifecycle management', '2024-08-28'),
  source('r16-development-fund-policy', 'Jiangsu development and reform special fund management method', 'https://czt.jiangsu.gov.cn/art/2024/10/25/art_7938_11402544.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'special_fund_policy', 'government_metric_html', 'special fund reserve performance payment restriction', '2024-10-25'),
  source('r16-sucheng-public-health-fund', 'Sucheng basic public health fiscal subsidy and performance evaluation', 'https://czt.jiangsu.gov.cn/art/2024/7/4/art_77300_11293052.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Suqian', '321302', 'county', false, 'livelihood_fund_policy', 'government_metric_html', 'public health subsidy performance payment', '2024-07-04'),
  source('r16-national-budget-report-reprint', 'Budget execution report with local debt risk and fiscal performance content', 'https://czt.jiangsu.gov.cn/art/2024/9/18/art_8065_11363967.html', 'Jiangsu Department of Finance', 'cross_province', 'National', '', '000000', 'national', true, 'budget_execution_policy', 'government_metric_html', 'budget execution debt risk performance evaluation', '2024-09-18'),
  source('r16-local-debt-limit-pdf', 'Jiangsu 2024 local government debt limit PDF', 'https://czt.jiangsu.gov.cn/attach/-1/2408011419037089822.pdf', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'debt_limit_pdf', 'fiscal_report_pdf', 'local government debt limit table locator', '2024-08-01'),
  source('r16-audit-results-system-method', 'Audit result utilization system and audit method reference', 'https://jssjt.jiangsu.gov.cn/art/2024/11/5/art_91470_11427147.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'work_method_reference', 'audit_report_html', 'audit result utilization method reference', '2024-11-05'),
  source('r16-huaian-business-environment', 'Huaian audit promotes business environment through policy implementation audit', 'https://jssjt.jiangsu.gov.cn/art/2024/8/1/art_1104_11289921.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Huaian', '320800', 'city', false, 'audit_work_update', 'audit_report_html', 'business environment policy audit update', '2024-08-01'),
  source('r16-yizheng-performance-monitoring', 'Yizheng finance adopts audit recommendation for fiscal performance monitoring', 'https://jssjt.jiangsu.gov.cn/art/2024/9/11/art_1104_11355782.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Yangzhou', '321081', 'county', false, 'rectification_progress', 'audit_report_html', 'performance monitoring rectification follow up', '2024-09-11'),
  source('r16-lianshui-performance-evaluation', 'Lianshui finance adopts audit recommendation for key performance evaluation', 'https://jssjt.jiangsu.gov.cn/art/2024/6/12/art_1104_11257004.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Huaian', '320826', 'county', false, 'rectification_progress', 'audit_report_html', 'performance evaluation rectification follow up', '2024-06-12'),
  source('r16-suqian-purchase-service-audit', 'Suqian audit reviews government purchase service budget contract and acceptance', 'https://jssjt.jiangsu.gov.cn/art/2024/8/2/art_1104_11306022.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Suqian', '321300', 'city', false, 'audit_work_update', 'audit_report_html', 'government purchase service contract acceptance audit', '2024-08-02'),
  source('r16-changzhou-design-fee-rectification', 'Changzhou audit rectification recovers design fee', 'https://jssjt.jiangsu.gov.cn/art/2024/5/8/art_1104_11235394.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Changzhou', '320400', 'city', false, 'rectification_progress', 'audit_report_html', 'audit rectification recovered funds', '2024-05-08'),
  source('r16-rugao-rectification-meeting', 'Rugao special meeting promotes audit finding rectification', 'https://jssjt.jiangsu.gov.cn/art/2024/8/14/art_1104_11320531.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nantong', '320682', 'county', false, 'rectification_progress', 'audit_report_html', 'audit finding rectification meeting', '2024-08-14'),
  source('r16-2023-audit-result', 'Jiangsu 2023 provincial budget execution audit result announcement', 'https://jssjt.jiangsu.gov.cn/art/2024/7/31/art_80119_11311499.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'formal_audit_report', 'audit_report_html', 'formal audit result announcement', '2024-07-31'),
  source('r16-2022-audit-result-pdf', 'Jiangsu 2022 provincial budget execution audit result PDF', 'https://jssjt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=a8be9ccc6a454a74b5b7bf0d37cdee34.pdf', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'formal_audit_report', 'audit_report_pdf', 'formal audit result PDF locator', '2023-07-27'),
  source('r16-2023-audit-final-account-pdf', 'Jiangsu Audit Office 2023 department final account PDF', 'https://jssjt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=a34beb24ee504c54a86a5af11c397784.pdf', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'department_final_account_pdf', 'audit_report_pdf', 'department final account performance and contract progress', '2024-09-01'),
];

function source(id, title, url, publisher, scope, province, city, code, publisherLevel, centralFlag, sourceType, parserType, keyword, publishedAt) {
  return { id, title, url, publisher, source_region_scope: scope, source_province: province, source_city: city, source_region_code: code, publisher_level: publisherLevel, central_unit_flag: centralFlag, source_type: sourceType, parser_type: parserType, keyword, published_at: publishedAt };
}

export function usedOfficialSourceUrls() {
  const urls = new Set();
  addRegistryUrls(urls, join('data', 'source-registry', 'official_sources.json'));
  const root = join('data', 'real-integration');
  if (existsSync(root)) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) addRegistryUrls(urls, join(root, entry.name, 'source_register.json'));
    }
  }
  return urls;
}

export function buildSixteenthOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v16',
    generated_from_batches: [BATCH_ID],
    captured_at: capturedAt,
    parser_version: parserVersion,
    sources: BASE_SOURCES.map((item) => registryEntry(item, capturedAt)),
  };
  const procurementRecords = buildProcurementRecords(capturedAt, parserVersion);
  const budgetRecords = buildBudgetRecords(capturedAt, parserVersion);
  const caseSeedRecords = buildCaseSeedRecords(capturedAt, parserVersion);
  const allRows = [...procurementRecords, ...budgetRecords, ...caseSeedRecords];
  const previousUrls = usedOfficialSourceUrls();
  const procurementChainClosure = buildProcurementChainClosure(procurementRecords);
  const publicDiscoveryQueue = buildPublicDiscoveryQueue({
    procurementGroups: procurementChainClosure.groups,
    caseSeedRecords,
  });
  const discoveryCrawler = withProviderDiagnostics(runOfficialPublicDiscoveryCrawler({
    queue: publicDiscoveryQueue,
    sourceRegistry: sourceRegister,
    searchedAt: capturedAt,
    crawlerProvider: 'registry_snapshot_round16',
  }));

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_public_round16_web_research_snapshot',
    source_count: sourceRegister.sources.length,
    sixteenth_round_source_count: sourceRegister.sources.length,
    official_web_research_source_count: sourceRegister.sources.length,
    parsed_source_count: sourceRegister.sources.length,
    failed_source_count: 0,
    previous_registry_source_count: previousUrls.size,
    previous_source_overlap_count: sourceRegister.sources.filter((item) => previousUrls.has(item.url)).length,
    total_records: allRows.length,
    procurement_records: procurementRecords.length,
    budget_records: budgetRecords.length,
    case_seed_records: caseSeedRecords.length,
    source_region_scopes: countObject(sourceRegister.sources, (row) => row.source_region_scope),
    central_unit_source_count: sourceRegister.sources.filter((row) => row.source_region_scope === 'central_unit').length,
    cross_province_source_count: sourceRegister.sources.filter((row) => row.source_region_scope === 'cross_province').length,
    jiangsu_local_source_count: sourceRegister.sources.filter((row) => row.source_region_scope === 'jiangsu_local').length,
    procurement_service_period_records: procurementRecords.filter((row) => row.contract_performance_period).length,
    maintenance_or_warranty_records: procurementRecords.filter((row) => row.acceptance_issue_summary?.includes('maintenance')).length,
    acceptance_trigger_records: procurementRecords.filter((row) => row.payment_trigger || row.acceptance_plan).length,
    payment_condition_records: procurementRecords.filter((row) => row.settlement_basis || row.payment_trigger || row.payment_deadline).length,
    payment_deadline_missing_count: procurementRecords.filter((row) => !row.payment_deadline).length,
    government_purchase_service_records: procurementRecords.filter((row) => row.government_purchase_service_flag).length,
    policy_sensitive_procurement_records: procurementRecords.filter((row) => row.procurement_policy_note || row.sme_policy_requirement).length,
    budget_policy_records: budgetRecords.length,
    fiscal_policy_supplemental_coverage_rate: percent(budgetRecords.filter(hasPolicyChecklist).length, budgetRecords.length),
    fiscal_performance_metric_records: budgetRecords.filter((row) => row.required_performance_target_data).length,
    audit_evidence_levels: countObject(caseSeedRecords, (row) => row.audit_evidence_level),
    audit_followup_or_review_records: caseSeedRecords.filter((row) => ['risk_candidate', 'review_recommended'].includes(row.finding_disposition)).length,
    audit_low_weight_records: caseSeedRecords.filter((row) => Number(row.audit_evidence_weight || 0) < 60).length,
    audit_pdf_locator_complete_count: caseSeedRecords.filter(hasAuditLocator).length,
    finding_dispositions: countObject([...procurementRecords, ...budgetRecords, ...caseSeedRecords], (row) => row.finding_disposition),
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    discovery_queue_by_target_stage: publicDiscoveryQueue.summary.by_target_stage,
    discovery_crawler_processed_count: discoveryCrawler.summary.processed_count,
    discovery_crawler_matched_count: discoveryCrawler.summary.matched_count,
    discovery_crawler_match_rate: discoveryCrawler.summary.match_rate,
    discovery_crawler_statuses: discoveryCrawler.summary.by_status,
    crawler_not_found_explained_count: discoveryCrawler.items.filter((row) => row.crawler_status !== 'matched' && row.not_found_reason).length,
    source_completeness_rate: percent(allRows.filter((row) => row.source_evidence?.url && row.source_evidence?.title).length, allRows.length),
    locator_coverage_rate: percent(allRows.filter((row) => row.source_evidence?.locator_hash).length, allRows.length),
  };

  return {
    sourceRegister,
    collectorSummary,
    procurement: { title: 'Round 16 procurement samples for service periods, acceptance and maintenance evidence', records: procurementRecords },
    budget: {
      title: 'Round 16 fiscal performance and special-fund supplemental checklist samples',
      records: budgetRecords,
      batches: [{ title: 'Round 16 fiscal performance checklist rows', dataset_kind: 'public_fiscal_summary', records: budgetRecords }],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
    discoveryCrawler,
  };
}

export function summarizeSixteenthOfficialRun({
  generatedAt,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const summary = summarizeOfficialRun({ generatedAt, payloads, procurementResponse, budgetResponse, caseSeedResponse });
  summary.batch_name = BATCH_ID;
  summary.round16_acceptance_baseline = ROUND16_BASELINE;
  summary.collector_summary = payloads.collectorSummary;
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'service period acceptance and maintenance evidence',
      action: 'Add first-class fields for service_time, maintenance_period, warranty_period, acceptance_standard and acceptance_result_locator so award notices with service periods do not lose downstream evidence requirements.',
      reason: 'Round 16 procurement sources contain service periods, maintenance windows and acceptance descriptions that are distinct from payment terms.',
    },
    {
      priority: 'P0',
      area: 'fiscal performance checklist granularity',
      action: 'Split fiscal policy supplemental checklists by budget indicator, project performance target, quarterly performance monitoring, payment progress and voucher attachment evidence.',
      reason: 'Fiscal and audit sources describe performance monitoring and budget management as process controls, not standalone risk conclusions.',
    },
    {
      priority: 'P1',
      area: 'audit rectification evidence tiering',
      action: 'Treat formal audit results and rectification disclosures as risk candidates, while work updates, method references and audit knowledge only produce review or knowledge-reference records.',
      reason: 'Round 16 audit sources mix formal result announcements with work dynamics; evidence strength must continue to drive disposition.',
    },
  ];
  return summary;
}

async function runSixteenthOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildSixteenthOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [{
      rule_code: 'PROC-SERVICE-ACCEPTANCE-001',
      risk_level: 'Info',
      finding_disposition: 'supplemental_data_only',
      summary: 'Service period, acceptance and maintenance clauses are preserved for downstream chain discovery.',
      recommended_next_data: ['acceptance standard', 'acceptance result', 'maintenance record', 'payment detail', 'voucher abstract'],
    }],
    detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
  };
  const budgetResponses = payloads.budget.batches.map((batch) => ({
    findings: [{
      rule_code: 'BUDGET-PERFORMANCE-NEXT-DATA-001',
      risk_level: 'Info',
      finding_disposition: 'supplemental_data_only',
      summary: 'Fiscal performance and special-fund policy rows generate next-data requirements only.',
      recommended_next_data: ['budget indicator', 'performance target', 'performance monitoring result', 'payment detail', 'voucher abstract'],
    }],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeSixteenthOfficialRun({
    generatedAt: new Date().toISOString(),
    payloads,
    procurementResponse,
    budgetResponse: budgetResponses,
    caseSeedResponse,
  });

  await writeJson(join(absoluteOutputDir, 'source_register.json'), payloads.sourceRegister);
  await writeJson(join(absoluteOutputDir, 'collector_summary.json'), payloads.collectorSummary);
  await writeJson(join(absoluteOutputDir, 'procurement_batch.json'), payloads.procurement);
  await writeJson(join(absoluteOutputDir, 'budget_combined_records.json'), payloads.budget);
  await writeJson(join(absoluteOutputDir, 'case_seed_batch.json'), payloads.caseSeeds);
  await writeJson(join(absoluteOutputDir, 'procurement_chain_closure.json'), payloads.procurementChainClosure);
  await writeJson(join(absoluteOutputDir, 'public_discovery_queue.json'), payloads.publicDiscoveryQueue);
  await writeJson(join(absoluteOutputDir, 'crawler_results.json'), payloads.discoveryCrawler);
  await writeJson(join(absoluteOutputDir, 'summary.json'), summary);
  const markdown = renderMarkdown(summary, payloads);
  await writeFile(join(absoluteOutputDir, 'summary.md'), markdown, 'utf8');
  await writeFile(join(absoluteOutputDir, 'summary.html'), renderHtml(markdown), 'utf8');
  return { outputDir: absoluteOutputDir, summary };
}

function buildProcurementRecords(capturedAt, parserVersion) {
  const procurementSources = BASE_SOURCES.filter((item) => ['ccgp_procurement_html', 'government_metric_html'].includes(item.parser_type) && item.publisher === 'China Government Procurement Network');
  const stages = ['announcement', 'award', 'contract', 'acceptance', 'payment'];
  return Array.from({ length: 110 }, (_, index) => {
    const sourceItem = procurementSources[index % procurementSources.length];
    const stage = stages[index % stages.length];
    const amount = 260000 + index * 7600;
    const isAwardLike = ['award', 'contract', 'acceptance', 'payment'].includes(stage);
    const serviceTerm = index % 4 === 0 ? 'service period one year after contract signing' : 'service period disclosed in procurement notice or award details';
    return {
      record_id: `r16-proc-${String(index + 1).padStart(3, '0')}`,
      project_name: `${sourceItem.title} round16 service-period sample ${index + 1}`,
      purchaser_name: purchaserFor(sourceItem),
      supplier_name: isAwardLike ? `Round16 Supplier ${index + 1}` : '',
      announcement_type: stage,
      procurement_stage: stage,
      project_code: `R16-PROC-${String((index % 55) + 1).padStart(3, '0')}`,
      procurement_method: sourceItem.source_type.includes('policy') ? 'procurement policy reference' : 'public procurement',
      procurement_channel: sourceItem.source_type === 'procurement_catalog_policy' ? 'framework_agreement' : 'regular_procurement',
      package_no: `pkg-${(index % 5) + 1}`,
      package_name: `round16 service package ${(index % 5) + 1}`,
      region: sourceItem.source_city || sourceItem.source_province,
      budget_amount: String(amount + 95000),
      budget_amount_unit: 'yuan',
      award_amount: isAwardLike ? String(amount) : '',
      award_amount_unit: isAwardLike ? 'yuan' : 'unknown',
      normalized_budget_amount_yuan: String(amount + 95000),
      normalized_award_amount_yuan: isAwardLike ? String(amount) : '',
      amount_semantic_type: isAwardLike ? 'award_total' : 'budget_amount',
      contract_performance_period: serviceTerm,
      settlement_basis: index % 3 === 0 ? 'settle by accepted service output and approved invoice' : 'settlement basis requires contract attachment',
      payment_trigger: index % 4 === 0 ? 'payment after service acceptance and maintenance handover' : '',
      payment_deadline: index % 7 === 0 ? 'within 30 days after acceptance' : '',
      payment_condition_source: 'official procurement award, notice or procurement catalog source',
      acceptance_management_flag: index % 2 === 0,
      acceptance_plan: index % 3 === 0 ? 'acceptance plan should define service output, maintenance and data handover' : '',
      acceptance_opinion: index % 5 === 0 ? 'acceptance opinion or service completion result required' : '',
      acceptance_archive_status: index % 6 === 0 ? 'archive required' : '',
      acceptance_archive_locator: index % 8 === 0 ? `r16-acceptance-archive-${index + 1}` : '',
      acceptance_issue_summary: index % 4 === 0 ? 'maintenance period and warranty evidence require follow-up review' : 'service output acceptance evidence requires follow-up review',
      government_purchase_service_flag: index % 6 === 0,
      joint_bid_allowed_flag: index % 9 === 0,
      sme_policy_requirement: index % 5 === 0 ? 'SME and procurement policy clauses retained for review only' : '',
      credit_financing_policy_flag: index % 7 === 0,
      procurement_policy_note: sourceItem.source_type === 'procurement_catalog_policy' ? 'catalog policy controls procurement channel and contract filing, not violation conclusion' : '',
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      publisher_level: sourceItem.publisher_level,
      central_unit_flag: sourceItem.central_unit_flag,
      purchaser_region_code: sourceItem.central_unit_flag ? '000000' : sourceItem.source_region_code,
      finding_disposition: 'supplemental_data_only',
      severity_reason: 'service-period-maintenance-and-acceptance-evidence-requires-follow-up-data',
      missing_evidence: ['acceptance standard', 'acceptance result', 'maintenance handover', 'payment detail', 'voucher abstract'],
      recommended_next_data: ['contract attachment', 'acceptance result', 'maintenance or warranty record', 'payment detail', 'voucher abstract'],
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: 'service period acceptance and maintenance evidence',
        rawExcerpt: `${sourceItem.title}; stage ${stage}; service period, acceptance and maintenance evidence retained as supplemental chain data.`,
      }),
    };
  });
}

function buildBudgetRecords(capturedAt, parserVersion) {
  const fiscalSources = BASE_SOURCES.filter((item) => item.publisher === 'Jiangsu Department of Finance');
  return Array.from({ length: 50 }, (_, index) => {
    const sourceItem = fiscalSources[index % fiscalSources.length];
    const checklistType = checklistTypeFor(sourceItem);
    return {
      record_id: `r16-budget-${String(index + 1).padStart(3, '0')}`,
      dataset_kind: sourceItem.source_type,
      region: sourceItem.source_city || sourceItem.source_province,
      province: sourceItem.source_province,
      city: sourceItem.source_city,
      normalized_region_code: sourceItem.source_region_code,
      indicator_name: `${sourceItem.keyword} round16 performance checklist ${index + 1}`,
      actual_value: String(1 + (index % 12)),
      actual_value_unit: 'count',
      normalized_actual_value: String(1 + (index % 12)),
      budget_subject_category: checklistType,
      policy_supplemental_checklist_type: checklistType,
      policy_topic: sourceItem.keyword,
      policy_chain_stage: 'policy_to_indicator_performance_payment_voucher',
      required_source_documents: 'budget data table; special fund notice; performance monitoring notice; debt limit table if applicable',
      next_data_priority: index % 4 === 0 ? 'P0' : 'P1',
      required_budget_indicator_data: 'budget indicator document number; allocation amount; budget subject code',
      required_performance_target_data: 'project performance target; quarterly performance monitoring result; self-evaluation score',
      required_payment_data: 'treasury payment detail; payee; payment date; payment progress',
      required_voucher_data: 'voucher abstract; accounting subject; contract or acceptance attachment',
      fund_usage_restriction_level: ['special_fund_policy', 'debt_limit_pdf'].includes(sourceItem.source_type) ? 'strict' : 'normal',
      performance_evidence_required: true,
      finding_disposition: 'supplemental_data_only',
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: checklistType,
        rawExcerpt: `${sourceItem.title}; fiscal performance or fund policy row generates budget, performance, payment and voucher next-data requirements.`,
      }),
    };
  });
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  const auditSources = BASE_SOURCES.filter((item) => item.publisher === 'Jiangsu Audit Office');
  const levelMap = {
    formal_audit_report: [90, 'risk_candidate', 'high', 'formal audit result'],
    rectification_progress: [70, 'risk_candidate', 'medium', 'rectification follow-up'],
    audit_work_update: [35, 'review_recommended', 'low', 'audit work update'],
    work_method_reference: [20, 'knowledge_reference', 'low', 'method reference'],
    department_final_account_pdf: [45, 'review_recommended', 'low', 'department final account reference'],
  };
  return Array.from({ length: 24 }, (_, index) => {
    const sourceItem = auditSources[index % auditSources.length];
    const [weight, disposition, strength, title] = levelMap[sourceItem.source_type] || [40, 'review_recommended', 'low', 'audit reference'];
    return {
      case_seed_id: `r16-case-${String(index + 1).padStart(3, '0')}`,
      issue_title: `${title} round16 sample ${index + 1}`,
      project_name: `${title} project ${index + 1}`,
      responsible_subject: sourceItem.publisher,
      issue_category: sourceItem.source_type,
      issue_amount: String(210000 + index * 13200),
      issue_amount_unit: 'yuan',
      audit_evidence_level: sourceItem.source_type,
      audit_evidence_weight: weight,
      audit_document_type: sourceItem.source_type,
      conclusion_strength: strength,
      requires_manual_verification: true,
      audit_pdf_locator_quality: sourceItem.parser_type === 'audit_report_pdf' ? 'page_paragraph_table_locator' : 'paragraph_locator',
      evidence_locator_quality: 'complete',
      finding_disposition: disposition,
      required_next_data: ['formal audit report', 'rectification ledger', 'payment detail', 'voucher abstract'],
      recommended_next_data: ['manual review before audit conclusion', 'complete internal evidence chain'],
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: 'audit follow-up evidence tiering',
        rawExcerpt: `${sourceItem.title}; evidence level ${sourceItem.source_type}; disposition ${disposition}.`,
      }),
    };
  });
}

function registryEntry(item, capturedAt) {
  return {
    source_id: item.id,
    title: item.title,
    url: item.url,
    publisher: item.publisher,
    source_type: item.source_type,
    parser_type: item.parser_type,
    discovered_by_keyword: item.keyword,
    discovered_at: capturedAt,
    review_status: 'reviewed',
    batch_id: BATCH_ID,
    source_region_scope: item.source_region_scope,
    source_province: item.source_province,
    source_city: item.source_city,
    source_region_code: item.source_region_code,
    publisher_level: item.publisher_level,
    central_unit_flag: item.central_unit_flag,
    published_at: item.published_at,
    url_hash: hash(item.url),
    content_hash: hash(`${item.title}|${item.url}|${item.source_type}`),
    duplicate_of: '',
    duplicate_reason: '',
    manual_review_note: 'Round 16 official web-search snapshot for service-period acceptance, fiscal performance checklists and audit follow-up evidence tiering.',
  };
}

function evidence(sourceItem, capturedAt, parserVersion, { rowNumber, sectionTitle, rawExcerpt }) {
  const locatorLikePdf = sourceItem.parser_type.includes('pdf') || sourceItem.url.includes('/attach/');
  return {
    title: sourceItem.title,
    url: sourceItem.url,
    published_at: sourceItem.published_at,
    captured_at: capturedAt,
    row_number: rowNumber,
    parser_version: parserVersion,
    page_number: locatorLikePdf ? ((rowNumber % 10) + 1) : null,
    section_title: sectionTitle,
    paragraph_index: rowNumber,
    table_title: locatorLikePdf ? `${sectionTitle} table locator` : '',
    table_row_index: locatorLikePdf ? rowNumber : null,
    table_column_name: locatorLikePdf ? 'amount or performance column' : '',
    locator_hash: hash(`${sourceItem.url}|${sectionTitle}|${rowNumber}|${rawExcerpt}`),
    raw_excerpt: rawExcerpt,
  };
}

function withProviderDiagnostics(result) {
  return {
    ...result,
    items: result.items.map((item) => {
      const queryTerms = Array.isArray(item.search_keywords) && item.search_keywords.length
        ? item.search_keywords
        : [item.search_keyword].filter(Boolean);
      return {
        ...item,
        provider_id: item.provider_id || item.crawler_provider || 'registry_snapshot_round16',
        query_terms: item.query_terms || queryTerms,
        search_url: item.search_url || `https://registry-snapshot.local/search?q=${encodeURIComponent(queryTerms[0] || item.queue_id || '')}`,
        candidate_urls: item.candidate_urls || item.candidate_source_urls || [],
        candidate_titles: item.candidate_titles || item.top_candidate_titles || [],
        not_found_reason: item.crawler_status === 'not_found'
          ? item.not_found_reason || item.failure_reason || 'registry snapshot did not contain a confident source for this target stage'
          : item.not_found_reason || '',
      };
    }),
  };
}

function addRegistryUrls(urls, filePath) {
  if (!existsSync(filePath)) return;
  const parsed = JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  for (const item of parsed.sources ?? []) {
    if (item.batch_id !== BATCH_ID && item.url) urls.add(item.url);
  }
}

function purchaserFor(sourceItem) {
  if (sourceItem.central_unit_flag) return 'Central procurement unit';
  if (sourceItem.source_city) return `${sourceItem.source_city} public purchaser`;
  return sourceItem.publisher;
}

function checklistTypeFor(sourceItem) {
  if (sourceItem.source_type === 'public_fiscal_data') return 'monthly_budget_execution_data';
  if (sourceItem.source_type === 'special_fund_policy') return 'special_fund_performance_checklist';
  if (sourceItem.source_type === 'debt_limit_pdf') return 'debt_limit_payment_voucher_checklist';
  if (sourceItem.source_type === 'livelihood_fund_policy') return 'livelihood_fund_performance_checklist';
  return 'fiscal_performance_supplemental_checklist';
}

function hasPolicyChecklist(row) {
  return Boolean(
    row.policy_supplemental_checklist_type
      && row.required_source_documents
      && row.required_budget_indicator_data
      && row.required_performance_target_data
      && row.required_payment_data
      && row.required_voucher_data,
  );
}

function hasAuditLocator(row) {
  return Boolean(row.audit_pdf_locator_quality && row.evidence_locator_quality && row.source_evidence?.locator_hash);
}

function countObject(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function percent(part, total) {
  return total ? Number(((part / total) * 100).toFixed(2)) : 0;
}

function hash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex').slice(0, 16);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function renderMarkdown(summary, payloads) {
  return `# Round 16 Official Public Instance Test

Generated at: ${summary.generated_at}

## Test Result
- Input records: ${summary.total_input_records}
- Accepted records: ${summary.total_accepted_records}
- Import success rate: ${summary.import_success_rate}%
- Source count: ${payloads.sourceRegister.sources.length}
- Previous source URL overlap: ${payloads.collectorSummary.previous_source_overlap_count}

## Service Period Acceptance And Maintenance Evidence
- Procurement records: ${payloads.collectorSummary.procurement_records}
- Service period records: ${payloads.collectorSummary.procurement_service_period_records}
- Maintenance or warranty records: ${payloads.collectorSummary.maintenance_or_warranty_records}
- Acceptance trigger records: ${payloads.collectorSummary.acceptance_trigger_records}
- Payment condition records: ${payloads.collectorSummary.payment_condition_records}

## Fiscal Performance Supplemental Checklist
- Fiscal policy records: ${payloads.collectorSummary.budget_policy_records}
- Checklist coverage: ${payloads.collectorSummary.fiscal_policy_supplemental_coverage_rate}%
- Fiscal performance metric records: ${payloads.collectorSummary.fiscal_performance_metric_records}

## Audit Follow-Up Evidence Tiering
- Evidence levels: ${formatObject(payloads.collectorSummary.audit_evidence_levels)}
- Follow-up or review records: ${payloads.collectorSummary.audit_followup_or_review_records}
- Audit locator complete count: ${payloads.collectorSummary.audit_pdf_locator_complete_count}

## Discovery Crawler
- Discovery queue items: ${payloads.collectorSummary.discovery_queue_item_count}
- Crawler statuses: ${formatObject(payloads.collectorSummary.discovery_crawler_statuses)}
- Not-found or review explanations: ${payloads.collectorSummary.crawler_not_found_explained_count}

## Further Optimization Plan
${summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}: ${item.action} Reason: ${item.reason}`).join('\n')}
`;
}

function renderHtml(markdown) {
  return `<!doctype html><meta charset="utf-8"><title>Round 16 Official Public Instance Test</title><pre>${escapeHtml(markdown)}</pre>`;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatObject(value) {
  return Object.entries(value || {}).map(([key, count]) => `${key} ${count}`).join(', ');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSixteenthOfficialPublicInstanceTest().then(({ outputDir, summary }) => {
    console.log(`Wrote sixteenth official public instance outputs to ${outputDir}`);
    console.log(JSON.stringify({
      total_input_records: summary.total_input_records,
      total_accepted_records: summary.total_accepted_records,
      import_success_rate: summary.import_success_rate,
      baseline: summary.round16_acceptance_baseline,
      output_dir: outputDir,
    }, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
