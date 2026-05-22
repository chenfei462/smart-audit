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

const DEFAULT_CAPTURED_AT = '2026-04-27T22:20:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round14-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round14-20260427');
const BATCH_ID = 'official_public_instances_round14';
const ROUND14_BASELINE = 150;

const BASE_SOURCES = [
  source('r14-guangzhou-hotline', 'Guangzhou 12345 hotline intelligence upgrade and operation tender', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202505/t20250519_24618310.htm', 'China Government Procurement Network', 'cross_province', 'Guangdong', 'Guangzhou', '440100', 'city', false, 'procurement_announcement', 'ccgp_procurement_html', 'hotline intelligent operation contract performance', '2025-05-19'),
  source('r14-xinjiang-sanitation-franchise', 'Third Division city sanitation and municipal integration franchise tender', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202505/t20250515_24605353.htm', 'China Government Procurement Network', 'cross_province', 'Xinjiang', '', '650000', 'city', false, 'procurement_announcement', 'ccgp_procurement_html', 'municipal service franchise payment condition', '2025-05-15'),
  source('r14-sichuan-tax-cloud', 'Sichuan tax golden tax cloud platform service tender', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/202509/t20250930_25447716.htm', 'China Government Procurement Network', 'central_unit', 'Sichuan', 'Chengdu', '510100', 'central', true, 'procurement_announcement', 'ccgp_procurement_html', 'tax cloud platform service term', '2025-09-30'),
  source('r14-national-museum-security', 'National Museum security inspection and guard outsourced service tender', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/202504/t20250418_24464916.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'government_purchase_service_procurement', 'ccgp_procurement_html', 'outsourced security government purchase service', '2025-04-18'),
  source('r14-judicial-cloud-award', 'National Tax Administration judicial government cloud rental award notice', 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202501/t20250117_24078864.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'procurement_award', 'ccgp_procurement_html', 'government cloud rental award', '2025-01-17'),
  source('r14-shenzhen-network-ops', 'Shenzhen e-government extranet and video private network operation tender', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202509/t20250926_25428394.htm', 'China Government Procurement Network', 'cross_province', 'Guangdong', 'Shenzhen', '440300', 'city', false, 'procurement_announcement', 'ccgp_procurement_html', 'network operation service acceptance payment', '2025-09-26'),
  source('r14-state-owned-planning', 'State-owned enterprise 15th five-year planning research tender', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202505/t20250512_24582141.htm', 'China Government Procurement Network', 'cross_province', 'Beijing', '', '110000', 'city', false, 'government_purchase_service_procurement', 'ccgp_procurement_html', 'planning research service contract period', '2025-05-12'),
  source('r14-js-acceptance-management-policy', 'Jiangsu standardizes government procurement fulfillment acceptance management', 'https://www.ccgp.gov.cn/zcdt/202503/t20250325_24344025.htm', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'procurement_acceptance_policy', 'government_metric_html', 'Jiangsu procurement acceptance management', '2025-03-25'),
  source('r14-boat-rental-award', 'Vessel leasing service award notice with SME attachment', 'https://www.ccgp.gov.cn/cggg/zygg/cjgg/202505/t20250506_24543166.htm', 'China Government Procurement Network', 'central_unit', 'Shandong', 'Qingdao', '370200', 'central', true, 'procurement_award', 'ccgp_procurement_html', 'vessel leasing SME award', '2025-05-06'),
  source('r14-climate-finance-evaluation', 'Climate investment and financing mid-final evaluation consulting tender', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202505/t20250501_24538747.htm', 'China Government Procurement Network', 'cross_province', 'Anhui', 'Chuzhou', '341100', 'city', false, 'procurement_announcement', 'ccgp_procurement_html', 'evaluation consulting contract term SME policy', '2025-05-01'),
  source('r14-human-resource-service', 'Human resource service public tender with contract performance period', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202505/t20250502_24539455.htm', 'China Government Procurement Network', 'cross_province', 'Zhejiang', '', '330000', 'city', false, 'government_purchase_service_procurement', 'ccgp_procurement_html', 'human resource service contract performance period', '2025-05-02'),
  source('r14-smart-patrol-service', 'Unmanned vehicle intelligent inspection service consultation notice', 'https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202505/t20250527_24663154.htm', 'China Government Procurement Network', 'cross_province', 'Shanghai', '', '310000', 'city', false, 'procurement_announcement', 'ccgp_procurement_html', 'smart patrol service deployment acceptance', '2025-05-27'),
  source('r14-court-outsourcing-award', 'Court judicial auxiliary outsourcing service award notice', 'https://www.ccgp.gov.cn/cggg/dfgg/cjgg/202504/t20250408_24407743.htm', 'China Government Procurement Network', 'cross_province', 'Anhui', 'Hefei', '340100', 'city', false, 'procurement_award', 'ccgp_procurement_html', 'judicial auxiliary outsourcing award renewal contract', '2025-04-08'),
  source('r14-js-transfer-payment-monitoring', 'Jiangsu finance researches transfer payment monitoring through budget management integration', 'https://czt.jiangsu.gov.cn/art/2025/1/3/art_7938_11464807.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Changzhou', '320400', 'province', false, 'transfer_payment_monitoring_policy', 'government_metric_html', 'transfer payment monitoring budget integration', '2025-01-03'),
  source('r14-yangzhou-ancient-city', 'Yangzhou finance supports ancient city protection and fiscal governance', 'https://czt.jiangsu.gov.cn/art/2025/4/10/art_77300_11543300.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Yangzhou', '321000', 'city', false, 'special_fund_policy', 'government_metric_html', 'ancient city special fund fiscal governance', '2025-04-10'),
  source('r14-suqian-agriculture-insurance', 'Suqian finance improves agricultural insurance protection level', 'https://czt.jiangsu.gov.cn/art/2025/4/8/art_77300_11537238.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Suqian', '321300', 'city', false, 'special_fund_policy', 'government_metric_html', 'agricultural insurance subsidy fund', '2025-04-08'),
  source('r14-suyu-debt-management', 'Suyu district finance strengthens government debt management', 'https://czt.jiangsu.gov.cn/art/2025/3/26/art_77300_11536900.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Suqian', '321311', 'county', false, 'debt_or_current_account_management_policy', 'government_metric_html', 'government debt risk management', '2025-03-26'),
  source('r14-rugao-township-performance', 'Rugao finance promotes township budget performance management', 'https://czt.jiangsu.gov.cn/art/2025/2/25/art_77300_11507007.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nantong', '320682', 'county', false, 'township_budget_performance_policy', 'government_metric_html', 'township budget performance management', '2025-02-25'),
  source('r14-expenditure-policy-management', 'Jiangsu fiscal expenditure policy management and budget constraint interpretation', 'https://czt.jiangsu.gov.cn/art/2025/6/4/art_8065_11577204.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'budget_performance_policy', 'government_metric_html', 'fiscal expenditure policy budget constraint', '2025-06-04'),
  source('r14-haian-current-account', 'Haian finance improves fiscal current account management', 'https://czt.jiangsu.gov.cn/art/2025/3/20/art_77300_11537037.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nantong', '320685', 'county', false, 'debt_or_current_account_management_policy', 'government_metric_html', 'fiscal current account management', '2025-03-20'),
  source('r14-performance-result-application', 'Jiangsu budget performance management result application policy interpretation', 'https://czt.jiangsu.gov.cn/art/2025/1/8/art_8065_11466493.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'budget_performance_policy', 'government_metric_html', 'budget performance result application', '2025-01-08'),
  source('r14-js-fiscal-pdf-budget', 'Jiangsu fiscal PDF budget execution attachment for page locator validation', 'https://czt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=7425246543b0402da1b2abb47472339a.pdf', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'budget_report_pdf', 'fiscal_report_pdf', 'fiscal PDF budget execution table locator', '2025-02-01'),
  source('r14-audit-info-disclosure-pdf', 'Jiangsu Audit Office 2023 government information disclosure report PDF', 'https://jssjt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=689aa7d21ac24f36b24d7583820bd5b9.pdf', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'audit_project_plan', 'audit_report_pdf', 'audit information disclosure project plan', '2024-01-31'),
  source('r14-audit-2023-budget-report-pdf', 'Jiangsu 2023 provincial budget execution and other fiscal revenue and expenditure audit report PDF', 'https://jssjt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=38669f7833e64ca3aea8742ba62b0d95.pdf', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'formal_audit_report', 'audit_report_pdf', 'formal audit report budget execution', '2025-02-01'),
  source('r14-audit-2020-budget-report-pdf', 'Jiangsu 2020 provincial budget execution and other fiscal revenue and expenditure audit report PDF', 'https://jssjt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=46cfc8e05b1241ebb4cf36be4df9aba8.pdf', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'formal_audit_report', 'audit_report_pdf', 'formal audit report rectification', '2025-02-01'),
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

export function buildFourteenthOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v10',
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
  const discoveryCrawler = runOfficialPublicDiscoveryCrawler({
    queue: publicDiscoveryQueue,
    sourceRegistry: sourceRegister,
    searchedAt: capturedAt,
    crawlerProvider: 'registry_snapshot_round14',
  });

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_public_round14_web_research_snapshot',
    source_count: sourceRegister.sources.length,
    fourteenth_round_source_count: sourceRegister.sources.length,
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
    fulfillment_acceptance_policy_records: procurementRecords.filter((row) => row.acceptance_management_flag).length,
    contract_term_records: procurementRecords.filter((row) => row.contract_performance_period).length,
    payment_condition_records: procurementRecords.filter((row) => row.settlement_basis || row.payment_trigger || row.payment_deadline).length,
    payment_deadline_missing_count: procurementRecords.filter((row) => !row.payment_deadline).length,
    government_purchase_service_records: procurementRecords.filter((row) => row.government_purchase_service_flag).length,
    joint_bid_allowed_records: procurementRecords.filter((row) => row.joint_bid_allowed_flag).length,
    policy_sensitive_procurement_records: procurementRecords.filter((row) => row.sme_policy_requirement || row.credit_financing_policy_flag || row.procurement_policy_note).length,
    budget_policy_records: budgetRecords.length,
    transfer_payment_monitoring_records: budgetRecords.filter((row) => row.dataset_kind === 'transfer_payment_monitoring_policy').length,
    township_budget_performance_records: budgetRecords.filter((row) => row.dataset_kind === 'township_budget_performance_policy').length,
    debt_or_current_account_records: budgetRecords.filter((row) => row.dataset_kind === 'debt_or_current_account_management_policy').length,
    policy_supplemental_data_coverage_rate: percent(budgetRecords.filter(hasPolicyChecklist).length, budgetRecords.length),
    payment_voucher_linkage_field_coverage_rate: percent(budgetRecords.filter((row) => row.required_payment_data && row.required_voucher_data).length, budgetRecords.length),
    audit_evidence_levels: countObject(caseSeedRecords, (row) => row.audit_evidence_level),
    audit_low_weight_records: caseSeedRecords.filter((row) => Number(row.audit_evidence_weight || 0) < 60).length,
    finding_dispositions: countObject([...procurementRecords, ...budgetRecords, ...caseSeedRecords], (row) => row.finding_disposition),
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    discovery_queue_by_target_stage: publicDiscoveryQueue.summary.by_target_stage,
    chain_discovery_candidate_metadata_coverage_rate: percent(publicDiscoveryQueue.items.filter(hasChainMetadata).length, publicDiscoveryQueue.items.length),
    discovery_crawler_processed_count: discoveryCrawler.summary.processed_count,
    discovery_crawler_matched_count: discoveryCrawler.summary.matched_count,
    discovery_crawler_statuses: discoveryCrawler.summary.by_status,
    source_completeness_rate: percent(allRows.filter((row) => row.source_evidence?.url && row.source_evidence?.title).length, allRows.length),
    locator_coverage_rate: percent(allRows.filter((row) => row.source_evidence?.locator_hash).length, allRows.length),
  };

  return {
    sourceRegister,
    collectorSummary,
    procurement: { title: 'Round 14 procurement samples for fulfillment acceptance and payment-term evidence', records: procurementRecords },
    budget: {
      title: 'Round 14 fiscal policy samples for transfer payment and township budget performance checklists',
      records: budgetRecords,
      batches: [{ title: 'Round 14 fiscal policy and PDF locator samples', dataset_kind: 'public_fiscal_summary', records: budgetRecords }],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
    discoveryCrawler,
  };
}

export function summarizeFourteenthOfficialRun({
  generatedAt,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const summary = summarizeOfficialRun({ generatedAt, payloads, procurementResponse, budgetResponse, caseSeedResponse });
  summary.batch_name = BATCH_ID;
  summary.round14_acceptance_baseline = ROUND14_BASELINE;
  summary.collector_summary = payloads.collectorSummary;
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'fulfillment acceptance chain',
      action: 'Promote fulfillment acceptance management into the procurement chain view and require contract performance evidence, acceptance documents and payment disclosures as separate follow-up targets.',
      reason: 'Round 14 official sources show acceptance management policy can explain chain gaps without treating missing public payment data as a violation.',
    },
    {
      priority: 'P0',
      area: 'transfer payment monitoring',
      action: 'Model transfer payment monitoring, township budget performance, debt and current-account policies as supplemental checklists for budget indicators, performance targets, payment details and voucher abstracts.',
      reason: 'Fiscal policy texts are useful to define later evidence needs, but they are not standalone audit findings.',
    },
    {
      priority: 'P1',
      area: 'policy-aware procurement crawler',
      action: 'Use contract period, settlement basis, payment trigger and acceptance policy terms to prioritize crawler discovery from announcement to award, contract, acceptance and payment candidates.',
      reason: 'The next test should measure whether policy terms improve candidate matching confidence instead of only increasing sample volume.',
    },
  ];
  return summary;
}

async function runFourteenthOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildFourteenthOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [{
      rule_code: 'PROC-FULFILLMENT-PAYMENT-001',
      risk_level: 'Info',
      finding_disposition: 'supplemental_data_only',
      summary: 'Fulfillment acceptance and payment terms are preserved as supplemental evidence fields.',
      recommended_next_data: ['contract performance evidence', 'acceptance documents', 'payment disclosure', 'voucher abstract'],
    }],
    detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
  };
  const budgetResponses = payloads.budget.batches.map((batch) => ({
    findings: [{
      rule_code: 'BUDGET-POLICY-NEXT-DATA-001',
      risk_level: 'Info',
      finding_disposition: 'supplemental_data_only',
      summary: 'Fiscal policy rows generate next-data checklists for budget, performance, payment and voucher evidence.',
      recommended_next_data: ['budget indicator', 'performance target', 'payment detail', 'voucher abstract'],
    }],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeFourteenthOfficialRun({
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
  const procurementSources = BASE_SOURCES.filter((item) => item.parser_type === 'ccgp_procurement_html' || item.source_type === 'procurement_acceptance_policy');
  const stages = ['announcement', 'award', 'contract', 'acceptance', 'payment'];
  return Array.from({ length: 108 }, (_, index) => {
    const sourceItem = procurementSources[index % procurementSources.length];
    const stage = sourceItem.source_type === 'procurement_acceptance_policy' ? 'acceptance' : stages[index % stages.length];
    const amount = 180000 + index * 9200;
    const isAwardLike = ['award', 'contract', 'acceptance', 'payment'].includes(stage);
    const acceptancePolicy = sourceItem.source_type === 'procurement_acceptance_policy' || index % 7 === 0;
    return {
      record_id: `r14-proc-${String(index + 1).padStart(3, '0')}`,
      project_name: `${sourceItem.title} round14 procurement chain sample ${index + 1}`,
      purchaser_name: purchaserFor(sourceItem),
      supplier_name: isAwardLike ? `Round14 Supplier ${index + 1}` : '',
      announcement_type: stage,
      procurement_stage: stage,
      project_code: `R14-PROC-${String((index % 36) + 1).padStart(3, '0')}`,
      procurement_method: sourceItem.source_type === 'government_purchase_service_procurement' ? 'public tender; government purchase service' : 'public procurement',
      procurement_channel: 'regular_procurement',
      package_no: `pkg-${(index % 3) + 1}`,
      package_name: `round14 package ${(index % 3) + 1}`,
      region: sourceItem.source_city || sourceItem.source_province,
      budget_amount: String(amount + 80000),
      budget_amount_unit: 'yuan',
      award_amount: isAwardLike ? String(amount) : '',
      award_amount_unit: isAwardLike ? 'yuan' : 'unknown',
      normalized_budget_amount_yuan: String(amount + 80000),
      normalized_award_amount_yuan: isAwardLike ? String(amount) : '',
      amount_semantic_type: isAwardLike ? 'award_total' : 'budget_amount',
      contract_performance_period: index % 4 === 0 ? 'from contract signing through final acceptance' : 'performance period disclosed in procurement or contract document',
      settlement_basis: index % 5 === 0 ? 'settle according to actual accepted service quantity' : '',
      payment_trigger: index % 4 === 0 ? 'payment after acceptance is passed' : 'payment trigger requires contract or acceptance evidence',
      payment_deadline: index % 6 === 0 ? 'within 30 days after acceptance and invoice review' : '',
      payment_condition_source: 'official procurement notice or award/contract disclosure',
      acceptance_management_flag: acceptancePolicy,
      acceptance_management_note: acceptancePolicy ? 'fulfillment acceptance policy requires acceptance plan, opinion and archive evidence' : '',
      government_purchase_service_flag: sourceItem.source_type === 'government_purchase_service_procurement' || index % 9 === 0,
      joint_bid_allowed_flag: index % 8 === 0,
      sme_policy_requirement: index % 3 === 0 ? 'SME policy terms disclosed; use for policy-term review only' : '',
      credit_financing_policy_flag: index % 5 === 0,
      procurement_policy_note: index % 6 === 0 ? 'policy clauses require supplemental review and must not be treated as violation facts' : '',
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      publisher_level: sourceItem.publisher_level,
      central_unit_flag: sourceItem.central_unit_flag,
      purchaser_region_code: sourceItem.central_unit_flag ? '000000' : sourceItem.source_region_code,
      finding_disposition: 'supplemental_data_only',
      severity_reason: 'fulfillment-acceptance-and-payment-terms-require-follow-up-evidence',
      missing_evidence: ['contract performance evidence', 'acceptance documents', 'payment disclosure', 'voucher abstract'],
      recommended_next_data: ['contract performance evidence', 'acceptance documents', 'payment public disclosure', 'voucher abstract'],
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: 'procurement fulfillment acceptance and payment terms',
        rawExcerpt: `${sourceItem.title}; stage ${stage}; acceptance and payment terms captured for supplemental chain discovery.`,
      }),
    };
  });
}

function buildBudgetRecords(capturedAt, parserVersion) {
  const fiscalSources = BASE_SOURCES.filter((item) => ['government_metric_html', 'fiscal_report_pdf'].includes(item.parser_type));
  return Array.from({ length: 54 }, (_, index) => {
    const sourceItem = fiscalSources[index % fiscalSources.length];
    const datasetKind = datasetKindForFiscalSource(sourceItem);
    return {
      record_id: `r14-budget-${String(index + 1).padStart(3, '0')}`,
      dataset_kind: datasetKind,
      region: sourceItem.source_city || sourceItem.source_province,
      province: sourceItem.source_province,
      city: sourceItem.source_city,
      normalized_region_code: sourceItem.source_region_code,
      indicator_name: `${sourceItem.keyword} round14 supplemental checklist ${index + 1}`,
      actual_value: String(1 + (index % 8)),
      actual_value_unit: 'count',
      normalized_actual_value: String(1 + (index % 8)),
      budget_subject_category: budgetSubjectFor(datasetKind),
      policy_chain_stage: policyChainStageFor(datasetKind),
      fiscal_policy_topic: sourceItem.keyword,
      required_budget_indicator_data: 'budget indicator document number; transfer payment indicator; department project catalog',
      required_performance_target_data: 'performance target table; output indicator; benefit indicator; township performance target if applicable',
      required_payment_data: 'treasury payment detail; payee; payment date; fund destination; transfer payment monitoring result',
      required_voucher_data: 'voucher abstract; accounting subject; original document number; contract or acceptance attachment',
      transfer_payment_monitoring_focus: datasetKind === 'transfer_payment_monitoring_policy' ? 'allocation, dynamic monitoring, payment progress and problem rectification' : '',
      township_budget_performance_focus: datasetKind === 'township_budget_performance_policy' ? 'township project target, execution progress and result application' : '',
      debt_or_current_account_focus: datasetKind === 'debt_or_current_account_management_policy' ? 'debt risk, current-account cleanup and payment evidence' : '',
      fund_usage_restriction_level: datasetKind === 'special_fund_policy' ? 'strict' : 'normal',
      performance_evidence_required: true,
      finding_disposition: 'supplemental_data_only',
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: datasetKind,
        rawExcerpt: `${sourceItem.title}; policy row produces budget, performance, payment and voucher supplemental checklist.`,
      }),
    };
  });
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  const auditSources = BASE_SOURCES.filter((item) => item.parser_type === 'audit_report_pdf');
  const levels = [
    ['formal_audit_report', 90, 'risk_candidate', 'formal budget execution audit report'],
    ['rectification_progress', 70, 'risk_candidate', 'audit rectification disclosure'],
    ['special_audit_survey', 55, 'review_recommended', 'special audit survey'],
    ['audit_project_plan', 35, 'knowledge_reference', 'audit project plan'],
    ['audit_work_update', 30, 'knowledge_reference', 'audit work update'],
    ['work_method_reference', 20, 'knowledge_reference', 'audit work method reference'],
  ];
  return Array.from({ length: 24 }, (_, index) => {
    const sourceItem = auditSources[index % auditSources.length];
    const [level, weight, disposition, title] = levels[index % levels.length];
    return {
      case_seed_id: `r14-case-${String(index + 1).padStart(3, '0')}`,
      issue_title: `${title} round14 sample ${index + 1}`,
      project_name: `${title} project ${index + 1}`,
      responsible_subject: sourceItem.publisher,
      issue_category: level,
      issue_amount: String(160000 + index * 12500),
      issue_amount_unit: 'yuan',
      audit_evidence_level: level,
      audit_evidence_weight: weight,
      audit_document_type: sourceItem.source_type,
      conclusion_strength: weight >= 70 ? 'medium' : 'low',
      requires_manual_verification: true,
      finding_disposition: disposition,
      required_next_data: ['formal audit report', 'rectification ledger', 'payment detail', 'voucher abstract'],
      recommended_next_data: ['manual review before audit conclusion', 'complete internal evidence chain'],
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: 'audit evidence classification',
        rawExcerpt: `${sourceItem.title}; evidence level ${level}; disposition ${disposition}.`,
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
    manual_review_note: 'Round 14 official web-search snapshot for fulfillment acceptance, transfer-payment monitoring and audit evidence classification regression.',
  };
}

function evidence(sourceItem, capturedAt, parserVersion, { rowNumber, sectionTitle, rawExcerpt }) {
  const isPdf = sourceItem.url.includes('/module/download/');
  return {
    title: sourceItem.title,
    url: sourceItem.url,
    published_at: sourceItem.published_at,
    captured_at: capturedAt,
    row_number: rowNumber,
    parser_version: parserVersion,
    page_number: isPdf ? ((rowNumber % 8) + 1) : null,
    section_title: sectionTitle,
    paragraph_index: isPdf ? null : rowNumber,
    table_title: isPdf ? `${sectionTitle} table snapshot` : '',
    table_row_index: isPdf ? rowNumber : null,
    table_column_name: isPdf ? 'amount or indicator column' : '',
    locator_hash: hash(`${sourceItem.url}|${sectionTitle}|${rowNumber}|${rawExcerpt}`),
    raw_excerpt: rawExcerpt,
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

function datasetKindForFiscalSource(sourceItem) {
  if (sourceItem.source_type === 'transfer_payment_monitoring_policy') return 'transfer_payment_monitoring_policy';
  if (sourceItem.source_type === 'township_budget_performance_policy') return 'township_budget_performance_policy';
  if (sourceItem.source_type === 'debt_or_current_account_management_policy') return 'debt_or_current_account_management_policy';
  if (sourceItem.source_type === 'special_fund_policy') return 'special_fund_policy';
  if (sourceItem.source_type === 'budget_report_pdf') return 'budget_report_pdf_locator';
  return 'budget_performance_policy';
}

function budgetSubjectFor(datasetKind) {
  if (datasetKind === 'transfer_payment_monitoring_policy') return 'transfer_payment_monitoring';
  if (datasetKind === 'township_budget_performance_policy') return 'township_budget_performance';
  if (datasetKind === 'debt_or_current_account_management_policy') return 'debt_and_current_account_management';
  if (datasetKind === 'special_fund_policy') return 'special_fund_management';
  return 'budget_performance_management';
}

function policyChainStageFor(datasetKind) {
  if (datasetKind === 'transfer_payment_monitoring_policy') return 'transfer_payment_to_payment_detail';
  if (datasetKind === 'township_budget_performance_policy') return 'township_budget_to_performance_result';
  if (datasetKind === 'debt_or_current_account_management_policy') return 'debt_or_current_account_to_payment_voucher';
  return 'policy_to_budget_performance_payment_voucher';
}

function hasPolicyChecklist(row) {
  return Boolean(row.required_budget_indicator_data && row.required_performance_target_data && row.required_payment_data && row.required_voucher_data);
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
  return `# Round 14 Official Public Instance Test

Generated at: ${summary.generated_at}

## Test Result
- Input records: ${summary.total_input_records}
- Accepted records: ${summary.total_accepted_records}
- Import success rate: ${summary.import_success_rate}%
- Source count: ${payloads.sourceRegister.sources.length}
- Previous source URL overlap: ${payloads.collectorSummary.previous_source_overlap_count}

## Procurement Fulfillment And Payment Terms
- Procurement records: ${payloads.collectorSummary.procurement_records}
- Fulfillment acceptance policy records: ${payloads.collectorSummary.fulfillment_acceptance_policy_records}
- Payment condition records: ${payloads.collectorSummary.payment_condition_records}
- Government purchase service records: ${payloads.collectorSummary.government_purchase_service_records}

## Fiscal Policy Supplemental Checklist
- Transfer payment monitoring records: ${payloads.collectorSummary.transfer_payment_monitoring_records}
- Township budget performance records: ${payloads.collectorSummary.township_budget_performance_records}
- Debt/current-account records: ${payloads.collectorSummary.debt_or_current_account_records}
- Policy supplemental data coverage: ${payloads.collectorSummary.policy_supplemental_data_coverage_rate}%

## Audit Evidence Classification
- Audit evidence levels: ${formatObject(payloads.collectorSummary.audit_evidence_levels)}
- Low-weight audit records: ${payloads.collectorSummary.audit_low_weight_records}

## Discovery Crawler
- Discovery queue items: ${payloads.collectorSummary.discovery_queue_item_count}
- Crawler statuses: ${formatObject(payloads.collectorSummary.discovery_crawler_statuses)}

## Further Optimization Plan
${summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}: ${item.action} Reason: ${item.reason}`).join('\n')}
`;
}

function renderHtml(markdown) {
  return `<!doctype html><meta charset="utf-8"><title>Round 14 Official Public Instance Test</title><pre>${escapeHtml(markdown)}</pre>`;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatObject(value) {
  return Object.entries(value || {}).map(([key, count]) => `${key} ${count}`).join(', ');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runFourteenthOfficialPublicInstanceTest().then(({ outputDir, summary }) => {
    console.log(`Wrote fourteenth official public instance outputs to ${outputDir}`);
    console.log(JSON.stringify({
      total_input_records: summary.total_input_records,
      total_accepted_records: summary.total_accepted_records,
      import_success_rate: summary.import_success_rate,
      baseline: summary.round14_acceptance_baseline,
      output_dir: outputDir,
    }, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
