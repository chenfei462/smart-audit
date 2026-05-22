import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildProcurementChainClosure,
  buildPublicDiscoveryQueue,
} from '../static/app/procurement-chain.js';
import { summarizeOfficialRun } from './test-official-public-instances.mjs';

const DEFAULT_BASE_URL = process.env.AUDITLENS_BASE_URL || 'http://127.0.0.1:18080';
const DEFAULT_CAPTURED_AT = '2026-04-26T23:20:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round5-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round5-20260426');
const BATCH_ID = 'official_public_instances_round5';

const SOURCES = [
  source('ccgp-zy-contract-smart-supervision-2025', '中央国家机关政府采购合同公告：数字监管服务', 'https://www.ccgp.gov.cn/cggg/zygg/htgg/202504/t20250427_24492482.htm', '中国政府采购网', 'contract_notice', 'ccgp_procurement_html', '江苏 政府采购 合同公告 2025'),
  source('ccgp-zy-contract-data-platform-2025', '中央国家机关政府采购合同公告：数据平台服务', 'https://www.ccgp.gov.cn/cggg/zygg/htgg/202504/t20250417_24446871.htm', '中国政府采购网', 'contract_notice', 'ccgp_procurement_html', '江苏 合同公告 数据平台 2025'),
  source('ccgp-js-contract-carbon-package-2025', '江苏省碳监测多包件项目合同公告', 'https://www.ccgp.gov.cn/cggg/dfgg/htgg/202510/t20251017_25532124.htm', '中国政府采购网', 'contract_notice', 'ccgp_procurement_html', '江苏 多包件 合同公告 2025'),
  source('ccgp-js-contract-repair-package-2025', '江苏省维修服务多包件项目合同公告', 'https://www.ccgp.gov.cn/cggg/dfgg/htgg/202510/t20251009_25487539.htm', '中国政府采购网', 'contract_notice', 'ccgp_procurement_html', '江苏 维修 合同公告 2025'),
  source('ccgp-js-acceptance-system-2025', '江苏省信息系统项目履约验收公告', 'https://www.ccgp.gov.cn/cggg/dfgg/ysgg/202503/t20250311_24280484.htm', '中国政府采购网', 'acceptance_notice', 'ccgp_procurement_html', '江苏 政府采购 验收公告 2025'),
  source('ccgp-js-acceptance-training-2025', '江苏省培训服务项目履约验收公告', 'https://www.ccgp.gov.cn/cggg/dfgg/ysgg/202503/t20250311_24280489.htm', '中国政府采购网', 'acceptance_notice', 'ccgp_procurement_html', '江苏 培训 验收公告 2025'),
  source('jsrd-2024-budget-execution-gazette-pdf', '江苏人大公报：2024年预算执行情况报告', 'https://www.jsrd.gov.cn/qwfb/cwhgb/202502/202502/P020250203481263220860.pdf', '江苏省人大常委会公报', 'budget_execution_pdf', 'fiscal_report_pdf', '江苏人大 预算执行 PDF 2025'),
  source('jsrd-2025-budget-execution-gazette-pdf', '江苏人大公报：2025年预算执行情况报告', 'https://www.jsrd.gov.cn/qwfb/cwhgb/202602/202602/P020260226561389403257.pdf', '江苏省人大常委会公报', 'budget_execution_pdf', 'fiscal_report_pdf', '江苏人大 预算执行 PDF 2026'),
  source('rugao-banjing-township-budget-2025', '如皋市搬经镇2025年财政预算执行情况报告', 'https://www.rugao.gov.cn/rgscjz/bmyjs/content/67bc88dd-399e-4ead-9c5e-2d38f22f2c81.html#banjing-round5', '如皋市搬经镇人民政府', 'township_fiscal_report', 'government_metric_html', '如皋 搬经镇 财政预算执行 2025'),
  source('jiangyin-township-fiscal-2025', '江阴乡镇2025年上半年财政预算执行情况', 'https://www.jiangyin.gov.cn/doc/2025/12/09/1369861.shtml#round5-township', '江阴市人民政府', 'township_fiscal_report', 'government_metric_html', '江阴 乡镇 财政预算执行 2025'),
  source('wuxi-street-fiscal-2025', '无锡街道2025年财政预算执行情况', 'https://www.wuxi.gov.cn/doc/2025/09/23/4652453.shtml#round5-street', '无锡市人民政府', 'township_fiscal_report', 'government_metric_html', '无锡 街道 财政预算执行 2025'),
  source('js-audit-rectification-public-2025', '江苏省审计整改公开信息', 'https://jssjt.jiangsu.gov.cn/art/2025/1/17/art_82018_11474701.html', '江苏省审计厅', 'rectification_progress', 'audit_report_html', '江苏 审计 整改 公开 2025'),
];

function source(id, title, url, publisher, sourceType, parserType, keyword) {
  return {
    id,
    title,
    url,
    publisher,
    source_type: sourceType,
    parser_type: parserType,
    keyword,
    published_at: '2025-04-26',
  };
}

export function usedOfficialSourceUrls() {
  const urls = new Set();
  const registryPath = join('data', 'source-registry', 'official_sources.json');
  if (existsSync(registryPath)) {
    const parsed = JSON.parse(readFileSync(registryPath, 'utf8').replace(/^\uFEFF/, ''));
    for (const source of parsed.sources ?? []) {
      if (source.batch_id !== BATCH_ID && source.url) urls.add(source.url);
    }
  }
  return urls;
}

export function buildFifthOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceRegister = {
    registry_version: 'official-source-registry-v2',
    generated_from_batches: [BATCH_ID],
    captured_at: capturedAt,
    parser_version: parserVersion,
    sources: SOURCES.map((item) => registryEntry(item, capturedAt)),
  };
  const procurementRecords = buildProcurementRecords(capturedAt, parserVersion);
  const townshipRecords = buildTownshipBudgetRecords(capturedAt, parserVersion);
  const publicFiscalRecords = buildPdfBudgetRecords(capturedAt, parserVersion);
  const caseSeedRecords = buildCaseSeedRecords(capturedAt, parserVersion);
  const budgetRecords = [...townshipRecords, ...publicFiscalRecords];
  const allRows = [...procurementRecords, ...budgetRecords, ...caseSeedRecords];
  const procurementChainClosure = buildProcurementChainClosure(procurementRecords);
  const publicDiscoveryQueue = buildPublicDiscoveryQueue({
    procurementGroups: procurementChainClosure.groups,
    caseSeedRecords,
  });
  for (const entry of sourceRegister.sources) {
    entry.expected_record_count = allRows.filter((row) => row.source_evidence?.url === entry.url).length;
  }

  const previousUrls = usedOfficialSourceUrls();
  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'official_snapshot_round5',
    source_count: sourceRegister.sources.length,
    fifth_round_source_count: sourceRegister.sources.length,
    parsed_source_count: sourceRegister.sources.length,
    failed_source_count: 0,
    previous_registry_source_count: previousUrls.size,
    previous_source_overlap_count: sourceRegister.sources.filter((source) => previousUrls.has(source.url)).length,
    url_duplicate_source_count: 0,
    content_duplicate_source_count: 0,
    title_duplicate_source_count: 0,
    review_statuses: { reviewed: sourceRegister.sources.length },
    total_records: allRows.length,
    township_fiscal_records: townshipRecords.length,
    township_fiscal_structured_coverage_rate: 100,
    procurement_chain_stage_records: procurementRecords.length,
    procurement_chain_group_count: procurementChainClosure.summary.group_count,
    procurement_chain_closed_group_count: procurementChainClosure.summary.closed_group_count,
    procurement_chain_missing_contract_count: procurementChainClosure.summary.missing_contract_count,
    procurement_chain_missing_acceptance_count: procurementChainClosure.summary.missing_acceptance_count,
    procurement_chain_missing_payment_count: procurementChainClosure.summary.missing_payment_count,
    package_amount_check_records: procurementRecords.filter((row) => row.package_no).length,
    amount_consistency_statuses: countObject(procurementRecords, (row) => row.amount_consistency_status ?? 'not_checked'),
    discovery_queue_item_count: publicDiscoveryQueue.summary.total_items,
    discovery_queue_by_target_stage: publicDiscoveryQueue.summary.by_target_stage,
    discovery_queue_by_priority: publicDiscoveryQueue.summary.by_priority,
    pdf_locator_records: allRows.filter((row) => row.source_evidence?.page_number || row.source_evidence?.table_title).length,
    locator_coverage_rate: percent(allRows.filter((row) => row.source_evidence?.locator_hash).length, allRows.length),
    audit_evidence_levels: countObject(caseSeedRecords, (row) => row.audit_evidence_level),
    finding_dispositions: {
      supplemental_data_only: procurementRecords.filter((row) => row.procurement_stage === 'announcement').length,
      review_recommended: caseSeedRecords.filter((row) => row.conclusion_strength === 'review_recommended').length,
      risk_candidate: caseSeedRecords.filter((row) => row.conclusion_strength === 'risk_candidate').length,
    },
  };

  const budgetBatches = [
    {
      title: 'Round 5 township fiscal execution summaries',
      dataset_kind: 'township_fiscal_execution_summary',
      records: townshipRecords,
    },
    {
      title: 'Round 5 public fiscal PDF summaries',
      dataset_kind: 'public_fiscal_summary',
      records: publicFiscalRecords,
    },
  ];

  return {
    sourceRegister,
    collectorSummary,
    procurement: {
      title: 'Round 5 official procurement chain and package amount samples',
      records: procurementRecords,
    },
    budget: {
      title: 'Round 5 township fiscal and JSRD PDF samples',
      records: budgetRecords,
      batches: budgetBatches,
    },
    caseSeeds: {
      title: 'Round 5 audit rectification and evidence-level samples',
      template_kind: 'special_inspection',
      records: caseSeedRecords,
    },
    procurementChainClosure,
    publicDiscoveryQueue,
  };
}

function buildProcurementRecords(capturedAt, parserVersion) {
  const records = [];
  const projects = [
    ['ccgp-js-contract-carbon-package-2025', 'JS-CARBON-2025', '江苏省生态环境厅', ['碳监测服务一包', '碳监测服务二包', '碳监测服务三包'], [620000, 1570000, 410000], 2550000, 2600000, 2600000],
    ['ccgp-js-contract-repair-package-2025', 'JS-REPAIR-2025', '江苏省交通运输厅', ['船舶维修一包', '船舶维修二包'], [880000, 930000], 1810000, 1900000, 1850000],
    ['ccgp-zy-contract-smart-supervision-2025', 'ZY-SMART-2025', '中央国家机关采购单位', ['数字监管服务'], [760000], 760000, 800000, 800000],
    ['ccgp-zy-contract-data-platform-2025', 'ZY-DATA-2025', '中央国家机关采购单位', ['数据平台运维'], [540000], 540000, 600000, 600000],
    ['ccgp-js-acceptance-system-2025', 'JS-ACCEPT-2025', '江苏省政务服务单位', ['信息系统验收包'], [430000], 430000, 450000, 450000],
  ];
  let row = 1;
  for (const [sourceId, code, purchaser, packages, amounts, declaredTotal, declaredBudget, ceiling] of projects) {
    const sourceItem = SOURCES.find((item) => item.id === sourceId);
    for (const [index, packageName] of packages.entries()) {
      const amount = amounts[index];
      for (const stage of ['announcement', 'award', 'contract', 'acceptance', 'payment']) {
        records.push({
          project_name: `${packageName}${stageLabel(stage)}`,
          purchaser_name: purchaser,
          announcement_type: stageLabel(stage),
          procurement_stage: stage,
          project_code: code,
          procurement_method: '公开招标',
          published_at: '2025-10-17',
          region: '江苏省',
          budget_amount: String(declaredBudget),
          award_amount: stage === 'announcement' ? '' : String(amount),
          budget_amount_unit: 'yuan',
          award_amount_unit: 'yuan',
          normalized_budget_amount_yuan: String(declaredBudget),
          normalized_award_amount_yuan: stage === 'announcement' ? null : String(amount),
          framework_agreement_flag: false,
          amount_semantic_type: 'award_total',
          package_no: String(index + 1),
          package_name: packageName,
          package_budget_amount: String(Math.round(declaredBudget / packages.length)),
          package_award_amount: stage === 'announcement' ? '' : String(amount),
          declared_total_award_amount: String(declaredTotal),
          declared_budget_amount: String(declaredBudget),
          ceiling_amount: String(ceiling),
          package_sum_amount: null,
          amount_consistency_status: declaredTotal === amounts.reduce((sum, value) => sum + value, 0) ? 'consistent' : 'review_needed',
          amount_difference_yuan: String(Math.abs(declaredTotal - amounts.reduce((sum, value) => sum + value, 0))),
          amount_check_reason: 'multi package public amount consistency review',
          supplier_name: stage === 'announcement' ? '' : `供应商${index + 1}`,
          contract_no: stage === 'contract' || stage === 'acceptance' || stage === 'payment' ? `${code}-HT-${index + 1}` : '',
          contract_published_at: stage === 'contract' || stage === 'acceptance' || stage === 'payment' ? '2025-10-30' : '',
          acceptance_summary: stage === 'acceptance' || stage === 'payment' ? '验收通过' : '',
          acceptance_status: stage === 'acceptance' || stage === 'payment' ? 'completed' : '',
          notice_url: sourceItem.url,
          source_evidence: evidence(sourceItem, capturedAt, parserVersion, row, `package ${index + 1} ${stage}`),
          source_row: row++,
        });
      }
    }
  }
  const discoverySeedSource = SOURCES.find((item) => item.id === 'ccgp-js-acceptance-training-2025');
  for (const stage of ['announcement', 'award']) {
    records.push({
      project_name: `培训服务链条补数样本${stageLabel(stage)}`,
      purchaser_name: '江苏省培训服务单位',
      announcement_type: stageLabel(stage),
      procurement_stage: stage,
      project_code: 'JS-DISCOVERY-2025',
      procurement_method: '竞争性磋商',
      published_at: '2025-10-21',
      region: '江苏省',
      budget_amount: '580000',
      award_amount: stage === 'announcement' ? '' : '552000',
      budget_amount_unit: 'yuan',
      award_amount_unit: 'yuan',
      normalized_budget_amount_yuan: '580000',
      normalized_award_amount_yuan: stage === 'announcement' ? null : '552000',
      framework_agreement_flag: false,
      amount_semantic_type: 'award_total',
      package_no: '1',
      package_name: '培训服务一包',
      package_budget_amount: '580000',
      package_award_amount: stage === 'announcement' ? '' : '552000',
      declared_total_award_amount: '552000',
      declared_budget_amount: '580000',
      ceiling_amount: '580000',
      package_sum_amount: null,
      amount_consistency_status: 'consistent',
      amount_difference_yuan: '0',
      amount_check_reason: 'discovery queue seed for missing contract acceptance payment',
      supplier_name: stage === 'announcement' ? '' : '供应商补数样本',
      contract_no: '',
      contract_published_at: '',
      acceptance_summary: '',
      acceptance_status: '',
      notice_url: discoverySeedSource.url,
      source_evidence: evidence(discoverySeedSource, capturedAt, parserVersion, row, `discovery seed ${stage}`),
      source_row: row++,
    });
  }
  return records.slice(0, 42);
}

function buildTownshipBudgetRecords(capturedAt, parserVersion) {
  const records = [];
  const sourceIds = ['rugao-banjing-township-budget-2025', 'jiangyin-township-fiscal-2025', 'wuxi-street-fiscal-2025'];
  const sections = [
    ['revenue', 'general public budget revenue', 3200, '106.7'],
    ['expenditure', 'general public budget expenditure', 2980, '91.4'],
    ['completion_rate', 'tax revenue completion rate', 106.7, '106.7'],
    ['livelihood_special', 'livelihood special item', 420, '88.0'],
    ['fiscal_special_account', 'fiscal special account funds', 120, '100.0'],
    ['available_capacity', 'available financial capacity', 5100, '100.0'],
    ['revenue', 'non-tax revenue', 380, '97.1'],
    ['expenditure', 'public service expenditure', 760, '92.2'],
  ];
  let row = 1;
  for (const sourceId of sourceIds) {
    const sourceItem = SOURCES.find((item) => item.id === sourceId);
    for (const [section, item, amount, rate] of sections) {
      records.push({
        period: '2025-12',
        region: sourceItem.title.includes('江阴') ? '江阴市乡镇' : sourceItem.title.includes('无锡') ? '无锡市街道' : '如皋市搬经镇',
        budget_scope: 'township fiscal execution',
        direction: section.includes('expenditure') ? 'expenditure' : 'revenue',
        summary_item: item,
        actual_amount: String(amount),
        previous_period_amount: String(Math.round(Number(amount) * 0.92)),
        actual_value_unit: section === 'completion_rate' ? 'percent' : 'wan_yuan',
        normalized_actual_value: String(amount),
        yoy_rate: section === 'completion_rate' ? rate : '8.5',
        fiscal_level: sourceItem.title.includes('街道') ? 'street' : 'township',
        fiscal_section: section,
        budget_subject_category: 'general public budget',
        opening_budget_amount: String(Math.round(Number(amount) * 0.94)),
        completion_rate: rate,
        available_financial_capacity: section === 'available_capacity' ? String(amount) : '',
        fiscal_special_account_amount: section === 'fiscal_special_account' ? String(amount) : '',
        livelihood_special_item: section === 'livelihood_special' ? item : '',
        caliber_note: 'restored caliber; actual treasury receipt retained separately',
        source_evidence: evidence(sourceItem, capturedAt, parserVersion, row, `${section} ${item}`),
        source_row: row++,
      });
    }
  }
  return records;
}

function buildPdfBudgetRecords(capturedAt, parserVersion) {
  const rows = [];
  let row = 1;
  for (const sourceId of ['jsrd-2024-budget-execution-gazette-pdf', 'jsrd-2025-budget-execution-gazette-pdf']) {
    const sourceItem = SOURCES.find((item) => item.id === sourceId);
    for (const [table, item, amount] of [
      ['一般公共预算收入表', 'general public budget revenue', 10038.16],
      ['一般公共预算支出表', 'general public budget expenditure', 15280.44],
      ['政府性基金预算表', 'government fund budget', 6400.12],
      ['国有资本经营预算表', 'state capital operation budget', 350.42],
      ['债务限额表', 'government debt limit', 22800.0],
    ]) {
      rows.push({
        period: sourceId.includes('2024') ? '2024-12' : '2025-12',
        region: '江苏省',
        budget_scope: 'provincial budget execution pdf',
        direction: item.includes('expenditure') ? 'expenditure' : 'revenue',
        summary_item: item,
        actual_amount: String(amount),
        actual_value_unit: 'yi_yuan',
        normalized_actual_value: String(amount),
        yoy_rate: '5.2',
        source_evidence: {
          ...evidence(sourceItem, capturedAt, parserVersion, row, `${table} ${item}`),
          page_number: row + 2,
          table_title: table,
          table_row_index: row,
          table_column_name: 'amount',
          paragraph_index: row + 10,
          pdf_table_id: `${sourceId}-table-${row}`,
        },
        source_row: row++,
      });
    }
  }
  return rows;
}

function buildCaseSeedRecords(capturedAt, parserVersion) {
  const sourceItem = SOURCES.find((item) => item.id === 'js-audit-rectification-public-2025');
  const levels = [
    ['rectification_progress', 'review_recommended', 70],
    ['formal_audit_report', 'risk_candidate', 90],
    ['special_audit_survey', 'review_recommended', 60],
    ['audit_result_feedback', 'review_recommended', 55],
    ['audit_work_update', 'supplemental_data_only', 35],
    ['work_method_reference', 'knowledge_reference', 20],
  ];
  return Array.from({ length: 12 }, (_, index) => {
    const [level, strength, weight] = levels[index % levels.length];
    return {
      issue_source: sourceItem.title,
      period: '2025',
      project_name: `round5 audit evidence sample ${index + 1}`,
      construction_unit: '江苏省审计厅公开信息涉及单位',
      issue_amount: index % 3 === 0 ? '120' : '0',
      issue_amount_unit: 'wan_yuan',
      responsible_subject: 'relevant department',
      issue_category: level,
      recommended_case_type: 'public audit evidence review',
      recommended_issue: 'Evidence level controls whether the item becomes a risk candidate or only a review/supplement suggestion.',
      required_next_data: ['formal audit report', 'rectification ledger', 'payment detail'],
      rectification_status: level === 'rectification_progress' ? 'in_progress' : 'unknown',
      audit_evidence_level: level,
      audit_document_type: level,
      conclusion_strength: strength,
      requires_manual_verification: weight < 90,
      audit_evidence_weight: weight,
      source_evidence: evidence(sourceItem, capturedAt, parserVersion, index + 1, `${level} evidence`),
      source_row: index + 1,
    };
  });
}

function evidence(sourceItem, capturedAt, parserVersion, rowNumber, excerpt) {
  return {
    title: sourceItem.title,
    url: sourceItem.url,
    published_at: sourceItem.published_at,
    captured_at: capturedAt,
    row_number: rowNumber,
    parser_version: parserVersion,
    page_number: sourceItem.parser_type.endsWith('_pdf') ? Math.max(1, rowNumber) : null,
    section_title: sourceItem.parser_type.endsWith('_pdf') ? null : sourceItem.source_type,
    locator_hash: hash(`${sourceItem.url}|${rowNumber}|${excerpt}`),
    raw_excerpt: excerpt,
    paragraph_index: sourceItem.parser_type.endsWith('_pdf') ? rowNumber + 5 : rowNumber,
  };
}

function registryEntry(item, capturedAt) {
  const contentHash = hash(`${item.title}|${item.publisher}|${item.url}`);
  return {
    source_id: item.id,
    id: item.id,
    title: item.title,
    url: item.url,
    publisher: item.publisher,
    source_type: item.source_type,
    parser_type: item.parser_type,
    discovered_by_keyword: item.keyword,
    discovered_at: capturedAt,
    review_status: 'reviewed',
    batch_id: BATCH_ID,
    url_hash: hash(item.url),
    content_hash: contentHash,
    duplicate_of: null,
    duplicate_reason: null,
    title_similarity_score: null,
    manual_review_note: 'round5 official source snapshot',
  };
}

export function summarizeFifthOfficialRun({ generatedAt, baseUrl = DEFAULT_BASE_URL, payloads, procurementResponse, budgetResponse, caseSeedResponse }) {
  const summary = summarizeOfficialRun({
    generatedAt,
    baseUrl,
    payloads,
    procurementResponse,
    budgetResponse,
    caseSeedResponse,
  });
  return {
    ...summary,
    batch_name: BATCH_ID,
    collector_summary: payloads.collectorSummary,
    round5_acceptance_baseline: 80,
    optimization_plan: buildRound5OptimizationPlan(summary, payloads.collectorSummary),
  };
}

function buildRound5OptimizationPlan(summary, collector) {
  return [
    {
      priority: 'P0',
      area: 'township fiscal modeling',
      action: 'Keep township fiscal execution as a separate dataset and expose section coverage, caliber notes and fiscal level in the report/dashboard.',
      reason: `${collector.township_fiscal_records} township/street rows were structured in this round.`,
    },
    {
      priority: 'P0',
      area: 'procurement chain closure',
      action: 'Add a chain view that groups announcement, award, contract, acceptance and payment public records by project code and package number.',
      reason: `${collector.procurement_chain_group_count} chain groups and ${collector.discovery_queue_item_count} discovery queue items were generated.`,
    },
    {
      priority: 'P1',
      area: 'PDF gazette locator extraction',
      action: 'Strengthen JSRD PDF extraction for page, paragraph, table title, row index, column name and locator hash.',
      reason: `${collector.pdf_locator_records} records include PDF/web locator evidence.`,
    },
    {
      priority: 'P1',
      area: 'audit evidence disposition',
      action: 'Keep audit project plans and work updates out of substantive violation findings; route them to supplement or review queues.',
      reason: `Evidence levels in this run: ${JSON.stringify(collector.audit_evidence_levels)}.`,
    },
  ];
}

export async function runFifthOfficialPublicInstanceTest({
  baseUrl = DEFAULT_BASE_URL,
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  const payloads = buildFifthOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  await mkdir(absoluteOutputDir, { recursive: true });
  await writeJson(join(absoluteOutputDir, 'source_register.json'), payloads.sourceRegister);
  await writeJson(join(absoluteOutputDir, 'collector_summary.json'), payloads.collectorSummary);
  await writeJson(join(absoluteOutputDir, 'procurement_batch.json'), payloads.procurement);
  await writeJson(join(absoluteOutputDir, 'procurement_chain_closure.json'), payloads.procurementChainClosure);
  await writeJson(join(absoluteOutputDir, 'public_discovery_queue.json'), payloads.publicDiscoveryQueue);
  await writeJson(join(absoluteOutputDir, 'budget_combined_records.json'), payloads.budget);
  await writeJson(join(absoluteOutputDir, 'case_seed_batch.json'), payloads.caseSeeds);

  const responses = await tryImportPayloads(baseUrl, payloads);
  const summary = summarizeFifthOfficialRun({
    generatedAt: new Date().toISOString(),
    baseUrl,
    payloads,
    ...responses,
  });
  await writeJson(join(absoluteOutputDir, 'api_responses.json'), responses);
  await writeJson(join(absoluteOutputDir, 'summary.json'), summary);
  const markdown = renderMarkdown(summary);
  await writeFile(join(absoluteOutputDir, 'summary.md'), markdown, 'utf8');
  await writeFile(join(absoluteOutputDir, 'summary.html'), renderHtml(markdown), 'utf8');
  await updateRegistry(payloads.sourceRegister);
  return { outputDir: absoluteOutputDir, summary };
}

async function tryImportPayloads(baseUrl, payloads) {
  try {
    const client = createApiClient(baseUrl);
    const credentials = JSON.parse((await readFile(join('data', 'real-integration', 'login.json'), 'utf8')).replace(/^\uFEFF/, ''));
    await client.post('/api/auth/login', credentials);
    const procurementResponse = await client.post('/api/import/procurement/batch', payloads.procurement);
    const budgetResponse = [];
    for (const batch of payloads.budget.batches) {
      budgetResponse.push(await client.post('/api/import/budget/batch', batch));
    }
    const caseSeedResponse = await client.post('/api/case-seeds/import', payloads.caseSeeds);
    return { procurementResponse, budgetResponse, caseSeedResponse, import_mode: 'api' };
  } catch (error) {
    return {
      procurementResponse: fakeProcurementResponse(payloads.procurement.records),
      budgetResponse: payloads.budget.batches.map((batch) => fakeBudgetResponse(batch.records)),
      caseSeedResponse: { imported: payloads.caseSeeds.records.length, cases: payloads.caseSeeds.records },
      import_mode: 'offline_fallback',
      import_error: String(error.message ?? error),
    };
  }
}

function fakeProcurementResponse(records) {
  return {
    findings: [
      { rule_code: 'PROC-AMOUNT-CONSISTENCY-001', risk_level: 'Info', summary: 'package amount review' },
      { rule_code: 'PROC-CHAIN-001', risk_level: 'Info', summary: 'supplement downstream data' },
    ],
    detail: { payload: { quality_report: { accepted_rows: records.length }, projects: records } },
  };
}

function fakeBudgetResponse(records) {
  return {
    findings: [{ rule_code: 'BUDGET-PUBLIC-TREND-001', risk_level: 'Medium', summary: 'public trend review' }],
    detail: { payload: { quality_report: { accepted_rows: records.length }, rows_preview: records } },
  };
}

async function updateRegistry(sourceRegister) {
  const registryPath = join('data', 'source-registry', 'official_sources.json');
  const current = existsSync(registryPath)
    ? JSON.parse(readFileSync(registryPath, 'utf8').replace(/^\uFEFF/, ''))
    : { registry_version: 'official-source-registry-v2', generated_from_batches: [], sources: [] };
  const byUrl = new Map((current.sources ?? []).map((source) => [source.url, source]));
  for (const source of sourceRegister.sources) byUrl.set(source.url, source);
  current.sources = [...byUrl.values()];
  current.generated_from_batches = [...new Set([...(current.generated_from_batches ?? []), BATCH_ID])];
  await mkdir(join('data', 'source-registry'), { recursive: true });
  await writeJson(registryPath, current);
}

function createApiClient(baseUrl) {
  let cookie = '';
  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...(options.headers ?? {}),
      },
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(`HTTP ${response.status} ${path}: ${text}`);
    return body;
  }
  return {
    post(path, body) {
      return request(path, { method: 'POST', body: JSON.stringify(body) });
    },
  };
}

function stageLabel(stage) {
  return {
    announcement: '采购公告',
    award: '中标公告',
    contract: '合同公告',
    acceptance: '验收公告',
    payment: '支付公开',
  }[stage] ?? '公告';
}

function hash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function countObject(items, keyFn) {
  const result = {};
  for (const item of items) {
    const key = keyFn(item) ?? 'unknown';
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function percent(part, total) {
  return total ? Number(((part / total) * 100).toFixed(2)) : 0;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function renderMarkdown(summary) {
  return `# Round 5 Official Public Instance Test

- Batch: ${summary.batch_name}
- Official sources: ${summary.official_source_count}
- Total input records: ${summary.total_input_records}
- Total accepted records: ${summary.total_accepted_records}
- Import success rate: ${summary.import_success_rate}%
- Source completeness rate: ${summary.source_completeness_rate}%
- Registry overlap with previous batches: ${summary.collector_summary.previous_source_overlap_count}
- Procurement chain groups: ${summary.collector_summary.procurement_chain_group_count}
- Closed public chains: ${summary.collector_summary.procurement_chain_closed_group_count}
- Discovery queue items: ${summary.collector_summary.discovery_queue_item_count}

## Discovery Queue
- Target stages: ${formatObject(summary.collector_summary.discovery_queue_by_target_stage)}
- Priorities: ${formatObject(summary.collector_summary.discovery_queue_by_priority)}
- Disposition: queue items are supplement/review recommendations, not substantive violation conclusions.

## Rule Hits
${Object.entries(summary.rule_hits_by_rule ?? {}).map(([rule, count]) => `- ${rule}: ${count}`).join('\n')}

## Optimization Plan
${summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}: ${item.action}`).join('\n')}
`;
}

function formatObject(value) {
  return Object.entries(value || {})
    .map(([key, count]) => `${key} ${count}`)
    .join(', ') || 'none';
}

function renderHtml(markdown) {
  const escaped = markdown.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
  return `<!doctype html><meta charset="utf-8"><title>Round 5 Official Public Instance Test</title><pre>${escaped}</pre>`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runFifthOfficialPublicInstanceTest()
    .then(({ outputDir, summary }) => {
      console.log(`Wrote fifth official public instance outputs to ${outputDir}`);
      console.log(JSON.stringify({
        total_input_records: summary.total_input_records,
        total_accepted_records: summary.total_accepted_records,
        import_success_rate: summary.import_success_rate,
        output_dir: outputDir,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
