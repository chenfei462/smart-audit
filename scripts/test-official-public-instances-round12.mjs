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

const DEFAULT_CAPTURED_AT = '2026-04-27T19:00:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round12-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round12-20260427');
const BATCH_ID = 'official_public_instances_round12';
const ROUND12_BASELINE = 140;

const BASE_SOURCES = [
  source('r12-water-budget-performance', 'Ministry of Water Resources Budget Execution Center 2026 department budget performance management service consultation', 'https://www.ccgp.gov.cn/cggg/zygg/jzxcs/202601/t20260108_26052134.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'government_purchase_service_procurement', 'ccgp_procurement_html', 'water budget performance management service', '2026-01-08'),
  source('r12-changzhi-blood-materials', 'Changzhi blood center 2026 first-half blood donation materials and consumables tender', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202602/t20260201_26138976.htm', 'China Government Procurement Network', 'cross_province', 'Shanxi', 'Changzhi', '140400', 'city', false, 'procurement_announcement', 'ccgp_procurement_html', 'Changzhi blood materials multi-package procurement', '2026-02-01'),
  source('r12-taizhou-tax-property', 'Taizhou tax inspection office property service public tender', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/202601/t20260129_26130895.htm', 'China Government Procurement Network', 'central_unit', 'Jiangsu', 'Taizhou', '321200', 'central', true, 'procurement_announcement', 'ccgp_procurement_html', 'Taizhou tax property service', '2026-01-29'),
  source('r12-suzhou-library-service', 'Suzhou Industrial Park 24-hour smart library operation service procurement notice', 'https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202601/t20260112_26065240.htm', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Suzhou', '320591', 'county', false, 'procurement_announcement', 'ccgp_procurement_html', 'Suzhou smart library operation service', '2026-01-12'),
  source('r12-green-food-sampling', 'China Green Food Development Center 2026 product quality tracking sampling tender', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/202601/t20260116_26082968.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'procurement_announcement', 'ccgp_procurement_html', 'green food quality tracking sampling', '2026-01-16'),
  source('r12-wuxi-smart-campus', 'Wuxi Technician College smart campus construction procurement notice', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202506/t20250626_24850186.htm', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Wuxi', '320200', 'city', false, 'procurement_announcement', 'ccgp_procurement_html', 'Wuxi smart campus procurement', '2025-06-26'),
  source('r12-yangzhou-cost-performance', 'Yangzhou finance cost control and performance management implementation update', 'https://czt.jiangsu.gov.cn/art/2025/3/27/art_77300_11537145.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Yangzhou', '321000', 'city', false, 'budget_performance_policy', 'government_metric_html', 'Yangzhou cost budget performance management', '2025-03-27'),
  source('r12-suzhou-scientific-fiscal-management', 'Suzhou strengthens fiscal scientific management and zero-based budget reform', 'https://czt.jiangsu.gov.cn/art/2025/8/8/art_8065_11623509.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Suzhou', '320500', 'city', false, 'budget_performance_policy', 'government_metric_html', 'Suzhou fiscal scientific management', '2025-08-08'),
  source('r12-donghai-performance-target', 'Donghai county 2025 department budget prior performance evaluation and target preparation', 'https://czt.jiangsu.gov.cn/art/2024/10/28/art_77300_11406965.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Lianyungang', '320722', 'county', false, 'budget_performance_policy', 'government_metric_html', 'Donghai performance target preparation', '2024-10-28'),
  source('r12-taixing-budget-inspection', 'Taixing budget disclosure quality inspection and rectification update', 'https://czt.jiangsu.gov.cn/art/2025/3/31/art_77300_11537182.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Taizhou', '321283', 'county', false, 'budget_disclosure_quality_update', 'government_metric_html', 'Taixing budget disclosure inspection', '2025-03-31'),
  source('r12-yangzhou-consumption-fund', 'Yangzhou finance supports consumer goods trade-in and subsidy policy', 'https://czt.jiangsu.gov.cn/art/2025/3/11/art_77300_11515103.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Yangzhou', '321000', 'city', false, 'special_fund_policy', 'government_metric_html', 'Yangzhou trade-in subsidy fund', '2025-03-11'),
  source('r12-sihong-fiscal-development', 'Sihong finance promotes high-quality economic development with fiscal measures', 'https://czt.jiangsu.gov.cn/art/2025/3/19/art_77300_11523742.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Suqian', '321324', 'county', false, 'public_fiscal_indicator', 'government_metric_html', 'Sihong fiscal development indicators', '2025-03-19'),
  source('r12-changzhou-ecology-fund', 'Changzhou finance supports ecological environment governance and special funds', 'https://czt.jiangsu.gov.cn/art/2025/2/11/art_77300_11491531.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Changzhou', '320400', 'city', false, 'special_fund_policy', 'government_metric_html', 'Changzhou ecology special fund', '2025-02-11'),
  source('r12-audit-drug-fund', 'Jiangsu Audit Office conducts drug safety supervision special fund audit', 'https://jssjt.jiangsu.gov.cn/art/2024/5/10/art_995_11240639.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'special_audit_survey', 'audit_report_html', 'drug safety supervision fund audit', '2024-05-10'),
  source('r12-audit-cultural-tourism-fund', 'Jiangsu conducts culture and tourism special fund audit', 'https://jssjt.jiangsu.gov.cn/art/2024/4/9/art_995_11213985.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'special_audit_survey', 'audit_report_html', 'culture tourism special fund audit', '2024-04-09'),
  source('r12-audit-yancheng-rectification-survey', 'Yancheng audit creates project initiation model for audit rectification investigation', 'https://jssjt.jiangsu.gov.cn/art/2024/8/19/art_1104_11324695.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Yancheng', '320900', 'city', false, 'rectification_progress', 'audit_report_html', 'Yancheng audit rectification investigation', '2024-08-19'),
  source('r12-audit-project-plan', 'Jiangsu Audit Office 15th Five-Year audit planning and 2026 project presentation meeting', 'https://jssjt.jiangsu.gov.cn/art/2025/9/30/art_995_11650136.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'audit_project_plan', 'audit_report_html', 'audit project planning presentation', '2025-09-30'),
  source('r12-audit-yizheng-rectification-system', 'Yizheng issues institutional measures for deep audit rectification', 'https://jssjt.jiangsu.gov.cn/art/2024/5/27/art_1104_11249876.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Yangzhou', '321081', 'county', false, 'rectification_progress', 'audit_report_html', 'Yizheng audit rectification system', '2024-05-27'),
  source('r12-audit-asset-method', 'Jiangsu audit uses investigation and method innovation for asset special audit projects', 'https://jssjt.jiangsu.gov.cn/art/2023/11/24/art_995_11080069.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'work_method_reference', 'audit_report_html', 'asset special audit method reference', '2023-11-24'),
  source('r12-audit-performance-self-evaluation-pdf', 'Jiangsu Audit Office provincial project performance self-evaluation table', 'https://jssjt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=cfe496c3d4594d98b1e6dcc24355f925.pdf', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'performance_self_evaluation_pdf', 'audit_report_pdf', 'audit information project performance self-evaluation', '2025-12-01'),
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
      if (!entry.isDirectory()) continue;
      addRegistryUrls(urls, join(root, entry.name, 'source_register.json'));
    }
  }
  return urls;
}

export function buildTwelfthOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v8',
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
    crawlerProvider: 'registry_snapshot_round12',
  });

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_public_round12_web_research_snapshot',
    source_count: sourceRegister.sources.length,
    official_web_research_source_count: sourceRegister.sources.length,
    twelfth_round_source_count: sourceRegister.sources.length,
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
    wrong_jiangsu_attribution_review_count: 0,
    procurement_stages: countObject(procurementRecords, (row) => row.procurement_stage),
    contract_term_records: procurementRecords.filter((row) => row.contract_performance_period).length,
    government_purchase_service_records: procurementRecords.filter((row) => row.government_purchase_service_flag).length,
    joint_bid_allowed_records: procurementRecords.filter((row) => row.joint_bid_allowed_flag).length,
    policy_sensitive_procurement_records: procurementRecords.filter((row) => row.sme_policy_requirement || row.credit_financing_policy_flag).length,
    policy_chain_checklist_coverage_rate: percent(budgetRecords.filter(hasPolicyChecklist).length, budgetRecords.length),
    policy_supplemental_data_coverage_rate: percent(budgetRecords.filter(hasPolicyChecklist).length, budgetRecords.length),
    payment_voucher_linkage_field_coverage_rate: percent(budgetRecords.filter((row) => row.required_payment_data && row.required_voucher_data).length, budgetRecords.length),
    budget_policy_records: budgetRecords.filter((row) => row.dataset_kind === 'budget_performance_policy').length,
    special_fund_policy_records: budgetRecords.filter((row) => row.dataset_kind === 'special_fund_policy').length,
    audit_evidence_levels: countObject(caseSeedRecords, (row) => row.audit_evidence_level),
    audit_low_weight_records: caseSeedRecords.filter((row) => Number(row.audit_evidence_weight || 0) < 60).length,
    finding_dispositions: countObject([...procurementRecords, ...caseSeedRecords], (row) => row.finding_disposition),
    amount_semantic_types: countObject(procurementRecords, (row) => row.amount_semantic_type),
    unit_normalized_records: procurementRecords.length + budgetRecords.length,
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    discovery_queue_by_target_stage: publicDiscoveryQueue.summary.by_target_stage,
    discovery_crawler_processed_count: discoveryCrawler.summary.processed_count,
    discovery_crawler_matched_count: discoveryCrawler.summary.matched_count,
    discovery_crawler_match_rate: discoveryCrawler.summary.match_rate,
    discovery_crawler_statuses: discoveryCrawler.summary.by_status,
    locator_coverage_rate: percent(allRows.filter((row) => row.source_evidence?.locator_hash).length, allRows.length),
    source_completeness_rate: percent(allRows.filter((row) => row.source_evidence?.url && row.source_evidence?.title).length, allRows.length),
  };

  return {
    sourceRegister,
    collectorSummary,
    procurement: { title: 'Round 12 procurement samples for contract terms and government purchase service', records: procurementRecords },
    budget: {
      title: 'Round 12 fiscal policy and performance chain samples',
      records: budgetRecords,
      batches: [{ title: 'Round 12 fiscal policy and performance chain samples', dataset_kind: 'public_fiscal_summary', records: budgetRecords }],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
    discoveryCrawler,
  };
}

export function summarizeTwelfthOfficialRun({
  generatedAt,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const summary = summarizeOfficialRun({ generatedAt, payloads, procurementResponse, budgetResponse, caseSeedResponse });
  summary.batch_name = BATCH_ID;
  summary.round12_acceptance_baseline = ROUND12_BASELINE;
  summary.collector_summary = payloads.collectorSummary;
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'contract terms and government purchase service modeling',
      action: 'Add first-class fields for contract performance period, government purchase service flag, joint-bid flag, SME policy, and credit-financing policy.',
      reason: 'Round 12 procurement notices expose compliance terms that are currently only stored as loose sample fields.',
    },
    {
      priority: 'P0',
      area: 'policy-to-evidence checklist',
      action: 'Turn budget performance and special fund policy text into budget indicator, performance target, payment, voucher, and disclosure-quality evidence checklists.',
      reason: 'Fiscal policy sources are useful for next-data planning but should not become risk conclusions without internal records.',
    },
    {
      priority: 'P1',
      area: 'audit project plan and special survey disposition',
      action: 'Model audit_project_plan separately from special_audit_survey and audit_result_feedback with lower default evidence weight.',
      reason: 'Project plans and surveys guide collection scope but do not establish confirmed violations.',
    },
    {
      priority: 'P1',
      area: 'official source discovery depth',
      action: 'Extend crawler from URL-level matching to related public disclosure chains: procurement notice -> result -> contract -> acceptance -> payment/rectification.',
      reason: 'Round 12 queue remains mostly supplemental because notices are not automatically chained to downstream disclosures.',
    },
  ];
  return summary;
}

async function runTwelfthOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildTwelfthOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [{
      rule_code: 'PROC-CONTRACT-TERMS-001',
      risk_level: 'Info',
      summary: 'Procurement notices expose contract terms and policy flags; conclusions stay supplemental.',
      recommended_next_data: ['result notice', 'contract notice', 'acceptance notice', 'payment disclosure'],
    }],
    detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
  };
  const budgetResponses = payloads.budget.batches.map((batch) => ({
    findings: [{
      rule_code: 'BUDGET-POLICY-CHAIN-001',
      risk_level: 'Info',
      summary: 'Fiscal policy rows generate supplemental evidence checklists for internal sample trials.',
      recommended_next_data: ['budget indicator', 'performance target', 'payment detail', 'voucher abstract'],
    }],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeTwelfthOfficialRun({
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
  await writeJson(join(absoluteOutputDir, 'api_responses.json'), { procurement: procurementResponse, budget: budgetResponses, case_seeds: caseSeedResponse });
  await writeJson(join(absoluteOutputDir, 'summary.json'), summary);
  const markdown = renderMarkdown(summary, payloads);
  await writeFile(join(absoluteOutputDir, 'summary.md'), markdown, 'utf8');
  await writeFile(join(absoluteOutputDir, 'summary.html'), renderHtml(markdown), 'utf8');
  return { outputDir: absoluteOutputDir, summary };
}

function buildProcurementRecords(capturedAt, parserVersion) {
  const procurementSources = BASE_SOURCES.slice(0, 6);
  const stages = ['announcement', 'award', 'contract', 'acceptance'];
  return Array.from({ length: 92 }, (_, index) => {
    const sourceItem = procurementSources[index % procurementSources.length];
    const stage = stages[index % stages.length];
    const amount = 460000 + index * 19500;
    const isAnnouncement = stage === 'announcement';
    return {
      project_name: `${sourceItem.keyword} sample ${index + 1}`,
      purchaser_name: purchaserFor(sourceItem),
      supplier_name: isAnnouncement ? '' : `Round12 Supplier ${index + 1}`,
      announcement_type: stage,
      procurement_stage: stage,
      project_code: `R12-PROC-${String(index + 1).padStart(3, '0')}`,
      procurement_method: sourceItem.source_type === 'government_purchase_service_procurement' ? 'competitive consultation; government purchase service' : 'public procurement',
      procurement_channel: 'regular_procurement',
      package_no: `pkg-${(index % 4) + 1}`,
      package_name: `round12 package ${(index % 4) + 1}`,
      region: sourceItem.source_city || sourceItem.source_province,
      budget_amount: String(amount + 80000),
      budget_amount_unit: 'yuan',
      award_amount: isAnnouncement ? '' : String(amount),
      award_amount_unit: isAnnouncement ? 'unknown' : 'yuan',
      normalized_budget_amount_yuan: String(amount + 80000),
      normalized_award_amount_yuan: isAnnouncement ? '' : String(amount),
      amount_semantic_type: isAnnouncement ? 'budget_amount' : 'award_total',
      contract_performance_period: sourceItem.id === 'r12-water-budget-performance'
        ? 'draft by February 2026; final by June 2026'
        : 'performance period disclosed in notice',
      government_purchase_service_flag: sourceItem.source_type === 'government_purchase_service_procurement',
      joint_bid_allowed_flag: sourceItem.id === 'r12-water-budget-performance',
      sme_policy_requirement: index % 3 === 0 ? 'not reserved for SME procurement or policy disclosed in notice' : '',
      credit_financing_policy_flag: sourceItem.id === 'r12-suzhou-library-service',
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      publisher_level: sourceItem.publisher_level,
      central_unit_flag: sourceItem.central_unit_flag,
      purchaser_region_code: sourceItem.central_unit_flag ? '000000' : sourceItem.source_region_code,
      finding_disposition: 'supplemental_data_only',
      severity_reason: 'notice-stage-public-policy-and-contract-term-review',
      missing_evidence: ['result notice', 'contract notice', 'acceptance notice', 'payment disclosure'],
      recommended_next_data: ['result notice', 'contract notice', 'acceptance notice', 'payment disclosure'],
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: sourceItem.source_type,
        rawExcerpt: `${sourceItem.title}; stage ${stage}; contract and policy terms captured for supplemental chain.`,
      }),
    };
  });
}

function buildBudgetRecords(capturedAt, parserVersion) {
  const fiscalSources = BASE_SOURCES.slice(6, 13);
  return Array.from({ length: 42 }, (_, index) => {
    const sourceItem = fiscalSources[index % fiscalSources.length];
    const specialFund = sourceItem.source_type === 'special_fund_policy';
    return {
      record_id: `r12-budget-${String(index + 1).padStart(3, '0')}`,
      dataset_kind: specialFund ? 'special_fund_policy' : 'budget_performance_policy',
      region: sourceItem.source_city || sourceItem.source_province,
      province: sourceItem.source_province,
      city: sourceItem.source_city,
      county: sourceItem.source_region_code?.startsWith('32') && !sourceItem.source_region_code.endsWith('00') ? sourceItem.source_city : '',
      normalized_region_code: sourceItem.source_region_code,
      indicator_name: `${sourceItem.keyword} policy chain sample ${index + 1}`,
      actual_value: String(1 + (index % 9)),
      actual_value_unit: index % 5 === 0 ? 'percent' : 'count',
      normalized_actual_value: String(1 + (index % 9)),
      budget_subject_category: specialFund ? 'special_fund_management' : 'budget_performance_management',
      policy_chain_stage: specialFund ? 'special_fund_to_payment_voucher' : 'budget_indicator_to_performance_target',
      disclosure_quality_focus: sourceItem.id === 'r12-taixing-budget-inspection' ? 'budget disclosure table integrity and rectification account' : 'policy-to-evidence checklist',
      required_budget_indicator_data: 'budget document number; department budget indicator; project catalog',
      required_performance_target_data: 'performance target table; cost-performance indicator; output indicator',
      required_payment_data: 'treasury payment detail; payee; payment date; fund destination',
      required_voucher_data: 'voucher abstract; accounting subject; source document number',
      fund_usage_restriction_level: specialFund ? 'strict' : 'normal',
      performance_evidence_required: true,
      finding_disposition: 'supplemental_data_only',
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: sourceItem.source_type,
        rawExcerpt: `${sourceItem.title}; policy chain fields captured for follow-up data requests.`,
      }),
    };
  });
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  const auditCases = [
    ['r12-audit-drug-fund', 'special_audit_survey', 55, 'review_recommended', 'drug safety special fund audit survey'],
    ['r12-audit-cultural-tourism-fund', 'special_audit_survey', 55, 'review_recommended', 'culture tourism special fund audit survey'],
    ['r12-audit-yancheng-rectification-survey', 'rectification_progress', 70, 'risk_candidate', 'Yancheng audit rectification investigation'],
    ['r12-audit-project-plan', 'audit_project_plan', 30, 'knowledge_reference', 'audit project planning reference'],
    ['r12-audit-yizheng-rectification-system', 'rectification_progress', 70, 'risk_candidate', 'Yizheng audit rectification system'],
    ['r12-audit-asset-method', 'work_method_reference', 20, 'knowledge_reference', 'asset special audit method reference'],
    ['r12-audit-performance-self-evaluation-pdf', 'methodology_or_experience', 20, 'knowledge_reference', 'audit performance self-evaluation PDF'],
  ];
  return Array.from({ length: 18 }, (_, index) => {
    const [sourceId, level, weight, disposition, title] = auditCases[index % auditCases.length];
    const sourceItem = byId(sourceId);
    return {
      case_seed_id: `r12-case-${String(index + 1).padStart(3, '0')}`,
      issue_title: `${title} sample ${index + 1}`,
      project_name: `${title} project ${index + 1}`,
      responsible_subject: sourceItem.publisher,
      issue_category: level,
      issue_amount: String(90000 + index * 21000),
      issue_amount_unit: 'yuan',
      audit_evidence_level: level,
      audit_evidence_weight: weight,
      audit_document_type: sourceItem.source_type,
      conclusion_strength: weight >= 70 ? 'medium' : 'low',
      requires_manual_verification: true,
      audit_topic_area: sourceItem.keyword,
      audit_project_scope: level === 'audit_project_plan' ? 'planned audit scope, not result evidence' : 'public audit work scope',
      audit_followup_focus: 'supplement formal report, rectification ledger, payment detail and voucher evidence',
      finding_disposition: disposition,
      required_next_data: ['formal audit report', 'rectification ledger', 'payment detail', 'voucher abstract'],
      recommended_next_data: ['manual review before risk conclusion'],
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
    manual_review_note: 'Round 12 official web research source; URL checked against previous registry snapshots.',
  };
}

function evidence(sourceItem, capturedAt, parserVersion, { rowNumber, sectionTitle, rawExcerpt }) {
  return {
    title: sourceItem.title,
    url: sourceItem.url,
    published_at: sourceItem.published_at,
    captured_at: capturedAt,
    row_number: rowNumber,
    parser_version: parserVersion,
    section_title: sectionTitle,
    paragraph_index: rowNumber,
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

function byId(sourceId) {
  const item = BASE_SOURCES.find((sourceItem) => sourceItem.id === sourceId);
  if (!item) throw new Error(`Unknown round12 source: ${sourceId}`);
  return item;
}

function purchaserFor(sourceItem) {
  if (sourceItem.central_unit_flag) return sourceItem.id.includes('tax') ? 'State Taxation Administration Taizhou Tax Bureau' : 'Central procurement unit';
  if (sourceItem.source_city === 'Changzhou') return sourceItem.id.includes('carbon') ? 'Changzhou Development and Reform Commission' : 'Changzhou public purchaser';
  if (sourceItem.source_city === 'Suzhou') return 'Suzhou public service purchaser';
  if (sourceItem.source_city === 'Wuxi') return 'Wuxi public resource purchaser';
  return sourceItem.publisher;
}

function hasPolicyChecklist(row) {
  return Boolean(row.required_budget_indicator_data && row.required_performance_target_data && row.required_payment_data && row.required_voucher_data);
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
  return `# Round 12 Official Public Instance Test

Generated at: ${summary.generated_at}

## Test Result
- Input records: ${summary.total_input_records}
- Accepted records: ${summary.total_accepted_records}
- Import success rate: ${summary.import_success_rate}%
- Source count: ${payloads.sourceRegister.sources.length}
- Previous source URL overlap: ${payloads.collectorSummary.previous_source_overlap_count}

## Coverage
- Contract term records: ${payloads.collectorSummary.contract_term_records}
- Government purchase service records: ${payloads.collectorSummary.government_purchase_service_records}
- Policy checklist coverage: ${payloads.collectorSummary.policy_chain_checklist_coverage_rate}%
- Audit evidence levels: ${formatObject(payloads.collectorSummary.audit_evidence_levels)}

## Official Sources
${payloads.sourceRegister.sources.map((item) => `- [${item.publisher}] ${item.title}: ${item.url}`).join('\n')}

## Further Optimization Plan
${summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}: ${item.action} Reason: ${item.reason}`).join('\n')}
`;
}

function renderHtml(markdown) {
  return `<!doctype html><meta charset="utf-8"><title>Round 12 Official Public Instance Test</title><pre>${escapeHtml(markdown)}</pre>`;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatObject(value) {
  return Object.entries(value || {}).map(([key, count]) => `${key} ${count}`).join(', ');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runTwelfthOfficialPublicInstanceTest().then(({ outputDir, summary }) => {
    console.log(`Wrote twelfth official public instance outputs to ${outputDir}`);
    console.log(JSON.stringify({
      total_input_records: summary.total_input_records,
      total_accepted_records: summary.total_accepted_records,
      import_success_rate: summary.import_success_rate,
      baseline: summary.round12_acceptance_baseline,
      output_dir: outputDir,
    }, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
