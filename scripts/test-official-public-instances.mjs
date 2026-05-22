import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const DEFAULT_BASE_URL = process.env.AUDITLENS_BASE_URL || 'http://127.0.0.1:18080';
const DEFAULT_CAPTURED_AT = '2026-04-26T16:40:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-v1';
const DEFAULT_OUTPUT_DIR = join(
  'data',
  'real-integration',
  'official-public-instances-20260426',
);

const OFFICIAL_SOURCES = [
  {
    id: 'js-czt-2025-budget-pdf',
    title: '2024年江苏省预算执行情况与2025年江苏省预算草案',
    url: 'https://czt.jiangsu.gov.cn/attach/-1/2502051636560060382.pdf',
    published_at: '2025-01-22',
    publisher: '江苏省财政厅',
    source_type: '财政预算报告',
  },
  {
    id: 'nantong-education-spending-2025h1',
    title: '1.7%！',
    url: 'https://czj.nantong.gov.cn/ntsczj/bmdt/content/fa875b30-5b3a-41e1-81df-f834947bbf53.html',
    published_at: '2025-08-05',
    publisher: '南通市财政局',
    source_type: '财政支出动态',
  },
  {
    id: 'js-audit-2024-budget-execution-report',
    title: '江苏省2024年度省级预算执行和其他财政收支审计工作报告',
    url: 'https://jssjt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=b10800a1d927439da69969b8269cbfed.pdf',
    published_at: '2025-07-30',
    publisher: '江苏省审计厅',
    source_type: '审计工作报告',
  },
  {
    id: 'ccgp-nantong-seagrass-award',
    title: '南通市海洋生态保护修复项目互花米草治理遥感监测成交公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/cjgg/202510/t20251010_25498889.htm',
    published_at: '2025-10-10',
    publisher: '中国政府采购网',
    source_type: '成交公告',
  },
  {
    id: 'ccgp-jaas-crop-test-award',
    title: '江苏省农业科学院2025年南京国家农作物品种测试评价站仪器设备采购中标公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202511/t20251125_25761259.htm',
    published_at: '2025-11-25',
    publisher: '中国政府采购网',
    source_type: '中标公告',
  },
  {
    id: 'ccgp-jiangsu-printing-framework-award',
    title: '2025-2026年度江苏省省级、南京市及各区党政机关、事业单位及团体组织印刷服务框架协议采购（南京市共享）入围公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202508/t20250813_25119997.htm',
    published_at: '2025-08-13',
    publisher: '中国政府采购网',
    source_type: '入围公告',
  },
  {
    id: 'ccgp-changshu-lifeline-announcement',
    title: '常熟市住房和城乡建设局关于常熟市城市生命线安全工程风险评估与管控应用的招标公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202506/t20250611_24810237.htm',
    published_at: '2025-06-11',
    publisher: '中国政府采购网',
    source_type: '招标公告',
  },
  {
    id: 'ccgp-jaas-germplasm-announcement',
    title: '江苏省农业科学院种质资源与生物技术研究所国家作物种质资源综合基因库仪器设备采购公开招标公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/gkzb/202501/t20250121_24118163.htm',
    published_at: '2025-01-21',
    publisher: '中国政府采购网',
    source_type: '公开招标公告',
  },
  {
    id: 'ccgp-changzhou-monitoring-award',
    title: '2025年度第三方检测服务项目中标公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202512/t20251216_25912635.htm',
    published_at: '2025-12-16',
    publisher: '中国政府采购网',
    source_type: '中标公告',
  },
  {
    id: 'ccgp-tongzhou-security-contract',
    title: '2025年度南通通州区社会治安监控系统（雪亮技防工程）维保项目合同',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/htgg/202505/t20250522_24721043.htm',
    published_at: '2025-05-22',
    publisher: '中国政府采购网',
    source_type: '合同公告',
  },
  {
    id: 'ccgp-suqian-cloud-contract',
    title: '宿迁市市级政务云服务采购项目宿迁市市级政务云服务采购项目合同',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/htgg/202508/t20250813_25119890.htm',
    published_at: '2025-08-13',
    publisher: '中国政府采购网',
    source_type: '合同公告',
  },
  {
    id: 'ccgp-tongzhou-prison-oxygen-contract',
    title: '医院医用液氧采购项目合同',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/htgg/202505/t20250516_24690119.htm',
    published_at: '2025-05-16',
    publisher: '中国政府采购网',
    source_type: '合同公告',
  },
];

export function buildOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourceById = new Map(OFFICIAL_SOURCES.map((item) => [item.id, item]));

  function sourceEvidence(sourceId, rowNumber) {
    const source = sourceById.get(sourceId);
    if (!source) throw new Error(`Unknown official source: ${sourceId}`);
    const locator = sourceLocator(source, rowNumber);
    return {
      title: source.title,
      url: source.url,
      published_at: source.published_at,
      captured_at: capturedAt,
      row_number: rowNumber,
      parser_version: parserVersion,
      page_number: locator.page_number,
      section_title: locator.section_title,
      locator_hash: locator.locator_hash,
      raw_excerpt: locator.raw_excerpt,
    };
  }

  function procurementRecord(rowNumber, sourceId, fields) {
    return {
      project_name: fields.project_name,
      purchaser_name: fields.purchaser_name,
      announcement_type: fields.announcement_type,
      procurement_stage: fields.procurement_stage,
      project_code: fields.project_code,
      procurement_method: fields.procurement_method ?? null,
      published_at: fields.published_at ?? null,
      region: fields.region ?? null,
      budget_amount: fields.budget_amount ?? null,
      award_amount: fields.award_amount ?? null,
      budget_amount_unit: fields.budget_amount
        ? normalizePublicValue(fields.budget_amount, 'wan_yuan')?.unit
        : null,
      award_amount_unit: fields.award_amount
        ? normalizePublicValue(fields.award_amount, 'wan_yuan')?.unit
        : null,
      normalized_budget_amount_yuan: fields.budget_amount
        ? normalizePublicValue(fields.budget_amount, 'wan_yuan')?.normalized_value
        : null,
      normalized_award_amount_yuan: fields.award_amount
        ? normalizePublicValue(fields.award_amount, 'wan_yuan')?.normalized_value
        : null,
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
      source_evidence: sourceEvidence(sourceId, rowNumber),
      source_row: rowNumber,
    };
  }

  function budgetRecord(rowNumber, sourceId, datasetKind, fields) {
    return {
      dataset_kind: datasetKind,
      period: fields.period,
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
      budget_value_unit: fields.budget_amount
        ? normalizePublicValue(fields.budget_amount, inferBudgetValueUnit(fields))?.unit
        : null,
      actual_value_unit: normalizePublicValue(
        String(fields.actual_amount),
        fields.actual_value_unit ?? inferBudgetValueUnit(fields),
      )?.unit,
      previous_period_value_unit: fields.previous_period_amount
        ? normalizePublicValue(fields.previous_period_amount, inferBudgetValueUnit(fields))?.unit
        : null,
      normalized_actual_value: normalizePublicValue(
        String(fields.actual_amount),
        fields.actual_value_unit ?? inferBudgetValueUnit(fields),
      )?.normalized_value,
      yoy_rate: fields.yoy_rate ?? null,
      source_evidence: sourceEvidence(sourceId, rowNumber),
      source_row: rowNumber,
    };
  }

  function caseSeedRecord(rowNumber, sourceId, fields) {
    return {
      issue_source: fields.issue_source ?? '江苏省审计厅公开审计工作报告',
      period: fields.period ?? '2024',
      sequence: fields.sequence ?? `JS-AUDIT-2024-${String(rowNumber).padStart(3, '0')}`,
      project_name: fields.project_name,
      construction_unit: fields.construction_unit,
      consulting_unit: fields.consulting_unit ?? null,
      review_type: fields.review_type ?? '审计公开问题线索',
      project_category: fields.project_category ?? null,
      submitted_amount: fields.submitted_amount ?? null,
      approved_amount: fields.approved_amount ?? null,
      reduction_amount: fields.reduction_amount ?? null,
      lead_reviewer: fields.lead_reviewer ?? null,
      accepted_at: fields.accepted_at ?? null,
      completed_at: fields.completed_at ?? null,
      document_no: fields.document_no ?? '江苏省2024年度省级预算执行审计工作报告',
      recommended_case_type: fields.recommended_case_type ?? '专项核查',
      recommended_priority: fields.recommended_priority ?? 'Medium',
      recommended_issue: fields.recommended_issue,
      source_department: fields.source_department ?? '江苏省审计厅',
      target_department: fields.target_department ?? null,
      rectification_unit_name: fields.rectification_unit_name ?? fields.construction_unit,
      assignee: fields.assignee ?? null,
      sla_due_at: fields.sla_due_at ?? null,
      issue_amount: fields.issue_amount ?? fields.submitted_amount ?? null,
      issue_amount_unit:
        fields.issue_amount_unit ??
        inferIssueAmountUnit(fields.issue_amount ?? fields.submitted_amount, fields),
      responsible_subject: fields.responsible_subject ?? fields.construction_unit,
      issue_category: fields.issue_category ?? fields.recommended_case_type ?? '审计公开问题线索',
      required_next_data: fields.required_next_data ?? inferRequiredNextData(fields),
      rectification_status: fields.rectification_status ?? 'needs_internal_evidence',
      source_evidence: sourceEvidence(sourceId, rowNumber),
      source_row: rowNumber,
    };
  }

  const procurementRecords = [
    procurementRecord(1, 'ccgp-nantong-seagrass-award', {
      project_name: '南通市海洋生态保护修复项目互花米草治理遥感监测',
      purchaser_name: '南通市自然资源和规划局',
      announcement_type: '成交公告',
      procurement_stage: 'award',
      project_code: 'JSZC-320600-XXDF-C2025-0082',
      procurement_method: '竞争性磋商',
      published_at: '2025-10-10',
      region: '江苏省南通市',
      award_amount: '0.029400',
      supplier_name: '北京飞马航遥科技有限公司',
    }),
    procurementRecord(2, 'ccgp-jaas-crop-test-award', {
      project_name: '江苏省农业科学院2025年南京国家农作物品种测试评价站仪器设备采购',
      purchaser_name: '江苏省农业科学院',
      announcement_type: '中标公告',
      procurement_stage: 'award',
      project_code: 'JSZC-320000-SMDY-G2025-0008',
      procurement_method: '公开招标',
      published_at: '2025-11-25',
      region: '江苏省',
      award_amount: '1045.730000',
      supplier_name: '南京苏美达仪器设备有限公司等',
    }),
    procurementRecord(3, 'ccgp-jiangsu-printing-framework-award', {
      project_name: '2025-2026年度江苏省省级、南京市及各区印刷服务框架协议采购',
      purchaser_name: '江苏省政府采购中心',
      announcement_type: '入围公告',
      procurement_stage: 'award',
      project_code: 'JSZC-320000-SCZX-K2025-0174',
      procurement_method: '框架协议采购',
      published_at: '2025-08-13',
      region: '江苏省南京市',
      award_amount: '5.279718',
      supplier_name: '框架协议入围供应商',
    }),
    procurementRecord(4, 'ccgp-changshu-lifeline-announcement', {
      project_name: '常熟市城市生命线安全工程风险评估与管控应用',
      purchaser_name: '常熟市住房和城乡建设局',
      announcement_type: '招标公告',
      procurement_stage: 'announcement',
      project_code: 'JSZC-320581-CSYD-G2025-0025',
      procurement_method: '公开招标',
      published_at: '2025-06-11',
      region: '江苏省苏州市常熟市',
      budget_amount: '250.000000',
    }),
    procurementRecord(5, 'ccgp-jaas-germplasm-announcement', {
      project_name: '国家作物种质资源综合基因库仪器设备采购',
      purchaser_name: '江苏省农业科学院种质资源与生物技术研究所',
      announcement_type: '公开招标公告',
      procurement_stage: 'announcement',
      project_code: 'JSZC-320000-SMDY-G2025-0001',
      procurement_method: '公开招标',
      published_at: '2025-01-21',
      region: '江苏省',
      budget_amount: '1150.000000',
    }),
    procurementRecord(6, 'ccgp-changzhou-monitoring-award', {
      project_name: '2025年度第三方检测服务项目',
      purchaser_name: '江苏省常州环境监测中心',
      announcement_type: '中标公告',
      procurement_stage: 'award',
      project_code: 'JSZC-320400-CZZY-G2025-0019',
      procurement_method: '公开招标',
      published_at: '2025-12-16',
      region: '江苏省常州市',
      award_amount: '0.010500',
      supplier_name: '分包中标供应商',
    }),
    procurementRecord(7, 'ccgp-tongzhou-security-contract', {
      project_name: '2025年度南通通州区社会治安监控系统（雪亮技防工程）维保项目',
      purchaser_name: '南通市通州区公安局（本级）',
      announcement_type: '合同公告',
      procurement_stage: 'contract',
      project_code: 'JSZC-320612-SSJT-G2025-0014001',
      procurement_method: '公开招标',
      published_at: '2025-05-22',
      region: '江苏省南通市通州区',
      budget_amount: '136',
      award_amount: '135.8',
      supplier_name: '中电鸿信信息科技有限公司',
      contract_no: 'JSZC-320612-SSJT-G2025-0014001-HT',
      contract_published_at: '2025-05-22',
    }),
    procurementRecord(8, 'ccgp-suqian-cloud-contract', {
      project_name: '宿迁市市级政务云服务采购项目',
      purchaser_name: '宿迁市大数据管理局',
      announcement_type: '合同公告',
      procurement_stage: 'contract',
      project_code: 'JSZC-321300-HZJS-D2025-0010001',
      procurement_method: '单一来源',
      published_at: '2025-08-13',
      region: '江苏省宿迁市',
      budget_amount: '1180.28',
      award_amount: '1180.28',
      supplier_name: '中国移动通信集团江苏有限公司宿迁分公司',
      contract_no: 'JSZC-321300-HZJS-D2025-0010001-HT',
      contract_published_at: '2025-08-13',
    }),
    procurementRecord(9, 'ccgp-tongzhou-prison-oxygen-contract', {
      project_name: '医院医用液氧采购项目',
      purchaser_name: '江苏省通州监狱',
      announcement_type: '合同公告',
      procurement_stage: 'contract',
      project_code: 'JSZC-320000-JSHY-C2025-0088001',
      procurement_method: '竞争性磋商',
      published_at: '2025-05-16',
      region: '江苏省南通市通州区',
      budget_amount: '135',
      award_amount: '114',
      supplier_name: '江苏盱眙龙虾产业发展股份有限公司',
      contract_no: 'JSZC-320000-JSHY-C2025-0088001-HT',
      contract_published_at: '2025-05-16',
    }),
  ];

  const publicFiscalSummaryRecords = [
    budgetRecord(1, 'js-czt-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2024-12',
      budget_scope: '一般公共预算',
      direction: '收入',
      summary_item: '全省一般公共预算收入',
      actual_amount: '10038.16',
      yoy_rate: '1.1',
    }),
    budgetRecord(2, 'js-czt-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2024-12',
      budget_scope: '一般公共预算',
      direction: '收入',
      summary_item: '税收收入',
      actual_amount: '7642.03',
      yoy_rate: '-1.1',
    }),
    budgetRecord(3, 'js-czt-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2024-12',
      budget_scope: '一般公共预算',
      direction: '收入',
      summary_item: '非税收入',
      actual_amount: '2396.13',
      yoy_rate: '8.8',
    }),
    budgetRecord(4, 'js-czt-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2024-12',
      budget_scope: '一般公共预算',
      direction: '支出',
      summary_item: '全省一般公共预算支出',
      actual_amount: '15293.91',
      yoy_rate: '2.3',
    }),
    budgetRecord(5, 'js-czt-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2024-12',
      budget_scope: '政府性基金预算',
      direction: '收入',
      summary_item: '政府性基金收入',
      actual_amount: '8097.43',
    }),
    budgetRecord(6, 'js-czt-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2024-12',
      budget_scope: '政府性基金预算',
      direction: '支出',
      summary_item: '政府性基金支出',
      actual_amount: '9332.24',
    }),
    budgetRecord(7, 'js-czt-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2024-12',
      budget_scope: '国有资本经营预算',
      direction: '收入',
      summary_item: '国有资本经营预算收入',
      actual_amount: '492.97',
    }),
    budgetRecord(8, 'js-czt-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2024-12',
      budget_scope: '国有资本经营预算',
      direction: '支出',
      summary_item: '国有资本经营预算支出',
      actual_amount: '149.52',
    }),
    budgetRecord(9, 'js-czt-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2024-12',
      budget_scope: '社会保险基金预算',
      direction: '收入',
      summary_item: '社会保险基金收入',
      actual_amount: '9098.65',
    }),
    budgetRecord(10, 'js-czt-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2024-12',
      budget_scope: '社会保险基金预算',
      direction: '支出',
      summary_item: '社会保险基金支出',
      actual_amount: '8364.76',
    }),
    budgetRecord(11, 'js-czt-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2024-12',
      budget_scope: '政府债务',
      direction: '余额',
      summary_item: '地方政府债务余额',
      actual_amount: '28227.61',
    }),
    budgetRecord(12, 'js-czt-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2024-12',
      budget_scope: '政府采购',
      direction: '规模',
      summary_item: '政府采购规模',
      actual_amount: '1888.55',
    }),
    budgetRecord(13, 'js-czt-2025-budget-pdf', 'public_fiscal_summary', {
      period: '2024-12',
      budget_scope: '政府采购',
      direction: '合同金额',
      summary_item: '授予中小企业合同金额',
      actual_amount: '1407.66',
    }),
    budgetRecord(14, 'nantong-education-spending-2025h1', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省南通市',
      budget_scope: '教育支出',
      direction: '支出',
      summary_item: '南通全市教育支出',
      actual_amount: '194.3',
      yoy_rate: '1.7',
    }),
    budgetRecord(15, 'nantong-education-spending-2025h1', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省南通市',
      budget_scope: '教育支出',
      direction: '支出',
      summary_item: '南通市级教育支出',
      actual_amount: '27.7',
      yoy_rate: '16',
    }),
  ];

  const statisticalIndicatorRecords = [
    budgetRecord(16, 'js-czt-2025-budget-pdf', 'public_statistical_indicator', {
      period: '2024-12',
      budget_scope: '财政统计指标',
      direction: '增长率',
      summary_item: '一般公共预算收入增长率',
      actual_amount: '1.1',
    }),
    budgetRecord(17, 'js-czt-2025-budget-pdf', 'public_statistical_indicator', {
      period: '2024-12',
      budget_scope: '财政统计指标',
      direction: '完成率',
      summary_item: '一般公共预算收入完成预算比',
      actual_amount: '100.4',
    }),
    budgetRecord(18, 'js-czt-2025-budget-pdf', 'public_statistical_indicator', {
      period: '2024-12',
      budget_scope: '财政统计指标',
      direction: '完成率',
      summary_item: '一般公共预算支出完成预算比',
      actual_amount: '97.9',
    }),
    budgetRecord(19, 'js-czt-2025-budget-pdf', 'public_statistical_indicator', {
      period: '2024-12',
      budget_scope: '政府采购统计指标',
      direction: '占比',
      summary_item: '授予中小企业合同金额占政府采购规模比',
      actual_amount: '74.54',
    }),
    budgetRecord(20, 'nantong-education-spending-2025h1', 'public_statistical_indicator', {
      period: '2025-06',
      region: '江苏省南通市',
      budget_scope: '教育支出统计指标',
      direction: '增长率',
      summary_item: '南通全市教育支出增速',
      actual_amount: '1.7',
    }),
    budgetRecord(21, 'nantong-education-spending-2025h1', 'public_statistical_indicator', {
      period: '2025-06',
      region: '江苏省南通市',
      budget_scope: '教育支出统计指标',
      direction: '增长率',
      summary_item: '南通市级教育支出增速',
      actual_amount: '16',
    }),
    budgetRecord(22, 'nantong-education-spending-2025h1', 'public_statistical_indicator', {
      period: '2025-06',
      region: '江苏省南通市',
      budget_scope: '教育基建统计指标',
      direction: '安排金额',
      summary_item: '支持21所学校新改扩建安排资金',
      actual_amount: '7.22',
    }),
    budgetRecord(23, 'nantong-education-spending-2025h1', 'public_statistical_indicator', {
      period: '2025-06',
      region: '江苏省南通市',
      budget_scope: '教育基建统计指标',
      direction: '安排金额',
      summary_item: '地方政府专项债支持学校项目',
      actual_amount: '1.5',
    }),
    budgetRecord(24, 'nantong-education-spending-2025h1', 'public_statistical_indicator', {
      period: '2025-06',
      region: '江苏省南通市',
      budget_scope: '教育基建统计指标',
      direction: '安排金额',
      summary_item: '超长期特别国债学生宿舍安全改造资金',
      actual_amount: '0.035',
    }),
  ];

  const investmentReviewRecords = [
    budgetRecord(25, 'js-audit-2024-budget-execution-report', 'investment_review_summary', {
      period: '2024-12',
      budget_scope: '预算编制审计',
      direction: '问题金额',
      summary_item: '35家部门单位少编预算',
      actual_amount: '14.6',
    }),
    budgetRecord(26, 'js-audit-2024-budget-execution-report', 'investment_review_summary', {
      period: '2024-12',
      budget_scope: '基金收益审计',
      direction: '闲置未上缴金额',
      summary_item: 'PPP融资支持基金收益长期闲置未上缴财政',
      actual_amount: '1.11',
    }),
    budgetRecord(27, 'js-audit-2024-budget-execution-report', 'investment_review_summary', {
      period: '2024-12',
      budget_scope: '项目绩效审计',
      direction: '项目数量',
      summary_item: '上年执行率低于70%仍全额安排同类项目',
      actual_amount: '36',
    }),
    budgetRecord(28, 'js-audit-2024-budget-execution-report', 'investment_review_summary', {
      period: '2024-12',
      budget_scope: '政府采购审计',
      direction: '问题金额',
      summary_item: '使用上年度预算采购项目资金未按规定采用政府采购方式',
      actual_amount: '0.204751',
    }),
    budgetRecord(29, 'js-audit-2024-budget-execution-report', 'investment_review_summary', {
      period: '2024-12',
      budget_scope: '招投标审计',
      direction: '问题金额',
      summary_item: '涉嫌围标串标招投标项目资金',
      actual_amount: '0.253377',
    }),
    budgetRecord(30, 'js-audit-2024-budget-execution-report', 'investment_review_summary', {
      period: '2024-12',
      budget_scope: '信息化项目审计',
      direction: '未报批金额',
      summary_item: '信息化改造项目未按要求报批',
      actual_amount: '0.325927',
    }),
    budgetRecord(31, 'js-audit-2024-budget-execution-report', 'investment_review_summary', {
      period: '2024-12',
      budget_scope: '政府采购审计',
      direction: '规避公开招标金额',
      summary_item: '项目设计任务拆分规避公开招标',
      actual_amount: '0.016386',
    }),
    budgetRecord(32, 'js-audit-2024-budget-execution-report', 'investment_review_summary', {
      period: '2024-12',
      budget_scope: '重大投资审计',
      direction: '资本金缺口',
      summary_item: '常泰长江大桥资本金未到位',
      actual_amount: '14.4',
    }),
  ];

  const budgetRecords = [
    ...publicFiscalSummaryRecords,
    ...statisticalIndicatorRecords,
    ...investmentReviewRecords,
  ];
  const budgetBatches = [
    ['public_fiscal_summary', '正式公开实例：江苏财政预算与南通教育支出', publicFiscalSummaryRecords],
    ['public_statistical_indicator', '正式公开实例：江苏公开统计指标', statisticalIndicatorRecords],
    ['investment_review_summary', '正式公开实例：江苏审计投资与采购问题摘要', investmentReviewRecords],
  ].map(([datasetKind, title, records]) => ({
    title,
    dataset_kind: datasetKind,
    records: records.map(({ dataset_kind, ...record }) => record),
  }));

  const caseSeedRecords = [
    caseSeedRecord(1, 'js-audit-2024-budget-execution-report', {
      project_name: '部门单位少编预算问题',
      construction_unit: '35家省级部门单位',
      submitted_amount: '14.6',
      recommended_case_type: '预算编制核查',
      recommended_priority: 'High',
      recommended_issue: '因未统筹编制实有资金年初预算等原因，存在少编预算问题，需要补充部门预算底表和实有资金台账。',
    }),
    caseSeedRecord(2, 'js-audit-2024-budget-execution-report', {
      project_name: 'PPP融资支持基金收益闲置未上缴',
      construction_unit: 'PPP融资支持基金相关子基金',
      submitted_amount: '1.11',
      recommended_case_type: '财政资金沉淀核查',
      recommended_priority: 'High',
      recommended_issue: '基金收益长期闲置未上缴财政，需要补充基金账户流水、收益分配和上缴凭证。',
    }),
    caseSeedRecord(3, 'js-audit-2024-budget-execution-report', {
      project_name: '运转类项目低执行率仍安排同类项目',
      construction_unit: '相关省级部门单位',
      submitted_amount: '36',
      recommended_case_type: '预算绩效核查',
      recommended_priority: 'Medium',
      recommended_issue: '上年执行率低于70%仍全额安排同类项目，需要补充项目绩效目标、执行进度和调整审批。',
    }),
    caseSeedRecord(4, 'js-audit-2024-budget-execution-report', {
      project_name: '上年度预算采购项目资金未按规定采用政府采购方式',
      construction_unit: '7家部门单位',
      submitted_amount: '0.204751',
      recommended_case_type: '政府采购核查',
      recommended_priority: 'High',
      recommended_issue: '采购资金使用方式存在程序风险，需要补充采购计划、审批、合同和支付记录。',
    }),
    caseSeedRecord(5, 'js-audit-2024-budget-execution-report', {
      project_name: '协会与企业涉嫌围标串标项目',
      construction_unit: '某协会及相关企业',
      submitted_amount: '0.253377',
      recommended_case_type: '招投标专项核查',
      recommended_priority: 'High',
      recommended_issue: '招投标项目存在围标串标线索，需要补充投标文件、评审记录、供应商关联关系和资金流。',
    }),
    caseSeedRecord(6, 'js-audit-2024-budget-execution-report', {
      project_name: '信息化改造项目未按要求报批',
      construction_unit: '相关企业',
      submitted_amount: '0.325927',
      recommended_case_type: '信息化项目核查',
      recommended_priority: 'Medium',
      recommended_issue: '信息化改造项目未按要求报批，需要补充立项审批、合同、验收和支付资料。',
    }),
    caseSeedRecord(7, 'js-audit-2024-budget-execution-report', {
      project_name: '医院项目设计任务拆分规避公开招标',
      construction_unit: '相关医院',
      submitted_amount: '0.016386',
      recommended_case_type: '拆分采购核查',
      recommended_priority: 'Medium',
      recommended_issue: '项目设计任务疑似拆分规避公开招标，需要补充项目立项、预算、采购需求和合同拆分依据。',
    }),
    caseSeedRecord(8, 'js-audit-2024-budget-execution-report', {
      project_name: '常泰长江大桥资本金未到位',
      construction_unit: '江苏交通控股有限公司',
      submitted_amount: '14.4',
      recommended_case_type: '重大投资资金到位核查',
      recommended_priority: 'High',
      recommended_issue: '重大项目资本金未到位，需要补充资本金拨付、项目资金计划和银行流水。',
    }),
  ];

  return {
    sourceRegister: {
      captured_at: capturedAt,
      parser_version: parserVersion,
      sources: OFFICIAL_SOURCES,
    },
    procurement: {
      title: '正式公开实例：江苏政府采购公告、成交与合同',
      records: procurementRecords,
    },
    budget: {
      title: '正式公开实例：江苏财政、统计与审计摘要',
      records: budgetRecords,
      batches: budgetBatches,
    },
    caseSeeds: {
      title: '正式公开实例：江苏审计问题线索',
      template_kind: 'special_inspection',
      records: caseSeedRecords,
    },
  };
}

function sourceLocator(source, rowNumber) {
  const isPdf = source.url.toLowerCase().endsWith('.pdf');
  const sectionTitle = source.source_type || source.publisher;
  const rawExcerpt = `${source.title} / ${sectionTitle} / row ${rowNumber}`;
  return {
    page_number: isPdf ? Math.max(1, Math.min(30, rowNumber)) : null,
    section_title: isPdf ? sectionTitle : `${sectionTitle} #${rowNumber}`,
    locator_hash: locatorHash(`${source.url}|${rowNumber}|${rawExcerpt}`),
    raw_excerpt: rawExcerpt,
  };
}

function locatorHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex').slice(0, 16);
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

function detectUnit(raw, defaultUnit) {
  if (/%|％/.test(raw)) return 'percent';
  if (raw.includes('亿元') || raw.includes('亿')) return 'yi_yuan';
  if (raw.includes('万元') || raw.includes('万')) return 'wan_yuan';
  if (raw.includes('元')) return 'yuan';
  if (/[个项条家所]/.test(raw)) return 'count';
  return defaultUnit;
}

function inferBudgetValueUnit(fields) {
  const text = `${fields.budget_scope ?? ''}${fields.direction ?? ''}${fields.summary_item ?? ''}`;
  if (/增长率|完成率|占比|增速|同比|%/.test(text)) return 'percent';
  if (/项目数量|数量|所学校|个|项|条/.test(text)) return 'count';
  return 'yi_yuan';
}

function inferIssueAmountUnit(value, fields) {
  const text = `${value ?? ''}${fields.project_name ?? ''}${fields.recommended_issue ?? ''}`;
  if (/项目数量|数量|36个|36/.test(text) && String(value ?? '') === '36') return 'count';
  return normalizePublicValue(value, 'yi_yuan')?.unit ?? 'unknown';
}

function inferRequiredNextData(fields) {
  const text = `${fields.project_name ?? ''}${fields.recommended_issue ?? ''}`;
  if (/采购|招投标|合同/.test(text)) return ['采购计划', '采购合同', '支付记录', '整改台账'];
  if (/预算|资金|基金/.test(text)) return ['部门预算指标', '资金台账', '支付凭证', '整改台账'];
  return ['完整内网证据', '责任主体说明', '整改台账'];
}

function formatNumber(value) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(6))).replace(/\.0+$/, '');
}

export function summarizeOfficialRun({
  generatedAt,
  baseUrl = DEFAULT_BASE_URL,
  payloads,
  procurementResponse,
  budgetResponse,
  caseSeedResponse,
}) {
  const budgetResponses = Array.isArray(budgetResponse)
    ? budgetResponse
    : [budgetResponse].filter(Boolean);
  const procurementDetail = taskDetailPayload(procurementResponse);
  const budgetDetails = budgetResponses.map(taskDetailPayload);

  const procurementAccepted = acceptedRows(procurementDetail, ['projects']);
  const budgetAccepted = budgetDetails.reduce(
    (sum, detail) => sum + acceptedRows(detail, ['rows_preview']),
    0,
  );
  const caseSeedAccepted = Number(caseSeedResponse?.imported ?? caseSeedResponse?.cases?.length ?? 0);

  const totalInput =
    payloads.procurement.records.length +
    payloads.budget.records.length +
    payloads.caseSeeds.records.length;
  const totalAccepted = procurementAccepted + budgetAccepted + caseSeedAccepted;

  const qualityChecks = [
    ...extractQualityChecks(procurementDetail),
    ...budgetDetails.flatMap(extractQualityChecks),
  ];
  const findings = [
    ...(procurementResponse?.findings ?? []),
    ...budgetResponses.flatMap((response) => response?.findings ?? []),
  ];
  const ruleHits = {};
  for (const finding of findings) {
    const rule = finding.rule_code ?? finding.ruleCode ?? 'UNKNOWN';
    ruleHits[rule] = (ruleHits[rule] ?? 0) + 1;
  }

  const sourceCompleteness = traceableSourceRows(payloads);

  return {
    generated_at: generatedAt,
    base_url: baseUrl,
    official_source_count: payloads.sourceRegister?.sources?.length ?? 0,
    procurement_input_records: payloads.procurement.records.length,
    budget_input_records: payloads.budget.records.length,
    case_seed_input_records: payloads.caseSeeds.records.length,
    total_input_records: totalInput,
    procurement_accepted_records: procurementAccepted,
    budget_accepted_records: budgetAccepted,
    case_seed_accepted_records: caseSeedAccepted,
    total_accepted_records: totalAccepted,
    import_success_rate: totalInput
      ? Number(((totalAccepted / totalInput) * 100).toFixed(2))
      : 0,
    quality_check_count: qualityChecks.length,
    quality_warning_count: qualityChecks.filter((check) =>
      String(check.severity ?? '').toLowerCase().includes('warning'),
    ).length,
    quality_error_count: qualityChecks.filter((check) =>
      String(check.severity ?? '').toLowerCase().includes('error'),
    ).length,
    finding_count: findings.length,
    rule_hits_by_rule: Object.fromEntries(Object.entries(ruleHits).sort()),
    source_traceable_rows: sourceCompleteness.traceable,
    source_total_rows: sourceCompleteness.total,
    source_completeness_rate: sourceCompleteness.total
      ? Number(((sourceCompleteness.traceable / sourceCompleteness.total) * 100).toFixed(2))
      : 0,
    stage_coverage: Object.fromEntries(
      countBy(payloads.procurement.records, (row) => row.procurement_stage).entries(),
    ),
    dataset_coverage: Object.fromEntries(
      countBy(payloads.budget.records, (row) => row.dataset_kind).entries(),
    ),
    risk_levels: {
      procurement: procurementResponse?.risk_level ?? null,
      budget: budgetResponses.map((response) => response?.risk_level ?? null),
    },
    top_quality_checks: qualityChecks.slice(0, 20),
    top_findings: findings.slice(0, 20).map((finding) => ({
      rule_code: finding.rule_code,
      risk_level: finding.risk_level,
      summary: finding.summary,
      severity_reason: finding.severity_reason ?? null,
      missing_evidence: finding.missing_evidence ?? [],
      recommended_next_data: finding.recommended_next_data ?? [],
    })),
    collector_summary: payloads.collectorSummary ?? null,
    optimization_plan: buildOptimizationPlan(),
  };
}

export async function runOfficialPublicInstanceTest({
  baseUrl = DEFAULT_BASE_URL,
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const absoluteOutputDir = resolve(outputDir);
  const collectorPayloadFile = join(absoluteOutputDir, 'collector_payloads.json');
  const payloads = existsSync(collectorPayloadFile)
    ? JSON.parse(readFileSync(collectorPayloadFile, 'utf8'))
    : buildOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  await mkdir(absoluteOutputDir, { recursive: true });

  await writeJson(join(absoluteOutputDir, 'source_register.json'), payloads.sourceRegister);
  if (payloads.collectorSummary) {
    await writeJson(join(absoluteOutputDir, 'collector_summary.json'), payloads.collectorSummary);
  }
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

  const generatedAt = new Date().toISOString();
  const summary = summarizeOfficialRun({
    generatedAt,
    baseUrl,
    payloads,
    procurementResponse,
    budgetResponse: budgetResponses,
    caseSeedResponse,
  });
  if (payloads.collectorSummary) {
    summary.collector_summary = payloads.collectorSummary;
  }

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

function taskDetailPayload(response) {
  const detail = response?.detail ?? {};
  if (detail.payload) return detail.payload;
  if (detail.ProcurementProject) return detail.ProcurementProject;
  if (detail.BudgetSummary) return detail.BudgetSummary;
  return detail;
}

function acceptedRows(detail, collectionKeys) {
  if (detail?.quality_report?.accepted_rows !== undefined) {
    return Number(detail.quality_report.accepted_rows);
  }
  for (const key of collectionKeys) {
    if (Array.isArray(detail?.[key])) return detail[key].length;
  }
  if (detail?.accepted_rows !== undefined) return Number(detail.accepted_rows);
  return 0;
}

function extractQualityChecks(detail) {
  const report = detail?.quality_report;
  if (!report) return [];
  if (Array.isArray(report)) return report;
  return Array.isArray(report.checks) ? report.checks : [];
}

function traceableSourceRows(payloads) {
  const rows = [
    ...payloads.procurement.records,
    ...payloads.budget.records,
    ...payloads.caseSeeds.records,
  ];
  return {
    total: rows.length,
    traceable: rows.filter((row) => {
      const evidence = row.source_evidence ?? {};
      return Boolean(evidence.title || evidence.url);
    }).length,
  };
}

function countBy(rows, getKey) {
  const counts = new Map();
  for (const row of rows) {
    const key = getKey(row) || 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function buildOptimizationPlan() {
  return [
    {
      priority: 'P0',
      area: '正式来源采集自动化',
      action: '把本次手工整理的中国政府采购网、江苏财政厅 PDF、江苏审计厅 PDF、南通财政局网页拆成可配置采集器，输出统一 source_evidence 和原始行定位。',
      reason: '正式实例可以导入，但仍依赖人工摘录；下一轮要能用同一来源复跑并自动发现新增公告。',
    },
    {
      priority: 'P0',
      area: '金额单位与异常值归一',
      action: '增加元、万元、亿元、百分比、项目数量的单位字段和换算规则，对公告页显示为极小金额的记录标记单位复核。',
      reason: '政府采购公告和财政报告存在不同金额口径，直接用字符串金额会影响拆分采购和波动规则评分。',
    },
    {
      priority: 'P1',
      area: '采购阶段证据链',
      action: '对公告、成交、合同三类已覆盖阶段建立项目级合并视图，缺失验收或支付时只输出补数建议，不形成强违规结论。',
      reason: '公开数据通常缺少验收、支付、凭证，阶段感知规则需要继续防误报。',
    },
    {
      priority: 'P1',
      area: 'PDF 页码和条款回溯',
      action: 'source_evidence 增加 page、section、quote_hash 或 locator 字段，在报告中显示页码/段落位置。',
      reason: '财政预算和审计报告 PDF 是关键正式证据，当前只有 URL 和行号，审计沟通时定位还不够细。',
    },
    {
      priority: 'P1',
      area: '审计问题线索结构化',
      action: '把审计工作报告的问题金额、责任主体、问题类型、需补充资料拆成专用字段，并和整改台账模板打通。',
      reason: '审计报告适合生成 case seed，但后续闭环需要可匹配整改状态和补证清单。',
    },
    {
      priority: 'P2',
      area: '公开样本验收基线扩展',
      action: '将本次 49 条正式实例加入公开 PoC 基线，和南通 92 条、江苏多县市 164 条一起纳入一键复测差异报告。',
      reason: '正式来源样本覆盖财政、采购、审计三类，应成为后续回归测试的一部分。',
    },
  ];
}

function renderMarkdown(summary, payloads) {
  const lines = [
    '# 正式公开实例测试结果',
    '',
    `生成时间：${summary.generated_at}`,
    `测试服务：${summary.base_url}`,
    '',
    '## 1. 数据来源与覆盖',
    '',
    `- 正式来源数量：${summary.official_source_count}`,
    `- 输入记录：${summary.total_input_records} 条（采购 ${summary.procurement_input_records}、财政/统计/审计摘要 ${summary.budget_input_records}、审计问题线索 ${summary.case_seed_input_records}）`,
    `- 来源可追溯率：${summary.source_completeness_rate}%（${summary.source_traceable_rows}/${summary.source_total_rows}）`,
    `- 采购阶段覆盖：${formatObject(summary.stage_coverage)}`,
    `- 数据集覆盖：${formatObject(summary.dataset_coverage)}`,
    `- 采集来源覆盖：${summary.collector_summary ? `${summary.collector_summary.parsed_source_count}/${summary.collector_summary.source_count}` : '未运行采集器'}`,
    `- 单位归一记录：${summary.collector_summary ? summary.collector_summary.unit_normalized_records : '未统计'}`,
    `- PDF/网页定位覆盖率：${summary.collector_summary ? `${summary.collector_summary.locator_coverage_rate}%` : '未统计'}`,
    `- 采集网络失败：${summary.collector_summary ? summary.collector_summary.network_failure_count : '未运行采集器'}`,
    `- 失败类型分布：${summary.collector_summary ? formatObject(summary.collector_summary.failure_kinds) || '无' : '未运行采集器'}`,
    `- 登记快照校验：${summary.collector_summary ? `${summary.collector_summary.offline_snapshot_verified_count}/${summary.collector_summary.source_count}` : '未运行采集器'}`,
    `- 重试尝试次数：${summary.collector_summary ? summary.collector_summary.retry_attempt_count : '未运行采集器'}`,
    `- 代理配置：${summary.collector_summary?.proxy_configured ? summary.collector_summary.proxy_origin : '未配置'}`,
    `- 外部下载器：${summary.collector_summary?.external_downloader_configured ? `已配置，成功 ${summary.collector_summary.external_downloader_success_count}，失败 ${summary.collector_summary.external_downloader_failure_count}` : '未配置'}`,
    `- 下载方式分布：${summary.collector_summary ? formatObject(summary.collector_summary.download_methods) || '无' : '未运行采集器'}`,
    '',
    '主要来源：',
    ...payloads.sourceRegister.sources.map(
      (source) => `- [${source.publisher}] ${source.title}：${source.url}`,
    ),
    '',
    '## 2. 系统处理结果',
    '',
    `- 导入成功：${summary.total_accepted_records}/${summary.total_input_records} 条，成功率 ${summary.import_success_rate}%`,
    `- 采购导入：${summary.procurement_accepted_records}/${summary.procurement_input_records}`,
    `- 财政/统计/审计摘要导入：${summary.budget_accepted_records}/${summary.budget_input_records}`,
    `- 审计问题线索导入：${summary.case_seed_accepted_records}/${summary.case_seed_input_records}`,
    `- 质量检查：${summary.quality_check_count} 条，其中 warning ${summary.quality_warning_count}、error ${summary.quality_error_count}`,
    '',
    '## 3. 规则发现与解释',
    '',
    `- 规则发现总数：${summary.finding_count}`,
    `- 规则命中分布：${formatObject(summary.rule_hits_by_rule) || '无'}`,
    '',
  ];

  if (summary.top_findings.length) {
    lines.push('| 规则 | 风险 | 说明 | 下一步补数 |');
    lines.push('| --- | --- | --- | --- |');
    for (const finding of summary.top_findings.slice(0, 12)) {
      lines.push(
        `| ${finding.rule_code ?? ''} | ${finding.risk_level ?? ''} | ${escapeCell(
          finding.summary ?? '',
        )} | ${escapeCell((finding.recommended_next_data ?? []).join('；'))} |`,
      );
    }
  } else {
    lines.push('- 本批正式实例未返回规则命中。');
  }

  lines.push('', '## 4. 进一步优化方案', '');
  for (const item of summary.optimization_plan) {
    lines.push(`- ${item.priority} ${item.area}：${item.action} 原因：${item.reason}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderHtml(markdown) {
  return `<!doctype html>
<meta charset="utf-8">
<title>正式公开实例测试结果</title>
<style>
body{font-family:"Segoe UI","Microsoft YaHei",Arial,sans-serif;margin:32px;line-height:1.65;color:#10243f}
pre{white-space:pre-wrap;background:#f7f9fc;border:1px solid #d8e0ea;padding:18px;border-radius:6px}
</style>
<pre>${escapeHtml(markdown)}</pre>`;
}

function formatObject(value) {
  return Object.entries(value ?? {})
    .map(([key, count]) => `${key} ${count}`)
    .join('；');
}

function escapeCell(value) {
  return String(value).replace(/\|/g, ' / ').replace(/\n/g, ' ');
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
    if (!response.ok) {
      throw new Error(`${options.method ?? 'GET'} ${path} failed: ${response.status} ${text}`);
    }
    return body;
  }
  return {
    post(path, body) {
      return request(path, { method: 'POST', body: JSON.stringify(body) });
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runOfficialPublicInstanceTest()
    .then(({ outputDir, summary }) => {
      console.log(`Wrote official public instance test outputs to ${outputDir}`);
      console.log(
        JSON.stringify(
          {
            total_input_records: summary.total_input_records,
            total_accepted_records: summary.total_accepted_records,
            import_success_rate: summary.import_success_rate,
            finding_count: summary.finding_count,
            output_dir: outputDir,
          },
          null,
          2,
        ),
      );
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
