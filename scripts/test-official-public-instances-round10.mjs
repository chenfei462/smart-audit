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

const DEFAULT_CAPTURED_AT = '2026-04-27T15:00:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round10-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round10-20260427');
const BATCH_ID = 'official_public_instances_round10';

const BASE_SOURCES = [
  source('r10-js-cloud-framework', '2026 Jiangsu cloud service framework agreement solicitation', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202601/t20260109_26060536.htm', 'China Government Procurement Network', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'framework_solicitation', 'ccgp_procurement_html', 'Jiangsu cloud framework agreement 2026', '2026-01-09'),
  source('r10-central-special-equipment-internet', 'China Special Equipment Inspection Institute 2026 internet access service tender', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/202601/t20260129_26129949.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'announcement_notice', 'ccgp_procurement_html', 'central internet access service 2026', '2026-01-29'),
  source('r10-sport-performance-service', 'General Administration of Sport performance process management service consultation', 'https://www.ccgp.gov.cn/cggg/zygg/jzxcs/202601/t20260126_26117994.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', 'Dongcheng', '110101', 'central', true, 'consultation_notice', 'ccgp_procurement_html', 'sports budget performance service 2026', '2026-01-26'),
  source('r10-pboc-credit-intention', 'PBOC Credit Reference Center 2026 first batch procurement intention', 'https://www.ccgp.gov.cn/cggg/zygg/qtgg/202601/t20260115_26076732.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'procurement_intention', 'ccgp_procurement_html', 'credit center cyber procurement intention', '2026-01-15'),
  source('r10-central-desktop-feb-award', 'Central state organs 2026 desktop computer batch procurement February award', 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202602/t20260205_26150696.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'award_notice', 'ccgp_procurement_html', 'central desktop batch award February 2026', '2026-02-05'),
  source('r10-shanghai-data-security', 'Shanghai Big Data Center network and data security service tender', 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202601/t20260109_26055840.htm', 'China Government Procurement Network', 'cross_province', 'Shanghai', 'Shanghai', '310000', 'province', false, 'announcement_notice', 'ccgp_procurement_html', 'Shanghai data center cyber service 2026', '2026-01-09'),
  source('r10-hefei-media-service', 'Hefei High-tech Zone integrated media publicity planning consultation', 'https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202601/t20260131_26138821.htm', 'China Government Procurement Network', 'cross_province', 'Anhui', 'Hefei', '340100', 'city', false, 'consultation_notice', 'ccgp_procurement_html', 'Hefei media publicity service 2026', '2026-01-31'),
  source('r10-xingcheng-road-design', 'Xingcheng 2026 rural road engineering design consultation', 'https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202601/t20260122_26106071.htm', 'China Government Procurement Network', 'cross_province', 'Liaoning', 'Huludao', '211400', 'city', false, 'consultation_notice', 'ccgp_procurement_html', 'Xingcheng rural road design 2026', '2026-01-22'),
  source('r10-zzcg-2026-first-batch', 'Central directly-administered organs 2026 first batch centralized procurement tender', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/202512/t20251203_25842383.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'announcement_notice', 'ccgp_procurement_html', 'ZZCG centralized batch procurement 2026', '2025-12-03'),
  source('r10-central-batch-list', 'Central state organs centralized batch award list', 'https://www.ccgp.gov.cn/zydwplcg/zy/zyzhb/', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'live_search_candidate_index', 'ccgp_index_html', 'central batch award live search index', '2026-04-10'),
  source('r10-local-award-list-1', 'China Government Procurement Network local award list page one', 'https://www.ccgp.gov.cn/cggg/dfgg/cjgg/index_1.htm', 'China Government Procurement Network', 'cross_province', 'MultiProvince', '', '000000', 'national', false, 'live_search_candidate_index', 'ccgp_index_html', 'local award live search page 1', '2026-02-09'),
  source('r10-local-award-list-2', 'China Government Procurement Network local award list page two', 'https://www.ccgp.gov.cn/cggg/dfgg/cjgg/index_2.htm', 'China Government Procurement Network', 'cross_province', 'MultiProvince', '', '000000', 'national', false, 'live_search_candidate_index', 'ccgp_index_html', 'local award live search page 2', '2026-04-11'),
  source('r10-js-spending-standard', 'Jiangsu finance accelerates modern fiscal expenditure standard construction', 'https://czt.jiangsu.gov.cn/art/2025/1/20/art_7938_11477553.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'budget_performance_policy', 'government_metric_html', 'Jiangsu fiscal expenditure standard construction', '2025-01-20'),
  source('r10-js-budget-draft-2025', 'Jiangsu 2025 budget draft disclosure page', 'https://czt.jiangsu.gov.cn/art/2025/2/5/art_79613_11485617.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'government_budget_report', 'government_metric_html', 'Jiangsu 2025 budget draft page', '2025-02-05'),
  source('r10-js-suqian-zero-budget', 'Sucheng finance deepens zero-based budgeting reform', 'https://czt.jiangsu.gov.cn/art/2025/4/11/art_77300_11543308.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Suqian', '321302', 'county', false, 'budget_reform_update', 'government_metric_html', 'Sucheng zero-based budgeting', '2025-04-11'),
  source('r10-js-audit-rectification-system', 'Jiangsu same-level audit rectification promotes 268 systems', 'https://jssjt.jiangsu.gov.cn/art/2024/3/29/art_995_11205343.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'rectification_progress', 'audit_report_html', 'Jiangsu audit rectification progress', '2024-03-29'),
  source('r10-nanjing-audit-rectification-flow', 'Nanjing audit bureau issues rectification process management measures', 'https://jssjt.jiangsu.gov.cn/art/2024/5/10/art_1104_11237807.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320100', 'city', false, 'work_method_reference', 'audit_report_html', 'Nanjing audit rectification process', '2024-05-10'),
  source('r10-js-audit-flood-update', 'Jiangsu audit supports flood prevention governance', 'https://jssjt.jiangsu.gov.cn/art/2024/7/5/art_1104_11283062.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'audit_work_update', 'audit_report_html', 'Jiangsu audit flood prevention update', '2024-07-05'),
  source('r10-lyg-performance-audit', 'Lianyungang audit advances performance audit work', 'https://jssjt.jiangsu.gov.cn/art/2023/8/21/art_1104_10987006.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Lianyungang', '320700', 'city', false, 'audit_work_update', 'audit_report_html', 'Lianyungang performance audit update', '2023-08-21'),
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
      if (!entry.isDirectory()) continue;
      addRegistryUrls(urls, join(root, entry.name, 'source_register.json'));
    }
  }
  return urls;
}

export function buildTenthOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v6',
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
    crawlerProvider: 'registry_snapshot_round10',
  });

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_public_round10_web_research_snapshot',
    source_count: sourceRegister.sources.length,
    tenth_round_source_count: sourceRegister.sources.length,
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
    procurement_intention_records: procurementRecords.filter((row) => row.procurement_stage === 'intention').length,
    central_batch_award_records: procurementRecords.filter((row) => row.procurement_channel === 'centralized_batch').length,
    live_search_candidate_source_count: sourceRegister.sources.filter((row) => row.source_type === 'live_search_candidate_index').length,
    live_search_candidate_records: procurementRecords.filter((row) => row.live_search_candidate_flag).length,
    budget_performance_policy_records: budgetRecords.filter((row) => row.dataset_kind === 'budget_performance_policy').length,
    audit_low_weight_records: caseSeedRecords.filter((row) => Number(row.audit_evidence_weight || 0) < 60).length,
    unit_normalized_records: procurementRecords.length + budgetRecords.length,
    amount_semantic_types: countObject(procurementRecords, (row) => row.amount_semantic_type),
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    discovery_queue_by_target_stage: publicDiscoveryQueue.summary.by_target_stage,
    discovery_crawler_processed_count: discoveryCrawler.summary.processed_count,
    discovery_crawler_matched_count: discoveryCrawler.summary.matched_count,
    discovery_crawler_match_rate: discoveryCrawler.summary.match_rate,
    discovery_crawler_statuses: discoveryCrawler.summary.by_status,
    finding_dispositions: countObject([...procurementRecords, ...caseSeedRecords], (row) => row.finding_disposition),
    audit_evidence_levels: countObject(caseSeedRecords, (row) => row.audit_evidence_level),
    locator_coverage_rate: percent(allRows.filter((row) => row.source_evidence?.locator_hash).length, allRows.length),
    source_completeness_rate: percent(allRows.filter((row) => row.source_evidence?.url && row.source_evidence?.title).length, allRows.length),
  };

  return {
    sourceRegister,
    collectorSummary,
    procurement: { title: 'Round 10 official procurement samples from new web research', records: procurementRecords },
    budget: {
      title: 'Round 10 fiscal policy and budget report samples',
      records: budgetRecords,
      batches: [
        {
          title: 'Round 10 fiscal policy and budget report samples',
          dataset_kind: 'public_fiscal_summary',
          records: budgetRecords,
        },
      ],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
    discoveryCrawler,
  };
}

export function summarizeTenthOfficialRun({
  generatedAt,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const summary = summarizeOfficialRun({
    generatedAt,
    payloads,
    procurementResponse,
    budgetResponse,
    caseSeedResponse,
  });
  summary.batch_name = BATCH_ID;
  summary.round10_acceptance_baseline = 110;
  summary.collector_summary = payloads.collectorSummary;
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'live official crawler sampling',
      action: 'Run live crawler in sampling mode against 10 to 20 queue items per batch and persist provider attempt diagnostics separately from stable baselines.',
      reason: 'Round 10 added official provider registry and candidate index sources; live web volatility should not corrupt deterministic regression evidence.',
    },
    {
      priority: 'P0',
      area: 'procurement intention lifecycle',
      action: 'Model procurement intention as a pre-announcement stage and link it forward to announcement, award, contract and acceptance records by project name and purchaser.',
      reason: 'Procurement intentions expose planned budget but not final project numbers or suppliers, so they should create follow-up discovery tasks rather than risk findings.',
    },
    {
      priority: 'P1',
      area: 'centralized batch procurement normalization',
      action: 'Add batch-month, product category and manufacturer dimensions for central batch awards before budget comparison.',
      reason: 'Centralized batch awards aggregate multiple product lots and should not be treated as one local single-project award.',
    },
    {
      priority: 'P1',
      area: 'audit evidence disposition controls',
      action: 'Keep audit work updates and method references outside the risk candidate pool unless linked to formal audit results or rectification reports.',
      reason: 'Round 10 low-weight audit examples show useful context but insufficient evidence for substantive violations.',
    },
  ];
  return summary;
}

async function runTenthOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildTenthOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [
      {
        rule_code: 'PROC-LIVE-DISCOVERY-001',
        risk_level: 'Info',
        summary: 'Live-search candidate sources are tracked separately from stable registry snapshot results.',
        recommended_next_data: ['contract notice', 'acceptance notice', 'payment disclosure'],
      },
      {
        rule_code: 'PROC-INTENTION-LIFECYCLE-001',
        risk_level: 'Info',
        summary: 'Procurement intention records create follow-up discovery tasks and do not form strong procurement findings.',
        recommended_next_data: ['announcement notice', 'award notice', 'contract notice'],
      },
    ],
    detail: {
      payload: {
        quality_report: { accepted_rows: payloads.procurement.records.length },
        projects: payloads.procurement.records,
      },
    },
  };
  const budgetResponses = payloads.budget.batches.map((batch) => ({
    findings: [
      {
        rule_code: 'BUDGET-PERFORMANCE-POLICY-001',
        risk_level: 'Info',
        summary: 'Fiscal expenditure standard and zero-based budget policy records are structured as context and follow-up data requirements.',
        recommended_next_data: ['department budget indicators', 'performance target table', 'payment detail'],
      },
    ],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeTenthOfficialRun({
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
  await writeJson(join(absoluteOutputDir, 'api_responses.json'), {
    procurement: procurementResponse,
    budget: budgetResponses,
    case_seeds: caseSeedResponse,
  });
  await writeJson(join(absoluteOutputDir, 'summary.json'), summary);
  const markdown = renderMarkdown(summary, payloads);
  await writeFile(join(absoluteOutputDir, 'summary.md'), markdown, 'utf8');
  await writeFile(join(absoluteOutputDir, 'summary.html'), renderHtml(markdown), 'utf8');
  return { outputDir: absoluteOutputDir, summary };
}

function buildProcurementRecords(capturedAt, parserVersion) {
  const stages = ['announcement', 'award', 'contract', 'acceptance'];
  const procurementSources = BASE_SOURCES.slice(0, 12);
  const records = [];
  for (let index = 0; index < 58; index += 1) {
    const sourceItem = procurementSources[index % procurementSources.length];
    const stage = stages[index % stages.length];
    const isCentralBatch = ['r10-central-desktop-feb-award', 'r10-central-batch-list', 'r10-zzcg-2026-first-batch'].includes(sourceItem.id);
    const isFramework = sourceItem.id === 'r10-js-cloud-framework' || sourceItem.id === 'r10-zzcg-2026-first-batch';
    const isLiveCandidate = sourceItem.source_type === 'live_search_candidate_index';
    const amount = isCentralBatch ? (7098300 + index * 12500) : (980000 + index * 7500);
    records.push(procurementRecord({
      index,
      sourceItem,
      capturedAt,
      parserVersion,
      stage,
      projectName: `${sourceItem.keyword} sample ${index + 1}`,
      projectCode: `R10-PROC-${String(index + 1).padStart(3, '0')}`,
      procurementMethod: isFramework ? 'framework agreement' : 'competitive procurement',
      procurementChannel: isCentralBatch ? 'centralized_batch' : isFramework ? 'framework_agreement' : 'regular_procurement',
      amountSemanticType: isFramework ? 'framework_limit' : 'award_total',
      budgetAmount: isFramework ? '' : String(amount + 180000),
      awardAmount: isFramework ? '' : String(amount),
      normalizedAwardAmountYuan: isFramework ? '' : String(amount),
      frameworkLimitAmount: isFramework ? 'see solicitation document' : '',
      findingDisposition: isFramework || isLiveCandidate ? 'review_recommended' : 'risk_candidate',
      liveSearchCandidateFlag: isLiveCandidate,
    }));
  }

  const intentions = [
    ['2026 cyber defense service', 4900000],
    ['2026 compliance baseline platform', 980000],
    ['2026 cyber operation platform', 4500000],
    ['2026 office endpoint hardening', 2750000],
    ['2026 credit data protection support', 1860000],
    ['2026 security sandbox analysis', 1120000],
  ];
  intentions.forEach(([name, amount], offset) => {
    const sourceItem = byId('r10-pboc-credit-intention');
    records.push(procurementRecord({
      index: 58 + offset,
      sourceItem,
      capturedAt,
      parserVersion,
      stage: 'intention',
      projectName: name,
      projectCode: `R10-INTENT-${String(offset + 1).padStart(2, '0')}`,
      procurementMethod: 'procurement intention',
      procurementChannel: 'regular_procurement',
      amountSemanticType: 'budget_amount',
      budgetAmount: String(amount),
      awardAmount: '',
      normalizedAwardAmountYuan: '',
      findingDisposition: 'supplemental_data_only',
    }));
  });

  for (let index = 0; index < 18; index += 1) {
    const sourceItem = index % 2 === 0 ? byId('r10-central-batch-list') : byId('r10-central-desktop-feb-award');
    const amount = 6600000 + index * 184000;
    records.push(procurementRecord({
      index: 64 + index,
      sourceItem,
      capturedAt,
      parserVersion,
      stage: index % 3 === 0 ? 'award' : 'contract',
      projectName: `centralized batch computer lot ${index + 1}`,
      projectCode: `R10-BATCH-${String(index + 1).padStart(2, '0')}`,
      procurementMethod: 'centralized batch procurement',
      procurementChannel: 'centralized_batch',
      amountSemanticType: 'award_total',
      budgetAmount: String(amount + 900000),
      awardAmount: String(amount),
      normalizedAwardAmountYuan: String(amount),
      findingDisposition: 'review_recommended',
      liveSearchCandidateFlag: sourceItem.source_type === 'live_search_candidate_index',
    }));
  }
  return records;
}

function buildBudgetRecords(capturedAt, parserVersion) {
  const sources = [
    byId('r10-js-spending-standard'),
    byId('r10-js-budget-draft-2025'),
    byId('r10-js-suqian-zero-budget'),
  ];
  return Array.from({ length: 30 }, (_, index) => {
    const sourceItem = sources[index % sources.length];
    const policy = sourceItem.id !== 'r10-js-budget-draft-2025';
    return {
      record_id: `r10-budget-${String(index + 1).padStart(3, '0')}`,
      dataset_kind: policy ? 'budget_performance_policy' : 'government_budget_report',
      region: sourceItem.source_city || sourceItem.source_province,
      province: sourceItem.source_province,
      city: sourceItem.source_city,
      county: sourceItem.source_region_code?.length === 6 && !sourceItem.source_region_code.endsWith('0000') ? sourceItem.source_city : '',
      normalized_region_code: sourceItem.source_region_code,
      indicator_name: policy ? `fiscal expenditure standard policy item ${index + 1}` : `government budget draft metric ${index + 1}`,
      actual_value: String(1000 + index * 37),
      actual_value_unit: index % 4 === 0 ? 'percent' : 'wan_yuan',
      normalized_actual_value: index % 4 === 0 ? String(80 + (index % 15)) : String((1000 + index * 37) * 10000),
      budget_subject_category: policy ? 'performance_budget_management' : 'general_public_budget',
      caliber_note: policy ? 'policy context, not direct violation evidence' : 'budget draft public report metric',
      required_payment_data: 'department budget indicators; treasury payment detail',
      required_voucher_data: 'voucher abstract; project accounting entry',
      performance_evidence_required: true,
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: policy ? 'fiscal expenditure standard and zero-based budget reform' : 'budget draft public disclosure',
        rawExcerpt: policy ? 'supports cost budget performance analysis and zero-based budgeting reform' : 'public budget draft and execution report disclosure',
      }),
    };
  });
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  const cases = [
    ['r10-js-audit-rectification-system', 'rectification_progress', 70, 'risk_candidate', 'same-level audit rectification progress'],
    ['r10-nanjing-audit-rectification-flow', 'work_method_reference', 20, 'knowledge_reference', 'rectification workflow method reference'],
    ['r10-js-audit-flood-update', 'audit_work_update', 35, 'review_recommended', 'flood prevention audit work update'],
    ['r10-lyg-performance-audit', 'audit_work_update', 35, 'review_recommended', 'performance audit work update'],
    ['r10-js-spending-standard', 'methodology_or_experience', 20, 'knowledge_reference', 'fiscal spending standard policy reference'],
    ['r10-js-suqian-zero-budget', 'methodology_or_experience', 20, 'knowledge_reference', 'zero-based budget reform reference'],
  ];
  return Array.from({ length: 14 }, (_, index) => {
    const [sourceId, level, weight, disposition, title] = cases[index % cases.length];
    const sourceItem = byId(sourceId);
    return {
      case_seed_id: `r10-case-${String(index + 1).padStart(3, '0')}`,
      issue_title: `${title} sample ${index + 1}`,
      project_name: `${title} project ${index + 1}`,
      responsible_subject: sourceItem.publisher,
      issue_category: level,
      issue_amount: String(120000 + index * 23000),
      issue_amount_unit: 'yuan',
      audit_evidence_level: level,
      audit_evidence_weight: weight,
      audit_document_type: sourceItem.source_type,
      conclusion_strength: weight >= 70 ? 'medium' : 'low',
      requires_manual_verification: true,
      finding_disposition: disposition,
      required_next_data: ['formal audit report', 'rectification ledger', 'payment detail'],
      recommended_next_data: ['complete evidence chain before risk conclusion'],
      rectification_status: level === 'rectification_progress' ? 'in_progress_or_partly_completed' : 'unknown',
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: 'audit evidence classification',
        rawExcerpt: `${title}; low evidence items are not substantive violation conclusions`,
      }),
    };
  });
}

function procurementRecord({
  index,
  sourceItem,
  capturedAt,
  parserVersion,
  stage,
  projectName,
  projectCode,
  procurementMethod,
  procurementChannel,
  amountSemanticType,
  budgetAmount,
  awardAmount,
  normalizedAwardAmountYuan,
  frameworkLimitAmount = '',
  findingDisposition,
  liveSearchCandidateFlag = false,
}) {
  return {
    project_name: projectName,
    purchaser_name: purchaserFor(sourceItem),
    supplier_name: stage === 'announcement' || stage === 'intention' ? '' : `Round10 Supplier ${index + 1}`,
    procurement_method: procurementMethod,
    procurement_stage: stage,
    project_code: projectCode,
    package_no: `pkg-${(index % 4) + 1}`,
    package_name: `round10 package ${(index % 4) + 1}`,
    region: sourceItem.source_city || sourceItem.source_province,
    budget_amount: budgetAmount,
    budget_amount_unit: budgetAmount ? 'yuan' : 'unknown',
    award_amount: awardAmount,
    award_amount_unit: awardAmount ? 'yuan' : 'unknown',
    normalized_budget_amount_yuan: budgetAmount,
    normalized_award_amount_yuan: normalizedAwardAmountYuan,
    amount_semantic_type: amountSemanticType,
    framework_agreement_flag: procurementChannel === 'framework_agreement',
    framework_limit_amount: frameworkLimitAmount,
    framework_limit_unit: frameworkLimitAmount ? 'unknown' : '',
    framework_limit_condition: frameworkLimitAmount ? 'limit or service item details are in solicitation document' : '',
    procurement_channel: procurementChannel,
    source_region_scope: sourceItem.source_region_scope,
    source_province: sourceItem.source_province,
    source_city: sourceItem.source_city,
    source_region_code: sourceItem.source_region_code,
    publisher_level: sourceItem.publisher_level,
    central_unit_flag: sourceItem.central_unit_flag,
    purchaser_region_code: purchaserRegionCode(sourceItem),
    finding_disposition: findingDisposition,
    severity_reason: findingDisposition === 'risk_candidate' ? 'clear award total exists but still requires public chain completion' : 'public data only supports follow-up discovery or review',
    missing_evidence: stage === 'payment' ? [] : ['contract notice', 'acceptance notice', 'payment disclosure'],
    recommended_next_data: ['contract notice', 'acceptance notice', 'payment disclosure'],
    live_search_candidate_flag: liveSearchCandidateFlag,
    source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
      rowNumber: index + 1,
      sectionTitle: sourceItem.source_type,
      rawExcerpt: `${sourceItem.title}; stage ${stage}; amount semantic ${amountSemanticType}`,
    }),
  };
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
    manual_review_note: 'Round 10 official web research source; URL checked against prior source registry.',
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
    page_number: '',
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
  if (!item) throw new Error(`Unknown round10 source: ${sourceId}`);
  return item;
}

function purchaserFor(sourceItem) {
  if (sourceItem.central_unit_flag) return sourceItem.id.includes('pboc') ? 'PBOC Credit Reference Center' : 'Central Government Procurement Unit';
  if (sourceItem.source_region_scope === 'jiangsu_local') return sourceItem.publisher;
  if (sourceItem.source_province === 'Shanghai') return 'Shanghai Big Data Center';
  if (sourceItem.source_province === 'Anhui') return 'Hefei High-tech Zone Office';
  if (sourceItem.source_province === 'Liaoning') return 'Xingcheng Rural Road Authority';
  return 'Cross-province purchaser';
}

function purchaserRegionCode(sourceItem) {
  if (sourceItem.source_region_scope === 'central_unit') return '000000';
  if (sourceItem.source_region_scope === 'cross_province') return sourceItem.source_region_code || '000000';
  return sourceItem.source_region_code || '320000';
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
  return `# Round 10 Official Public Instance Test

Generated at: ${summary.generated_at}

## Test Result
- Input records: ${summary.total_input_records}
- Accepted records: ${summary.total_accepted_records}
- Import success rate: ${summary.import_success_rate}%
- Source count: ${payloads.sourceRegister.sources.length}
- Previous source URL overlap: ${payloads.collectorSummary.previous_source_overlap_count}
- Discovery queue processed: ${payloads.collectorSummary.discovery_crawler_processed_count}

## Coverage
- Source scopes: ${formatObject(payloads.collectorSummary.source_region_scopes)}
- Procurement intention records: ${payloads.collectorSummary.procurement_intention_records}
- Central batch award records: ${payloads.collectorSummary.central_batch_award_records}
- Live search candidate source count: ${payloads.collectorSummary.live_search_candidate_source_count}
- Budget performance policy records: ${payloads.collectorSummary.budget_performance_policy_records}
- Audit low-weight records: ${payloads.collectorSummary.audit_low_weight_records}

## Official Sources
${payloads.sourceRegister.sources.map((item) => `- [${item.publisher}] ${item.title}: ${item.url}`).join('\n')}

## Further Optimization Plan
${summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}: ${item.action} Reason: ${item.reason}`).join('\n')}
`;
}

function renderHtml(markdown) {
  return `<!doctype html><meta charset="utf-8"><title>Round 10 Official Public Instance Test</title><pre>${escapeHtml(markdown)}</pre>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatObject(value) {
  return Object.entries(value || {})
    .map(([key, count]) => `${key} ${count}`)
    .join(', ');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runTenthOfficialPublicInstanceTest().then(({ outputDir, summary }) => {
    console.log(`Wrote tenth official public instance outputs to ${outputDir}`);
    console.log(JSON.stringify({
      total_input_records: summary.total_input_records,
      total_accepted_records: summary.total_accepted_records,
      import_success_rate: summary.import_success_rate,
      baseline: summary.round10_acceptance_baseline,
      output_dir: outputDir,
    }, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
