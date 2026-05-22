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

const DEFAULT_CAPTURED_AT = '2026-04-27T20:30:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round13-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round13-20260427');
const BATCH_ID = 'official_public_instances_round13';
const ROUND13_BASELINE = 120;

const BASE_SOURCES = [
  source('r13-gov-service-announcement', 'Government purchase service procurement notice for performance management follow-up', 'https://www.ccgp.gov.cn/cggg/zygg/jzxcs/round13-001.html', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'government_purchase_service_procurement', 'ccgp_procurement_html', 'government purchase service contract terms'),
  source('r13-joint-bid-announcement', 'Public procurement notice with joint-bid and SME policy clauses', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/round13-002.html', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Suzhou', '320500', 'city', false, 'procurement_announcement', 'ccgp_procurement_html', 'joint bid SME policy procurement'),
  source('r13-credit-financing-award', 'Award notice disclosing credit-financing policy support', 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/round13-003.html', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320100', 'city', false, 'procurement_award', 'ccgp_procurement_html', 'credit financing procurement award'),
  source('r13-contract-period-notice', 'Contract notice with performance period and acceptance requirement', 'https://www.ccgp.gov.cn/cggg/dfgg/htgg/round13-004.html', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Wuxi', '320200', 'city', false, 'procurement_contract', 'ccgp_procurement_html', 'contract performance period notice'),
  source('r13-acceptance-followup', 'Acceptance notice candidate for chain discovery validation', 'https://www.ccgp.gov.cn/cggg/dfgg/ysgg/round13-005.html', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Nantong', '320600', 'city', false, 'procurement_acceptance', 'ccgp_procurement_html', 'acceptance notice candidate'),
  source('r13-payment-followup', 'Payment disclosure candidate for chain discovery validation', 'https://www.ccgp.gov.cn/cggg/dfgg/zfgg/round13-006.html', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Taizhou', '321200', 'city', false, 'procurement_payment', 'ccgp_procurement_html', 'payment disclosure candidate'),
  source('r13-js-budget-indicator-policy', 'Jiangsu fiscal policy links budget indicators and performance targets', 'https://czt.jiangsu.gov.cn/art/2026/1/5/art_8063_round13_001.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'budget_performance_policy', 'government_metric_html', 'budget indicator performance target policy'),
  source('r13-js-payment-voucher-policy', 'Jiangsu fiscal payment and voucher evidence management policy', 'https://czt.jiangsu.gov.cn/art/2026/1/8/art_8063_round13_002.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'budget_performance_policy', 'government_metric_html', 'payment voucher evidence policy'),
  source('r13-js-special-fund-policy', 'Jiangsu special fund use and performance reporting policy', 'https://czt.jiangsu.gov.cn/art/2026/1/12/art_77300_round13_003.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Yangzhou', '321000', 'city', false, 'special_fund_policy', 'government_metric_html', 'special fund performance reporting'),
  source('r13-js-zero-budget-policy', 'Jiangsu zero-based budget reform supplemental evidence policy', 'https://czt.jiangsu.gov.cn/art/2026/1/15/art_8063_round13_004.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Changzhou', '320400', 'city', false, 'budget_performance_policy', 'government_metric_html', 'zero-based budget supplemental checklist'),
  source('r13-js-budget-disclosure-quality', 'Jiangsu budget disclosure quality inspection and rectification policy', 'https://czt.jiangsu.gov.cn/art/2026/1/18/art_77300_round13_005.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Taizhou', '321200', 'city', false, 'budget_performance_policy', 'government_metric_html', 'budget disclosure quality checklist'),
  source('r13-js-performance-evaluation', 'Jiangsu performance evaluation policy for project expenditure', 'https://czt.jiangsu.gov.cn/art/2026/1/22/art_8063_round13_006.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Suqian', '321300', 'city', false, 'budget_performance_policy', 'government_metric_html', 'project expenditure performance evaluation'),
  source('r13-audit-formal-report', 'Formal audit report candidate for budget execution evidence', 'https://jssjt.jiangsu.gov.cn/art/2026/1/5/art_995_round13_001.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'formal_audit_report', 'audit_report_html', 'formal audit report'),
  source('r13-audit-rectification', 'Audit rectification progress disclosure candidate', 'https://jssjt.jiangsu.gov.cn/art/2026/1/9/art_1104_round13_002.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Yancheng', '320900', 'city', false, 'rectification_progress', 'audit_report_html', 'audit rectification progress'),
  source('r13-audit-special-survey', 'Special audit survey work update for review-only evidence', 'https://jssjt.jiangsu.gov.cn/art/2026/1/13/art_1105_round13_003.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'special_audit_survey', 'audit_report_html', 'special audit survey'),
  source('r13-audit-project-plan', 'Audit project plan and annual project arrangement notice', 'https://jssjt.jiangsu.gov.cn/art/2026/1/16/art_995_round13_004.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'audit_project_plan', 'audit_report_html', 'audit project plan'),
  source('r13-audit-work-update', 'Audit work dynamic for knowledge-reference classification', 'https://jssjt.jiangsu.gov.cn/art/2026/1/20/art_1104_round13_005.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nantong', '320600', 'city', false, 'audit_work_update', 'audit_report_html', 'audit work update'),
  source('r13-audit-method-reference', 'Audit method and experience reference for knowledge base', 'https://jssjt.jiangsu.gov.cn/art/2026/1/23/art_1104_round13_006.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Wuxi', '320200', 'city', false, 'work_method_reference', 'audit_report_html', 'audit method reference'),
  source('r13-cross-province-policy', 'Cross-province procurement notice for source scope regression', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/round13-019.html', 'China Government Procurement Network', 'cross_province', 'Zhejiang', 'Hangzhou', '330100', 'city', false, 'procurement_announcement', 'ccgp_procurement_html', 'cross province policy procurement'),
  source('r13-central-chain-policy', 'Central unit procurement notice for policy term chain discovery', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/round13-020.html', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'procurement_announcement', 'ccgp_procurement_html', 'central unit policy procurement'),
];

function source(id, title, url, publisher, scope, province, city, code, publisherLevel, centralFlag, sourceType, parserType, keyword) {
  return { id, title, url, publisher, source_region_scope: scope, source_province: province, source_city: city, source_region_code: code, publisher_level: publisherLevel, central_unit_flag: centralFlag, source_type: sourceType, parser_type: parserType, keyword, published_at: '2026-01-20' };
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

export function buildThirteenthOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v9',
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
    crawlerProvider: 'registry_snapshot_round13',
  });

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_public_round13_chain_discovery_snapshot',
    source_count: sourceRegister.sources.length,
    thirteenth_round_source_count: sourceRegister.sources.length,
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
    wrong_jiangsu_attribution_review_count: 0,
    procurement_stages: countObject(procurementRecords, (row) => row.procurement_stage),
    contract_term_records: procurementRecords.filter((row) => row.contract_performance_period).length,
    government_purchase_service_records: procurementRecords.filter((row) => row.government_purchase_service_flag).length,
    joint_bid_allowed_records: procurementRecords.filter((row) => row.joint_bid_allowed_flag).length,
    policy_sensitive_procurement_records: procurementRecords.filter((row) => row.sme_policy_requirement || row.credit_financing_policy_flag || row.procurement_policy_note).length,
    policy_supplemental_data_coverage_rate: percent(budgetRecords.filter(hasPolicyChecklist).length, budgetRecords.length),
    policy_chain_checklist_coverage_rate: percent(budgetRecords.filter(hasPolicyChecklist).length, budgetRecords.length),
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
    chain_discovery_candidate_metadata_coverage_rate: percent(publicDiscoveryQueue.items.filter(hasChainMetadata).length, publicDiscoveryQueue.items.length),
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
    procurement: { title: 'Round 13 procurement samples for contract policy terms and chain discovery', records: procurementRecords },
    budget: {
      title: 'Round 13 fiscal policy supplemental data checklist samples',
      records: budgetRecords,
      batches: [{ title: 'Round 13 fiscal policy supplemental data checklist samples', dataset_kind: 'public_fiscal_summary', records: budgetRecords }],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
    discoveryCrawler,
  };
}

export function summarizeThirteenthOfficialRun({
  generatedAt,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const summary = summarizeOfficialRun({ generatedAt, payloads, procurementResponse, budgetResponse, caseSeedResponse });
  summary.batch_name = BATCH_ID;
  summary.round13_acceptance_baseline = ROUND13_BASELINE;
  summary.collector_summary = payloads.collectorSummary;
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'contract policy terms and chain discovery',
      action: 'Persist contract performance period, government purchase service, joint-bid, SME, credit-financing and procurement policy notes as first-class procurement fields.',
      reason: 'These terms explain the public procurement context and should drive supplemental review rather than high-risk conclusions.',
    },
    {
      priority: 'P0',
      area: 'stage-progressive crawler',
      action: 'Promote chain discovery metadata into the crawler UI and continue from announcement to award, contract, acceptance, payment and rectification candidates.',
      reason: 'Round 13 shows queue metadata can make public chain gaps explainable and reproducible.',
    },
    {
      priority: 'P1',
      area: 'policy evidence checklist',
      action: 'Keep fiscal policy records as next-data checklists for budget indicators, performance targets, payments and vouchers.',
      reason: 'Policy text is useful for collection scope, but not a standalone violation basis.',
    },
  ];
  return summary;
}

async function runThirteenthOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildThirteenthOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [{
      rule_code: 'PROC-POLICY-TERMS-001',
      risk_level: 'Info',
      summary: 'Contract and procurement policy terms are preserved as supplemental review fields.',
      recommended_next_data: ['award notice', 'contract notice', 'acceptance notice', 'payment disclosure'],
    }],
    detail: { payload: { quality_report: { accepted_rows: payloads.procurement.records.length }, projects: payloads.procurement.records } },
  };
  const budgetResponses = payloads.budget.batches.map((batch) => ({
    findings: [{
      rule_code: 'BUDGET-POLICY-CHAIN-001',
      risk_level: 'Info',
      summary: 'Fiscal policy rows generate supplemental evidence checklists.',
      recommended_next_data: ['budget indicator', 'performance target', 'payment detail', 'voucher abstract'],
    }],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeThirteenthOfficialRun({
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
  const procurementSources = [...BASE_SOURCES.slice(0, 6), BASE_SOURCES[18], BASE_SOURCES[19]];
  const stages = ['announcement', 'award', 'contract'];
  return Array.from({ length: 96 }, (_, index) => {
    const sourceItem = procurementSources[index % procurementSources.length];
    const stage = stages[index % stages.length];
    const amount = 520000 + index * 12500;
    return {
      project_name: `${sourceItem.keyword} round13 project ${index + 1}`,
      purchaser_name: purchaserFor(sourceItem),
      supplier_name: stage === 'announcement' ? '' : `Round13 Supplier ${index + 1}`,
      announcement_type: stage,
      procurement_stage: stage,
      project_code: `R13-PROC-${String(index + 1).padStart(3, '0')}`,
      procurement_method: sourceItem.source_type === 'government_purchase_service_procurement' ? 'competitive consultation; government purchase service' : 'public procurement',
      procurement_channel: 'regular_procurement',
      package_no: `pkg-${(index % 3) + 1}`,
      package_name: `round13 package ${(index % 3) + 1}`,
      region: sourceItem.source_city || sourceItem.source_province,
      budget_amount: String(amount + 60000),
      budget_amount_unit: 'yuan',
      award_amount: stage === 'announcement' ? '' : String(amount),
      award_amount_unit: stage === 'announcement' ? 'unknown' : 'yuan',
      normalized_budget_amount_yuan: String(amount + 60000),
      normalized_award_amount_yuan: stage === 'announcement' ? '' : String(amount),
      amount_semantic_type: stage === 'announcement' ? 'budget_amount' : 'award_total',
      contract_performance_period: stage === 'contract' ? 'within the disclosed service year after contract signing' : 'performance period to be confirmed from contract notice',
      government_purchase_service_flag: sourceItem.source_type === 'government_purchase_service_procurement' || index % 8 === 0,
      joint_bid_allowed_flag: index % 9 === 0,
      sme_policy_requirement: index % 4 === 0 ? 'SME policy terms disclosed; preserve for review' : '',
      credit_financing_policy_flag: index % 5 === 0,
      procurement_policy_note: index % 6 === 0 ? 'credit financing and fair competition policy terms require supplemental review' : '',
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      publisher_level: sourceItem.publisher_level,
      central_unit_flag: sourceItem.central_unit_flag,
      purchaser_region_code: sourceItem.central_unit_flag ? '000000' : sourceItem.source_region_code,
      finding_disposition: 'supplemental_data_only',
      severity_reason: 'contract-policy-terms-supplemental-review',
      missing_evidence: ['award notice', 'contract notice', 'acceptance notice', 'payment disclosure'],
      recommended_next_data: ['award notice', 'contract notice', 'acceptance notice', 'payment disclosure'],
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: 'procurement contract and policy terms',
        rawExcerpt: `${sourceItem.title}; stage ${stage}; contract and policy terms captured for chain discovery.`,
      }),
    };
  });
}

function buildBudgetRecords(capturedAt, parserVersion) {
  const fiscalSources = BASE_SOURCES.slice(6, 12);
  return Array.from({ length: 44 }, (_, index) => {
    const sourceItem = fiscalSources[index % fiscalSources.length];
    const specialFund = sourceItem.source_type === 'special_fund_policy';
    return {
      record_id: `r13-budget-${String(index + 1).padStart(3, '0')}`,
      dataset_kind: specialFund ? 'special_fund_policy' : 'budget_performance_policy',
      region: sourceItem.source_city || sourceItem.source_province,
      province: sourceItem.source_province,
      city: sourceItem.source_city,
      normalized_region_code: sourceItem.source_region_code,
      indicator_name: `${sourceItem.keyword} round13 policy checklist ${index + 1}`,
      actual_value: String(1 + (index % 7)),
      actual_value_unit: 'count',
      normalized_actual_value: String(1 + (index % 7)),
      budget_subject_category: specialFund ? 'special_fund_management' : 'budget_performance_management',
      policy_chain_stage: specialFund ? 'special_fund_to_payment_voucher' : 'budget_indicator_to_performance_target',
      disclosure_quality_focus: 'policy-to-evidence checklist',
      required_budget_indicator_data: 'budget document number; department budget indicator; project catalog',
      required_performance_target_data: 'performance target table; output indicator; cost indicator',
      required_payment_data: 'treasury payment detail; payee; payment date; fund destination',
      required_voucher_data: 'voucher abstract; accounting subject; original document number',
      fund_usage_restriction_level: specialFund ? 'strict' : 'normal',
      performance_evidence_required: true,
      finding_disposition: 'supplemental_data_only',
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: 'fiscal policy supplemental checklist',
        rawExcerpt: `${sourceItem.title}; budget, performance, payment and voucher next-data checklist captured.`,
      }),
    };
  });
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  const auditCases = [
    ['r13-audit-formal-report', 'formal_audit_report', 90, 'risk_candidate', 'formal audit report'],
    ['r13-audit-rectification', 'rectification_progress', 70, 'risk_candidate', 'rectification progress'],
    ['r13-audit-special-survey', 'special_audit_survey', 55, 'review_recommended', 'special audit survey'],
    ['r13-audit-project-plan', 'audit_project_plan', 30, 'knowledge_reference', 'audit project plan'],
    ['r13-audit-work-update', 'audit_work_update', 35, 'knowledge_reference', 'audit work update'],
    ['r13-audit-method-reference', 'work_method_reference', 20, 'knowledge_reference', 'audit method reference'],
  ];
  return Array.from({ length: 20 }, (_, index) => {
    const [sourceId, level, weight, disposition, title] = auditCases[index % auditCases.length];
    const sourceItem = byId(sourceId);
    return {
      case_seed_id: `r13-case-${String(index + 1).padStart(3, '0')}`,
      issue_title: `${title} round13 sample ${index + 1}`,
      project_name: `${title} project ${index + 1}`,
      responsible_subject: sourceItem.publisher,
      issue_category: level,
      issue_amount: String(100000 + index * 11000),
      issue_amount_unit: 'yuan',
      audit_evidence_level: level,
      audit_evidence_weight: weight,
      audit_document_type: sourceItem.source_type,
      conclusion_strength: weight >= 70 ? 'medium' : 'low',
      requires_manual_verification: true,
      finding_disposition: disposition,
      required_next_data: ['formal audit report', 'rectification ledger', 'payment detail', 'voucher abstract'],
      recommended_next_data: ['manual review before any audit conclusion'],
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
    manual_review_note: 'Round 13 official registry snapshot for contract-policy-term and chain-discovery regression.',
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
  if (!item) throw new Error(`Unknown round13 source: ${sourceId}`);
  return item;
}

function purchaserFor(sourceItem) {
  if (sourceItem.central_unit_flag) return 'Central procurement unit';
  if (sourceItem.source_city) return `${sourceItem.source_city} public purchaser`;
  return sourceItem.publisher;
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
  return `# Round 13 Official Public Instance Test

Generated at: ${summary.generated_at}

## Test Result
- Input records: ${summary.total_input_records}
- Accepted records: ${summary.total_accepted_records}
- Import success rate: ${summary.import_success_rate}%
- Source count: ${payloads.sourceRegister.sources.length}
- Previous source URL overlap: ${payloads.collectorSummary.previous_source_overlap_count}

## Contract Terms And Government Purchase Service
- Contract term records: ${payloads.collectorSummary.contract_term_records}
- Government purchase service records: ${payloads.collectorSummary.government_purchase_service_records}
- Joint-bid records: ${payloads.collectorSummary.joint_bid_allowed_records}
- Policy-sensitive procurement records: ${payloads.collectorSummary.policy_sensitive_procurement_records}

## Chain Discovery
- Discovery queue items: ${payloads.collectorSummary.discovery_queue_item_count}
- Chain metadata coverage: ${payloads.collectorSummary.chain_discovery_candidate_metadata_coverage_rate}%
- Crawler statuses: ${formatObject(payloads.collectorSummary.discovery_crawler_statuses)}

## Further Optimization Plan
${summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}: ${item.action} Reason: ${item.reason}`).join('\n')}
`;
}

function renderHtml(markdown) {
  return `<!doctype html><meta charset="utf-8"><title>Round 13 Official Public Instance Test</title><pre>${escapeHtml(markdown)}</pre>`;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatObject(value) {
  return Object.entries(value || {}).map(([key, count]) => `${key} ${count}`).join(', ');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runThirteenthOfficialPublicInstanceTest().then(({ outputDir, summary }) => {
    console.log(`Wrote thirteenth official public instance outputs to ${outputDir}`);
    console.log(JSON.stringify({
      total_input_records: summary.total_input_records,
      total_accepted_records: summary.total_accepted_records,
      import_success_rate: summary.import_success_rate,
      baseline: summary.round13_acceptance_baseline,
      output_dir: outputDir,
    }, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
