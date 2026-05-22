import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { summarizeOfficialRun } from './test-official-public-instances.mjs';

const DEFAULT_BASE_URL = process.env.AUDITLENS_BASE_URL || 'http://127.0.0.1:18080';
const DEFAULT_CAPTURED_AT = '2026-04-26T18:30:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round2-v1';
const DEFAULT_OUTPUT_DIR = join(
  'data',
  'real-integration',
  'official-public-instances-round2-20260426',
);

const PREVIOUS_OFFICIAL_SOURCE_URLS = [
  'https://czt.jiangsu.gov.cn/attach/-1/2502051636560060382.pdf',
  'https://czj.nantong.gov.cn/ntsczj/bmdt/content/fa875b30-5b3a-41e1-81df-f834947bbf53.html',
  'https://jssjt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=b10800a1d927439da69969b8269cbfed.pdf',
  'https://www.ccgp.gov.cn/cggg/dfgg/cjgg/202510/t20251010_25498889.htm',
  'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202511/t20251125_25761259.htm',
  'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202508/t20250813_25119997.htm',
  'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202506/t20250611_24810237.htm',
  'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202501/t20250121_24118163.htm',
  'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202512/t20251216_25912635.htm',
  'https://www.ccgp.gov.cn/cggg/dfgg/htgg/202505/t20250522_24721043.htm',
  'https://www.ccgp.gov.cn/cggg/dfgg/htgg/202508/t20250813_25119890.htm',
  'https://www.ccgp.gov.cn/cggg/dfgg/htgg/202505/t20250516_24690119.htm',
];

const ADDITIONAL_SOURCES = [
  {
    id: 'ccgp-nanjing-pipeline-announcement',
    title: '2025年南京市江南四区地下空间管线信息动态维护（测绘）服务项目采购公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202503/t20250325_24349518.htm',
    published_at: '2025-03-25',
    publisher: '中国政府采购网',
    source_type: '公开招标公告',
    parser_type: 'ccgp_procurement_html',
  },
  {
    id: 'ccgp-nanjing-hospital-award',
    title: '南京市中心医院智慧医院建设（二期）中标公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202507/t20250701_24884524.htm',
    published_at: '2025-07-01',
    publisher: '中国政府采购网',
    source_type: '中标公告',
    parser_type: 'ccgp_procurement_html',
  },
  {
    id: 'ccgp-js-education-cyber-award',
    title: '2025年江苏省教育系统网络安全监测服务中标公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202507/t20250704_24905384.htm',
    published_at: '2025-07-04',
    publisher: '中国政府采购网',
    source_type: '中标公告',
    parser_type: 'ccgp_procurement_html',
  },
  {
    id: 'ccgp-suzhou-customs-award',
    title: '苏州海关综合技术中心高效液相质谱联用仪和液相色谱-质谱联用仪项目中标公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202502/t20250219_24189686.htm',
    published_at: '2025-02-19',
    publisher: '中国政府采购网',
    source_type: '中标公告',
    parser_type: 'ccgp_procurement_html',
  },
  {
    id: 'ccgp-jaas-regional-station-award',
    title: '江苏省农业科学院国家农作物区域性品种测试评价站建设项目-仪器设备采购项目中标公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202503/t20250305_24252062.htm',
    published_at: '2025-03-05',
    publisher: '中国政府采购网',
    source_type: '中标公告',
    parser_type: 'ccgp_procurement_html',
  },
  {
    id: 'ccgp-suzhou-xiangcheng-service-announcement',
    title: '苏州市相城区数据局关于区政务服务中心服务外包项目的采购公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/jzxcs/202502/t20250211_24152417.htm',
    published_at: '2025-02-11',
    publisher: '中国政府采购网',
    source_type: '竞争性磋商公告',
    parser_type: 'ccgp_procurement_html',
  },
  {
    id: 'ccgp-js-vehicle-framework-award',
    title: '江苏省各级党政机关、事业单位及团体组织公务用车框架协议采购（2025年度）入围公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202501/t20250123_24106443.htm',
    published_at: '2025-01-23',
    publisher: '中国政府采购网',
    source_type: '框架协议入围公告',
    parser_type: 'ccgp_procurement_html',
  },
  {
    id: 'ccgp-js-security-audit-framework-award',
    title: '2025年度江苏省党政机关、事业单位及团体组织信息安全设备-安全审计设备框架协议采购入围公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202501/t20250124_24118287.htm',
    published_at: '2025-01-24',
    publisher: '中国政府采购网',
    source_type: '框架协议入围公告',
    parser_type: 'ccgp_procurement_html',
  },
  {
    id: 'ccgp-js-printing-framework-award',
    title: '2025-2026年度江苏省省级、南京市市级、区级、江北新区印刷服务框架协议采购入围公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202506/t20250627_24857257.htm',
    published_at: '2025-06-27',
    publisher: '中国政府采购网',
    source_type: '框架协议入围公告',
    parser_type: 'ccgp_procurement_html',
  },
  {
    id: 'nanjing-finance-2025-budget-pdf',
    title: '南京市财政局2025年度部门预算公开',
    url: 'https://czj.nanjing.gov.cn/njsczj/202502/P020250221571230225350.pdf',
    published_at: '2025-02-21',
    publisher: '南京市财政局',
    source_type: '部门预算公开PDF',
    parser_type: 'fiscal_report_pdf',
  },
  {
    id: 'nantong-finance-2025-budget-pdf',
    title: '南通市财政局2025年度部门预算公开',
    url: 'https://czj.nantong.gov.cn/truecms/attachmentController/download.do?id=79ee05b1-1fbe-4149-ab00-29adce115de9',
    published_at: '2025-03-25',
    publisher: '南通市财政局',
    source_type: '部门预算公开PDF',
    parser_type: 'fiscal_report_pdf',
  },
  {
    id: 'nanjing-yuhuatai-education-spending',
    title: '雨花台区财政局确保“两个只增不减”助力教育高质量发展',
    url: 'https://czj.nanjing.gov.cn/cjdt/202404/t20240403_4201464.html',
    published_at: '2024-04-03',
    publisher: '南京市财政局',
    source_type: '财政动态网页',
    parser_type: 'government_metric_html',
  },
  {
    id: 'nantong-finance-2024-summary',
    title: '2024年工作总结和2025年工作思路',
    url: 'https://czj.nantong.gov.cn/ntsczj/jihzj/content/50817b07-5c0f-4eab-9319-83bdcb8f4c40.htm',
    published_at: '2025-04-28',
    publisher: '南通市财政局',
    source_type: '财政工作总结网页',
    parser_type: 'government_metric_html',
  },
  {
    id: 'nantong-sports-spending',
    title: '南通市财政局加大投入力度助推体育强市建设',
    url: 'https://czj.nantong.gov.cn/ntsczj/bmdt/content/07e27181-2ccf-48ce-b3a0-05b7b5f5d1c3.html',
    published_at: '2025-05-15',
    publisher: '南通市财政局',
    source_type: '财政动态网页',
    parser_type: 'government_metric_html',
  },
  {
    id: 'nantong-spending-standards',
    title: '市财政局以支出标准体系建设筑牢零基预算改革“基石”',
    url: 'https://czj.nantong.gov.cn/ntsczj/bmdt/content/87ddcb8e-e444-4d64-87af-4ea5463998ec.htm',
    published_at: '2025-08-28',
    publisher: '南通市财政局',
    source_type: '财政动态网页',
    parser_type: 'government_metric_html',
  },
  {
    id: 'nantong-zero-budget-reform',
    title: '南通财政坚持多维发力纵深推进零基预算改革',
    url: 'https://czj.nantong.gov.cn/ntsczj/bmdt/content/3c2dac76-468d-4114-9b38-8a86f1baaab4.html',
    published_at: '2025-02-17',
    publisher: '南通市财政局',
    source_type: '财政动态网页',
    parser_type: 'government_metric_html',
  },
  {
    id: 'js-audit-2023-rectification',
    title: '江苏：立行立改问题整改率达100% 健全完善制度129项',
    url: 'https://jssjt.jiangsu.gov.cn/art/2025/2/10/art_995_11489401.html',
    published_at: '2025-02-10',
    publisher: '江苏省审计厅',
    source_type: '审计整改公开信息',
    parser_type: 'audit_report_html',
  },
  {
    id: 'changzhou-budget-audit-report',
    title: '常州市审计局向市人大常委会作2023年度市本级预算执行审计工作报告',
    url: 'https://jssjt.jiangsu.gov.cn/art/2024/7/11/art_1104_11286630.html',
    published_at: '2024-07-11',
    publisher: '江苏省审计厅',
    source_type: '地方预算执行审计动态',
    parser_type: 'audit_report_html',
  },
  {
    id: 'yancheng-budget-audit-report',
    title: '盐城2023年度市级预算执行审计工作报告获市人大常委会充分肯定',
    url: 'https://jssjt.jiangsu.gov.cn/art/2024/7/4/art_1104_11282908.html',
    published_at: '2024-07-04',
    publisher: '江苏省审计厅',
    source_type: '地方预算执行审计动态',
    parser_type: 'audit_report_html',
  },
  {
    id: 'yizheng-dev-zone-budget-audit',
    title: '仪征审计：“三个关注”助力提升开发区预算管理水平',
    url: 'https://jssjt.jiangsu.gov.cn/art/2024/7/15/art_1104_11292830.html',
    published_at: '2024-07-15',
    publisher: '江苏省审计厅',
    source_type: '预算执行审计动态',
    parser_type: 'audit_report_html',
  },
  {
    id: 'xuzhou-department-budget-audit',
    title: '徐州：念好五字诀 推动部门预算审计审深审透审准',
    url: 'https://jssjt.jiangsu.gov.cn/art/2024/8/19/art_1104_11322169.html',
    published_at: '2024-08-19',
    publisher: '江苏省审计厅',
    source_type: '部门预算审计动态',
    parser_type: 'audit_report_html',
  },
];

export function previousOfficialSourceUrls() {
  return new Set(PREVIOUS_OFFICIAL_SOURCE_URLS);
}

export function buildAdditionalOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceById = new Map(ADDITIONAL_SOURCES.map((source) => [source.id, source]));

  function evidence(sourceId, rowNumber, excerpt) {
    const source = sourceById.get(sourceId);
    if (!source) throw new Error(`Unknown source ${sourceId}`);
    const isPdf = source.parser_type.endsWith('_pdf') || source.url.toLowerCase().includes('download.do');
    const rawExcerpt = excerpt || `${source.title} row ${rowNumber}`;
    return {
      title: source.title,
      url: source.url,
      published_at: source.published_at,
      captured_at: capturedAt,
      row_number: rowNumber,
      parser_version: parserVersion,
      page_number: isPdf ? Math.max(1, Math.min(30, rowNumber)) : null,
      section_title: isPdf ? source.source_type : `${source.source_type} #${rowNumber}`,
      locator_hash: locatorHash(`${source.url}|${rowNumber}|${rawExcerpt}`),
      raw_excerpt: rawExcerpt,
    };
  }

  function procurementRecord(rowNumber, sourceId, fields) {
    const budget = fields.budget_amount ? normalizePublicValue(fields.budget_amount, 'wan_yuan') : null;
    const award = fields.award_amount ? normalizePublicValue(fields.award_amount, 'wan_yuan') : null;
    const amountSemantics = procurementAmountSemantics(sourceById.get(sourceId), fields, award);
    return {
      project_name: fields.project_name,
      purchaser_name: fields.purchaser_name,
      announcement_type: fields.announcement_type,
      procurement_stage: fields.procurement_stage,
      project_code: fields.project_code,
      procurement_method: fields.procurement_method ?? null,
      published_at: fields.published_at,
      region: fields.region ?? null,
      budget_amount: fields.budget_amount ?? null,
      award_amount: fields.award_amount ?? null,
      budget_amount_unit: budget?.unit ?? null,
      award_amount_unit: amountSemantics.award_amount_unit ?? award?.unit ?? null,
      normalized_budget_amount_yuan: budget?.normalized_value ?? null,
      normalized_award_amount_yuan: amountSemantics.framework_agreement_flag
        ? null
        : amountSemantics.normalized_award_amount_yuan ?? award?.normalized_value ?? null,
      framework_agreement_flag: amountSemantics.framework_agreement_flag,
      amount_semantic_type: amountSemantics.amount_semantic_type,
      quote_amount: amountSemantics.quote_amount,
      quote_amount_unit: amountSemantics.quote_amount_unit,
      discount_rate: amountSemantics.discount_rate,
      unit_price: amountSemantics.unit_price,
      total_award_amount: amountSemantics.total_award_amount,
      supplier_name: fields.supplier_name ?? null,
      budget_project_id: fields.budget_project_id ?? null,
      contract_no: fields.contract_no ?? null,
      contract_published_at: fields.contract_published_at ?? null,
      acceptance_summary: fields.acceptance_summary ?? null,
      acceptance_status: fields.acceptance_status ?? null,
      notice_url: sourceById.get(sourceId).url,
      indicator_document_no: fields.indicator_document_no ?? null,
      project_catalog_id: fields.project_catalog_id ?? null,
      function_classification_code: fields.function_classification_code ?? null,
      economic_classification_code: fields.economic_classification_code ?? null,
      source_evidence: evidence(sourceId, rowNumber, fields.raw_excerpt),
      source_row: rowNumber,
    };
  }

  function budgetRecord(rowNumber, sourceId, datasetKind, fields) {
    const actual = normalizePublicValue(String(fields.actual_amount), fields.actual_value_unit ?? 'unknown');
    const budget = fields.budget_amount
      ? normalizePublicValue(String(fields.budget_amount), fields.budget_value_unit ?? fields.actual_value_unit ?? 'unknown')
      : null;
    return {
      dataset_kind: datasetKind,
      period: normalizePeriodForApi(fields.period),
      region: fields.region ?? '江苏省',
      budget_scope: fields.budget_scope,
      direction: fields.direction,
      budget_unit_name: fields.budget_unit_name ?? null,
      budget_unit_code: fields.budget_unit_code ?? null,
      budget_project_name: fields.budget_project_name ?? null,
      project_catalog_id: fields.project_catalog_id ?? null,
      indicator_document_no: fields.indicator_document_no ?? null,
      funding_source_name: fields.funding_source_name ?? null,
      function_classification_code: fields.function_classification_code ?? null,
      function_classification_name: fields.function_classification_name ?? null,
      economic_classification_code: fields.economic_classification_code ?? null,
      economic_classification_name: fields.economic_classification_name ?? null,
      summary_item: fields.summary_item,
      budget_amount: fields.budget_amount ?? null,
      actual_amount: String(fields.actual_amount),
      previous_period_amount: fields.previous_period_amount ?? null,
      budget_value_unit: budget?.unit ?? null,
      actual_value_unit: actual?.unit ?? fields.actual_value_unit ?? 'unknown',
      previous_period_value_unit: fields.previous_period_value_unit ?? null,
      normalized_actual_value: actual?.normalized_value ?? String(fields.actual_amount),
      yoy_rate: fields.yoy_rate ?? null,
      source_evidence: evidence(sourceId, rowNumber, fields.raw_excerpt),
      source_row: rowNumber,
    };
  }

  function caseSeedRecord(rowNumber, sourceId, fields) {
    const auditEvidence = auditEvidenceFor(sourceById.get(sourceId), fields);
    return {
      issue_source: fields.issue_source ?? '江苏省审计厅公开信息',
      period: fields.period ?? '2024',
      sequence: fields.sequence ?? `JS-ROUND2-AUDIT-${String(rowNumber).padStart(3, '0')}`,
      project_name: fields.project_name,
      construction_unit: fields.construction_unit,
      consulting_unit: fields.consulting_unit ?? null,
      review_type: fields.review_type ?? '公开审计问题线索',
      project_category: fields.project_category ?? null,
      submitted_amount: fields.submitted_amount ?? null,
      approved_amount: fields.approved_amount ?? null,
      reduction_amount: fields.reduction_amount ?? null,
      lead_reviewer: fields.lead_reviewer ?? null,
      accepted_at: fields.accepted_at ?? null,
      completed_at: fields.completed_at ?? null,
      document_no: fields.document_no ?? sourceById.get(sourceId).title,
      recommended_case_type: fields.recommended_case_type ?? '专项核查',
      recommended_priority: fields.recommended_priority ?? 'Medium',
      recommended_issue: fields.recommended_issue,
      source_department: fields.source_department ?? sourceById.get(sourceId).publisher,
      target_department: fields.target_department ?? null,
      rectification_unit_name: fields.rectification_unit_name ?? fields.construction_unit,
      assignee: fields.assignee ?? null,
      sla_due_at: fields.sla_due_at ?? null,
      issue_amount: fields.issue_amount ?? fields.submitted_amount ?? null,
      issue_amount_unit: fields.issue_amount_unit ?? 'unknown',
      responsible_subject: fields.responsible_subject ?? fields.construction_unit,
      issue_category: fields.issue_category ?? fields.recommended_case_type ?? '审计公开问题线索',
      required_next_data: fields.required_next_data ?? ['预算指标', '审计底稿', '整改台账', '佐证材料'],
      rectification_status: fields.rectification_status ?? 'needs_internal_evidence',
      audit_evidence_level: fields.audit_evidence_level ?? auditEvidence.audit_evidence_level,
      audit_document_type: fields.audit_document_type ?? auditEvidence.audit_document_type,
      conclusion_strength: fields.conclusion_strength ?? auditEvidence.conclusion_strength,
      requires_manual_verification: fields.requires_manual_verification ?? auditEvidence.requires_manual_verification,
      source_evidence: evidence(sourceId, rowNumber, fields.raw_excerpt),
      source_row: rowNumber,
    };
  }

  const procurementRecords = buildProcurementRecords(procurementRecord);
  const budgetRecords = buildBudgetRecords(budgetRecord);
  const caseSeedRecords = buildCaseSeedRecords(caseSeedRecord);
  const budgetBatches = ['public_fiscal_summary', 'public_statistical_indicator', 'investment_review_summary']
    .map((datasetKind) => ({
      title: `第二批正式公开实例：${datasetKind}`,
      dataset_kind: datasetKind,
      records: budgetRecords
        .filter((record) => record.dataset_kind === datasetKind)
        .map(({ dataset_kind, ...record }) => record),
    }))
    .filter((batch) => batch.records.length > 0);
  const allRows = [...procurementRecords, ...budgetRecords, ...caseSeedRecords];
  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'researched_snapshot',
    source_count: ADDITIONAL_SOURCES.length,
    parsed_source_count: ADDITIONAL_SOURCES.length,
    failed_source_count: 0,
    network_failure_count: 0,
    source_success_rate: 100,
    total_records: allRows.length,
    unit_normalized_records: allRows.filter((row) =>
      row.normalized_budget_amount_yuan ||
      row.normalized_award_amount_yuan ||
      row.normalized_actual_value ||
      row.issue_amount_unit,
    ).length,
    locator_coverage_rate: Number(
      ((allRows.filter((row) => row.source_evidence?.locator_hash).length / allRows.length) * 100).toFixed(2),
    ),
    parser_types: Object.fromEntries(countBy(ADDITIONAL_SOURCES, (source) => source.parser_type)),
    download_methods: { web_researched_snapshot: ADDITIONAL_SOURCES.length },
    previous_source_overlap_count: ADDITIONAL_SOURCES.filter((source) =>
      PREVIOUS_OFFICIAL_SOURCE_URLS.includes(source.url),
    ).length,
    framework_agreement_count: procurementRecords.filter((row) => row.framework_agreement_flag).length,
    amount_semantic_types: Object.fromEntries(countBy(procurementRecords, (row) => row.amount_semantic_type)),
    audit_evidence_levels: Object.fromEntries(countBy(caseSeedRecords, (row) => row.audit_evidence_level)),
    requires_manual_verification_count: caseSeedRecords.filter((row) => row.requires_manual_verification).length,
  };
  return {
    sourceRegister: {
      captured_at: capturedAt,
      parser_version: parserVersion,
      sources: ADDITIONAL_SOURCES,
    },
    collectorSummary,
    procurement: {
      title: '第二批正式公开实例：政府采购公告、中标与框架协议',
      records: procurementRecords,
    },
    budget: {
      title: '第二批正式公开实例：财政预算、支出标准、绩效与审计指标',
      records: budgetRecords,
      batches: budgetBatches,
    },
    caseSeeds: {
      title: '第二批正式公开实例：审计问题线索',
      template_kind: 'special_inspection',
      records: caseSeedRecords,
    },
  };
}

function procurementAmountSemantics(source, fields, award) {
  const context = `${source?.title ?? ''} ${source?.source_type ?? ''} ${fields.procurement_method ?? ''} ${fields.announcement_type ?? ''} ${fields.raw_excerpt ?? ''}`;
  const framework = /框架协议|入围|framework/i.test(context);
  const discount = /%|％|优惠率|折扣率|discount/i.test(context);
  if (!framework) {
    return {
      framework_agreement_flag: false,
      amount_semantic_type: fields.award_amount ? 'award_total' : fields.budget_amount ? 'budget_amount' : 'unknown',
      quote_amount: null,
      quote_amount_unit: null,
      discount_rate: null,
      unit_price: null,
      total_award_amount: fields.award_amount ?? null,
      award_amount_unit: null,
      normalized_award_amount_yuan: award?.normalized_value ?? null,
    };
  }
  if (discount) {
    return {
      framework_agreement_flag: true,
      amount_semantic_type: 'discount_rate',
      quote_amount: fields.award_amount ?? null,
      quote_amount_unit: 'percent',
      discount_rate: award?.normalized_value ?? fields.award_amount ?? null,
      unit_price: null,
      total_award_amount: null,
      award_amount_unit: 'percent',
      normalized_award_amount_yuan: null,
    };
  }
  return {
    framework_agreement_flag: true,
    amount_semantic_type: 'framework_quote',
    quote_amount: fields.award_amount ?? null,
    quote_amount_unit: award?.unit ?? 'unknown',
    discount_rate: null,
    unit_price: fields.award_amount ?? null,
    total_award_amount: null,
    award_amount_unit: award?.unit ?? 'unknown',
    normalized_award_amount_yuan: null,
  };
}

function auditEvidenceFor(source, fields) {
  const text = `${source?.title ?? ''} ${source?.source_type ?? ''} ${fields.project_name ?? ''} ${fields.recommended_issue ?? ''}`;
  if (/整改|rectification/i.test(text)) {
    return {
      audit_evidence_level: 'rectification_progress',
      audit_document_type: 'rectification_progress',
      conclusion_strength: 'review_recommended',
      requires_manual_verification: true,
    };
  }
  if (/工作报告|人大常委会|审计报告|formal/i.test(text)) {
    return {
      audit_evidence_level: 'formal_audit_report',
      audit_document_type: 'budget_execution_audit_report',
      conclusion_strength: 'medium',
      requires_manual_verification: true,
    };
  }
  if (/经验|做法|方法|念好|三个关注|助力|method/i.test(text)) {
    return {
      audit_evidence_level: 'audit_work_update',
      audit_document_type: 'audit_work_update',
      conclusion_strength: 'supplemental_data_only',
      requires_manual_verification: true,
    };
  }
  return {
    audit_evidence_level: 'audit_work_update',
    audit_document_type: 'audit_work_update',
    conclusion_strength: 'supplemental_data_only',
    requires_manual_verification: true,
  };
}

function buildProcurementRecords(record) {
  const rows = [
    record(1, 'ccgp-nanjing-pipeline-announcement', {
      project_name: '2025年南京市江南四区地下空间管线信息动态维护（测绘）服务项目',
      purchaser_name: '南京市城市地下管线数字化管理中心',
      announcement_type: '采购公告',
      procurement_stage: 'announcement',
      project_code: 'JSZC-320100-SNZX-G2025-0030',
      procurement_method: '公开招标',
      published_at: '2025-03-25',
      region: '江苏省南京市',
      budget_amount: '430.000000',
      raw_excerpt: '预算金额430.000000万元，南京市江南四区地下空间管线信息动态维护项目。',
    }),
    record(1, 'ccgp-nanjing-hospital-award', {
      project_name: '南京市中心医院智慧医院建设（二期）',
      purchaser_name: '南京市中心医院',
      announcement_type: '中标公告',
      procurement_stage: 'award',
      project_code: 'JSZC-320100-JZCG-G2025-0167',
      procurement_method: '公开招标',
      published_at: '2025-07-01',
      region: '江苏省南京市',
      award_amount: '595.000000',
      supplier_name: '江苏移动信息系统集成有限公司',
      raw_excerpt: '总中标金额595.000000万元，供应商江苏移动信息系统集成有限公司。',
    }),
    record(1, 'ccgp-js-education-cyber-award', {
      project_name: '2025年江苏省教育系统网络安全监测服务',
      purchaser_name: '江苏省教育信息化与数据管理中心',
      announcement_type: '中标公告',
      procurement_stage: 'award',
      project_code: 'JSZC-320000-SCZX-G2025-0184',
      procurement_method: '公开招标',
      published_at: '2025-07-04',
      region: '江苏省',
      award_amount: '226.800000',
      supplier_name: '杭州安恒信息技术股份有限公司',
      raw_excerpt: '总中标金额226.800000万元，采购人为江苏省教育信息化与数据管理中心。',
    }),
    record(1, 'ccgp-suzhou-customs-award', {
      project_name: '苏州海关综合技术中心高效液相质谱联用仪和液相色谱-质谱联用仪项目',
      purchaser_name: '苏州海关综合技术中心',
      announcement_type: '中标公告',
      procurement_stage: 'award',
      project_code: '0664-2540SUMECZF011',
      procurement_method: '公开招标',
      published_at: '2025-02-19',
      region: '江苏省苏州市',
      award_amount: '567.560000',
      supplier_name: '江苏海外集团国际技术工程有限公司',
      raw_excerpt: '中标金额567.5600000万元，货物为高效液相质谱联用仪等。',
    }),
    record(1, 'ccgp-suzhou-xiangcheng-service-announcement', {
      project_name: '区政务服务中心服务外包项目',
      purchaser_name: '苏州市相城区数据局',
      announcement_type: '竞争性磋商公告',
      procurement_stage: 'announcement',
      project_code: 'JSZC-320507-XTPC-C2025-0007',
      procurement_method: '竞争性磋商',
      published_at: '2025-02-11',
      region: '江苏省苏州市相城区',
      budget_amount: '120.000000',
      raw_excerpt: '预算金额120.000000万元，服务期至2026年2月28日。',
    }),
  ];

  const agriculturePackages = [
    ['1', '南京畅翔仪器设备有限责任公司', '277.5'],
    ['2', '南京铭奥仪器设备有限公司', '276.2'],
    ['3', '南京艾瑞塔信息科技有限公司', '39.86'],
    ['5', '南京知麦信息科技有限公司', '29.2'],
    ['6', '南京维新空间信息技术有限公司', '68.68'],
    ['7', '南京荣胜达实验仪器有限公司', '79.5'],
    ['8', '南京巨百生物科技有限公司', '94.35'],
    ['9', '南京泽洋生物科技有限公司', '9.97'],
    ['10', '铁岭旭日农业技术开发有限公司', '66.8'],
    ['11', '扬州特优新智能装备有限责任公司', '26'],
    ['12', '淮安泉发贸易有限公司', '9.54'],
    ['13', '南京勇宏城勤科技有限公司', '14.4'],
    ['14', '青岛芯农农业科技有限公司', '27.85'],
    ['16', '扬州特优新智能装备有限责任公司', '25.88'],
  ];
  for (const [pkg, supplier, amount] of agriculturePackages) {
    rows.push(record(Number(pkg), 'ccgp-jaas-regional-station-award', {
      project_name: `江苏省南京市国家农作物区域性品种测试评价站建设项目-仪器设备采购项目分包${pkg}`,
      purchaser_name: '江苏省农业科学院',
      announcement_type: '中标公告',
      procurement_stage: 'award',
      project_code: `JSZC-320000-SMDY-G2025-0008-${pkg}`,
      procurement_method: '公开招标',
      published_at: '2025-03-05',
      region: '江苏省南京市',
      award_amount: amount,
      supplier_name: supplier,
      raw_excerpt: `分包${pkg}中标成交金额${amount}万元，供应商${supplier}。`,
    }));
  }

  const vehicleAwards = [
    ['1-1', '南京弘行汽车销售服务有限公司', '13.49'],
    ['1-2', '上汽大众汽车有限公司', '14.5'],
    ['1-3', '一汽大众销售有限责任公司', '15.19'],
    ['2-1', '重庆长安汽车股份有限公司', '9.49'],
    ['2-2', '上汽大众汽车有限公司', '9.99'],
    ['2-3', '一汽丰田汽车销售有限公司', '11.57'],
  ];
  for (const [pkg, supplier, amount] of vehicleAwards) {
    rows.push(record(Number(rows.length + 1), 'ccgp-js-vehicle-framework-award', {
      project_name: `江苏省公务用车框架协议采购2025年度入围包${pkg}`,
      purchaser_name: '江苏省政府采购中心',
      announcement_type: '框架协议入围公告',
      procurement_stage: 'award',
      project_code: `JSZC-320000-SCZX-K2024-0726-${pkg}`,
      procurement_method: '框架协议采购',
      published_at: '2025-01-23',
      region: '江苏省',
      award_amount: amount,
      supplier_name: supplier,
      raw_excerpt: `公务用车框架协议采购包${pkg}入围金额${amount}万元，供应商${supplier}。`,
    }));
  }

  const securityAwards = [
    ['1', '南京聚铭网络科技有限公司', '5.86'],
    ['2', '杭州思福迪信息技术有限公司', '6'],
    ['3', '北京山石网科信息技术有限公司', '6.4998'],
    ['4', '北京天融信网络安全技术有限公司', '6.5'],
    ['5', '杭州迪普科技股份有限公司', '7'],
    ['6', '杭州安恒信息技术股份有限公司', '7'],
  ];
  for (const [pkg, supplier, amount] of securityAwards) {
    rows.push(record(Number(rows.length + 1), 'ccgp-js-security-audit-framework-award', {
      project_name: `江苏省信息安全设备-安全审计设备框架协议采购入围包${pkg}`,
      purchaser_name: '江苏省政府采购中心',
      announcement_type: '框架协议入围公告',
      procurement_stage: 'award',
      project_code: `JSZC-320000-SCZX-K2024-0741-${pkg}`,
      procurement_method: '框架协议采购',
      published_at: '2025-01-24',
      region: '江苏省',
      award_amount: amount,
      supplier_name: supplier,
      raw_excerpt: `安全审计设备框架协议入围包${pkg}金额${amount}万元，供应商${supplier}。`,
    }));
  }

  const printingAwards = [
    ['1', '江苏农垦机关印刷厂有限公司', '76'],
    ['2', '江苏华德印务有限公司', '70.05'],
    ['3', '南京新龙飞实业有限公司', '70'],
    ['4', '南京碧峰印务有限公司', '68.5'],
    ['5', '无锡市俱进教育用品有限公司', '68.25'],
    ['6', '南京鸿润印刷有限公司', '66.01'],
    ['7', '南京科教印刷厂有限公司', '66'],
    ['8', '南京百花彩色印刷广告制作有限责任公司', '65.95'],
    ['9', '南京海兴印务有限公司', '65.21'],
    ['10', '江苏教院印务有限公司', '65.2'],
  ];
  for (const [pkg, supplier, percent] of printingAwards) {
    rows.push(record(Number(rows.length + 1), 'ccgp-js-printing-framework-award', {
      project_name: `江苏省、南京市及区级印刷服务框架协议采购入围包${pkg}`,
      purchaser_name: '江苏省政府采购中心',
      announcement_type: '框架协议入围公告',
      procurement_stage: 'award',
      project_code: `JSZC-320000-SCZX-K2025-0174-${pkg}`,
      procurement_method: '框架协议采购',
      published_at: '2025-06-27',
      region: '江苏省南京市',
      award_amount: percent,
      supplier_name: supplier,
      raw_excerpt: `印刷服务框架协议入围包${pkg}优惠率${percent}%，供应商${supplier}。`,
    }));
  }
  return rows;
}

function buildBudgetRecords(record) {
  const rows = [
    record(1, 'nanjing-finance-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2025',
      region: '江苏省南京市',
      budget_scope: '南京市财政局部门预算',
      direction: '收入',
      summary_item: '财政拨款本年收入',
      actual_amount: '12009.78',
      actual_value_unit: 'wan_yuan',
    }),
    record(2, 'nanjing-finance-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2025',
      region: '江苏省南京市',
      budget_scope: '南京市财政局部门预算',
      direction: '支出',
      summary_item: '一般公共服务支出',
      actual_amount: '7131.02',
      actual_value_unit: 'wan_yuan',
    }),
    record(3, 'nanjing-finance-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2025',
      region: '江苏省南京市',
      budget_scope: '南京市财政局部门预算',
      direction: '支出',
      summary_item: '社会保障和就业支出',
      actual_amount: '1401.65',
      actual_value_unit: 'wan_yuan',
    }),
    record(4, 'nanjing-finance-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2025',
      region: '江苏省南京市',
      budget_scope: '南京市财政局部门预算',
      direction: '支出',
      summary_item: '住房保障支出',
      actual_amount: '3477.11',
      actual_value_unit: 'wan_yuan',
    }),
    record(5, 'nanjing-finance-2025-budget-pdf', 'public_statistical_indicator', {
      period: '2025',
      region: '江苏省南京市',
      budget_scope: '南京市财政局部门预算',
      direction: '支出结构',
      summary_item: '项目支出',
      actual_amount: '1362',
      actual_value_unit: 'wan_yuan',
    }),
    record(6, 'nanjing-finance-2025-budget-pdf', 'public_statistical_indicator', {
      period: '2025',
      region: '江苏省南京市',
      budget_scope: '南京市财政局部门预算',
      direction: '支出结构',
      summary_item: '信息化建设支出',
      actual_amount: '615',
      actual_value_unit: 'wan_yuan',
    }),
    record(7, 'nanjing-finance-2025-budget-pdf', 'public_statistical_indicator', {
      period: '2025',
      region: '江苏省南京市',
      budget_scope: '三公经费',
      direction: '预算',
      summary_item: '三公经费合计',
      actual_amount: '20.25',
      actual_value_unit: 'wan_yuan',
    }),
    record(8, 'nanjing-finance-2025-budget-pdf', 'public_statistical_indicator', {
      period: '2025',
      region: '江苏省南京市',
      budget_scope: '机关运行经费',
      direction: '预算',
      summary_item: '物业管理费',
      actual_amount: '167',
      actual_value_unit: 'wan_yuan',
    }),
    record(1, 'nantong-finance-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2025',
      region: '江苏省南通市',
      budget_scope: '南通市财政局部门预算',
      direction: '收入',
      summary_item: '一般公共预算拨款收入',
      actual_amount: '8280.73',
      actual_value_unit: 'wan_yuan',
    }),
    record(2, 'nantong-finance-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2025',
      region: '江苏省南通市',
      budget_scope: '南通市财政局部门预算',
      direction: '支出',
      summary_item: '一般公共服务支出',
      actual_amount: '6528.34',
      actual_value_unit: 'wan_yuan',
    }),
    record(3, 'nantong-finance-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2025',
      region: '江苏省南通市',
      budget_scope: '南通市财政局部门预算',
      direction: '支出',
      summary_item: '住房保障支出',
      actual_amount: '1752.39',
      actual_value_unit: 'wan_yuan',
    }),
    record(4, 'nantong-finance-2025-budget-pdf', 'public_statistical_indicator', {
      period: '2025',
      region: '江苏省南通市',
      budget_scope: '南通市财政局部门预算',
      direction: '支出结构',
      summary_item: '项目支出',
      actual_amount: '1785.39',
      actual_value_unit: 'wan_yuan',
    }),
    record(5, 'nantong-finance-2025-budget-pdf', 'public_statistical_indicator', {
      period: '2025',
      region: '江苏省南通市',
      budget_scope: '南通市财政局部门预算',
      direction: '支出结构',
      summary_item: '信息化建设支出',
      actual_amount: '376.09',
      actual_value_unit: 'wan_yuan',
    }),
    record(6, 'nantong-finance-2025-budget-pdf', 'public_statistical_indicator', {
      period: '2025',
      region: '江苏省南通市',
      budget_scope: '南通市财政局部门预算',
      direction: '经济分类',
      summary_item: '商品和服务支出',
      actual_amount: '640.86',
      actual_value_unit: 'wan_yuan',
    }),
    record(7, 'nantong-finance-2025-budget-pdf', 'public_statistical_indicator', {
      period: '2025',
      region: '江苏省南通市',
      budget_scope: '南通市财政局部门预算',
      direction: '经济分类',
      summary_item: '公务接待费',
      actual_amount: '10.83',
      actual_value_unit: 'wan_yuan',
    }),
    record(8, 'nantong-finance-2025-budget-pdf', 'public_statistical_indicator', {
      period: '2025',
      region: '江苏省南通市',
      budget_scope: '南通市财政局部门预算',
      direction: '经济分类',
      summary_item: '培训费',
      actual_amount: '30.80',
      actual_value_unit: 'wan_yuan',
    }),
  ];

  rows.push(
    ...[
      ['2023', '江苏省南京市雨花台区', '教育支出', '一般公共预算教育支出', '16', 'yi_yuan'],
      ['2023', '江苏省南京市雨花台区', '教育支出', '教育支出占一般公共预算支出比重', '18.69', 'percent'],
      ['2023', '江苏省南京市雨花台区', '教育支出', '教育支出增量', '6595', 'wan_yuan'],
      ['2023', '江苏省南京市雨花台区', '教育支出', '教育支出增幅', '4.3', 'percent'],
      ['2023', '江苏省南京市雨花台区', '教育附加', '实际可留存教育附加', '21642', 'wan_yuan'],
      ['2024', '江苏省南京市雨花台区', '教育支出', '安排一般公共预算教育支出', '16.48', 'yi_yuan'],
      ['2024', '江苏省南京市雨花台区', '教育支出', '教育支出同比增长', '6.6', 'percent'],
      ['2024', '江苏省南京市雨花台区', '学校建设', '学校建设经费', '4.2', 'yi_yuan'],
      ['2024', '江苏省南京市雨花台区', '教师保障', '教师专项绩效', '6767', 'wan_yuan'],
      ['2024', '江苏省南京市雨花台区', '教师保障', '教育内涵发展专项', '900', 'wan_yuan'],
      ['2024', '江苏省南京市雨花台区', '教师保障', '名特优教师培养专项', '220', 'wan_yuan'],
    ].map(([period, region, scope, item, amount, unit], index) => record(index + 1, 'nanjing-yuhuatai-education-spending', 'public_statistical_indicator', {
      period,
      region,
      budget_scope: scope,
      direction: '公开指标',
      summary_item: item,
      actual_amount: amount,
      actual_value_unit: unit,
    })),
  );

  rows.push(
    ...[
      ['2024', '江苏省南通市', '财政收支', '一般公共预算收入', '700.9', 'yi_yuan'],
      ['2024', '江苏省南通市', '财政收支', '一般公共预算收入增长率', '3', 'percent'],
      ['2025', '江苏省南通市', '国有资产盘活', '六月末全市国有资产整体盘活目标', '80', 'percent'],
      ['2025', '江苏省南通市', '资本招商', '全年落地资本招商项目目标', '50', 'count'],
    ].map(([period, region, scope, item, amount, unit], index) => record(index + 1, 'nantong-finance-2024-summary', 'public_statistical_indicator', {
      period,
      region,
      budget_scope: scope,
      direction: '公开指标',
      summary_item: item,
      actual_amount: amount,
      actual_value_unit: unit,
    })),
  );

  rows.push(
    ...[
      ['近三年体育事业投入', '10', 'yi_yuan'],
      ['市本级体育事业投入', '5', 'yi_yuan'],
      ['体育投入年均增长率', '12', 'percent'],
      ['体育运动学校新校区建筑面积', '5.4', 'count'],
      ['体育运动学校项目建设资金', '4.3', 'yi_yuan'],
      ['儿童业余体校建筑面积', '2.5', 'count'],
      ['儿童业余体校项目建设资金', '2.3', 'yi_yuan'],
      ['年度承办赛事活动数量', '400', 'count'],
    ].map(([item, amount, unit], index) => record(index + 1, 'nantong-sports-spending', 'public_statistical_indicator', {
      period: '2025',
      region: '江苏省南通市',
      budget_scope: '体育事业财政投入',
      direction: '公开指标',
      summary_item: item,
      actual_amount: amount,
      actual_value_unit: unit,
    })),
  );

  rows.push(
    ...[
      ['支出标准体系建设周期', '2', 'count'],
      ['细化完善预算支出标准', '28', 'count'],
      ['修订支出标准', '6', 'count'],
      ['新出台支出标准', '7', 'count'],
    ].map(([item, amount, unit], index) => record(index + 1, 'nantong-spending-standards', 'public_statistical_indicator', {
      period: '2025',
      region: '江苏省南通市',
      budget_scope: '支出标准体系',
      direction: '公开指标',
      summary_item: item,
      actual_amount: amount,
      actual_value_unit: unit,
    })),
  );

  rows.push(
    ...[
      ['覆盖四本预算支出标准数量', '92', 'count'],
      ['政府专项资金精简后类别', '3', 'count'],
      ['政府专项资金精简后事项', '10', 'count'],
      ['人员经费预算审核原用时', '3', 'count'],
      ['人员经费预算审核现用时', '3', 'count'],
      ['财会监督项目数量', '56', 'count'],
      ['压减2025年预算资金', '1.17', 'yi_yuan'],
      ['重点绩效评价项目数量', '20', 'count'],
      ['压减2025年部门预算', '7000', 'wan_yuan'],
    ].map(([item, amount, unit], index) => record(index + 1, 'nantong-zero-budget-reform', 'public_statistical_indicator', {
      period: '2024',
      region: '江苏省南通市',
      budget_scope: '零基预算改革',
      direction: '公开指标',
      summary_item: item,
      actual_amount: amount,
      actual_value_unit: unit,
    })),
  );

  rows.push(
    ...[
      ['立行立改问题完成数量', '176', 'count'],
      ['立行立改问题整改率', '100', 'percent'],
      ['分阶段整改问题数量', '195', 'count'],
      ['分阶段整改已完成数量', '134', 'count'],
      ['分阶段整改完成率', '68.72', 'percent'],
      ['促进增收节支', '17.81', 'yi_yuan'],
      ['促进资金拨付', '8.57', 'yi_yuan'],
      ['盘活存量资金', '49.79', 'yi_yuan'],
      ['健全完善制度', '129', 'count'],
    ].map(([item, amount, unit], index) => record(index + 1, 'js-audit-2023-rectification', 'investment_review_summary', {
      period: '2024',
      region: '江苏省',
      budget_scope: '审计整改结果',
      direction: '公开指标',
      summary_item: item,
      actual_amount: amount,
      actual_value_unit: unit,
    })),
  );

  rows.push(
    ...[
      ['常州市GDP迈上万亿台阶', '10000', 'yi_yuan'],
      ['常州市审计建议方向', '4', 'count'],
      ['盐城市审计重点领域', '4', 'count'],
      ['仪征开发区预算审计关注点', '3', 'count'],
      ['徐州部门预算审计方法字诀', '5', 'count'],
      ['徐州部门预算审计专题数量', '2', 'count'],
      ['徐州部门预算审计普遍问题', '31', 'count'],
      ['徐州部门预算审计对策建议', '5', 'count'],
    ].map(([item, amount, unit], index) => record(index + 1, [
      'changzhou-budget-audit-report',
      'changzhou-budget-audit-report',
      'yancheng-budget-audit-report',
      'yizheng-dev-zone-budget-audit',
      'xuzhou-department-budget-audit',
      'xuzhou-department-budget-audit',
      'xuzhou-department-budget-audit',
      'xuzhou-department-budget-audit',
    ][index], 'investment_review_summary', {
      period: '2024',
      region: index < 2 ? '江苏省常州市' : index === 2 ? '江苏省盐城市' : index === 3 ? '江苏省扬州市仪征市' : '江苏省徐州市',
      budget_scope: '地方预算执行审计',
      direction: '公开指标',
      summary_item: item,
      actual_amount: amount,
      actual_value_unit: unit,
    })),
  );

  return rows;
}

function buildCaseSeedRecords(record) {
  return [
    record(1, 'js-audit-2023-rectification', {
      project_name: '2023年度省级预算执行审计查出问题整改跟踪',
      construction_unit: '相关省级部门和地区',
      issue_amount: '17.81',
      issue_amount_unit: 'yi_yuan',
      recommended_case_type: '整改成效复核',
      recommended_priority: 'Medium',
      recommended_issue: '促进增收节支17.81亿元，需用内网整改台账、资金入库和节支凭证验证整改真实性。',
      required_next_data: ['整改台账', '资金入库凭证', '节支测算表', '责任单位说明'],
    }),
    record(2, 'js-audit-2023-rectification', {
      project_name: '2023年度审计整改资金拨付复核',
      construction_unit: '相关财政和主管部门',
      issue_amount: '8.57',
      issue_amount_unit: 'yi_yuan',
      recommended_case_type: '资金拨付复核',
      recommended_priority: 'Medium',
      recommended_issue: '公开信息显示促进资金拨付8.57亿元，需补充拨付清单、支付流水和项目验收材料。',
      required_next_data: ['拨付清单', '支付流水', '项目验收材料', '整改销号记录'],
    }),
    record(3, 'js-audit-2023-rectification', {
      project_name: '2023年度审计整改盘活存量资金复核',
      construction_unit: '相关财政和预算单位',
      issue_amount: '49.79',
      issue_amount_unit: 'yi_yuan',
      recommended_case_type: '存量资金盘活复核',
      recommended_priority: 'High',
      recommended_issue: '盘活存量资金49.79亿元，需补充资金来源、调剂使用和预算调整依据。',
      required_next_data: ['存量资金台账', '预算调整文件', '调剂使用明细', '资金支付凭证'],
    }),
    record(4, 'changzhou-budget-audit-report', {
      project_name: '常州市2023年度市本级预算执行审计问题跟踪',
      construction_unit: '常州市相关预算单位',
      issue_amount: '4',
      issue_amount_unit: 'count',
      recommended_case_type: '预算执行审计跟踪',
      recommended_priority: 'Medium',
      recommended_issue: '报告提出四方面审计建议，需补充政府预算管理、部门预算执行和公共资金问题清单。',
      required_next_data: ['审计工作报告', '问题清单', '整改责任分解', '预算执行数据'],
    }),
    record(5, 'yancheng-budget-audit-report', {
      project_name: '盐城市2023年度市级预算执行审计问题跟踪',
      construction_unit: '盐城市相关预算单位',
      issue_amount: '4',
      issue_amount_unit: 'count',
      recommended_case_type: '预算绩效审计跟踪',
      recommended_priority: 'Medium',
      recommended_issue: '审计聚焦预决算编制、预算绩效管理和政策落实等问题，需补充底稿和整改时限。',
      required_next_data: ['预决算数据', '绩效评价资料', '整改时限表', '责任单位说明'],
    }),
    record(6, 'yizheng-dev-zone-budget-audit', {
      project_name: '仪征经济开发区2023年预算执行审计问题跟踪',
      construction_unit: '仪征经济开发区相关单位',
      issue_amount: '3',
      issue_amount_unit: 'count',
      recommended_case_type: '开发区预算管理核查',
      recommended_priority: 'Medium',
      recommended_issue: '审计关注预算编制完整性、执行规范性和支出绩效科学性三类问题，需补充预算草案、总预算账和绩效评价资料。',
      required_next_data: ['预算草案', '总预算账', '绩效评价报告', '整改台账'],
    }),
    record(7, 'xuzhou-department-budget-audit', {
      project_name: '徐州市部门预算执行审计普遍问题跟踪',
      construction_unit: '徐州市相关预算部门',
      issue_amount: '31',
      issue_amount_unit: 'count',
      recommended_case_type: '部门预算审计核查',
      recommended_priority: 'High',
      recommended_issue: '公开信息显示提炼31项普遍性、倾向性问题，需补充具体问题清单和责任主体。',
      required_next_data: ['问题清单', '审计报告', '责任主体清单', '整改销号资料'],
    }),
    record(8, 'xuzhou-department-budget-audit', {
      project_name: '徐州市部门预算审计整改建议落实跟踪',
      construction_unit: '徐州市相关预算部门',
      issue_amount: '5',
      issue_amount_unit: 'count',
      recommended_case_type: '整改建议落实复核',
      recommended_priority: 'Medium',
      recommended_issue: '公开信息显示提出5条对策建议，需补充建议采纳、制度修订和预算调整证据。',
      required_next_data: ['建议采纳情况', '制度修订文件', '预算调整记录', '后续跟踪结果'],
    }),
  ];
}

export function summarizeAdditionalOfficialRun({
  generatedAt,
  baseUrl = DEFAULT_BASE_URL,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
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
    batch_name: 'official_public_instances_round2',
    collector_summary: payloads.collectorSummary,
    optimization_plan: buildRound2OptimizationPlan(summary),
  };
}

export async function runAdditionalOfficialPublicInstanceTest({
  baseUrl = DEFAULT_BASE_URL,
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const payloads = buildAdditionalOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });
  await writeJson(join(absoluteOutputDir, 'source_register.json'), payloads.sourceRegister);
  await writeJson(join(absoluteOutputDir, 'collector_summary.json'), payloads.collectorSummary);
  await writeJson(join(absoluteOutputDir, 'procurement_batch.json'), payloads.procurement);
  await writeJson(join(absoluteOutputDir, 'budget_combined_records.json'), payloads.budget);
  await writeJson(join(absoluteOutputDir, 'case_seed_batch.json'), payloads.caseSeeds);

  const client = createApiClient(baseUrl);
  const credentials = JSON.parse(
    (await readFile(join('data', 'real-integration', 'login.json'), 'utf8')).replace(/^\uFEFF/, ''),
  );
  await client.post('/api/auth/login', credentials);
  const procurementResponse = await client.post('/api/import/procurement/batch', payloads.procurement);
  const budgetResponses = [];
  for (const batch of payloads.budget.batches) {
    budgetResponses.push(await client.post('/api/import/budget/batch', batch));
  }
  const caseSeedResponse = await client.post('/api/case-seeds/import', payloads.caseSeeds);
  const summary = summarizeAdditionalOfficialRun({
    generatedAt: new Date().toISOString(),
    baseUrl,
    payloads,
    procurementResponse,
    budgetResponse: budgetResponses,
    caseSeedResponse,
  });
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

function buildRound2OptimizationPlan(summary) {
  return [
    {
      priority: 'P0',
      area: '网页检索来源登记',
      action: '把第二批来源登记为可配置source registry，保留检索关键词、发现时间、人工复核状态和是否与历史基线重复。',
      reason: `本批来源${summary.official_source_count}个且均与上一批不重复，后续需要自动去重和批次化管理。`,
    },
    {
      priority: 'P0',
      area: '框架协议金额语义',
      action: '对框架协议的评审报价、优惠率、单价和总中标金额分别建模，避免把优惠率误当作成交金额。',
      reason: '本批车辆、安全审计设备、印刷服务框架协议中同时出现单价、总额和百分比。'
    },
    {
      priority: 'P1',
      area: 'PDF表格抽取',
      action: '南京、南通部门预算PDF应进入表格抽取器，输出表号、页码、科目编码、金额列和空表标记。',
      reason: '部门预算PDF字段结构清晰，但现在仍由人工登记样本固化。'
    },
    {
      priority: 'P1',
      area: '审计动态线索分层',
      action: '将审计动态类网页区分为正式审计结果、整改进展、审计工作动态和方法经验，分别设置不同证据强度。',
      reason: '地方审计动态能形成线索，但不能等同于正式审计结论。'
    },
    {
      priority: 'P2',
      area: '跨批次回归对比',
      action: '把第二批样本加入统一回归摘要，按批次比较采购阶段、金额单位、来源类型、规则命中差异。',
      reason: '第二批包含更多框架协议和预算PDF，能补足第一批样本结构。'
    },
  ];
}

function normalizePublicValue(rawValue, defaultUnit = 'unknown') {
  const raw = String(rawValue ?? '').trim();
  if (!raw) return null;
  const numberMatch = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!numberMatch) return null;
  const numeric = Number(numberMatch[0]);
  if (!Number.isFinite(numeric)) return null;
  const unit = detectUnit(raw, defaultUnit);
  const normalized =
    unit === 'yi_yuan'
      ? numeric * 100000000
      : unit === 'wan_yuan'
        ? numeric * 10000
        : numeric;
  return {
    raw_value: raw,
    unit,
    normalized_value: formatNumber(normalized),
  };
}

function normalizePeriodForApi(period) {
  const value = String(period ?? '').trim();
  if (/^\d{4}$/.test(value)) return `${value}-12`;
  return value;
}

function detectUnit(raw, defaultUnit) {
  if (/%|百分比|优惠率/.test(raw)) return 'percent';
  if (/亿元|亿/.test(raw)) return 'yi_yuan';
  if (/万元|万/.test(raw)) return 'wan_yuan';
  if (/元/.test(raw)) return 'yuan';
  if (/项|条|个|类|天|份|场|套|包/.test(raw)) return 'count';
  return defaultUnit;
}

function locatorHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex').slice(0, 16);
}

function formatNumber(value) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(6))).replace(/\.0+$/, '');
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item) || 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function renderMarkdown(summary, payloads) {
  const lines = [
    '# 第二批正式公开实例测试结果',
    '',
    `生成时间：${summary.generated_at}`,
    `测试服务：${summary.base_url}`,
    '',
    '## 数据来源与覆盖',
    '',
    `- 新来源数量：${summary.official_source_count}`,
    `- 与上一批来源重合：${summary.collector_summary.previous_source_overlap_count}`,
    `- 输入记录：${summary.total_input_records} 条（采购 ${summary.procurement_input_records}、财政/统计/审计摘要 ${summary.budget_input_records}、审计线索 ${summary.case_seed_input_records}）`,
    `- 来源可追溯率：${summary.source_completeness_rate}%`,
    `- 采集模式：${summary.collector_summary.fetch_mode}`,
    `- 单位归一记录：${summary.collector_summary.unit_normalized_records}`,
    `- 定位覆盖率：${summary.collector_summary.locator_coverage_rate}%`,
    '',
    '主要来源：',
    ...payloads.sourceRegister.sources.map((source) => `- [${source.publisher}] ${source.title}：${source.url}`),
    '',
    '## 系统处理结果',
    '',
    `- 导入成功：${summary.total_accepted_records}/${summary.total_input_records}，成功率 ${summary.import_success_rate}%`,
    `- 采购导入：${summary.procurement_accepted_records}/${summary.procurement_input_records}`,
    `- 财政/统计/审计摘要导入：${summary.budget_accepted_records}/${summary.budget_input_records}`,
    `- 审计线索导入：${summary.case_seed_accepted_records}/${summary.case_seed_input_records}`,
    `- 规则发现：${summary.finding_count}`,
    `- 规则命中：${formatObject(summary.rule_hits_by_rule) || '无'}`,
    '',
    '## 进一步优化方案',
    '',
    ...summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}：${item.action} 原因：${item.reason}`),
  ];
  return `${lines.join('\n')}\n`;
}

function renderHtml(markdown) {
  return `<!doctype html>
<meta charset="utf-8">
<title>第二批正式公开实例测试结果</title>
<style>body{font-family:"Segoe UI","Microsoft YaHei",Arial,sans-serif;margin:32px;line-height:1.65;color:#10243f}pre{white-space:pre-wrap;background:#f7f9fc;border:1px solid #d8e0ea;padding:18px;border-radius:6px}</style>
<pre>${escapeHtml(markdown)}</pre>`;
}

function formatObject(value) {
  return Object.entries(value ?? {})
    .map(([key, count]) => `${key} ${count}`)
    .join('；');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
  })[char]);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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
    const setCookieValues =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : response.headers.get('set-cookie')
          ? [response.headers.get('set-cookie')]
          : [];
    if (setCookieValues.length) {
      cookie = setCookieValues
        .map((value) => value.split(';')[0])
        .filter(Boolean)
        .join('; ');
    }
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path} failed: ${response.status} ${text}`);
    return body;
  }
  return {
    post(path, body) {
      return request(path, { method: 'POST', body: JSON.stringify(body) });
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAdditionalOfficialPublicInstanceTest()
    .then(({ outputDir, summary }) => {
      console.log(`Wrote additional official public instance outputs to ${outputDir}`);
      console.log(JSON.stringify({
        total_input_records: summary.total_input_records,
        total_accepted_records: summary.total_accepted_records,
        import_success_rate: summary.import_success_rate,
        finding_count: summary.finding_count,
        output_dir: outputDir,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
