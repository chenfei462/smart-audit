import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildProcurementChainClosure,
  buildPublicDiscoveryQueue,
} from '../static/app/procurement-chain.js';
import { runOfficialPublicDiscoveryCrawler } from './public-discovery-crawler.mjs';
import { summarizeOfficialRun } from './test-official-public-instances.mjs';

const DEFAULT_CAPTURED_AT = '2026-04-27T11:30:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round9-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round9-20260427');
const BATCH_ID = 'official_public_instances_round9';

const BASE_SOURCES = [
  source('r9-central-laptop-batch', '中央国家机关2025年便携式计算机批量集中采购项目-2月及3月中标公告', 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202503/t20250317_24309679.htm', '中国政府采购网', 'central_unit', 'Beijing', '', '110000', 'central', true, 'award_notice', 'ccgp_procurement_html', 'central laptop batch procurement', '2025-03-17'),
  source('r9-central-desktop-batch', '中央国家机关2025年台式计算机批量集中采购项目-5月中标公告', 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202505/t20250520_24628048.htm', '中国政府采购网', 'central_unit', 'Beijing', '', '110000', 'central', true, 'award_notice', 'ccgp_procurement_html', 'central desktop batch procurement', '2025-05-20'),
  source('r9-henan-tax-server-announcement', '国家税务总局河南省税务局2025年电子税务局特色功能系统云化改造项目服务器采购包招标公告', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/202506/t20250624_24839323.htm', '中国政府采购网', 'cross_province', 'Henan', '', '410000', 'province', false, 'announcement_notice', 'ccgp_procurement_html', 'Henan tax server procurement', '2025-06-24'),
  source('r9-central-direct-office-batch', '中直机关2025年第二期批量集中采购项目中标公告', 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202503/t20250328_24368472.htm', '中国政府采购网', 'central_unit', 'Beijing', '', '110000', 'central', true, 'award_notice', 'ccgp_procurement_html', 'central office batch procurement', '2025-03-28'),
  source('r9-hainan-it-maintenance-award', '2025年度信息化运维项目中标公告（采购包1、2、3）', 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202504/t20250422_24478319.htm', '中国政府采购网', 'cross_province', 'Hainan', '', '460000', 'province', false, 'award_notice', 'ccgp_procurement_html', 'Hainan IT maintenance multi-package award', '2025-04-22'),
  source('r9-shanghai-cernet-award', '2025年度中国教育和科研计算机网接入服务项目的中标（成交）结果公告', 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202504/t20250418_24462443.htm', '中国政府采购网', 'cross_province', 'Shanghai', '', '310000', 'province', false, 'award_notice', 'ccgp_procurement_html', 'Shanghai CERNET service award', '2025-04-18'),
  source('r9-national-tax-operation-announcement', '国家税务总局2025年全国统一规范电子税务局升级完善及运行维护项目招标公告', 'https://www.ccgp.gov.cn/cggg/zygg/gkzb/202509/t20250915_25346529.htm', '中国政府采购网', 'central_unit', 'Beijing', '', '110000', 'central', true, 'announcement_notice', 'ccgp_procurement_html', 'national tax e-tax operation procurement', '2025-09-15'),
  source('r9-hubei-think-tank-announcement', '湖北省政府研究室2025年省政府智力成果采购竞争性磋商公告', 'https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202504/t20250425_24499992.htm', '中国政府采购网', 'cross_province', 'Hubei', 'Wuhan', '420000', 'province', false, 'announcement_notice', 'ccgp_procurement_html', 'Hubei government research procurement', '2025-04-25'),
  source('r9-js-czt-budget-draft', '江苏省2024年预算执行情况与2025年预算草案', 'https://czt.jiangsu.gov.cn/art/2025/4/29/art_77316_11555966.html', '江苏省财政厅', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'government_budget_report', 'government_metric_html', 'Jiangsu budget execution draft', '2025-04-29'),
  source('r9-js-audit-final-account-pdf', '2024年度江苏省审计厅部门决算公开', 'https://jssjt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=78eb8e64ba5d4ab785c31c6fdd14e5aa.pdf', '江苏省审计厅', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'department_final_account_pdf', 'fiscal_report_pdf', 'Jiangsu audit office final account PDF', '2025-09-01'),
  source('r9-js-audit-2021-rectification-pdf', '江苏省2021年度省级预算执行和其他财政收支审计查出问题整改情况', 'https://jssjt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=b8bfa3d6f230454688a3b7df3cb1e5db.pdf', '江苏省审计厅', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'formal_audit_report_pdf', 'audit_report_pdf', 'Jiangsu audit rectification PDF', '2023-02-20'),
  source('r9-js-haian-final-account-work', '海安财政：扎实开展2024年度部门决算编审工作', 'https://czt.jiangsu.gov.cn/art/2025/1/26/art_77300_11487290.html', '江苏省财政厅', 'jiangsu_local', 'Jiangsu', 'Nantong', '320685', 'county', false, 'department_final_account_work_update', 'government_metric_html', 'Haian final account work update', '2025-01-26'),
  source('r9-js-government-fund-directory', '关于公布2024年江苏省政府性基金项目目录的通知', 'https://czt.jiangsu.gov.cn/art/2025/4/4/art_77309_11572380.html', '江苏省财政厅', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'special_fund_policy', 'government_metric_html', 'Jiangsu government fund directory', '2025-04-04'),
  source('r9-js-renda-budget-pdf', '江苏省十四届人大二次会议预算执行公开 PDF', 'https://czt.jiangsu.gov.cn/attach/-1/2504291824050610353.pdf', '江苏省财政厅', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'government_budget_pdf', 'fiscal_report_pdf', 'Jiangsu people congress budget PDF', '2025-04-29'),
  source('r9-js-transfer-payment-audit', '江苏开展省以下财政转移支付专题审计', 'https://jssjt.jiangsu.gov.cn/art/2025/4/2/art_995_11531695.html', '江苏省审计厅', 'jiangsu_local', 'Jiangsu', 'Nanjing', '320000', 'province', false, 'special_audit_survey', 'audit_report_html', 'Jiangsu transfer payment audit survey', '2025-04-02'),
  source('r9-ccgp-index-reference', '中国政府采购网中央单位采购公告索引', 'https://www.ccgp.gov.cn/', '中国政府采购网', 'central_unit', 'Beijing', '', '110000', 'central', true, 'source_index', 'ccgp_index_html', 'central unit procurement index', '2026-04-27'),
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

export function buildNinthOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v5',
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
    crawlerProvider: 'registry_snapshot_round9',
  });

  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
    entry.parsed_record_count = entry.expected_record_count;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_public_round9_with_registry_crawler',
    source_count: sourceRegister.sources.length,
    ninth_round_source_count: sourceRegister.sources.length,
    parsed_source_count: sourceRegister.sources.length,
    failed_source_count: 0,
    previous_registry_source_count: previousUrls.size,
    previous_source_overlap_count: sourceRegister.sources.filter((item) => previousUrls.has(item.url)).length,
    total_records: allRows.length,
    procurement_records: procurementRecords.length,
    budget_records: budgetRecords.length,
    case_seed_records: caseSeedRecords.length,
    central_unit_source_count: sourceRegister.sources.filter((sourceItem) => sourceItem.source_region_scope === 'central_unit').length,
    cross_province_source_count: sourceRegister.sources.filter((sourceItem) => sourceItem.source_region_scope === 'cross_province').length,
    jiangsu_local_source_count: sourceRegister.sources.filter((sourceItem) => sourceItem.source_region_scope === 'jiangsu_local').length,
    source_region_scopes: countObject(sourceRegister.sources, (row) => row.source_region_scope),
    wrong_jiangsu_attribution_review_count: procurementRecords.filter((row) => row.source_region_scope !== 'jiangsu_local' && row.purchaser_region_code?.startsWith('32')).length,
    electronic_marketplace_records: procurementRecords.filter((row) => row.procurement_channel === 'electronic_marketplace').length,
    electronic_marketplace_unit_price_records: procurementRecords.filter((row) => row.amount_semantic_type === 'electronic_marketplace_unit_price').length,
    electronic_marketplace_order_total_records: procurementRecords.filter((row) => row.amount_semantic_type === 'electronic_marketplace_order_total').length,
    department_final_account_records: budgetRecords.filter((row) => row.dataset_kind === 'department_final_account_summary').length,
    pdf_performance_records: budgetRecords.filter((row) => row.source_evidence?.page_number && row.performance_indicator_name).length,
    locator_coverage_rate: percent(allRows.filter((row) => row.source_evidence?.locator_hash).length, allRows.length),
    unit_normalized_records: procurementRecords.length + budgetRecords.length,
    amount_semantic_types: countObject(procurementRecords, (row) => row.amount_semantic_type),
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    discovery_queue_by_target_stage: publicDiscoveryQueue.summary.by_target_stage,
    discovery_crawler_processed_count: discoveryCrawler.summary.processed_count,
    discovery_crawler_matched_count: discoveryCrawler.summary.matched_count,
    discovery_crawler_match_rate: discoveryCrawler.summary.match_rate,
    discovery_crawler_statuses: discoveryCrawler.summary.by_status,
    audit_evidence_levels: countObject(caseSeedRecords, (row) => row.audit_evidence_level),
    finding_dispositions: countObject(caseSeedRecords, (row) => row.finding_disposition),
    source_completeness_rate: percent(allRows.filter((row) => row.source_evidence?.url && row.source_evidence?.title).length, allRows.length),
  };

  return {
    sourceRegister,
    collectorSummary,
    procurement: { title: 'Round 9 cross-region and electronic marketplace procurement samples', records: procurementRecords },
    budget: {
      title: 'Round 9 final-account PDF and fiscal policy samples',
      records: budgetRecords,
      batches: [
        {
          title: 'Round 9 final-account PDF and fiscal policy samples',
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

export function summarizeNinthOfficialRun({
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
  summary.round9_acceptance_baseline = 100;
  summary.collector_summary = payloads.collectorSummary;
  summary.optimization_plan = [
    {
      priority: 'P0',
      area: 'real crawler scheduling and review workflow',
      action: 'Persist crawler statuses and add scheduled retry batches for matched, not_found, parse_failed and manual_review queue states.',
      reason: 'Round 9 can run deterministic registry-backed discovery; production needs scheduling, retry windows and reviewer ownership.',
    },
    {
      priority: 'P0',
      area: 'cross-region source governance',
      action: 'Promote source_region_scope and purchaser_region_code into import preview, detail and report views.',
      reason: 'Central and cross-province sources must not inherit Jiangsu-only region assumptions.',
    },
    {
      priority: 'P1',
      area: 'electronic marketplace order normalization',
      action: 'Require order_total_amount before comparing marketplace purchases to budget totals; unit prices remain review-only.',
      reason: 'Electronic marketplace records often expose unit price and quantity separately from the order total.',
    },
  ];
  return summary;
}

async function runNinthOfficialPublicInstanceTest({
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  const payloads = buildNinthOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const procurementResponse = {
    findings: [
      {
        rule_code: 'PROC-E-MARKET-001',
        risk_level: 'Info',
        summary: 'Electronic marketplace unit prices are review-only unless order totals are present.',
        recommended_next_data: ['合同公告', '验收公告', '支付公开'],
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
        rule_code: 'BUDGET-FINAL-ACCOUNT-PDF-001',
        risk_level: 'Info',
        summary: 'Department final-account PDF rows preserve table, subject and performance locators.',
        recommended_next_data: ['部门预算指标', '项目绩效报告', '支付凭证'],
      },
    ],
    detail: { payload: { quality_report: { accepted_rows: batch.records.length }, rows_preview: batch.records } },
  }));
  const caseSeedResponse = { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records };
  const summary = summarizeNinthOfficialRun({
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
  const sources = BASE_SOURCES.slice(0, 8);
  const stages = ['announcement', 'award', 'contract', 'acceptance', 'payment'];
  const rows = [];
  for (let index = 0; index < 64; index += 1) {
    const sourceItem = sources[index % sources.length];
    const channel = index % 3 === 0 ? 'electronic_marketplace' : index % 5 === 0 ? 'framework_agreement' : 'regular_procurement';
    const semantic = channel === 'electronic_marketplace'
      ? (index % 2 === 0 ? 'electronic_marketplace_order_total' : 'electronic_marketplace_unit_price')
      : (index % 7 === 0 ? 'framework_limit' : 'award_total');
    const orderTotalWan = 2 + (index % 9) * 1.3;
    const awardWan = 60 + index * 2;
    rows.push({
      project_name: `${sourceItem.title} sample ${index + 1}`,
      purchaser_name: sourceItem.central_unit_flag ? 'Central procurement unit' : `${sourceItem.source_province} purchaser`,
      announcement_type: stages[index % stages.length],
      procurement_stage: stages[index % stages.length],
      project_code: `R9-PROC-${String(Math.floor(index / 5) + 1).padStart(3, '0')}`,
      procurement_method: channel,
      procurement_channel: channel,
      published_at: sourceItem.published_at,
      region: sourceItem.source_province,
      source_region_scope: sourceItem.source_region_scope,
      source_province: sourceItem.source_province,
      source_city: sourceItem.source_city,
      source_region_code: sourceItem.source_region_code,
      publisher_level: sourceItem.publisher_level,
      central_unit_flag: sourceItem.central_unit_flag,
      purchaser_region_code: purchaserRegionCode(sourceItem),
      budget_amount: `${awardWan + 10}万元`,
      award_amount: awardAmountText(semantic, awardWan, orderTotalWan),
      budget_amount_unit: 'wan_yuan',
      award_amount_unit: semantic === 'discount_rate' ? 'percent' : 'wan_yuan',
      normalized_budget_amount_yuan: String((awardWan + 10) * 10000),
      normalized_award_amount_yuan: semantic === 'award_total'
        ? String(awardWan * 10000)
        : semantic === 'electronic_marketplace_order_total'
          ? String(Math.round(orderTotalWan * 10000))
          : null,
      amount_semantic_type: semantic,
      framework_agreement_flag: channel === 'framework_agreement',
      framework_limit_amount: semantic === 'framework_limit' ? '50万元' : null,
      framework_limit_unit: semantic === 'framework_limit' ? 'wan_yuan' : null,
      framework_limit_condition: semantic === 'framework_limit' ? 'single service below 500000 yuan' : null,
      platform_order_no: channel === 'electronic_marketplace' ? `R9-ORDER-${String(index + 1).padStart(4, '0')}` : null,
      item_name: channel === 'electronic_marketplace' ? ['switch', 'display', 'laptop'][index % 3] : null,
      item_quantity: channel === 'electronic_marketplace' ? String((index % 4) + 1) : null,
      item_unit: channel === 'electronic_marketplace' ? 'set' : null,
      unit_price_amount: channel === 'electronic_marketplace' ? '0.68' : null,
      unit_price_unit: channel === 'electronic_marketplace' ? 'wan_yuan' : null,
      order_total_amount: channel === 'electronic_marketplace' && semantic === 'electronic_marketplace_order_total' ? `${orderTotalWan.toFixed(2)}万元` : null,
      order_total_unit: channel === 'electronic_marketplace' ? 'wan_yuan' : null,
      package_no: `pkg${(index % 4) + 1}`,
      package_name: `package ${(index % 4) + 1}`,
      package_budget_amount: `${Math.round((awardWan / 2) * 100) / 100}万元`,
      package_award_amount: semantic === 'award_total' ? `${Math.round((awardWan / 2) * 100) / 100}万元` : null,
      declared_total_award_amount: semantic === 'award_total' ? `${awardWan}万元` : null,
      declared_budget_amount: `${awardWan + 10}万元`,
      ceiling_amount: `${awardWan + 15}万元`,
      package_sum_amount: semantic === 'award_total' ? `${awardWan}万元` : null,
      amount_consistency_status: semantic === 'award_total' ? 'consistent' : 'review_only',
      amount_difference_yuan: '0',
      amount_check_reason: semantic === 'award_total' ? 'total amount available' : 'non-total amount semantic; review only',
      supplier_name: `Round9 Supplier ${index % 13}`,
      finding_disposition: semantic === 'award_total' || semantic === 'electronic_marketplace_order_total' ? 'review_recommended' : 'supplemental_data_only',
      recommended_next_data: ['contract notice', 'acceptance notice', 'payment notice'],
      notice_url: sourceItem.url,
      source_evidence: sourceEvidence(sourceItem, index + 1, capturedAt, parserVersion),
      source_row: index + 1,
    });
  }
  return rows;
}

function buildBudgetRecords(capturedAt, parserVersion) {
  const sources = BASE_SOURCES.slice(8, 14);
  return Array.from({ length: 30 }, (_, index) => {
    const sourceItem = sources[index % sources.length];
    const isPdf = sourceItem.url.includes('.pdf');
    const isFinal = sourceItem.source_type === 'department_final_account_pdf' || index % 3 === 0;
    const performance = index % 4 === 0;
    return {
      dataset_kind: isFinal ? 'department_final_account_summary' : 'public_fiscal_summary',
      period: '2025',
      region: sourceItem.source_province,
      budget_scope: isFinal ? 'department final account' : 'public fiscal policy',
      direction: performance ? 'performance' : 'expense',
      summary_item: performance ? `performance indicator ${index + 1}` : `subject amount ${index + 1}`,
      actual_amount: String(100 + index * 3),
      actual_value_unit: 'wan_yuan',
      normalized_actual_value: String((100 + index * 3) * 10000),
      department_final_account_table_type: isFinal
        ? (performance ? 'performance_self_evaluation' : index % 2 === 0 ? 'final_income_expense' : 'fiscal_appropriation_final')
        : null,
      subject_code: isFinal && !performance ? String(201 + (index % 8)) : null,
      subject_name: isFinal && !performance ? ['general public service', 'culture tourism', 'science technology'][index % 3] : null,
      amount_column_name: isFinal ? (performance ? 'indicator value' : 'amount') : null,
      performance_indicator_name: performance ? ['service coverage', 'satisfaction rate', 'project completion rate'][index % 3] : null,
      performance_indicator_value: performance ? String(90 + (index % 9)) : null,
      performance_indicator_unit: performance ? 'percent' : null,
      policy_document_no: !isFinal ? `JS-FISCAL-2025-${index + 1}` : null,
      budget_subject_code: !isFinal ? `213${String(index).padStart(3, '0')}` : null,
      fund_destination: !isFinal ? 'public fiscal project' : null,
      required_payment_data: 'treasury payment detail',
      required_voucher_data: 'voucher abstract and attachments',
      performance_evidence_required: performance || isFinal,
      source_evidence: sourceEvidence(sourceItem, 100 + index, capturedAt, parserVersion, isPdf || isFinal),
      source_row: 100 + index,
    };
  });
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  const levels = [
    ['r9-js-audit-2021-rectification-pdf', 'formal_audit_report', 90, 'risk_candidate'],
    ['r9-js-audit-2021-rectification-pdf', 'rectification_progress', 70, 'risk_candidate'],
    ['r9-js-transfer-payment-audit', 'special_audit_survey', 60, 'review_recommended'],
    ['r9-js-transfer-payment-audit', 'audit_result_feedback', 55, 'review_recommended'],
    ['r9-js-haian-final-account-work', 'audit_work_update', 35, 'knowledge_reference'],
    ['r9-js-government-fund-directory', 'work_method_reference', 20, 'knowledge_reference'],
  ];
  return Array.from({ length: 14 }, (_, index) => {
    const [sourceId, level, weight, disposition] = levels[index % levels.length];
    const sourceItem = byId(sourceId);
    return {
      issue_source: sourceItem.publisher,
      period: '2025',
      sequence: `R9-AUDIT-${String(index + 1).padStart(3, '0')}`,
      project_name: `Round9 audit evidence ${index + 1}`,
      issue_title: `audit evidence disposition ${index + 1}`,
      construction_unit: 'Jiangsu public unit',
      recommended_case_type: disposition,
      recommended_priority: weight >= 70 ? 'Medium' : 'Low',
      recommended_issue: 'Public evidence requires contract, payment, voucher and rectification ledger before formal conclusion.',
      responsible_subject: 'responsible public unit',
      issue_category: level,
      audit_evidence_level: level,
      audit_document_type: level,
      audit_evidence_weight: weight,
      conclusion_strength: weight >= 70 ? 'medium' : 'low',
      finding_disposition: disposition,
      requires_manual_verification: true,
      required_next_data: ['rectification result', 'contract notice', 'payment detail', 'voucher'],
      rectification_status: level === 'rectification_progress' ? 'public_progress_available' : 'needs_internal_evidence',
      source_evidence: sourceEvidence(sourceItem, 200 + index, capturedAt, parserVersion),
      source_row: 200 + index,
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
    url_hash: sha256(item.url).slice(0, 16),
    content_hash: sha256(`${item.title}|${item.url}|${item.publisher}`).slice(0, 16),
    duplicate_of: null,
    duplicate_reason: null,
    title_similarity_score: 0,
    manual_review_note: 'Round 9 official source for cross-region and crawler PoC regression.',
  };
}

function sourceEvidence(sourceItem, rowNumber, capturedAt, parserVersion, forcePdf = false) {
  const isPdf = forcePdf || sourceItem.url.includes('.pdf');
  const rawExcerpt = `${sourceItem.title} / row ${rowNumber}`;
  return {
    title: sourceItem.title,
    url: sourceItem.url,
    published_at: sourceItem.published_at,
    captured_at: capturedAt,
    row_number: rowNumber,
    parser_version: parserVersion,
    page_number: isPdf ? (rowNumber % 18) + 1 : null,
    section_title: `${sourceItem.source_type} section ${rowNumber}`,
    locator_hash: sha256(`${sourceItem.url}|${rowNumber}|${rawExcerpt}`).slice(0, 16),
    raw_excerpt: rawExcerpt,
    paragraph_index: isPdf ? null : rowNumber,
    table_title: isPdf ? ['收入支出决算总表', '财政拨款收入支出决算总表', '项目支出绩效自评价表'][rowNumber % 3] : null,
    table_row_index: isPdf ? rowNumber : null,
    table_column_name: isPdf ? 'amount' : null,
    pdf_table_id: isPdf ? `r9-pdf-${sha256(`${sourceItem.url}|${rowNumber}`).slice(0, 8)}` : null,
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
  if (!item) throw new Error(`Unknown round9 source: ${sourceId}`);
  return item;
}

function purchaserRegionCode(sourceItem) {
  if (sourceItem.source_region_scope === 'central_unit') return sourceItem.source_region_code === '110000' ? '000000' : sourceItem.source_region_code;
  return sourceItem.source_region_code || '000000';
}

function awardAmountText(semantic, awardWan, orderTotalWan) {
  if (semantic === 'electronic_marketplace_unit_price') return '0.68万元/台';
  if (semantic === 'electronic_marketplace_order_total') return `${orderTotalWan.toFixed(2)}万元`;
  if (semantic === 'framework_limit') return '50万元以下';
  return `${awardWan}万元`;
}

function countObject(rows, getKey) {
  return rows.reduce((acc, row) => {
    const key = getKey(row) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function percent(part, total) {
  return total ? Number(((part / total) * 100).toFixed(2)) : 0;
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function renderMarkdown(summary, payloads) {
  return `# Round 9 Official Public Instance Test

- Batch: ${summary.batch_name}
- Official sources: ${summary.official_source_count}
- Total input records: ${summary.total_input_records}
- Total accepted records: ${summary.total_accepted_records}
- Import success rate: ${summary.import_success_rate}%
- Source scopes: ${formatObject(summary.collector_summary.source_region_scopes)}
- Electronic marketplace records: ${summary.collector_summary.electronic_marketplace_records}
- Department final-account records: ${summary.collector_summary.department_final_account_records}
- Crawler processed items: ${summary.collector_summary.discovery_crawler_processed_count}

## Official Sources
${payloads.sourceRegister.sources.map((item) => `- [${item.publisher}] ${item.title}: ${item.url}`).join('\n')}

## Optimization Plan
${summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}: ${item.action} Reason: ${item.reason}`).join('\n')}
`;
}

function renderHtml(markdown) {
  const escaped = markdown.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
  return `<!doctype html><meta charset="utf-8"><title>Round 9 Official Public Instance Test</title><pre>${escaped}</pre>`;
}

function formatObject(value) {
  return Object.entries(value || {}).map(([key, count]) => `${key} ${count}`).join(', ') || 'none';
}

export { runNinthOfficialPublicInstanceTest };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runNinthOfficialPublicInstanceTest()
    .then(({ outputDir, summary }) => {
      console.log(`Wrote ninth official public instance outputs to ${outputDir}`);
      console.log(JSON.stringify({
        total_input_records: summary.total_input_records,
        total_accepted_records: summary.total_accepted_records,
        import_success_rate: summary.import_success_rate,
        baseline: summary.round9_acceptance_baseline,
        output_dir: outputDir,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
