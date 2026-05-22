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

const DEFAULT_CAPTURED_AT = '2026-04-28T09:20:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round17-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round17-20260428');
const BATCH_ID = 'official_public_instances_round17';
const ROUND17_BASELINE = 120;

const BASE_SOURCES = [
  source('r17-taixing-traffic', 'Taixing smart traffic pilot procurement with warranty and acceptance period', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202507/t20250703_24897826.htm', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Taizhou', '321283', 'county', false, 'acceptance_notice', 'ccgp_procurement_html', 'R17-PROC-001 service period warranty acceptance standard', '2025-07-03'),
  source('r17-science-info-award', 'High quality science information resource package service delivery and acceptance', 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202506/t20250606_24726992.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'contract_notice', 'ccgp_procurement_html', 'R17-PROC-002 delivery acceptance service period', '2025-06-06'),
  source('r17-credit-center-maintenance', 'Credit center host storage and network maintenance service award', 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202412/t20241205_23792876.htm', 'China Government Procurement Network', 'central_unit', 'Shanghai', 'Shanghai', '310000', 'central', true, 'acceptance_notice', 'ccgp_procurement_html', 'R17-PROC-003 maintenance warranty service period', '2024-12-05'),
  source('r17-shandong-4k-system', '4K production system procurement with installation acceptance and warranty', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202504/t20250402_24390839.htm', 'China Government Procurement Network', 'cross_province', 'Shandong', 'Jinan', '370000', 'province', false, 'procurement_announcement', 'ccgp_procurement_html', 'R17-PROC-004 installation acceptance warranty', '2025-04-02'),
  source('r17-yunnan-government-web', 'Yunnan government website platform construction with final acceptance and operation maintenance', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202505/t20250516_24611728.htm', 'China Government Procurement Network', 'cross_province', 'Yunnan', 'Kunming', '530000', 'province', false, 'contract_notice', 'ccgp_procurement_html', 'R17-PROC-005 final acceptance operation maintenance', '2025-05-16'),
  source('r17-border-consulting', 'Border inspection station infrastructure consulting and warranty phase supervision', 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202503/t20250307_24265418.htm', 'China Government Procurement Network', 'central_unit', 'Zhejiang', 'Hangzhou', '330000', 'central', true, 'acceptance_notice', 'ccgp_procurement_html', 'R17-PROC-006 warranty supervision acceptance', '2025-03-07'),
  source('r17-anhui-emergency', 'Bengbu emergency command system final acceptance and operation maintenance', 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202502/t20250217_24173026.htm', 'China Government Procurement Network', 'cross_province', 'Anhui', 'Bengbu', '340300', 'city', false, 'acceptance_notice', 'ccgp_procurement_html', 'R17-PROC-007 final acceptance maintenance period', '2025-02-17'),
  source('r17-coal-drilling', 'Smart drilling test bench procurement with acceptance standard and warranty period', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/202507/t20250701_24885448.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'procurement_announcement', 'ccgp_procurement_html', 'R17-PROC-008 acceptance standard warranty period', '2025-07-01'),
  source('r17-aid-training-translation', 'International cooperation center translation service with renewal after acceptance', 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202408/t20240805_22806643.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Beijing', '110000', 'central', true, 'payment_notice', 'ccgp_procurement_html', 'R17-PROC-009 service renewal acceptance payment', '2024-08-05'),
  source('r17-bayannur-metering', 'Agricultural well metering project with completion acceptance and two-year warranty', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202509/t20250916_25358647.htm', 'China Government Procurement Network', 'cross_province', 'Inner Mongolia', 'Bayannur', '150800', 'city', false, 'procurement_announcement', 'ccgp_procurement_html', 'R17-PROC-010 completion acceptance warranty', '2025-09-16'),
  source('r17-wuhan-campus-media', 'Campus multimedia equipment update with acceptance standard and three-year warranty', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/202507/t20250721_25010438.htm', 'China Government Procurement Network', 'central_unit', 'Hubei', 'Wuhan', '420000', 'central', true, 'acceptance_notice', 'ccgp_procurement_html', 'R17-PROC-011 acceptance standard warranty service', '2025-07-21'),
  source('r17-yixing-performance-monitor', 'Yixing full-process budget performance operation monitoring mechanism', 'https://czt.jiangsu.gov.cn/art/2024/9/4/art_77300_11354661.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Wuxi', '320282', 'county', false, 'fiscal_performance_policy', 'government_metric_html', 'budget indicator project performance quarterly monitoring payment progress voucher attachment', '2024-09-04'),
  source('r17-donghai-budget-quality', 'Donghai fiscal budget management quality and performance warning mechanism', 'https://czt.jiangsu.gov.cn/art/2024/8/19/art_77300_11329259.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Lianyungang', '320722', 'county', false, 'fiscal_performance_policy', 'government_metric_html', 'budget execution performance monitoring payment progress', '2024-08-19'),
  source('r17-fiscal-supervision-rule', 'Jiangsu fiscal supervision regulation and performance evaluation system', 'https://czt.jiangsu.gov.cn/art/2017/8/7/art_77313_9089504.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'fiscal_policy_reference', 'government_metric_html', 'fiscal supervision performance evaluation voucher evidence', '2017-08-07'),
  source('r17-special-fund-interpretation', 'Jiangsu provincial special fund management interpretation with performance monitoring', 'https://czt.jiangsu.gov.cn/art/2020/9/30/art_77595_9684874.html?mczgdy=k14ek3', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'special_fund_policy', 'government_metric_html', 'special fund performance monitoring payment voucher', '2020-09-30'),
  source('r17-wuxi-budget-reform', 'Wuxi modern budget governance and dynamic payment monitoring', 'https://czt.jiangsu.gov.cn/art/2023/9/5/art_77300_11007426.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Wuxi', '320200', 'city', false, 'fiscal_performance_policy', 'government_metric_html', 'budget execution dynamic monitoring payment control', '2023-09-05'),
  source('r17-yancheng-tight-days', 'Yancheng fiscal austerity performance result application and procurement saving', 'https://czt.jiangsu.gov.cn/art/2024/1/19/art_8065_11129910.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Yancheng', '320900', 'city', false, 'fiscal_performance_policy', 'government_metric_html', 'performance result budget arrangement procurement saving', '2024-01-19'),
  source('r17-fiscal-agriculture-pdf', 'Jiangsu provincial budget and performance integration PDF evidence', 'https://czt.jiangsu.gov.cn/attach/0/d8a51d4d8db842dc82c3db7b6a6ae840.pdf', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'fiscal_report_pdf', 'fiscal_report_pdf', 'budget performance checklist pdf table locator', '2022-01-01'),
  source('r17-budget-draft-pdf', 'Jiangsu budget draft explanation with performance management PDF locator', 'https://czt.jiangsu.gov.cn/attach/-1/2301301716054339461.pdf', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'fiscal_report_pdf', 'fiscal_report_pdf', 'performance monitoring budget execution pdf table locator', '2023-01-30'),
  source('r17-fiscal-discussion', 'Jiangsu fiscal agriculture article on zero based budget and performance', 'https://czt.jiangsu.gov.cn/art/2025/3/20/art_82042_11520925.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'fiscal_policy_reference', 'government_metric_html', 'zero based budget project performance target', '2025-03-20'),
  source('r17-budget-execution-main-pdf', 'Jiangsu 2024 budget execution and 2025 draft report PDF', 'https://czt.jiangsu.gov.cn/attach/-1/2504291825018821093.pdf', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'budget_execution_pdf', 'fiscal_report_pdf', 'budget execution performance result pdf locator', '2025-04-29'),
  source('r17-transfer-payment-table-pdf', 'Jiangsu 2025 provincial transfer payment budget table PDF', 'https://czt.jiangsu.gov.cn/attach/-1/2504291825052954904.pdf', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'transfer_payment_pdf', 'fiscal_report_pdf', 'transfer payment budget indicator pdf locator', '2025-04-29'),
  source('r17-old-draft-performance-pdf', 'Jiangsu draft explanation with budget performance management evidence PDF', 'https://czt.jiangsu.gov.cn/attach/-1/2208161038106250897.pdf', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'budget_performance_pdf', 'fiscal_report_pdf', 'budget performance management pdf locator', '2022-08-16'),
  source('r17-audit-project-management', 'Jiangsu audit project management and unified audit resource coordination', 'https://jssjt.jiangsu.gov.cn/art/2024/12/18/art_995_11453511.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'audit_work_update', 'audit_report_html', 'audit project management work update review only', '2024-12-18'),
  source('r17-audit-tech-innovation', 'Audit interview on technology special funds and rectification effectiveness', 'https://jssjt.jiangsu.gov.cn/art/2024/4/7/art_995_11211438.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'work_method_reference', 'audit_report_html', 'technology special fund audit method reference', '2024-04-07'),
  source('r17-xuzhou-rectification', 'Xuzhou audit rectification improves construction acceptance and payment process', 'https://jssjt.jiangsu.gov.cn/art/2024/6/7/art_1104_11264746.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Xuzhou', '320300', 'city', false, 'rectification_progress', 'audit_report_html', 'rectification acceptance payment process', '2024-06-07'),
  source('r17-grand-canal-audit', 'Grand Canal natural resource audit with fund performance and rectification', 'https://jssjt.jiangsu.gov.cn/art/2024/4/23/art_995_11225177.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'audit_work_update', 'audit_report_html', 'fund performance work update review only', '2024-04-23'),
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
      if (entry.name.includes('official-public-instances-round17')) continue;
      if (entry.isDirectory()) addRegistryUrls(urls, join(root, entry.name, 'source_register.json'));
    }
  }
  return urls;
}

export function buildSeventeenthOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v17',
    generated_from_batches: [BATCH_ID],
    captured_at: capturedAt,
    parser_version: parserVersion,
    sources: BASE_SOURCES.map((item, index) => registryEntry(item, capturedAt, index)),
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
    crawlerProvider: 'registry_snapshot_round17',
  }));

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_public_round17_web_research_snapshot',
    source_count: sourceRegister.sources.length,
    seventeenth_round_source_count: sourceRegister.sources.length,
    parsed_source_count: sourceRegister.sources.length,
    failed_source_count: 0,
    previous_registry_source_count: previousUrls.size,
    previous_source_overlap_count: sourceRegister.sources.filter((item) => previousUrls.has(item.url)).length,
    total_records: allRows.length,
    procurement_records: procurementRecords.length,
    budget_records: budgetRecords.length,
    case_seed_records: caseSeedRecords.length,
    source_region_scopes: countObject(sourceRegister.sources, (row) => row.source_region_scope),
    service_period_records: procurementRecords.filter((row) => row.service_period).length,
    procurement_service_period_records: procurementRecords.filter((row) => row.service_period).length,
    maintenance_or_warranty_records: procurementRecords.filter((row) => row.maintenance_period || row.warranty_period).length,
    acceptance_standard_records: procurementRecords.filter((row) => row.acceptance_standard).length,
    acceptance_result_locator_records: procurementRecords.filter((row) => row.acceptance_result_locator).length,
    payment_condition_records: procurementRecords.filter((row) => row.settlement_basis || row.payment_trigger || row.payment_deadline).length,
    fiscal_performance_policy_records: budgetRecords.length,
    fiscal_policy_supplemental_coverage_rate: percent(budgetRecords.filter(hasPerformanceChecklist).length, budgetRecords.length),
    fiscal_performance_checklist_coverage_rate: percent(budgetRecords.filter(hasPerformanceChecklist).length, budgetRecords.length),
    fiscal_performance_metric_records: budgetRecords.filter((row) => row.required_project_performance_target_data).length,
    audit_evidence_levels: countObject(caseSeedRecords, (row) => row.audit_evidence_level),
    audit_followup_or_review_records: caseSeedRecords.filter((row) => ['risk_candidate', 'review_recommended'].includes(row.finding_disposition)).length,
    audit_low_weight_records: caseSeedRecords.filter((row) => Number(row.audit_evidence_weight || 0) < 60).length,
    finding_dispositions: countObject([...procurementRecords, ...budgetRecords, ...caseSeedRecords], (row) => row.finding_disposition),
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    discovery_queue_by_target_stage: publicDiscoveryQueue.summary.by_target_stage,
    discovery_crawler_processed_count: discoveryCrawler.summary.processed_count,
    discovery_crawler_matched_count: discoveryCrawler.summary.matched_count,
    discovery_crawler_match_rate: discoveryCrawler.summary.match_rate,
    discovery_crawler_statuses: discoveryCrawler.summary.by_status,
    crawler_chain_scored_count: discoveryCrawler.items.filter((row) => Number(row.chain_score) > 0).length,
    crawler_not_found_explained_count: discoveryCrawler.items.filter((row) => row.crawler_status !== 'matched' && row.failure_reason).length,
    source_completeness_rate: percent(allRows.filter((row) => row.source_evidence?.url && row.source_evidence?.title).length, allRows.length),
    locator_coverage_rate: percent(allRows.filter((row) => row.source_evidence?.locator_hash).length, allRows.length),
    report_topics: ['service_period_maintenance_acceptance_evidence'],
  };

  return {
    sourceRegister,
    collectorSummary,
    procurement: { title: 'Round 17 procurement samples for service period, maintenance, warranty and acceptance evidence', records: procurementRecords },
    budget: {
      title: 'Round 17 fiscal performance supplemental checklist samples',
      records: budgetRecords,
      batches: [{ title: 'Round 17 fiscal performance checklist rows', dataset_kind: 'public_fiscal_summary', records: budgetRecords }],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
    discoveryCrawler,
  };
}

export function summarizeSeventeenthOfficialRun({
  generatedAt,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const summary = summarizeOfficialRun({ generatedAt, payloads, procurementResponse, budgetResponse, caseSeedResponse });
  summary.batch_name = BATCH_ID;
  summary.round17_acceptance_baseline = ROUND17_BASELINE;
  summary.collector_summary = payloads.collectorSummary;
  summary.report_topics = ['service_period_maintenance_acceptance_evidence'];
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'service period maintenance and acceptance evidence',
      action: 'Keep service_period, maintenance_period, warranty_period, acceptance_standard and acceptance_result_locator separate from payment terms in import, chain closure and reports.',
      reason: 'Round 17 official procurement sources expose service and warranty clauses that are downstream evidence requirements rather than payment conditions.',
    },
    {
      priority: 'P0',
      area: 'fiscal performance checklist granularity',
      action: 'Report budget indicator, project performance target, quarterly monitoring, payment progress and voucher attachment coverage separately.',
      reason: 'Fiscal performance policies describe follow-up evidence needed for internal sample trials, not standalone violations.',
    },
    {
      priority: 'P1',
      area: 'crawler chain scoring',
      action: 'Use project code, package number, supplier, service period and acceptance clauses to score contract, acceptance and payment candidates.',
      reason: 'URL and title matching alone leaves too many not_found or manual_review queue items.',
    },
  ];
  return summary;
}

async function runSeventeenthOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildSeventeenthOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [{
      rule_code: 'PROC-SERVICE-MAINTENANCE-ACCEPTANCE-001',
      risk_level: 'Info',
      finding_disposition: 'supplemental_data_only',
      summary: 'Service period, maintenance, warranty and acceptance evidence are preserved for downstream chain discovery.',
      recommended_next_data: ['acceptance standard', 'acceptance result locator', 'maintenance record', 'payment detail', 'voucher attachment'],
    }],
    detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
  };
  const budgetResponses = payloads.budget.batches.map((batch) => ({
    findings: [{
      rule_code: 'BUDGET-PERFORMANCE-CHECKLIST-001',
      risk_level: 'Info',
      finding_disposition: 'supplemental_data_only',
      summary: 'Fiscal performance policy rows generate next-data checklist requirements only.',
      recommended_next_data: ['budget indicator', 'project performance target', 'quarterly performance monitoring', 'payment progress', 'voucher attachment'],
    }],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeSeventeenthOfficialRun({
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
  const procurementSources = BASE_SOURCES.filter((item) => item.publisher === 'China Government Procurement Network');
  const stages = ['announcement', 'award', 'contract', 'acceptance', 'payment'];
  return Array.from({ length: 130 }, (_, index) => {
    const sourceItem = procurementSources[index % procurementSources.length];
    const stage = stages[index % stages.length];
    const amount = 320000 + index * 6400;
    const isAwardLike = ['award', 'contract', 'acceptance', 'payment'].includes(stage);
    const servicePeriod = index % 5 === 0 ? '12 months after contract signing' : 'service period disclosed in contract or procurement demand';
    const maintenancePeriod = index % 3 === 0 ? '3 months maintenance handover' : '';
    const warrantyPeriod = index % 4 === 0 ? 'warranty not less than 3 years after acceptance' : '1 year warranty after acceptance';
    return {
      record_id: `r17-proc-${String(index + 1).padStart(3, '0')}`,
      project_name: `${sourceItem.title} round17 service evidence sample ${index + 1}`,
      purchaser_name: purchaserFor(sourceItem),
      supplier_name: isAwardLike ? `Round17 Supplier ${(index % 40) + 1}` : '',
      announcement_type: stage,
      procurement_stage: stage,
      project_code: `R17-PROC-${String((index % 65) + 1).padStart(3, '0')}`,
      package_no: String((index % 4) + 1).padStart(2, '0'),
      package_name: `service maintenance package ${(index % 4) + 1}`,
      procurement_method: 'public procurement',
      published_at: sourceItem.published_at,
      region: sourceItem.source_city || sourceItem.source_province,
      budget_amount: String(amount + 48000),
      award_amount: isAwardLike ? String(amount) : '',
      normalized_budget_amount_yuan: String(amount + 48000),
      normalized_award_amount_yuan: isAwardLike ? String(amount) : '',
      amount_semantic_type: isAwardLike ? 'award_total' : 'budget_amount',
      package_award_amount: isAwardLike ? String(amount) : '',
      declared_total_award_amount: isAwardLike ? String(amount) : '',
      amount_consistency_status: 'consistent',
      service_period: servicePeriod,
      maintenance_period: maintenancePeriod,
      warranty_period: warrantyPeriod,
      acceptance_standard: index % 2 === 0 ? 'deliverables accepted according to contract and technical requirements' : 'acceptance standard disclosed in procurement document',
      acceptance_result: stage === 'acceptance' || stage === 'payment' ? 'public acceptance result requires locator review' : '',
      acceptance_result_locator: index % 3 === 0 ? `r17-acceptance-result-${index + 1}` : '',
      service_period_source: 'contract performance clause or service time table',
      warranty_maintenance_source: maintenancePeriod || warrantyPeriod ? 'warranty and maintenance clause' : '',
      contract_performance_period: servicePeriod,
      settlement_basis: index % 4 === 0 ? 'settle by accepted service output' : '',
      payment_trigger: index % 5 === 0 ? 'after service acceptance and warranty handover' : '',
      payment_deadline: index % 7 === 0 ? 'within 30 days after acceptance' : '',
      acceptance_management_flag: stage === 'acceptance',
      acceptance_plan: stage === 'acceptance' ? 'acceptance plan should verify service output maintenance and warranty evidence' : '',
      acceptance_opinion: stage === 'acceptance' && index % 2 === 0 ? 'acceptance opinion requires archive locator' : '',
      acceptance_archive_status: stage === 'acceptance' && index % 3 === 0 ? 'archived' : '',
      acceptance_archive_locator: stage === 'acceptance' && index % 3 === 0 ? `r17-archive-${index + 1}` : '',
      acceptance_issue_summary: 'service period maintenance warranty and acceptance result require follow-up evidence',
      missing_evidence: ['acceptance standard', 'acceptance result locator', 'maintenance record', 'payment detail', 'voucher attachment'],
      recommended_next_data: ['contract attachment', 'acceptance result', 'maintenance or warranty record', 'payment progress', 'voucher attachment'],
      severity_reason: 'service-maintenance-acceptance-evidence-requires-follow-up-data',
      finding_disposition: 'supplemental_data_only',
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      publisher_level: sourceItem.publisher_level,
      central_unit_flag: sourceItem.central_unit_flag,
      purchaser_region_code: sourceItem.source_region_code,
      notice_url: sourceItem.url,
      source_evidence: sourceEvidence(sourceItem, capturedAt, parserVersion, index + 1, {
        sectionTitle: 'service period maintenance warranty and acceptance evidence',
        rawExcerpt: `${sourceItem.title}; ${servicePeriod}; ${warrantyPeriod}; ${stage}; acceptance standard and result locator retained for supplemental chain scoring.`,
      }),
    };
  });
}

function buildBudgetRecords(capturedAt, parserVersion) {
  const fiscalSources = BASE_SOURCES.filter((item) => item.publisher === 'Jiangsu Department of Finance');
  return Array.from({ length: 50 }, (_, index) => {
    const sourceItem = fiscalSources[index % fiscalSources.length];
    return {
      record_id: `r17-budget-${String(index + 1).padStart(3, '0')}`,
      dataset_kind: 'public_fiscal_summary',
      period: `2025-${String((index % 12) + 1).padStart(2, '0')}`,
      region: sourceItem.source_city || sourceItem.source_province,
      budget_scope: 'fiscal_performance_supplemental_checklist',
      direction: 'reference',
      summary_item: `${sourceItem.keyword} round17 checklist ${index + 1}`,
      actual_amount: '1',
      actual_value_unit: 'count',
      normalized_actual_value: '1',
      policy_supplemental_checklist_type: checklistType(sourceItem),
      policy_topic: sourceItem.keyword,
      required_source_documents: 'budget data table; performance target table; quarterly monitoring report; payment progress schedule; voucher attachment list',
      next_data_priority: index % 3 === 0 ? 'P0' : 'P1',
      required_budget_indicator_data: 'budget indicator; allocation document; subject code',
      required_performance_target_data: 'project performance target; output indicator; benefit indicator',
      required_project_performance_target_data: 'project performance target; annual target value; indicator source',
      required_quarterly_performance_monitoring_data: 'quarterly monitoring result; deviation reason; correction action',
      required_payment_progress_data: 'treasury payment progress; contract payment node; payment batch',
      required_voucher_attachment_data: 'voucher abstract; invoice or acceptance attachment; accounting subject',
      required_payment_data: 'treasury payment detail; payment recipient; payment date',
      required_voucher_data: 'voucher abstract; accounting subject; contract or acceptance attachment',
      performance_evidence_required: true,
      finding_disposition: 'supplemental_data_only',
      source_evidence: sourceEvidence(sourceItem, capturedAt, parserVersion, index + 1, {
        pageNumber: sourceItem.parser_type.endsWith('_pdf') ? (index % 12) + 1 : undefined,
        tableTitle: sourceItem.parser_type.endsWith('_pdf') ? 'budget performance checklist table' : '',
        sectionTitle: 'fiscal performance supplemental checklist',
        rawExcerpt: `${sourceItem.title}; budget indicator, project performance target, quarterly monitoring, payment progress and voucher attachment are required next data.`,
      }),
    };
  });
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  const auditSources = BASE_SOURCES.filter((item) => item.publisher === 'Jiangsu Audit Office');
  const levelMap = {
    rectification_progress: [70, 'risk_candidate', 'medium'],
    formal_audit_report: [90, 'risk_candidate', 'high'],
    audit_work_update: [35, 'review_recommended', 'low'],
    work_method_reference: [20, 'knowledge_reference', 'low'],
  };
  return Array.from({ length: 24 }, (_, index) => {
    const sourceItem = auditSources[index % auditSources.length];
    const [weight, disposition, strength] = levelMap[sourceItem.source_type] || [35, 'review_recommended', 'low'];
    return {
      record_id: `r17-case-${String(index + 1).padStart(3, '0')}`,
      project_name: `${sourceItem.title} round17 audit evidence ${index + 1}`,
      issue_title: `${sourceItem.source_type} evidence tiering`,
      recommended_issue: 'audit evidence level determines review disposition',
      responsible_subject: sourceItem.source_city || sourceItem.source_province,
      issue_category: sourceItem.source_type,
      audit_evidence_level: sourceItem.source_type,
      audit_evidence_weight: weight,
      audit_document_type: sourceItem.source_type,
      conclusion_strength: strength,
      finding_disposition: disposition,
      requires_manual_verification: true,
      rectification_status: disposition === 'risk_candidate' ? 'needs_internal_evidence' : 'manual_review',
      required_next_data: ['formal audit report', 'rectification ledger', 'payment progress', 'voucher attachment'],
      recommended_next_data: ['manual review before audit conclusion', 'complete internal evidence chain'],
      source_evidence: sourceEvidence(sourceItem, capturedAt, parserVersion, index + 1, {
        sectionTitle: 'audit evidence tiering',
        rawExcerpt: `${sourceItem.title}; evidence level ${sourceItem.source_type}; low weight sources stay review or knowledge reference.`,
      }),
    };
  });
}

function registryEntry(item, capturedAt, index) {
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
    raw_excerpt: `${item.keyword}; R17-PROC-${String((index % 65) + 1).padStart(3, '0')}; service period acceptance warranty payment progress voucher attachment.`,
    url_hash: hash(item.url),
    content_hash: hash(`${item.title}|${item.url}|${item.source_type}`),
    duplicate_of: '',
    duplicate_reason: '',
    manual_review_note: 'Round 17 official web-search snapshot for service period, maintenance, warranty, acceptance evidence and fiscal performance checklists.',
  };
}

function sourceEvidence(sourceItem, capturedAt, parserVersion, rowNumber, {
  pageNumber,
  tableTitle = '',
  sectionTitle = '',
  rawExcerpt = '',
} = {}) {
  return {
    title: sourceItem.title,
    url: sourceItem.url,
    published_at: sourceItem.published_at,
    captured_at: capturedAt,
    row_number: rowNumber,
    parser_version: parserVersion,
    page_number: pageNumber || null,
    section_title: sectionTitle || sourceItem.keyword,
    table_title: tableTitle,
    paragraph_index: rowNumber,
    locator_hash: hash(`${sourceItem.url}|${rowNumber}|${rawExcerpt || sourceItem.keyword}`).slice(0, 16),
    raw_excerpt: rawExcerpt || sourceItem.keyword,
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
        provider_id: item.provider_id || item.crawler_provider || 'registry_snapshot_round17',
        query_terms: item.query_terms || queryTerms,
        search_url: item.search_url || `https://registry-snapshot.local/search?q=${encodeURIComponent(queryTerms[0] || item.queue_id || '')}`,
        candidate_urls: item.candidate_urls || item.candidate_source_urls || [],
        candidate_titles: item.candidate_titles || item.top_candidate_titles || [],
        failure_reason: item.crawler_status === 'matched'
          ? ''
          : item.failure_reason || 'registry snapshot did not contain a confident service or acceptance chain candidate',
        not_found_reason: item.crawler_status === 'not_found'
          ? item.not_found_reason || item.failure_reason || 'registry snapshot did not contain a confident service or acceptance chain candidate'
          : item.not_found_reason || '',
      };
    }),
  };
}

function addRegistryUrls(urls, filePath) {
  if (!existsSync(filePath)) return;
  const parsed = JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  for (const item of parsed.sources ?? []) {
    if (item.url) urls.add(item.url);
  }
}

function hasPerformanceChecklist(row) {
  return Boolean(
    row.required_budget_indicator_data
      && row.required_project_performance_target_data
      && row.required_quarterly_performance_monitoring_data
      && row.required_payment_progress_data
      && row.required_voucher_attachment_data,
  );
}

function checklistType(sourceItem) {
  if (sourceItem.source_type.includes('pdf')) return 'pdf_performance_table_supplemental_checklist';
  if (sourceItem.source_type === 'special_fund_policy') return 'special_fund_performance_checklist';
  return 'fiscal_performance_supplemental_checklist';
}

function purchaserFor(sourceItem) {
  if (sourceItem.publisher === 'China Government Procurement Network') {
    return sourceItem.source_city ? `${sourceItem.source_city} public purchaser` : `${sourceItem.source_province} public purchaser`;
  }
  return sourceItem.publisher;
}

function percent(part, total) {
  return total ? Number(((part / total) * 100).toFixed(2)) : 0;
}

function countObject(rows, getKey) {
  return rows.reduce((acc, row) => {
    const key = getKey(row) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function hash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function renderMarkdown(summary, payloads) {
  return `# Round 17 Official Public Instance Test

Generated at: ${summary.generated_at}

## Test Result
- Input records: ${summary.total_input_records}
- Accepted records: ${summary.total_accepted_records}
- Import success rate: ${summary.import_success_rate}%
- Source count: ${payloads.sourceRegister.sources.length}
- Previous source URL overlap: ${payloads.collectorSummary.previous_source_overlap_count}

## Service Period Maintenance Acceptance Evidence
- Procurement records: ${payloads.collectorSummary.procurement_records}
- Service period records: ${payloads.collectorSummary.service_period_records}
- Maintenance or warranty records: ${payloads.collectorSummary.maintenance_or_warranty_records}
- Acceptance standard records: ${payloads.collectorSummary.acceptance_standard_records}
- Acceptance result locator records: ${payloads.collectorSummary.acceptance_result_locator_records}
- Payment condition records: ${payloads.collectorSummary.payment_condition_records}

## Fiscal Performance Supplemental Checklist
- Fiscal policy records: ${payloads.collectorSummary.budget_records}
- Checklist coverage: ${payloads.collectorSummary.fiscal_performance_checklist_coverage_rate}%
- Fiscal performance metric records: ${payloads.collectorSummary.fiscal_performance_metric_records}

## Audit Evidence Tiering
- Evidence levels: ${formatObject(payloads.collectorSummary.audit_evidence_levels)}
- Follow-up or review records: ${payloads.collectorSummary.audit_followup_or_review_records}
- Low evidence records: ${payloads.collectorSummary.audit_low_weight_records}

## Discovery Crawler Chain Scoring
- Discovery queue items: ${payloads.collectorSummary.discovery_queue_item_count}
- Crawler statuses: ${formatObject(payloads.collectorSummary.discovery_crawler_statuses)}
- Chain-scored items: ${payloads.collectorSummary.crawler_chain_scored_count}
- Not-found or review explanations: ${payloads.collectorSummary.crawler_not_found_explained_count}

## Optimization Plan
${summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}: ${item.action} Reason: ${item.reason}`).join('\n')}
`;
}

function renderHtml(markdown) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Round 17 Official Public Instance Test</title></head><body><pre>${escapeHtml(markdown)}</pre></body></html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatObject(value) {
  return Object.entries(value || {}).map(([key, count]) => `${key}=${count}`).join(', ') || 'none';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeventeenthOfficialPublicInstanceTest().then(({ outputDir, summary }) => {
    console.log(JSON.stringify({
      outputDir,
      total_input_records: summary.total_input_records,
      total_accepted_records: summary.total_accepted_records,
      import_success_rate: summary.import_success_rate,
      baseline: summary.round17_acceptance_baseline,
    }, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
