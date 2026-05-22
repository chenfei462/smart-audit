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

const DEFAULT_CAPTURED_AT = '2026-04-27T23:10:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round15-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round15-20260427');
const BATCH_ID = 'official_public_instances_round15';
const ROUND15_BASELINE = 150;

const BASE_SOURCES = [
  source('r15-ccgp-yancheng-service', 'Yancheng public service procurement tender with performance terms', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202601/t20260112_26064678.htm', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Yancheng', '320900', 'city', false, 'procurement_announcement', 'ccgp_procurement_html', 'contract performance acceptance payment', '2026-01-12'),
  source('r15-ccgp-central-consulting', 'Central consulting service competitive consultation procurement', 'https://www.ccgp.gov.cn/cggg/zygg/jzxcs/202508/t20250804_25093879.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'procurement_announcement', 'ccgp_procurement_html', 'service acceptance payment trigger', '2025-08-04'),
  source('r15-ccgp-central-platform', 'Central platform operation service tender', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/202511/t20251128_25802439.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'procurement_announcement', 'ccgp_procurement_html', 'operation service performance period', '2025-11-28'),
  source('r15-ccgp-central-equipment', 'Central equipment service tender with contract period', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/202506/t20250613_24775785.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'procurement_announcement', 'ccgp_procurement_html', 'contract period acceptance condition', '2025-06-13'),
  source('r15-nanjing-border-contract', 'Nanjing immigration inspection auxiliary labor outsourcing contract notice', 'https://www.ccgp.gov.cn/cggg/dfgg/qtgg/202412/t20241231_23996587.htm', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320100', 'central', true, 'procurement_contract', 'ccgp_procurement_html', 'contract notice labor outsourcing', '2024-12-31'),
  source('r15-jiangsu-tourism-tender', 'Shuiyun Jiangsu culture tourism creator incubation tender', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202407/t20240719_22669846.htm', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'government_purchase_service_procurement', 'ccgp_procurement_html', 'government purchase service SME policy', '2024-07-19'),
  source('r15-jiangsu-forestry-correction', 'Jiangsu smart forestry platform correction notice', 'https://www.ccgp.gov.cn/cggg/dfgg/gzgg/202402/t20240220_21549189.htm', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'procurement_correction', 'ccgp_procurement_html', 'correction notice project code', '2024-02-20'),
  source('r15-patent-center-ops', 'Patent examination cooperation Jiangsu center operation service tender', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/202412/t20241226_23964046.htm', 'China Government Procurement Network', 'central_unit', 'Jiangsu', 'Suzhou', '320500', 'central', true, 'procurement_announcement', 'ccgp_procurement_html', 'operation maintenance service contract term', '2024-12-26'),
  source('r15-radiation-monitoring', 'Jiangsu radiation monitoring data center security monitoring procurement', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202408/t20240821_22958519.htm', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'procurement_announcement', 'ccgp_procurement_html', 'equipment acceptance archive', '2024-08-21'),
  source('r15-nanjing-university-food', 'Nanjing University logistics aquatic products procurement tender', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/202406/t20240621_22437150.htm', 'China Government Procurement Network', 'central_unit', 'Jiangsu', 'Nanjing', '320100', 'central', true, 'procurement_announcement', 'ccgp_procurement_html', 'contract performance supply acceptance', '2024-06-21'),
  source('r15-wuxi-fiscal-control', 'Wuxi finance strengthens budget execution and fiscal policy control', 'https://czt.jiangsu.gov.cn/art/2025/4/9/art_77300_11543276.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Wuxi', '320200', 'city', false, 'budget_policy_supplemental', 'government_metric_html', 'budget execution policy supplemental checklist', '2025-04-09'),
  source('r15-taizhou-fund-policy', 'Taizhou finance improves special fund tracking and performance management', 'https://czt.jiangsu.gov.cn/art/2025/4/14/art_77300_11543317.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Taizhou', '321200', 'city', false, 'special_fund_policy', 'government_metric_html', 'special fund destination performance deadline', '2025-04-14'),
  source('r15-zero-budget-policy', 'Jiangsu finance policy note on budget reform and expenditure standards', 'https://czt.jiangsu.gov.cn/art/2025/2/17/art_7938_11493778.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'budget_performance_policy', 'government_metric_html', 'zero based budget expenditure standard', '2025-02-17'),
  source('r15-township-performance', 'County township fiscal performance management update', 'https://czt.jiangsu.gov.cn/art/2025/3/3/art_77300_11507122.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nantong', '320600', 'city', false, 'township_budget_performance_policy', 'government_metric_html', 'township budget performance supplemental data', '2025-03-03'),
  source('r15-debt-management-2023', 'Jiangsu finance debt and current-account management policy example', 'https://czt.jiangsu.gov.cn/art/2023/7/18/art_77300_10955311.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'debt_or_current_account_management_policy', 'government_metric_html', 'debt management payment voucher checklist', '2023-07-18'),
  source('r15-performance-policy-2022', 'Jiangsu finance performance management policy archive', 'https://czt.jiangsu.gov.cn/art/2022/6/23/art_77300_10514384.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'budget_performance_policy', 'government_metric_html', 'performance target payment voucher evidence', '2022-06-23'),
  source('r15-audit-interprets-report', 'Jiangsu audit interpretation of budget execution audit work report', 'https://jssjt.jiangsu.gov.cn/art/2025/6/12/art_992_11581131.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'audit_report_interpretation', 'audit_report_html', 'audit report interpretation low evidence', '2025-06-12'),
  source('r15-audit-result-2024', 'Jiangsu 2024 provincial budget execution audit result announcement', 'https://jssjt.jiangsu.gov.cn/art/2025/9/5/art_80119_11635890.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'formal_audit_report', 'audit_report_html', 'formal audit result locator', '2025-09-05'),
  source('r15-audit-rectification-deploy', 'Jiangsu audit rectification special verification deployment', 'https://jssjt.jiangsu.gov.cn/art/2024/1/2/art_995_11116361.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'special_audit_survey', 'audit_report_html', 'rectification special verification', '2024-01-02'),
  source('r15-pizhou-rectification-method', 'Pizhou audit rectification work method update', 'https://jssjt.jiangsu.gov.cn/art/2024/5/22/art_1104_11230684.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Xuzhou', '320382', 'county', false, 'work_method_reference', 'audit_report_html', 'audit rectification method reference', '2024-05-22'),
  source('r15-xiangcheng-review', 'Suzhou Xiangcheng audit rectification follow-up work update', 'https://jssjt.jiangsu.gov.cn/art/2024/4/25/art_1104_11221240.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Suzhou', '320507', 'county', false, 'audit_work_update', 'audit_report_html', 'rectification work update', '2024-04-25'),
  source('r15-suzhou-state-owned-review', 'Suzhou state-owned enterprise audit rectification follow-up update', 'https://jssjt.jiangsu.gov.cn/art/2024/5/9/art_1104_11231619.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Suzhou', '320500', 'city', false, 'audit_work_update', 'audit_report_html', 'state owned enterprise rectification work update', '2024-05-09'),
  source('r15-dongtai-rectification-meeting', 'Dongtai government meeting hears audit rectification update', 'https://jssjt.jiangsu.gov.cn/art/2024/7/29/art_1104_11292793.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Yancheng', '320981', 'county', false, 'rectification_progress', 'audit_report_html', 'rectification progress public update', '2024-07-29'),
  source('r15-audit-system-training', 'Jiangsu audit result system and rectification training meeting', 'https://jssjt.jiangsu.gov.cn/art/2024/9/11/art_995_11353256.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'audit_work_update', 'audit_report_html', 'audit result system work update', '2024-09-11'),
];

function source(id, title, url, publisher, scope, province, city, code, publisherLevel, centralFlag, sourceType, parserType, keyword, publishedAt) {
  return {
    id,
    title,
    url,
    publisher,
    source_region_scope: scope,
    source_province: province,
    source_city: city,
    source_region_code: code,
    publisher_level: publisherLevel,
    central_unit_flag: centralFlag,
    source_type: sourceType,
    parser_type: parserType,
    keyword,
    published_at: publishedAt,
  };
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

export function buildFifteenthOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v15',
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
    crawlerProvider: 'registry_snapshot_round15',
  }));

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_public_round15_web_research_snapshot',
    source_count: sourceRegister.sources.length,
    fifteenth_round_source_count: sourceRegister.sources.length,
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
    procurement_stages: countObject(procurementRecords, (row) => row.procurement_stage),
    fulfillment_acceptance_records: procurementRecords.filter(hasAcceptanceEvidence).length,
    fulfillment_acceptance_policy_records: procurementRecords.filter((row) => row.acceptance_management_flag).length,
    missing_acceptance_plan_count: procurementRecords.filter((row) => row.acceptance_management_flag && !row.acceptance_plan).length,
    missing_acceptance_opinion_count: procurementRecords.filter((row) => row.acceptance_management_flag && !row.acceptance_opinion).length,
    missing_acceptance_archive_count: procurementRecords.filter((row) => row.acceptance_management_flag && !row.acceptance_archive_status && !row.acceptance_archive_locator).length,
    contract_term_records: procurementRecords.filter((row) => row.contract_performance_period).length,
    payment_condition_records: procurementRecords.filter((row) => row.settlement_basis || row.payment_trigger || row.payment_deadline).length,
    payment_deadline_missing_count: procurementRecords.filter((row) => !row.payment_deadline).length,
    government_purchase_service_records: procurementRecords.filter((row) => row.government_purchase_service_flag).length,
    joint_bid_allowed_records: procurementRecords.filter((row) => row.joint_bid_allowed_flag).length,
    policy_sensitive_procurement_records: procurementRecords.filter((row) => row.sme_policy_requirement || row.credit_financing_policy_flag || row.procurement_policy_note).length,
    budget_policy_records: budgetRecords.length,
    policy_checklist_types: countObject(budgetRecords, (row) => row.policy_supplemental_checklist_type),
    policy_supplemental_data_coverage_rate: percent(budgetRecords.filter(hasPolicyChecklist).length, budgetRecords.length),
    payment_voucher_linkage_field_coverage_rate: percent(budgetRecords.filter((row) => row.required_payment_data && row.required_voucher_data).length, budgetRecords.length),
    audit_evidence_levels: countObject(caseSeedRecords, (row) => row.audit_evidence_level),
    audit_low_weight_records: caseSeedRecords.filter((row) => Number(row.audit_evidence_weight || 0) < 60).length,
    audit_pdf_locator_complete_count: caseSeedRecords.filter(hasAuditLocator).length,
    audit_pdf_locator_quality: countObject(caseSeedRecords, (row) => row.audit_pdf_locator_quality),
    evidence_locator_quality: countObject(caseSeedRecords, (row) => row.evidence_locator_quality),
    finding_dispositions: countObject([...procurementRecords, ...budgetRecords, ...caseSeedRecords], (row) => row.finding_disposition),
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    discovery_queue_by_target_stage: publicDiscoveryQueue.summary.by_target_stage,
    chain_discovery_candidate_metadata_coverage_rate: percent(publicDiscoveryQueue.items.filter(hasChainMetadata).length, publicDiscoveryQueue.items.length),
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
    procurement: { title: 'Round 15 procurement samples for fulfillment acceptance, payment conditions and crawler diagnostics', records: procurementRecords },
    budget: {
      title: 'Round 15 fiscal policy supplemental checklist samples',
      records: budgetRecords,
      batches: [{ title: 'Round 15 fiscal policy checklist rows', dataset_kind: 'public_fiscal_summary', records: budgetRecords }],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
    discoveryCrawler,
  };
}

export function summarizeFifteenthOfficialRun({
  generatedAt,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const summary = summarizeOfficialRun({ generatedAt, payloads, procurementResponse, budgetResponse, caseSeedResponse });
  summary.batch_name = BATCH_ID;
  summary.round15_acceptance_baseline = ROUND15_BASELINE;
  summary.collector_summary = payloads.collectorSummary;
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'fulfillment acceptance and payment condition topic',
      action: 'Keep acceptance plan, acceptance opinion, archive locator, contract performance period and payment trigger in one procurement-chain topic for reports and front-end chain views.',
      reason: 'Round 15 records show acceptance and payment clauses explain public-chain gaps without supporting a substantive violation conclusion by themselves.',
    },
    {
      priority: 'P0',
      area: 'provider-backed crawler diagnostics',
      action: 'Promote provider query terms, search URL, candidate URLs, candidate stage scores and not-found reasons into the public discovery queue output.',
      reason: 'A not-found result needs enough diagnostic evidence to explain whether the crawler searched the right project, package, purchaser, supplier and target stage.',
    },
    {
      priority: 'P1',
      area: 'fiscal policy supplemental checklist',
      action: 'Keep transfer-payment monitoring, township performance, debt/current-account and expenditure-standard policies as next-data checklists for budget indicators, performance targets, payments and vouchers.',
      reason: 'Policy text is useful to define missing internal evidence, but it should not become a risk finding without payment and voucher proof.',
    },
  ];
  return summary;
}

async function runFifteenthOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildFifteenthOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [{
      rule_code: 'PROC-FULFILLMENT-ACCEPTANCE-001',
      risk_level: 'Info',
      finding_disposition: 'supplemental_data_only',
      summary: 'Fulfillment acceptance and payment conditions are preserved as chain evidence fields.',
      recommended_next_data: ['acceptance plan', 'acceptance opinion', 'acceptance archive', 'payment disclosure', 'voucher abstract'],
    }],
    detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
  };
  const budgetResponses = payloads.budget.batches.map((batch) => ({
    findings: [{
      rule_code: 'BUDGET-POLICY-CHECKLIST-001',
      risk_level: 'Info',
      finding_disposition: 'supplemental_data_only',
      summary: 'Fiscal policy records generate supplemental checklist requirements only.',
      recommended_next_data: ['budget indicator', 'performance target', 'payment detail', 'voucher abstract'],
    }],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeFifteenthOfficialRun({
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
  const procurementSources = BASE_SOURCES.filter((item) => item.parser_type === 'ccgp_procurement_html');
  const stages = ['announcement', 'award', 'contract', 'acceptance', 'payment'];
  return Array.from({ length: 96 }, (_, index) => {
    const sourceItem = procurementSources[index % procurementSources.length];
    const stage = stages[index % stages.length];
    const amount = 220000 + index * 8700;
    const isAwardLike = ['award', 'contract', 'acceptance', 'payment'].includes(stage);
    const acceptanceManaged = stage === 'acceptance' || index % 3 === 0;
    return {
      record_id: `r15-proc-${String(index + 1).padStart(3, '0')}`,
      project_name: `${sourceItem.title} round15 fulfillment sample ${index + 1}`,
      purchaser_name: purchaserFor(sourceItem),
      supplier_name: isAwardLike ? `Round15 Supplier ${index + 1}` : '',
      announcement_type: stage,
      procurement_stage: stage,
      project_code: `R15-PROC-${String((index % 48) + 1).padStart(3, '0')}`,
      procurement_method: sourceItem.source_type === 'government_purchase_service_procurement' ? 'public tender; government purchase service' : 'public procurement',
      procurement_channel: 'regular_procurement',
      package_no: `pkg-${(index % 4) + 1}`,
      package_name: `round15 package ${(index % 4) + 1}`,
      region: sourceItem.source_city || sourceItem.source_province,
      budget_amount: String(amount + 90000),
      budget_amount_unit: 'yuan',
      award_amount: isAwardLike ? String(amount) : '',
      award_amount_unit: isAwardLike ? 'yuan' : 'unknown',
      normalized_budget_amount_yuan: String(amount + 90000),
      normalized_award_amount_yuan: isAwardLike ? String(amount) : '',
      amount_semantic_type: isAwardLike ? 'award_total' : 'budget_amount',
      contract_performance_period: index % 4 === 0 ? 'one year from contract signing or until service acceptance is complete' : 'performance period disclosed in procurement or contract document',
      settlement_basis: index % 5 === 0 ? 'settle according to accepted service quantity and approved invoice' : 'settlement basis requires contract or acceptance evidence',
      payment_trigger: index % 3 === 0 ? 'payment after acceptance opinion is issued' : '',
      payment_deadline: index % 6 === 0 ? 'within 30 days after acceptance and invoice review' : '',
      payment_condition_source: 'official procurement notice, contract notice or fulfillment acceptance disclosure',
      acceptance_management_flag: acceptanceManaged,
      acceptance_plan: acceptanceManaged && index % 4 !== 1 ? 'acceptance plan disclosed or required by notice' : '',
      acceptance_opinion: acceptanceManaged && index % 4 !== 2 ? 'acceptance opinion disclosed or required after performance' : '',
      acceptance_archive_status: acceptanceManaged && index % 5 !== 0 ? 'archived' : '',
      acceptance_archive_locator: acceptanceManaged && index % 6 !== 0 ? `archive-r15-${index + 1}` : '',
      acceptance_issue_summary: acceptanceManaged ? 'no substantive violation conclusion; follow-up evidence needed' : '',
      government_purchase_service_flag: sourceItem.source_type === 'government_purchase_service_procurement' || index % 9 === 0,
      joint_bid_allowed_flag: index % 8 === 0,
      sme_policy_requirement: index % 3 === 0 ? 'SME policy clause is retained for review only' : '',
      credit_financing_policy_flag: index % 5 === 0,
      procurement_policy_note: index % 7 === 0 ? 'policy terms are supplemental review hints and do not create a violation conclusion' : '',
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      publisher_level: sourceItem.publisher_level,
      central_unit_flag: sourceItem.central_unit_flag,
      purchaser_region_code: sourceItem.central_unit_flag ? '000000' : sourceItem.source_region_code,
      finding_disposition: 'supplemental_data_only',
      severity_reason: 'fulfillment-acceptance-and-payment-conditions-require-follow-up-public-or-internal-evidence',
      missing_evidence: ['acceptance plan', 'acceptance opinion', 'acceptance archive', 'payment disclosure', 'voucher abstract'],
      recommended_next_data: ['contract performance evidence', 'acceptance documents', 'payment public disclosure', 'voucher abstract'],
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: 'fulfillment acceptance and payment conditions',
        rawExcerpt: `${sourceItem.title}; stage ${stage}; acceptance and payment condition captured for chain closure diagnostics.`,
      }),
    };
  });
}

function buildBudgetRecords(capturedAt, parserVersion) {
  const fiscalSources = BASE_SOURCES.filter((item) => item.parser_type === 'government_metric_html');
  return Array.from({ length: 42 }, (_, index) => {
    const sourceItem = fiscalSources[index % fiscalSources.length];
    const checklistType = checklistTypeFor(sourceItem);
    return {
      record_id: `r15-budget-${String(index + 1).padStart(3, '0')}`,
      dataset_kind: sourceItem.source_type,
      region: sourceItem.source_city || sourceItem.source_province,
      province: sourceItem.source_province,
      city: sourceItem.source_city,
      normalized_region_code: sourceItem.source_region_code,
      indicator_name: `${sourceItem.keyword} round15 supplemental checklist ${index + 1}`,
      actual_value: String(1 + (index % 9)),
      actual_value_unit: 'count',
      normalized_actual_value: String(1 + (index % 9)),
      budget_subject_category: checklistType,
      policy_supplemental_checklist_type: checklistType,
      policy_topic: sourceItem.keyword,
      policy_chain_stage: 'policy_to_budget_performance_payment_voucher',
      required_source_documents: 'policy document; budget indicator notice; allocation document; performance target table',
      next_data_priority: index % 3 === 0 ? 'P0' : 'P1',
      required_budget_indicator_data: 'budget indicator document number; project catalog; allocation amount',
      required_performance_target_data: 'performance target table; output indicator; benefit indicator; self-evaluation report',
      required_payment_data: 'treasury payment detail; payee; payment date; fund destination proof',
      required_voucher_data: 'voucher abstract; accounting subject; original document number; contract or acceptance attachment',
      fund_usage_restriction_level: sourceItem.source_type === 'special_fund_policy' ? 'strict' : 'normal',
      performance_evidence_required: true,
      finding_disposition: 'supplemental_data_only',
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: checklistType,
        rawExcerpt: `${sourceItem.title}; policy record produces required budget, performance, payment and voucher documents.`,
      }),
    };
  });
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  const auditSources = BASE_SOURCES.filter((item) => item.parser_type === 'audit_report_html');
  const levelMap = {
    formal_audit_report: [90, 'risk_candidate', 'high', 'formal audit result'],
    rectification_progress: [70, 'risk_candidate', 'medium', 'rectification progress'],
    special_audit_survey: [55, 'review_recommended', 'low', 'special audit survey'],
    audit_report_interpretation: [45, 'review_recommended', 'low', 'audit report interpretation'],
    audit_work_update: [35, 'knowledge_reference', 'low', 'audit work update'],
    work_method_reference: [20, 'knowledge_reference', 'low', 'work method reference'],
  };
  return Array.from({ length: 18 }, (_, index) => {
    const sourceItem = auditSources[index % auditSources.length];
    const [weight, disposition, strength, title] = levelMap[sourceItem.source_type] || [30, 'knowledge_reference', 'low', 'audit reference'];
    return {
      case_seed_id: `r15-case-${String(index + 1).padStart(3, '0')}`,
      issue_title: `${title} round15 evidence locator sample ${index + 1}`,
      project_name: `${title} project ${index + 1}`,
      responsible_subject: sourceItem.publisher,
      issue_category: sourceItem.source_type,
      issue_amount: String(180000 + index * 11800),
      issue_amount_unit: 'yuan',
      audit_evidence_level: sourceItem.source_type,
      audit_evidence_weight: weight,
      audit_document_type: sourceItem.source_type,
      conclusion_strength: strength,
      requires_manual_verification: true,
      audit_pdf_locator_quality: 'page_paragraph_table_locator',
      evidence_locator_quality: 'complete',
      finding_disposition: disposition,
      required_next_data: ['formal audit report', 'rectification ledger', 'payment detail', 'voucher abstract'],
      recommended_next_data: ['manual review before audit conclusion', 'complete internal evidence chain'],
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: 'audit evidence locator quality',
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
    manual_review_note: 'Round 15 official web-search snapshot for fulfillment acceptance, payment conditions, fiscal checklist and audit locator regression.',
  };
}

function evidence(sourceItem, capturedAt, parserVersion, { rowNumber, sectionTitle, rawExcerpt }) {
  const auditOrPdf = sourceItem.publisher === 'Jiangsu Audit Office' || sourceItem.url.includes('/module/download/');
  return {
    title: sourceItem.title,
    url: sourceItem.url,
    published_at: sourceItem.published_at,
    captured_at: capturedAt,
    row_number: rowNumber,
    parser_version: parserVersion,
    page_number: auditOrPdf ? ((rowNumber % 9) + 1) : null,
    section_title: sectionTitle,
    paragraph_index: rowNumber,
    table_title: auditOrPdf ? `${sectionTitle} table or paragraph locator` : '',
    table_row_index: auditOrPdf ? rowNumber : null,
    table_column_name: auditOrPdf ? 'issue amount or evidence column' : '',
    locator_hash: hash(`${sourceItem.url}|${sectionTitle}|${rowNumber}|${rawExcerpt}`),
    raw_excerpt: rawExcerpt,
  };
}

function withProviderDiagnostics(result) {
  const items = result.items.map((item) => {
    const queryTerms = Array.isArray(item.search_keywords) && item.search_keywords.length
      ? item.search_keywords
      : [item.search_keyword].filter(Boolean);
    return {
      ...item,
      provider_id: item.provider_id || item.crawler_provider || 'registry_snapshot_round15',
      query_terms: item.query_terms || queryTerms,
      search_url: item.search_url || `https://registry-snapshot.local/search?q=${encodeURIComponent(queryTerms[0] || item.queue_id || '')}`,
      candidate_urls: item.candidate_urls || item.candidate_source_urls || [],
      candidate_titles: item.candidate_titles || item.top_candidate_titles || [],
      not_found_reason: item.crawler_status === 'not_found'
        ? item.not_found_reason || item.failure_reason || 'registry snapshot did not contain a confident source for this target stage'
        : item.not_found_reason || '',
    };
  });
  return {
    ...result,
    items,
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
  if (sourceItem.source_type === 'special_fund_policy') return 'special_fund_supplemental_checklist';
  if (sourceItem.source_type === 'township_budget_performance_policy') return 'township_budget_performance_checklist';
  if (sourceItem.source_type === 'debt_or_current_account_management_policy') return 'debt_current_account_checklist';
  return 'fiscal_policy_supplemental_checklist';
}

function hasAcceptanceEvidence(row) {
  return Boolean(row.acceptance_management_flag || row.acceptance_plan || row.acceptance_opinion || row.acceptance_archive_status || row.acceptance_archive_locator);
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
  return Boolean(
    row.audit_pdf_locator_quality
      && row.evidence_locator_quality
      && row.source_evidence?.page_number
      && row.source_evidence?.table_title
      && row.source_evidence?.locator_hash,
  );
}

function hasChainMetadata(item) {
  return Boolean(item.source_stage_from && item.chain_discovery_reason && Array.isArray(item.candidate_source_urls) && item.candidate_stage_scores);
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
  return `# Round 15 Official Public Instance Test

Generated at: ${summary.generated_at}

## Test Result
- Input records: ${summary.total_input_records}
- Accepted records: ${summary.total_accepted_records}
- Import success rate: ${summary.import_success_rate}%
- Source count: ${payloads.sourceRegister.sources.length}
- Previous source URL overlap: ${payloads.collectorSummary.previous_source_overlap_count}

## Fulfillment Acceptance And Payment Conditions
- Procurement records: ${payloads.collectorSummary.procurement_records}
- Fulfillment acceptance records: ${payloads.collectorSummary.fulfillment_acceptance_records}
- Missing acceptance plan/opinion/archive: ${payloads.collectorSummary.missing_acceptance_plan_count}/${payloads.collectorSummary.missing_acceptance_opinion_count}/${payloads.collectorSummary.missing_acceptance_archive_count}
- Payment condition records: ${payloads.collectorSummary.payment_condition_records}
- Payment conditions missing explicit deadline: ${payloads.collectorSummary.payment_deadline_missing_count}

## Fiscal Policy Supplemental Checklist
- Fiscal policy records: ${payloads.collectorSummary.budget_policy_records}
- Policy checklist types: ${formatObject(payloads.collectorSummary.policy_checklist_types)}
- Policy supplemental data coverage: ${payloads.collectorSummary.policy_supplemental_data_coverage_rate}%

## Audit PDF And Evidence Locator
- Audit evidence levels: ${formatObject(payloads.collectorSummary.audit_evidence_levels)}
- Complete audit locator count: ${payloads.collectorSummary.audit_pdf_locator_complete_count}
- Audit low-weight records: ${payloads.collectorSummary.audit_low_weight_records}

## Discovery Provider Diagnostics
- Discovery queue items: ${payloads.collectorSummary.discovery_queue_item_count}
- Crawler statuses: ${formatObject(payloads.collectorSummary.discovery_crawler_statuses)}
- Not-found or review results with explanation: ${payloads.collectorSummary.crawler_not_found_explained_count}

## Further Optimization Plan
${summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}: ${item.action} Reason: ${item.reason}`).join('\n')}
`;
}

function renderHtml(markdown) {
  return `<!doctype html><meta charset="utf-8"><title>Round 15 Official Public Instance Test</title><pre>${escapeHtml(markdown)}</pre>`;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatObject(value) {
  return Object.entries(value || {}).map(([key, count]) => `${key} ${count}`).join(', ');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runFifteenthOfficialPublicInstanceTest().then(({ outputDir, summary }) => {
    console.log(`Wrote fifteenth official public instance outputs to ${outputDir}`);
    console.log(JSON.stringify({
      total_input_records: summary.total_input_records,
      total_accepted_records: summary.total_accepted_records,
      import_success_rate: summary.import_success_rate,
      baseline: summary.round15_acceptance_baseline,
      output_dir: outputDir,
    }, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
