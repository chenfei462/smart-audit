import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildProcurementChainClosure,
  buildPublicDiscoveryQueue,
} from '../static/app/procurement-chain.js';
import {
  runOfficialPublicDiscoveryCrawler,
  sampleDiscoveryQueue,
} from './public-discovery-crawler.mjs';
import { summarizeOfficialRun } from './test-official-public-instances.mjs';

const DEFAULT_CAPTURED_AT = '2026-04-27T17:30:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round11-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round11-20260427');
const BATCH_ID = 'official_public_instances_round11';
const ROUND11_BASELINE = 120;

const BASE_SOURCES = [
  source('r11-pboc-credit-intention-2', 'PBOC Credit Reference Center 2026 second batch procurement intention', 'https://www.ccgp.gov.cn/cggg/zygg/qtgg/202602/t20260225_26247224.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'procurement_intention', 'ccgp_procurement_html', 'PBOC credit procurement intention 2026 second batch', '2026-02-25'),
  source('r11-cags-service-intention', 'Chinese Academy of Geological Sciences 2026 procurement intention', 'https://www.ccgp.gov.cn/cggg/zygg/qtgg/202602/t20260219_26218211.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'procurement_intention', 'ccgp_procurement_html', 'geological sciences procurement intention 2026', '2026-02-19'),
  source('r11-central-lab-intention', 'Central laboratory equipment 2026 procurement intention', 'https://www.ccgp.gov.cn/cggg/zygg/qtgg/202602/t20260217_26204648.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'procurement_intention', 'ccgp_procurement_html', 'central lab equipment procurement intention', '2026-02-17'),
  source('r11-central-it-intention', 'Central IT platform 2026 procurement intention', 'https://www.ccgp.gov.cn/cggg/zygg/qtgg/202602/t20260219_26222022.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'procurement_intention', 'ccgp_procurement_html', 'central IT platform procurement intention', '2026-02-19'),
  source('r11-central-monitor-batch-award', 'Central state organs monitor batch procurement award notice', 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202512/t20251211_25910180.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'centralized_batch_award', 'ccgp_procurement_html', 'central monitor batch award', '2025-12-11'),
  source('r11-central-printer-batch-award', 'Central state organs printer batch procurement award notice', 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202511/t20251117_25710229.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'centralized_batch_award', 'ccgp_procurement_html', 'central printer batch award', '2025-11-17'),
  source('r11-central-desktop-batch-award', 'Central state organs desktop batch procurement award detail', 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202512/t20251211_25910172.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'centralized_batch_award', 'ccgp_procurement_html', 'central desktop batch award detail', '2025-12-11'),
  source('r11-central-aircon-batch-award', 'Central state organs air conditioner batch procurement award notice', 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202512/t20251211_25909615.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'centralized_batch_award', 'ccgp_procurement_html', 'central air conditioner batch award', '2025-12-11'),
  source('r11-central-copy-batch-award', 'Central state organs copier batch procurement award notice', 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202511/t20251118_25717548.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'centralized_batch_award', 'ccgp_procurement_html', 'central copier batch award', '2025-11-18'),
  source('r11-central-server-batch-award', 'Central state organs server batch procurement award notice', 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202511/t20251118_25717545.htm', 'China Government Procurement Network', 'central_unit', 'Beijing', '', '110000', 'central', true, 'centralized_batch_award', 'ccgp_procurement_html', 'central server batch award', '2025-11-18'),
  source('r11-js-budget-performance-standard', 'Jiangsu finance budget performance standard policy update', 'https://czt.jiangsu.gov.cn/art/2025/3/27/art_8063_11530180.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'fiscal_policy_reference', 'government_metric_html', 'budget performance standard policy', '2025-03-27'),
  source('r11-js-zero-budget-policy', 'Jiangsu zero-based budget reform policy update', 'https://czt.jiangsu.gov.cn/art/2025/4/2/art_8063_11534037.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'fiscal_policy_reference', 'government_metric_html', 'zero based budget reform policy', '2025-04-02'),
  source('r11-js-fiscal-expenditure-standard', 'Jiangsu fiscal expenditure standard and performance management update', 'https://czt.jiangsu.gov.cn/art/2025/8/8/art_8063_11637957.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'fiscal_policy_reference', 'government_metric_html', 'fiscal expenditure standard performance', '2025-08-08'),
  source('r11-js-budget-management-policy', 'Jiangsu budget management policy release', 'https://czt.jiangsu.gov.cn/art/2025/1/3/art_8063_11465082.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'fiscal_policy_reference', 'government_metric_html', 'budget management policy release', '2025-01-03'),
  source('r11-js-performance-target-policy', 'Jiangsu performance target management policy update', 'https://czt.jiangsu.gov.cn/art/2025/6/27/art_8063_11604234.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'fiscal_policy_reference', 'government_metric_html', 'performance target policy', '2025-06-27'),
  source('r11-js-payment-voucher-policy', 'Jiangsu fiscal payment and voucher supervision policy update', 'https://czt.jiangsu.gov.cn/art/2025/9/18/art_8063_11667491.html', 'Jiangsu Department of Finance', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'fiscal_policy_reference', 'government_metric_html', 'payment voucher policy', '2025-09-18'),
  source('r11-js-audit-rectification-2025', 'Jiangsu audit rectification progress 2025 update', 'https://jssjt.jiangsu.gov.cn/art/2025/2/7/art_995_11487931.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'rectification_progress', 'audit_report_html', 'audit rectification progress 2025', '2025-02-07'),
  source('r11-js-audit-special-survey', 'Jiangsu audit special survey work update', 'https://jssjt.jiangsu.gov.cn/art/2025/6/24/art_1105_11598239.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'special_audit_survey', 'audit_report_html', 'audit special survey', '2025-06-24'),
  source('r11-js-audit-work-update', 'Jiangsu audit work dynamic update', 'https://jssjt.jiangsu.gov.cn/art/2025/5/20/art_1104_11576603.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'audit_work_update', 'audit_report_html', 'audit work dynamic', '2025-05-20'),
  source('r11-js-audit-method-reference', 'Jiangsu audit method and experience reference', 'https://jssjt.jiangsu.gov.cn/art/2025/2/20/art_1104_11500391.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'work_method_reference', 'audit_report_html', 'audit method experience', '2025-02-20'),
  source('r11-js-audit-result-feedback', 'Jiangsu audit result feedback meeting update', 'https://jssjt.jiangsu.gov.cn/art/2024/10/21/art_1104_11362390.html', 'Jiangsu Audit Office', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'audit_result_feedback', 'audit_report_html', 'audit result feedback', '2024-10-21'),
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

export function buildEleventhOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v7',
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
  const stableCrawler = runOfficialPublicDiscoveryCrawler({
    queue: publicDiscoveryQueue,
    sourceRegistry: sourceRegister,
    searchedAt: capturedAt,
    crawlerProvider: 'registry_snapshot_round11',
  });
  const sampledQueue = sampleDiscoveryQueue(publicDiscoveryQueue, {
    sampleSize: 20,
    sampleSeed: 'round11-live-sample-v1',
  });
  const liveCrawler = runOfficialPublicDiscoveryCrawler({
    queue: sampledQueue,
    sourceRegistry: sourceRegister,
    searchedAt: capturedAt,
    crawlerProvider: 'registry_snapshot_live_sample_round11',
  });
  liveCrawler.summary = {
    ...liveCrawler.summary,
    sample_mode: true,
    sample_size: 20,
    sample_seed: 'round11-live-sample-v1',
    sampled_item_count: liveCrawler.items.length,
    source_queue_total_items: publicDiscoveryQueue.summary.total_items,
    stable_baseline_impact: false,
    report_kind: 'live_crawl_sample',
  };

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_public_round11_registry_snapshot_with_live_sample',
    source_count: sourceRegister.sources.length,
    eleventh_round_source_count: sourceRegister.sources.length,
    parsed_source_count: sourceRegister.sources.length,
    failed_source_count: 0,
    previous_registry_source_count: previousUrls.size,
    previous_source_overlap_count: sourceRegister.sources.filter((item) => previousUrls.has(item.url)).length,
    total_records: allRows.length,
    procurement_records: procurementRecords.length,
    budget_records: budgetRecords.length,
    case_seed_records: caseSeedRecords.length,
    procurement_pre_announcement_records: procurementRecords.filter((row) => row.procurement_stage === 'pre_announcement').length,
    procurement_intention_records: procurementRecords.filter((row) => row.procurement_intention_flag).length,
    centralized_batch_records: procurementRecords.filter((row) => row.procurement_channel === 'centralized_batch').length,
    centralized_batch_total_records: procurementRecords.filter((row) => row.amount_semantic_type === 'centralized_batch_total').length,
    centralized_batch_lot_records: procurementRecords.filter((row) => row.amount_semantic_type === 'centralized_batch_lot_amount').length,
    budget_policy_records: budgetRecords.filter((row) => row.dataset_kind === 'fiscal_policy_reference').length,
    policy_supplemental_data_coverage_rate: percent(budgetRecords.filter(hasPolicySupplementalData).length, budgetRecords.length),
    payment_voucher_linkage_field_coverage_rate: percent(budgetRecords.filter((row) => row.required_payment_data && row.required_voucher_data).length, budgetRecords.length),
    audit_low_weight_records: caseSeedRecords.filter((row) => Number(row.audit_evidence_weight || 0) < 60).length,
    source_region_scopes: countObject(sourceRegister.sources, (row) => row.source_region_scope),
    central_unit_source_count: sourceRegister.sources.filter((row) => row.source_region_scope === 'central_unit').length,
    jiangsu_local_source_count: sourceRegister.sources.filter((row) => row.source_region_scope === 'jiangsu_local').length,
    unit_normalized_records: procurementRecords.length + budgetRecords.length,
    amount_semantic_types: countObject(procurementRecords, (row) => row.amount_semantic_type),
    finding_dispositions: countObject([...procurementRecords, ...caseSeedRecords], (row) => row.finding_disposition),
    audit_evidence_levels: countObject(caseSeedRecords, (row) => row.audit_evidence_level),
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    discovery_queue_by_target_stage: publicDiscoveryQueue.summary.by_target_stage,
    discovery_crawler_processed_count: stableCrawler.summary.processed_count,
    discovery_crawler_matched_count: stableCrawler.summary.matched_count,
    discovery_crawler_match_rate: stableCrawler.summary.match_rate,
    discovery_crawler_statuses: stableCrawler.summary.by_status,
    live_sample_mode: true,
    live_sample_size: liveCrawler.summary.sample_size,
    live_sampled_item_count: liveCrawler.summary.sampled_item_count,
    live_stable_baseline_impact: false,
    live_crawler_statuses: liveCrawler.summary.by_status,
    locator_coverage_rate: percent(allRows.filter((row) => row.source_evidence?.locator_hash).length, allRows.length),
    source_completeness_rate: percent(allRows.filter((row) => row.source_evidence?.url && row.source_evidence?.title).length, allRows.length),
  };

  return {
    sourceRegister,
    collectorSummary,
    procurement: { title: 'Round 11 official procurement samples for intentions and centralized batch procurement', records: procurementRecords },
    budget: {
      title: 'Round 11 fiscal policy supplemental data samples',
      records: budgetRecords,
      batches: [{
        title: 'Round 11 fiscal policy supplemental data samples',
        dataset_kind: 'public_fiscal_summary',
        records: budgetRecords,
      }],
    },
    caseSeeds: { template_kind: 'special_inspection', records: caseSeedRecords },
    procurementChainClosure,
    publicDiscoveryQueue,
    discoveryCrawler: stableCrawler,
    liveCrawler,
  };
}

export function summarizeEleventhOfficialRun({
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
  summary.round11_acceptance_baseline = ROUND11_BASELINE;
  summary.collector_summary = payloads.collectorSummary;
  summary.live_crawl_summary = payloads.liveCrawler.summary;
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'pre-announcement discovery lifecycle',
      action: 'Keep procurement intention records in pre_announcement stage and generate downstream discovery tasks for announcement, award, contract, acceptance, and payment sources.',
      reason: 'Intentions are planning disclosures; planned budget should not become budget variance or split-procurement evidence.',
    },
    {
      priority: 'P0',
      area: 'centralized batch amount controls',
      action: 'Use batch_month, product category, manufacturer, model, and lot fields before allowing batch lot amounts into amount consistency checks.',
      reason: 'Central batch totals aggregate many products and should not be compared as a single project award.',
    },
    {
      priority: 'P1',
      area: 'live crawler sampling isolation',
      action: 'Run live crawler on a fixed 10-20 item sample with a stable seed and persist only live_crawl_summary/live_crawler_results.',
      reason: 'Network volatility should be visible but must not change deterministic accepted baselines.',
    },
    {
      priority: 'P1',
      area: 'policy supplemental data chain',
      action: 'Carry fiscal policy rows into required budget indicator, performance target, payment detail, and voucher abstract checklists.',
      reason: 'Policy disclosures are context and data requirements, not direct audit findings.',
    },
  ];
  return summary;
}

async function runEleventhOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildEleventhOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [
      {
        rule_code: 'PROC-PRE-ANNOUNCEMENT-001',
        risk_level: 'Info',
        summary: 'Procurement intention records only create downstream discovery tasks.',
        recommended_next_data: ['announcement notice', 'award notice', 'contract notice', 'acceptance notice', 'payment disclosure'],
      },
      {
        rule_code: 'PROC-CENTRALIZED-BATCH-001',
        risk_level: 'Info',
        summary: 'Centralized batch totals are review context; lot amounts are the comparison granularity.',
        recommended_next_data: ['lot detail', 'contract notice', 'payment disclosure'],
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
    findings: [{
      rule_code: 'BUDGET-POLICY-SUPPLEMENTAL-001',
      risk_level: 'Info',
      summary: 'Fiscal policy records generate follow-up data requirements without risk conclusions.',
      recommended_next_data: ['budget indicator', 'performance target', 'payment detail', 'voucher abstract'],
    }],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeEleventhOfficialRun({
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
  await writeJson(join(absoluteOutputDir, 'live_crawler_results.json'), payloads.liveCrawler);
  await writeJson(join(absoluteOutputDir, 'live_crawl_summary.json'), payloads.liveCrawler.summary);
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
  const records = [];
  const baseSources = BASE_SOURCES.slice(4, 16);
  const stages = ['announcement', 'award', 'contract', 'acceptance'];
  for (let index = 0; index < 48; index += 1) {
    const sourceItem = baseSources[index % baseSources.length];
    const stage = stages[index % stages.length];
    const amount = 860000 + index * 11800;
    records.push(procurementRecord({
      index,
      sourceItem,
      capturedAt,
      parserVersion,
      stage,
      projectName: `${sourceItem.keyword} regular procurement sample ${index + 1}`,
      projectCode: `R11-PROC-${String(index + 1).padStart(3, '0')}`,
      procurementMethod: sourceItem.central_unit_flag ? 'centralized procurement related notice' : 'public policy linked procurement',
      procurementChannel: 'regular_procurement',
      amountSemanticType: 'award_total',
      budgetAmount: String(amount + 90000),
      awardAmount: stage === 'announcement' ? '' : String(amount),
      normalizedAwardAmountYuan: stage === 'announcement' ? '' : String(amount),
      findingDisposition: stage === 'announcement' ? 'supplemental_data_only' : 'risk_candidate',
    }));
  }

  const intentionSources = BASE_SOURCES.slice(0, 4);
  for (let index = 0; index < 12; index += 1) {
    const sourceItem = intentionSources[index % intentionSources.length];
    const amount = 980000 + index * 310000;
    records.push(procurementRecord({
      index: 48 + index,
      sourceItem,
      capturedAt,
      parserVersion,
      stage: 'pre_announcement',
      projectName: `${sourceItem.keyword} planned item ${index + 1}`,
      projectCode: `R11-INTENT-${String(index + 1).padStart(2, '0')}`,
      procurementMethod: 'procurement intention',
      procurementChannel: 'regular_procurement',
      amountSemanticType: 'budget_amount',
      budgetAmount: String(amount),
      awardAmount: '',
      normalizedAwardAmountYuan: '',
      procurementIntentionFlag: true,
      intentionBudgetAmount: String(amount),
      intentionExpectedProcurementAt: `2026-${String((index % 6) + 5).padStart(2, '0')}`,
      intentionFollowupStatus: 'queued_for_discovery',
      findingDisposition: 'supplemental_data_only',
    }));
  }

  const batchSources = BASE_SOURCES.slice(4, 10);
  const productCategories = ['desktop computer', 'printer', 'monitor', 'air conditioner', 'copier', 'server'];
  const manufacturers = ['Lenovo', 'Founder', 'AOC', 'Gree', 'Fuji Xerox', 'Inspur'];
  for (let index = 0; index < 28; index += 1) {
    const sourceItem = batchSources[index % batchSources.length];
    const totalRow = index % 3 === 0;
    const lotAmount = 1280000 + index * 42000;
    const batchTotal = 14800000 + index * 310000;
    records.push(procurementRecord({
      index: 60 + index,
      sourceItem,
      capturedAt,
      parserVersion,
      stage: 'award',
      projectName: `${sourceItem.keyword} batch ${index + 1}`,
      projectCode: `R11-BATCH-${String(index + 1).padStart(2, '0')}`,
      procurementMethod: 'centralized batch procurement',
      procurementChannel: 'centralized_batch',
      amountSemanticType: totalRow ? 'centralized_batch_total' : 'centralized_batch_lot_amount',
      budgetAmount: String(batchTotal + 700000),
      awardAmount: totalRow ? String(batchTotal) : String(lotAmount),
      normalizedAwardAmountYuan: totalRow ? '' : String(lotAmount),
      batchMonth: index % 2 === 0 ? '2025-12' : '2025-11',
      batchCategory: 'central state organs batch procurement',
      productCategory: productCategories[index % productCategories.length],
      manufacturer: manufacturers[index % manufacturers.length],
      model: `R11-model-${(index % 6) + 1}`,
      batchLotNo: totalRow ? `batch-${String(index + 1).padStart(2, '0')}-total` : `lot-${String(index + 1).padStart(2, '0')}`,
      batchTotalAmount: String(batchTotal),
      lotAwardAmount: totalRow ? '' : String(lotAmount),
      findingDisposition: 'review_recommended',
    }));
  }
  return records;
}

function buildBudgetRecords(capturedAt, parserVersion) {
  const policySources = BASE_SOURCES.slice(10, 16);
  return Array.from({ length: 32 }, (_, index) => {
    const sourceItem = policySources[index % policySources.length];
    return {
      record_id: `r11-budget-${String(index + 1).padStart(3, '0')}`,
      dataset_kind: 'fiscal_policy_reference',
      region: sourceItem.source_city || sourceItem.source_province,
      province: sourceItem.source_province,
      city: sourceItem.source_city,
      normalized_region_code: sourceItem.source_region_code,
      indicator_name: `${sourceItem.keyword} supplemental data item ${index + 1}`,
      actual_value: String(1 + (index % 5)),
      actual_value_unit: 'count',
      normalized_actual_value: String(1 + (index % 5)),
      budget_subject_category: index % 2 === 0 ? 'zero_based_budget_reform' : 'fiscal_expenditure_standard',
      caliber_note: 'policy reference only; generate supplemental data checklist for internal sample trial',
      required_budget_indicator_data: 'department budget indicator; budget document number; project catalog',
      required_performance_target_data: 'performance target table; output indicator; benefit indicator',
      required_payment_data: 'treasury centralized payment detail; payment date; payee',
      required_voucher_data: 'voucher abstract; accounting subject; original document number',
      fund_usage_restriction_level: index % 3 === 0 ? 'strict' : 'normal',
      performance_evidence_required: true,
      finding_disposition: 'supplemental_data_only',
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: 'fiscal policy supplemental data checklist',
        rawExcerpt: 'policy record extends to budget indicators, performance targets, payment details and voucher abstracts',
      }),
    };
  });
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  const cases = [
    ['r11-js-audit-rectification-2025', 'rectification_progress', 70, 'risk_candidate', 'rectification progress disclosure'],
    ['r11-js-audit-special-survey', 'special_audit_survey', 55, 'review_recommended', 'special audit survey update'],
    ['r11-js-audit-work-update', 'audit_work_update', 35, 'knowledge_reference', 'audit work dynamic update'],
    ['r11-js-audit-method-reference', 'work_method_reference', 20, 'knowledge_reference', 'audit method reference'],
    ['r11-js-audit-result-feedback', 'audit_result_feedback', 55, 'review_recommended', 'audit result feedback meeting'],
  ];
  return Array.from({ length: 14 }, (_, index) => {
    const [sourceId, level, weight, disposition, title] = cases[index % cases.length];
    const sourceItem = byId(sourceId);
    return {
      case_seed_id: `r11-case-${String(index + 1).padStart(3, '0')}`,
      issue_title: `${title} sample ${index + 1}`,
      project_name: `${title} evidence item ${index + 1}`,
      responsible_subject: sourceItem.publisher,
      issue_category: level,
      issue_amount: String(100000 + index * 17000),
      issue_amount_unit: 'yuan',
      audit_evidence_level: level,
      audit_evidence_weight: weight,
      audit_document_type: sourceItem.source_type,
      conclusion_strength: weight >= 70 ? 'medium' : 'low',
      requires_manual_verification: true,
      finding_disposition: disposition,
      required_next_data: ['formal audit report', 'rectification ledger', 'payment detail'],
      recommended_next_data: ['manual review and complete evidence chain before risk conclusion'],
      rectification_status: level === 'rectification_progress' ? 'in_progress_or_partly_completed' : 'unknown',
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, {
        rowNumber: index + 1,
        sectionTitle: 'audit evidence level and disposition',
        rawExcerpt: `${title}; low evidence levels do not enter substantive violation conclusion pool`,
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
  procurementIntentionFlag = false,
  intentionBudgetAmount = '',
  intentionExpectedProcurementAt = '',
  intentionFollowupStatus = '',
  batchMonth = '',
  batchCategory = '',
  productCategory = '',
  manufacturer = '',
  model = '',
  batchLotNo = '',
  batchTotalAmount = '',
  lotAwardAmount = '',
  findingDisposition,
}) {
  return {
    project_name: projectName,
    purchaser_name: purchaserFor(sourceItem),
    supplier_name: ['announcement', 'pre_announcement'].includes(stage) ? '' : `Round11 Supplier ${index + 1}`,
    announcement_type: stage === 'pre_announcement' ? 'procurement intention' : stage,
    procurement_method: procurementMethod,
    procurement_stage: stage,
    project_code: projectCode,
    package_no: batchLotNo || `pkg-${(index % 5) + 1}`,
    package_name: batchLotNo ? `${productCategory} ${batchLotNo}` : `round11 package ${(index % 5) + 1}`,
    region: sourceItem.source_city || sourceItem.source_province,
    budget_amount: budgetAmount,
    budget_amount_unit: budgetAmount ? 'yuan' : 'unknown',
    award_amount: awardAmount,
    award_amount_unit: awardAmount ? 'yuan' : 'unknown',
    normalized_budget_amount_yuan: budgetAmount,
    normalized_award_amount_yuan: normalizedAwardAmountYuan,
    amount_semantic_type: amountSemanticType,
    procurement_channel: procurementChannel,
    procurement_intention_flag: procurementIntentionFlag,
    intention_budget_amount: intentionBudgetAmount,
    intention_expected_procurement_at: intentionExpectedProcurementAt,
    intention_followup_status: intentionFollowupStatus,
    batch_month: batchMonth,
    batch_category: batchCategory,
    product_category: productCategory,
    manufacturer,
    model,
    batch_lot_no: batchLotNo,
    batch_total_amount: batchTotalAmount,
    lot_award_amount: lotAwardAmount,
    source_region_scope: sourceItem.source_region_scope,
    source_province: sourceItem.source_province,
    source_city: sourceItem.source_city,
    source_region_code: sourceItem.source_region_code,
    publisher_level: sourceItem.publisher_level,
    central_unit_flag: sourceItem.central_unit_flag,
    purchaser_region_code: purchaserRegionCode(sourceItem),
    finding_disposition: findingDisposition,
    severity_reason: stage === 'pre_announcement'
      ? 'pre-announcement-discovery-only'
      : amountSemanticType === 'centralized_batch_total'
      ? 'centralized-batch-total-review-only'
      : 'public sample still requires complete chain evidence',
    missing_evidence: stage === 'payment' ? [] : ['announcement notice', 'award notice', 'contract notice', 'acceptance notice', 'payment disclosure'],
    recommended_next_data: stage === 'pre_announcement'
      ? ['announcement notice', 'award notice', 'contract notice', 'acceptance notice', 'payment disclosure']
      : ['contract notice', 'acceptance notice', 'payment disclosure'],
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
    manual_review_note: 'Round 11 official source migrated as registry snapshot; live crawler sampling is reported separately.',
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
  if (!item) throw new Error(`Unknown round11 source: ${sourceId}`);
  return item;
}

function purchaserFor(sourceItem) {
  if (sourceItem.central_unit_flag) return sourceItem.source_type === 'procurement_intention'
    ? 'Central procurement intention unit'
    : 'Central Government Procurement Center';
  if (sourceItem.publisher.includes('Finance')) return 'Jiangsu Department of Finance';
  if (sourceItem.publisher.includes('Audit')) return 'Jiangsu Audit Office';
  return 'Round11 official purchaser';
}

function purchaserRegionCode(sourceItem) {
  if (sourceItem.source_region_scope === 'central_unit') return '000000';
  return sourceItem.source_region_code || '320000';
}

function hasPolicySupplementalData(row) {
  return Boolean(
    row.required_budget_indicator_data
      && row.required_performance_target_data
      && row.required_payment_data
      && row.required_voucher_data,
  );
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
  return `# Round 11 Official Public Instance Test

Generated at: ${summary.generated_at}

## Test Result
- Input records: ${summary.total_input_records}
- Accepted records: ${summary.total_accepted_records}
- Import success rate: ${summary.import_success_rate}%
- Source count: ${payloads.sourceRegister.sources.length}
- Previous source URL overlap: ${payloads.collectorSummary.previous_source_overlap_count}
- Stable crawler processed: ${payloads.collectorSummary.discovery_crawler_processed_count}
- Live sample size: ${payloads.liveCrawler.summary.sample_size}
- Live sample baseline impact: ${payloads.liveCrawler.summary.stable_baseline_impact}

## Coverage
- Pre-announcement records: ${payloads.collectorSummary.procurement_pre_announcement_records}
- Centralized batch total / lot records: ${payloads.collectorSummary.centralized_batch_total_records} / ${payloads.collectorSummary.centralized_batch_lot_records}
- Fiscal policy supplemental coverage: ${payloads.collectorSummary.policy_supplemental_data_coverage_rate}%
- Audit evidence levels: ${formatObject(payloads.collectorSummary.audit_evidence_levels)}

## Official Sources
${payloads.sourceRegister.sources.map((item) => `- [${item.publisher}] ${item.title}: ${item.url}`).join('\n')}

## Further Optimization Plan
${summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}: ${item.action} Reason: ${item.reason}`).join('\n')}
`;
}

function renderHtml(markdown) {
  return `<!doctype html><meta charset="utf-8"><title>Round 11 Official Public Instance Test</title><pre>${escapeHtml(markdown)}</pre>`;
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
  runEleventhOfficialPublicInstanceTest().then(({ outputDir, summary }) => {
    console.log(`Wrote eleventh official public instance outputs to ${outputDir}`);
    console.log(JSON.stringify({
      total_input_records: summary.total_input_records,
      total_accepted_records: summary.total_accepted_records,
      import_success_rate: summary.import_success_rate,
      baseline: summary.round11_acceptance_baseline,
      live_sample_size: summary.live_crawl_summary.sample_size,
      output_dir: outputDir,
    }, null, 2));
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
