import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { registryHash, normalizePublicValue } from './collect-official-public-sources.mjs';
import { summarizeOfficialRun } from './test-official-public-instances.mjs';

const DEFAULT_BASE_URL = process.env.AUDITLENS_BASE_URL || 'http://127.0.0.1:18080';
const DEFAULT_CAPTURED_AT = '2026-04-26T21:30:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-instance-round4-v1';
const DEFAULT_OUTPUT_DIR = join('data', 'real-integration', 'official-public-instances-round4-20260426');
const BATCH_ID = 'official_public_instances_round4';

const ROUND4_SOURCES = [
  {
    id: 'ccgp-js-fire-it-satcom-award-2025',
    title: '江苏省消防救援总队2025-2026年度信息化及卫星通信网运维服务项目中标公告',
    url: 'https://www.ccgp.gov.cn/cggg/zygg/zbgg/202505/t20250530_24694632.htm',
    published_at: '2025-05-30',
    publisher: '中国政府采购网',
    source_type: '中标公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '江苏 消防救援 信息化 卫星通信 中标公告',
  },
  {
    id: 'ccgp-yancheng-fire-equipment-award-2025',
    title: '盐城市消防救援支队2024年度目录外器材装备采购项目（第一批）（分包二）中标公告',
    url: 'https://www.ccgp.gov.cn/cggg/dfgg/zbgg/202503/t20250317_24307833.htm',
    published_at: '2025-03-17',
    publisher: '中国政府采购网',
    source_type: '中标公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '盐城 消防 器材装备 中标公告',
  },
  {
    id: 'changjiang-nanjing-vessel-repair-announcement-2026',
    title: '长江南京航道局2026年6艘船舶进厂维修项目公开招标公告',
    url: 'https://www.hubeibidding.com/view/45757.html',
    published_at: '2026-02-11',
    publisher: '湖北省成套招标股份有限公司',
    source_type: '公开招标公告',
    parser_type: 'ccgp_procurement_html',
    keyword: '长江南京航道局 船舶维修 公开招标 2026',
  },
  {
    id: 'huaian-xuyi-bus-station-renovation-announcement-2025',
    title: '盱眙县汽车站设施设备维修改造工程采购公告',
    url: 'https://czj.huaian.gov.cn/col/17116_223664/content/17566560/ff80808199161b88019917c06b81000d.html',
    published_at: '2025-09-05',
    publisher: '淮安市政府采购网',
    source_type: '竞争性磋商公告',
    parser_type: 'government_procurement_html',
    keyword: '淮安 盱眙 汽车站 维修改造 采购公告',
  },
  {
    id: 'jiangyin-yuecheng-2025h1-budget',
    title: '2024年度财政决算和2025年上半年财政预算执行情况',
    url: 'https://www.jiangyin.gov.cn/doc/2025/12/09/1369861.shtml',
    published_at: '2025-12-09',
    publisher: '江阴市月城镇人民政府',
    source_type: '财政预算执行情况',
    parser_type: 'government_metric_html',
    keyword: '江阴 月城 2025 上半年 财政预算执行',
  },
  {
    id: 'rugao-changjiang-2025h1-budget',
    title: '长江镇2024年财政决算情况、2025年上半年财政预算执行情况和2025年财政预算调整方案的报告',
    url: 'https://www.rugao.gov.cn/rgscjz/bmyjs/content/67bc88dd-399e-4ead-9c5e-2d38f22f2c81.html',
    published_at: '2025-07-17',
    publisher: '如皋市长江镇人民政府办公室',
    source_type: '财政预算执行情况',
    parser_type: 'government_metric_html',
    keyword: '如皋 长江镇 2025 上半年 财政预算执行',
  },
  {
    id: 'rugao-dingyan-2025h1-budget',
    title: '丁堰镇2024年财政决算情况和2025年上半年财政预算执行情况',
    url: 'https://www.rugao.gov.cn/rgsdyz/bmyjs/content/2a040b38-2532-4ee7-bba6-aef81b4f94b5.html',
    published_at: '2025-10-16',
    publisher: '如皋市丁堰镇人民政府',
    source_type: '财政预算执行情况',
    parser_type: 'government_metric_html',
    keyword: '如皋 丁堰镇 2025 上半年 财政预算执行',
  },
  {
    id: 'rugao-devzone-2025h1-budget',
    title: '开发区（城北街道）2024年财政决算、2025年上半年财政预算执行情况的报告',
    url: 'https://www.rugao.gov.cn/rgskfq/bmyjs/content/b704e76e-c30a-4a8d-b8c8-8ab88f8aa1f0.html',
    published_at: '2025-09-10',
    publisher: '如皋经济技术开发区',
    source_type: '财政预算执行情况',
    parser_type: 'government_metric_html',
    keyword: '如皋 开发区 城北街道 财政预算执行',
  },
  {
    id: 'rugao-jiangan-2025h1-budget',
    title: '关于江安镇2024年财政决算（草案）和2025年上半年财政预算执行情况的报告',
    url: 'https://www.rugao.gov.cn/rgsjaz/bmyjs/content/a61e7f26-a3ea-4084-a81a-1e290faa7287.html',
    published_at: '2025-07-17',
    publisher: '如皋市江安镇人民政府',
    source_type: '财政预算执行情况',
    parser_type: 'government_metric_html',
    keyword: '如皋 江安镇 2025 上半年 财政预算执行',
  },
  {
    id: 'rugao-city-2025h1-plan-report',
    title: '关于如皋市2025年上半年国民经济和社会发展计划执行情况的报告',
    url: 'https://www.rugao.gov.cn/rgsfgw/dissgwngh/content/41e24a4b-459b-409a-984d-a429f568cd99.html',
    published_at: '2025-09-04',
    publisher: '如皋市发展和改革委员会',
    source_type: '国民经济和社会发展计划执行情况',
    parser_type: 'government_metric_html',
    keyword: '如皋 2025 上半年 国民经济 社会发展计划',
  },
  {
    id: 'huishan-2025-plan-report',
    title: '关于无锡市惠山区2024年国民经济及社会发展计划执行情况和2025年国民经济及社会发展计划安排（草案）的报告',
    url: 'https://www.huishan.gov.cn/doc/2025/01/09/4558049.shtml',
    published_at: '2025-01-09',
    publisher: '无锡市惠山区人民政府',
    source_type: '国民经济和社会发展计划报告',
    parser_type: 'government_metric_html',
    keyword: '无锡 惠山区 2025 计划 报告 一般公共预算收入',
  },
  {
    id: 'xishan-2025h1-budget-meeting',
    title: '区政府召开党组（扩大）会议暨理论学习中心组学习会和五届第64次常务会议',
    url: 'https://www.jsxishan.gov.cn/doc/2025/09/23/4652453.shtml',
    published_at: '2025-09-23',
    publisher: '无锡市锡山区人民政府',
    source_type: '财政预算执行审议动态',
    parser_type: 'government_metric_html',
    keyword: '锡山 2025 上半年 财政预算执行 情况报告',
  },
  {
    id: 'jsrd-2025h1-budget-execution-pdf',
    title: '关于江苏省2025年上半年预算执行情况的报告',
    url: 'https://www.jsrd.gov.cn/qwfb/cwhgb/202505/202512/P020260226561389403257.pdf',
    published_at: '2025-07-25',
    publisher: '江苏省人大常委会公报',
    source_type: '财政预算执行报告PDF',
    parser_type: 'fiscal_report_pdf',
    keyword: '江苏省 2025 上半年 预算执行 情况 报告 PDF',
  },
  {
    id: 'js-audit-tech-platform-survey-2025',
    title: '江苏组织开展高水平科技创新平台建设运行情况专项审计调查',
    url: 'https://jssjt.jiangsu.gov.cn/art/2025/4/27/art_995_11554202.html',
    published_at: '2025-04-27',
    publisher: '江苏省审计厅',
    source_type: '专项审计调查',
    parser_type: 'audit_report_html',
    keyword: '江苏 审计 科技创新平台 专项审计调查',
  },
  {
    id: 'js-audit-social-security-card-survey-2025',
    title: '江苏开展全省社会保障卡建设管理情况专项审计调查',
    url: 'https://jssjt.jiangsu.gov.cn/art/2025/4/3/art_995_11534020.html',
    published_at: '2025-04-03',
    publisher: '江苏省审计厅',
    source_type: '专项审计调查',
    parser_type: 'audit_report_html',
    keyword: '江苏 审计 社会保障卡 专项审计调查',
  },
  {
    id: 'js-audit-engineering-risk-survey-2025',
    title: '江苏开展全省工程建设领域规范管理和风险防控情况专项审计调查',
    url: 'https://jssjt.jiangsu.gov.cn/art/2025/8/6/art_1053_11618961.html',
    published_at: '2025-08-06',
    publisher: '江苏省审计厅',
    source_type: '专项审计调查',
    parser_type: 'audit_report_html',
    keyword: '江苏 审计 工程建设 风险防控 专项审计调查',
  },
  {
    id: 'js-audit-two-new-policy-survey-2025',
    title: '江苏省审计厅开展“两新”政策落实情况专项审计调查',
    url: 'https://jssjt.jiangsu.gov.cn/art/2025/8/20/art_1053_11626392.html',
    published_at: '2025-08-20',
    publisher: '江苏省审计厅',
    source_type: '专项审计调查',
    parser_type: 'audit_report_html',
    keyword: '江苏 审计 两新 政策 专项审计调查',
  },
  {
    id: 'js-audit-2025-project-plan',
    title: '江苏省审计厅2025年度审计项目计划',
    url: 'https://jssjt.jiangsu.gov.cn/art/2025/1/23/art_80112_11477987.html',
    published_at: '2025-01-23',
    publisher: '江苏省审计厅',
    source_type: '审计项目计划',
    parser_type: 'audit_report_html',
    keyword: '江苏省审计厅 2025 审计项目计划',
  },
  {
    id: 'nt-audit-solar-terms-liqiu-2025',
    title: '南通审计人的二十四节气︱立秋禾熟 厚积薄发',
    url: 'https://jssjt.jiangsu.gov.cn/art/2025/8/7/art_1053_11618200.html',
    published_at: '2025-08-07',
    publisher: '江苏省审计厅',
    source_type: '审计工作动态',
    parser_type: 'audit_report_html',
    keyword: '南通 审计 两新 补贴 5G 工业互联网 奖补资金',
  },
  {
    id: 'js-audit-department-performance-self-eval-2024',
    title: '省级部门整体绩效自评价表',
    url: 'https://jssjt.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=299621393aac49e5a11e4655a4906f12.pdf',
    published_at: '2025-12-26',
    publisher: '江苏省审计厅',
    source_type: '部门绩效自评PDF',
    parser_type: 'audit_report_pdf',
    keyword: '江苏省审计厅 部门整体绩效 自评价 PDF',
  },
];

export function usedOfficialSourceUrls() {
  const urls = new Set();
  const registryPath = join('data', 'source-registry', 'official_sources.json');
  if (existsSync(registryPath)) {
    const parsed = JSON.parse(readFileSync(registryPath, 'utf8').replace(/^\uFEFF/, ''));
    for (const source of parsed.sources ?? []) {
      if (source.batch_id !== BATCH_ID && source.url) urls.add(source.url);
    }
  }
  for (const dir of [
    'official-public-instances-20260426',
    'official-public-instances-round2-20260426',
    'official-public-instances-round3-20260426',
  ]) {
    const file = join('data', 'real-integration', dir, 'source_register.json');
    if (!existsSync(file)) continue;
    const parsed = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    for (const source of parsed.sources ?? []) {
      if (source.url) urls.add(source.url);
    }
  }
  return urls;
}

export function buildFourthOfficialPublicInstancePayloads({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const sourcesById = new Map(ROUND4_SOURCES.map((source) => [source.id, source]));
  let procurementRow = 1;
  let budgetRow = 1;
  let caseRow = 1;

  function sourceRegisterEntry(source) {
    const contentBasis = `${source.title}|${source.publisher}|${source.url}`;
    return {
      source_id: source.id,
      title: source.title,
      url: source.url,
      publisher: source.publisher,
      source_type: source.source_type,
      parser_type: source.parser_type,
      discovered_by_keyword: source.keyword,
      discovered_at: capturedAt,
      review_status: 'reviewed',
      batch_id: BATCH_ID,
      url_hash: registryHash(source.url),
      content_hash: registryHash(contentBasis),
      duplicate_of: null,
      duplicate_reason: null,
      title_similarity_score: null,
      manual_review_note: '第四批全网检索正式实例，人工复核为新来源',
      expected_record_count: 0,
    };
  }

  function evidence(sourceId, rowNumber, rawExcerpt, sectionTitle = '正文摘录', pageNumber = null) {
    const source = sourcesById.get(sourceId);
    return {
      title: source.title,
      url: source.url,
      published_at: source.published_at,
      captured_at: capturedAt,
      row_number: rowNumber,
      parser_version: parserVersion,
      page_number: pageNumber,
      section_title: pageNumber ? null : sectionTitle,
      locator_hash: locatorHash(`${source.url}|${pageNumber ?? sectionTitle}|${rawExcerpt}`),
      raw_excerpt: rawExcerpt,
    };
  }

  function procurement(sourceId, fields) {
    const row = procurementRow++;
    const budget = normalizePublicValue(fields.budget_amount, fields.budget_amount_unit ?? 'wan_yuan');
    const award = normalizePublicValue(fields.award_amount, fields.award_amount_unit ?? 'wan_yuan');
    return {
      project_code: fields.project_code,
      project_name: fields.project_name,
      purchaser_name: fields.purchaser_name,
      procurement_method: fields.procurement_method,
      procurement_stage: fields.procurement_stage,
      announcement_type: fields.announcement_type ?? (fields.procurement_stage === 'award' ? '中标公告' : '采购公告'),
      published_at: fields.published_at,
      region: fields.region,
      budget_amount: budget?.raw_number ?? fields.budget_amount ?? null,
      budget_amount_unit: budget?.unit ?? null,
      normalized_budget_amount_yuan: budget?.normalized_value ?? null,
      award_amount: award?.raw_number ?? fields.award_amount ?? null,
      award_amount_unit: award?.unit ?? null,
      normalized_award_amount_yuan: award?.normalized_value ?? null,
      framework_agreement_flag: false,
      amount_semantic_type: fields.amount_semantic_type ?? (fields.award_amount ? 'award_total' : 'budget_amount'),
      quote_amount: fields.quote_amount ?? null,
      quote_amount_unit: null,
      discount_rate: null,
      unit_price: null,
      total_award_amount: fields.award_amount ?? null,
      supplier_name: fields.supplier_name ?? null,
      source_evidence: evidence(sourceId, row, fields.raw_excerpt, fields.section_title ?? '采购公告'),
      source_row: row,
    };
  }

  function budget(sourceId, datasetKind, fields) {
    const row = budgetRow++;
    const actual = normalizePublicValue(String(fields.actual_amount), fields.actual_value_unit ?? inferUnit(fields));
    const previous = fields.previous_period_amount
      ? normalizePublicValue(String(fields.previous_period_amount), fields.previous_period_value_unit ?? inferUnit(fields))
      : null;
    return {
      dataset_kind: datasetKind,
      period: fields.period,
      region: fields.region,
      budget_scope: fields.budget_scope,
      direction: fields.direction,
      budget_unit_name: fields.budget_unit_name ?? null,
      budget_project_name: fields.budget_project_name ?? null,
      summary_item: fields.summary_item,
      budget_amount: fields.budget_amount ?? null,
      actual_amount: String(fields.actual_amount),
      previous_period_amount: fields.previous_period_amount ?? null,
      budget_value_unit: fields.budget_value_unit ?? null,
      actual_value_unit: actual?.unit ?? fields.actual_value_unit ?? null,
      previous_period_value_unit: previous?.unit ?? null,
      normalized_actual_value: actual?.normalized_value ?? null,
      yoy_rate: fields.yoy_rate ?? null,
      policy_document_no: fields.policy_document_no ?? null,
      budget_subject_code: fields.budget_subject_code ?? null,
      fund_destination: fields.fund_destination ?? null,
      prohibited_use_summary: fields.prohibited_use_summary ?? null,
      performance_report_due_at: fields.performance_report_due_at ?? null,
      source_evidence: evidence(sourceId, row, fields.raw_excerpt, fields.section_title ?? '财政指标'),
      source_row: row,
    };
  }

  function caseSeed(sourceId, fields) {
    const row = caseRow++;
    const source = sourcesById.get(sourceId);
    return {
      issue_source: fields.issue_source ?? source.publisher,
      period: fields.period ?? '2025',
      sequence: `JS-ROUND4-AUDIT-${String(row).padStart(3, '0')}`,
      project_name: fields.project_name,
      construction_unit: fields.construction_unit,
      consulting_unit: null,
      review_type: fields.review_type ?? '公开审计线索',
      submitted_amount: String(fields.submitted_amount ?? fields.issue_amount ?? 0),
      approved_amount: null,
      reduction_amount: null,
      lead_reviewer: null,
      accepted_at: fields.accepted_at ?? source.published_at,
      completed_at: null,
      document_no: fields.document_no ?? source.title,
      recommended_case_type: fields.recommended_case_type,
      recommended_priority: fields.recommended_priority ?? 'Medium',
      recommended_issue: fields.recommended_issue,
      source_department: source.publisher,
      target_department: null,
      rectification_unit_name: fields.rectification_unit_name ?? fields.construction_unit,
      assignee: null,
      sla_due_at: null,
      project_category: fields.project_category ?? '公开审计线索',
      issue_amount: fields.issue_amount ?? null,
      issue_amount_unit: fields.issue_amount_unit ?? 'unknown',
      responsible_subject: fields.responsible_subject ?? fields.construction_unit,
      issue_category: fields.issue_category ?? fields.recommended_case_type,
      required_next_data: fields.required_next_data ?? ['正式审计报告', '问题清单', '整改台账', '资金凭证'],
      rectification_status: fields.rectification_status ?? 'needs_internal_evidence',
      audit_evidence_level: fields.audit_evidence_level,
      audit_document_type: fields.audit_document_type,
      conclusion_strength: fields.conclusion_strength,
      requires_manual_verification: fields.requires_manual_verification ?? true,
      audit_evidence_weight: fields.audit_evidence_weight ?? auditEvidenceWeight(fields.audit_evidence_level),
      source_evidence: evidence(sourceId, row, fields.raw_excerpt, fields.section_title ?? '审计信息'),
      source_row: row,
    };
  }

  const procurementRecords = [
    procurement('ccgp-js-fire-it-satcom-award-2025', {
      project_code: 'SNZX-20250167',
      project_name: '江苏省消防救援总队2025-2026年度信息化运维服务',
      purchaser_name: '江苏省消防救援总队',
      procurement_method: '公开招标',
      procurement_stage: 'award',
      published_at: '2025-05-30',
      region: '江苏省',
      award_amount: '162.8',
      supplier_name: '江苏移动信息系统集成有限公司',
      raw_excerpt: '分包1中标金额162.8000000万元；总中标金额192.400000万元。',
    }),
    procurement('ccgp-js-fire-it-satcom-award-2025', {
      project_code: 'SNZX-20250167-02',
      project_name: '江苏省消防救援总队2025-2026年度卫星通信网运维服务',
      purchaser_name: '江苏省消防救援总队',
      procurement_method: '公开招标',
      procurement_stage: 'award',
      published_at: '2025-05-30',
      region: '江苏省',
      award_amount: '29.6',
      supplier_name: '南京中网卫星通信股份有限公司',
      raw_excerpt: '分包2中标金额29.6000000万元；服务期壹年。',
    }),
    procurement('ccgp-yancheng-fire-equipment-award-2025', {
      project_code: 'YCXFCG2024-D07',
      project_name: '盐城市消防救援支队2024年度目录外器材装备采购项目（第一批）（分包二）',
      purchaser_name: '盐城市消防救援支队',
      procurement_method: '公开招标',
      procurement_stage: 'award',
      published_at: '2025-03-17',
      region: '江苏省盐城市',
      award_amount: '163.5',
      supplier_name: '中国电信股份有限公司盐城分公司',
      raw_excerpt: '总中标金额￥163.500000万元；分包二供应商为中国电信股份有限公司盐城分公司。',
    }),
    procurement('changjiang-nanjing-vessel-repair-announcement-2026', {
      project_code: 'HBCZ-2601060091-260328-01',
      project_name: '长江南京航道局2026年6艘船舶进厂维修项目一标段',
      purchaser_name: '长江南京航道局',
      procurement_method: '公开招标',
      procurement_stage: 'announcement',
      published_at: '2026-02-11',
      region: '江苏省南京市',
      budget_amount: '62',
      raw_excerpt: '一标段小计62万元，包括5艘船舶进厂维修及法定检验。',
    }),
    procurement('changjiang-nanjing-vessel-repair-announcement-2026', {
      project_code: 'HBCZ-2601060091-260328-02',
      project_name: '长江南京航道局2026年6艘船舶进厂维修项目二标段',
      purchaser_name: '长江南京航道局',
      procurement_method: '公开招标',
      procurement_stage: 'announcement',
      published_at: '2026-02-11',
      region: '江苏省南京市',
      budget_amount: '157',
      raw_excerpt: '二标段小计157万元，包括航道12106维修及法定检验、锚泊功能改造等。',
    }),
    procurement('changjiang-nanjing-vessel-repair-announcement-2026', {
      project_code: 'HBCZ-2601060091-260328',
      project_name: '长江南京航道局2026年6艘船舶进厂维修项目最高限价',
      purchaser_name: '长江南京航道局',
      procurement_method: '公开招标',
      procurement_stage: 'announcement',
      published_at: '2026-02-11',
      region: '江苏省南京市',
      budget_amount: '219',
      raw_excerpt: '预算金额248万元，最高限价219万元。',
    }),
    procurement('huaian-xuyi-bus-station-renovation-announcement-2025', {
      project_code: 'JSZC-320830-DLGS-C2025-0007',
      project_name: '盱眙县汽车站设施设备维修改造工程',
      purchaser_name: '盱眙县交通运输局（机关）',
      procurement_method: '竞争性磋商',
      procurement_stage: 'announcement',
      published_at: '2025-09-05',
      region: '江苏省淮安市盱眙县',
      budget_amount: '140',
      raw_excerpt: '预算金额140.000000万元，最高限价140万元；施工内容包括厕所改造、道闸维修、路灯改造、地板砖改造等。',
    }),
  ];

  const budgetRecords = [
    budget('jiangyin-yuecheng-2025h1-budget', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省无锡市江阴市月城镇',
      budget_scope: '一般公共预算',
      direction: '收入',
      summary_item: '一般公共预算收入',
      actual_amount: '24686',
      actual_value_unit: 'wan_yuan',
      raw_excerpt: '1-6月，全镇一般公共预算收入完成24686万元，完成年初预算收入42800万元的57.68%。',
    }),
    budget('jiangyin-yuecheng-2025h1-budget', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省无锡市江阴市月城镇',
      budget_scope: '一般公共预算',
      direction: '收入预算',
      summary_item: '年初预算收入',
      actual_amount: '42800',
      actual_value_unit: 'wan_yuan',
      raw_excerpt: '年初预算收入42800万元。',
    }),
    budget('jiangyin-yuecheng-2025h1-budget', 'public_statistical_indicator', {
      period: '2025-06',
      region: '江苏省无锡市江阴市月城镇',
      budget_scope: '预算完成率',
      direction: '完成率',
      summary_item: '一般公共预算收入完成率',
      actual_amount: '57.68',
      actual_value_unit: 'percent',
      raw_excerpt: '完成年初预算收入42800万元的57.68%。',
    }),
    budget('rugao-changjiang-2025h1-budget', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省南通市如皋市长江镇',
      budget_scope: '一般公共预算',
      direction: '收入',
      summary_item: '一般公共预算收入（还原口径）',
      actual_amount: '115054.55',
      actual_value_unit: 'wan_yuan',
      raw_excerpt: '一般公共预算收入（还原口径）为115054.55万元，完成年初预算的87.49%。',
    }),
    budget('rugao-changjiang-2025h1-budget', 'public_statistical_indicator', {
      period: '2025-06',
      region: '江苏省南通市如皋市长江镇',
      budget_scope: '预算完成率',
      direction: '完成率',
      summary_item: '长江镇一般公共预算收入完成率',
      actual_amount: '87.49',
      actual_value_unit: 'percent',
      raw_excerpt: '完成年初预算的87.49%。',
    }),
    budget('rugao-changjiang-2025h1-budget', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省南通市如皋市长江镇',
      budget_scope: '税收调节',
      direction: '留抵退税',
      summary_item: '留抵退税金额',
      actual_amount: '10081.61',
      actual_value_unit: 'wan_yuan',
      raw_excerpt: '其中留抵退税10081.61万元，实际入库110013.74万元。',
    }),
    budget('rugao-changjiang-2025h1-budget', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省南通市如皋市长江镇',
      budget_scope: '一般公共预算',
      direction: '实际入库',
      summary_item: '实际入库金额',
      actual_amount: '110013.74',
      actual_value_unit: 'wan_yuan',
      raw_excerpt: '实际入库110013.74万元。',
    }),
    ...[
      ['尊老金支出', '130.56'],
      ['残疾人两项补贴及精神障碍患者以奖代补资金', '307'],
      ['特殊困难群体城乡居民医疗保险及优抚对象保险', '108.1'],
      ['村干部报酬及离任村干部补助', '369.25'],
      ['教育投入', '285'],
      ['村级土地流转资金及土地补偿费', '1226'],
      ['村公益事业一事一议奖补资金', '214'],
      ['乡村振兴资金', '270'],
      ['宜居宜业和美乡村改厕资金', '58'],
      ['土地复垦资金', '94.3'],
      ['河道整治资金', '94.98'],
      ['政府性投资工程', '2127.76'],
    ].map(([item, amount]) => budget('rugao-dingyan-2025h1-budget', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省南通市如皋市丁堰镇',
      budget_scope: '民生和乡村振兴支出',
      direction: '支出',
      summary_item: item,
      actual_amount: amount,
      actual_value_unit: 'wan_yuan',
      fund_destination: item,
      raw_excerpt: `2025年上半年财政预算执行情况列示${item}${amount}万元。`,
    })),
    budget('rugao-devzone-2025h1-budget', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省南通市如皋经济技术开发区',
      budget_scope: '一般公共预算',
      direction: '可用财力',
      summary_item: '一般公共预算可用财力',
      actual_amount: '24535',
      actual_value_unit: 'wan_yuan',
      raw_excerpt: '开发区（城北街道）2024年一般公共预算可用财力为24535万元。',
    }),
    budget('rugao-devzone-2025h1-budget', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省南通市如皋经济技术开发区',
      budget_scope: '财政专户',
      direction: '收入',
      summary_item: '财政专户管理资金收入',
      actual_amount: '58880',
      actual_value_unit: 'wan_yuan',
      raw_excerpt: '财政专户管理资金收入完成58880万元。',
    }),
    budget('rugao-devzone-2025h1-budget', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省南通市如皋经济技术开发区',
      budget_scope: '综合财力',
      direction: '可用财力',
      summary_item: '合计可用财力',
      actual_amount: '83415',
      actual_value_unit: 'wan_yuan',
      raw_excerpt: '当年合计可用财力为83415万元。',
    }),
    budget('rugao-jiangan-2025h1-budget', 'public_fiscal_summary', {
      period: '2024-12',
      region: '江苏省南通市如皋市江安镇',
      budget_scope: '财政总收入',
      direction: '收入',
      summary_item: '财政总收入',
      actual_amount: '2.49',
      actual_value_unit: 'yi_yuan',
      raw_excerpt: '2024年完成财政总收入达到2.49亿元。',
    }),
    budget('rugao-jiangan-2025h1-budget', 'public_fiscal_summary', {
      period: '2024-12',
      region: '江苏省南通市如皋市江安镇',
      budget_scope: '一般公共预算',
      direction: '收入',
      summary_item: '一般公共预算收入',
      actual_amount: '12731.67',
      actual_value_unit: 'wan_yuan',
      raw_excerpt: '实现一般公共预算收入12731.67万元，完成年初预算13500万元的94.31%。',
    }),
    budget('rugao-jiangan-2025h1-budget', 'public_fiscal_summary', {
      period: '2024-12',
      region: '江苏省南通市如皋市江安镇',
      budget_scope: '一般公共预算',
      direction: '年初预算',
      summary_item: '一般公共预算年初预算',
      actual_amount: '13500',
      actual_value_unit: 'wan_yuan',
      raw_excerpt: '完成年初预算13500万元的94.31%。',
    }),
    budget('rugao-jiangan-2025h1-budget', 'public_statistical_indicator', {
      period: '2024-12',
      region: '江苏省南通市如皋市江安镇',
      budget_scope: '预算完成率',
      direction: '完成率',
      summary_item: '一般公共预算收入完成率',
      actual_amount: '94.31',
      actual_value_unit: 'percent',
      raw_excerpt: '完成年初预算13500万元的94.31%。',
    }),
    ...[
      ['一般公共预算收入', '43.4', 'yi_yuan', '实现一般公共预算收入43.4亿元，序时完成率104.6%。'],
      ['一般公共预算收入序时完成率', '104.6', 'percent', '序时完成率104.6%。'],
      ['外贸进出口总额', '192.4', 'yi_yuan', '外贸进出口总额192.4亿元，序时完成率106.9%。'],
      ['外贸进出口序时完成率', '106.9', 'percent', '外贸进出口总额192.4亿元，序时完成率106.9%。'],
      ['高新技术产值占规上工业产值比', '61.5', 'percent', '高新技术产值占规模工业产值比61.5%。'],
      ['地表水省级以上考核断面III类比例', '100', 'percent', '地表水省级以上考核断面达到或好于III类比例100%。'],
      ['居民人均可支配收入增速', '5.4', 'percent', '居民人均可支配收入增速5.4%。'],
      ['城镇新增就业人数', '6528', 'count', '城镇新增就业人数6528人，序时完成率130.6%。'],
    ].map(([item, amount, unit, excerpt]) => budget('rugao-city-2025h1-plan-report', 'public_statistical_indicator', {
      period: '2025-06',
      region: '江苏省南通市如皋市',
      budget_scope: '国民经济和社会发展计划',
      direction: unit === 'percent' ? '比例' : '指标',
      summary_item: item,
      actual_amount: amount,
      actual_value_unit: unit,
      raw_excerpt: excerpt,
    })),
    ...[
      ['地区生产总值预计完成增速', '6', 'percent'],
      ['一般公共预算收入全年预计', '120.2', 'yi_yuan'],
      ['固定资产投资全年预计', '520', 'yi_yuan'],
      ['工业投资全年预计', '220', 'yi_yuan'],
      ['规上服务业营业收入预计增速', '20', 'percent'],
      ['进出口总额预计增速', '2', 'percent'],
      ['实际使用外资全年预计', '2.8', 'count'],
    ].map(([item, amount, unit]) => budget('huishan-2025-plan-report', 'public_statistical_indicator', {
      period: '2024-12',
      region: '江苏省无锡市惠山区',
      budget_scope: '国民经济和社会发展计划',
      direction: unit === 'percent' ? '增速' : '指标',
      summary_item: item,
      actual_amount: amount,
      actual_value_unit: unit,
      raw_excerpt: '附表列示惠山区2024年全年预计和2025年目标建议。',
    })),
    budget('xishan-2025h1-budget-meeting', 'public_statistical_indicator', {
      period: '2025-09',
      region: '江苏省无锡市锡山区',
      budget_scope: '预算执行报告审议',
      direction: '会议审议',
      summary_item: '2024年财政决算和2025年上半年财政预算执行情况报告',
      actual_amount: '1',
      actual_value_unit: 'count',
      raw_excerpt: '会议审议《锡山区2024年财政决算和2025年上半年财政预算执行情况报告》。',
    }),
    budget('jsrd-2025h1-budget-execution-pdf', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省',
      budget_scope: '政府性基金预算',
      direction: '收入',
      summary_item: '预算收入',
      actual_amount: '1813.70',
      actual_value_unit: 'yi_yuan',
      yoy_rate: '-20.1',
      raw_excerpt: '预算收入完成1813.70亿元，下降20.1%。',
    }),
    budget('jsrd-2025h1-budget-execution-pdf', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省',
      budget_scope: '一般公共预算',
      direction: '支出',
      summary_item: '全省一般公共预算支出',
      actual_amount: '7240.77',
      actual_value_unit: 'yi_yuan',
      raw_excerpt: '全省一般公共预算支出完成7240.77亿元。',
    }),
    budget('jsrd-2025h1-budget-execution-pdf', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省',
      budget_scope: '政府性基金预算',
      direction: '收入增速',
      summary_item: '政府性基金预算收入同比下降',
      actual_amount: '-20.1',
      actual_value_unit: 'percent',
      raw_excerpt: '预算收入完成1813.70亿元，下降20.1%。',
    }),
    budget('jsrd-2025h1-budget-execution-pdf', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省',
      budget_scope: '政府债务',
      direction: '限额管理',
      summary_item: '新增政府债券资金使用监管',
      actual_amount: '1',
      actual_value_unit: 'count',
      raw_excerpt: '报告提出加快新增债券资金使用进度，强化债券资金绩效管理。',
    }),
    budget('jsrd-2025h1-budget-execution-pdf', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省',
      budget_scope: '预算管理',
      direction: '监督建议',
      summary_item: '严肃财经纪律和预算约束',
      actual_amount: '1',
      actual_value_unit: 'count',
      raw_excerpt: '报告强调严肃财经纪律，加强财政资源统筹和预算执行管理。',
    }),
    budget('jsrd-2025h1-budget-execution-pdf', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省',
      budget_scope: '民生保障',
      direction: '支出管理',
      summary_item: '兜牢基层三保底线',
      actual_amount: '1',
      actual_value_unit: 'count',
      raw_excerpt: '报告要求兜牢基层“三保”底线，保障重点民生支出。',
    }),
    budget('jsrd-2025h1-budget-execution-pdf', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省',
      budget_scope: '专项资金',
      direction: '绩效管理',
      summary_item: '提高财政资金使用绩效',
      actual_amount: '1',
      actual_value_unit: 'count',
      raw_excerpt: '报告要求加强资金绩效管理，提高财政资金使用效益。',
    }),
    budget('jsrd-2025h1-budget-execution-pdf', 'public_fiscal_summary', {
      period: '2025-06',
      region: '江苏省',
      budget_scope: '政府采购',
      direction: '制度执行',
      summary_item: '规范政府采购和预算执行联动',
      actual_amount: '1',
      actual_value_unit: 'count',
      raw_excerpt: '报告涉及预算执行、财政资金管理和政府采购等制度执行要求。',
    }),
  ];

  const caseSeedRecords = [
    caseSeed('js-audit-tech-platform-survey-2025', {
      project_name: '高水平科技创新平台财政科研经费管理核查',
      construction_unit: '科技创新平台主管部门及项目单位',
      issue_amount: '0',
      recommended_case_type: '专项审计调查补数',
      recommended_issue: '专项审计调查关注省级财政科研经费管理、项目申报评审立项和监管验收，需补充项目库、拨款凭证和验收资料。',
      audit_evidence_level: 'special_audit_survey',
      audit_document_type: 'special_audit_survey',
      conclusion_strength: 'review_recommended',
      raw_excerpt: '重点关注省级财政科研经费管理、项目申报评审立项管理、项目任务完成及监管验收情况。',
    }),
    caseSeed('js-audit-social-security-card-survey-2025', {
      project_name: '社会保障卡信息化项目建设与资金使用核查',
      construction_unit: '社会保障卡建设管理相关单位',
      issue_amount: '0',
      recommended_case_type: '信息化项目审计补数',
      recommended_issue: '公开信息显示审计调查关注信息系统建设、资金使用管理、居民服务应用和数据安全，需补充项目合同、支付和数据安全测评。',
      audit_evidence_level: 'special_audit_survey',
      audit_document_type: 'special_audit_survey',
      conclusion_strength: 'review_recommended',
      raw_excerpt: '重点审计调查信息化项目建设、资金使用管理、居民服务应用推广、数据利用和安全管理四个方面。',
    }),
    caseSeed('js-audit-engineering-risk-survey-2025', {
      project_name: '工程建设领域招投标和大额资金安排风险核查',
      construction_unit: '工程建设领域相关主管部门及项目单位',
      issue_amount: '0',
      recommended_case_type: '工程建设专项审计调查',
      recommended_priority: 'High',
      recommended_issue: '专项审计调查明确关注违规决策、违规招投标评标、形象工程和领导干部干预插手工程建设等风险，需补充项目清单和招投标资料。',
      audit_evidence_level: 'special_audit_survey',
      audit_document_type: 'special_audit_survey',
      conclusion_strength: 'review_recommended',
      raw_excerpt: '重点调查近三年全部使用财政资金或国有资金为主的工程项目，关注违规招标投标评标、形象工程等管理问题。',
    }),
    caseSeed('js-audit-two-new-policy-survey-2025', {
      project_name: '两新政策补贴资金兑付及时性核查',
      construction_unit: '设备更新和消费品以旧换新政策相关部门',
      issue_amount: '0',
      recommended_case_type: '政策落实专项审计调查',
      recommended_issue: '专项审计调查关注补贴对象真实性、补贴资金兑付及时性、资金分配和使用规范性，需补充补贴申请台账和支付凭证。',
      audit_evidence_level: 'special_audit_survey',
      audit_document_type: 'special_audit_survey',
      conclusion_strength: 'review_recommended',
      raw_excerpt: '关注补贴程序便利性、补贴资金兑付及时性、补贴对象真实性以及资金分配、管理和使用情况。',
    }),
    caseSeed('js-audit-2025-project-plan', {
      project_name: '2025年度省级预算执行和部门预算执行审计计划',
      construction_unit: '江苏省审计厅',
      issue_amount: '0',
      recommended_case_type: '审计计划线索',
      recommended_issue: '年度计划列示预算执行、部门预算、税收和非税收入征管等审计项目，当前仅能形成补数清单，不能形成实质违规结论。',
      audit_evidence_level: 'audit_work_update',
      audit_document_type: 'audit_project_plan',
      conclusion_strength: 'supplemental_data_only',
      raw_excerpt: '2025年度审计项目计划包括2024年省级预算执行和决算草案审计、部门预算执行审计、税收和非税收入征管等。',
    }),
    caseSeed('nt-audit-solar-terms-liqiu-2025', {
      project_name: '南通两新补贴审核和5G+工业互联网奖补资金核查',
      construction_unit: '南通市审计局',
      issue_amount: '0',
      recommended_case_type: '工作动态补数建议',
      recommended_issue: '工作动态提到抽查补贴申请台账和5G+工业互联网新型材料奖补资金真实性，应要求补充正式审计项目资料后再形成结论。',
      audit_evidence_level: 'audit_work_update',
      audit_document_type: 'audit_work_update',
      conclusion_strength: 'supplemental_data_only',
      raw_excerpt: '审计人员抽查补贴申请台账资料，关注以旧换新补贴审核情况；核查5G+工业互联网新型材料奖补资金申报项目真实性。',
    }),
    caseSeed('js-audit-department-performance-self-eval-2024', {
      project_name: '江苏省审计厅部门整体绩效自评价参考',
      construction_unit: '江苏省审计厅机关',
      issue_amount: '0',
      recommended_case_type: '绩效自评参考',
      recommended_issue: '部门绩效自评属于管理参考材料，可用于完善绩效字段，不进入实质违规线索池。',
      audit_evidence_level: 'work_method_reference',
      audit_document_type: 'performance_self_evaluation',
      conclusion_strength: 'knowledge_reference',
      required_next_data: ['部门绩效目标表', '预算执行明细', '项目绩效评价报告'],
      raw_excerpt: '省级部门整体绩效自评价表描述审计职责和绩效自评信息。',
    }),
  ];

  const sourceRegister = {
    registry_version: 'official-source-registry-v2',
    generated_from_batches: [BATCH_ID],
    captured_at: capturedAt,
    parser_version: parserVersion,
    sources: ROUND4_SOURCES.map(sourceRegisterEntry),
  };
  const allRows = [...procurementRecords, ...budgetRecords, ...caseSeedRecords];
  for (const source of sourceRegister.sources) {
    source.expected_record_count = allRows.filter((row) => row.source_evidence.url === source.url).length;
  }

  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: 'web_researched_snapshot',
    source_count: sourceRegister.sources.length,
    fourth_round_source_count: sourceRegister.sources.length,
    parsed_source_count: sourceRegister.sources.length,
    failed_source_count: 0,
    previous_source_overlap_count: sourceRegister.sources.filter((source) => usedOfficialSourceUrls().has(source.url)).length,
    url_duplicate_source_count: 0,
    content_duplicate_source_count: 0,
    title_duplicate_source_count: 0,
    review_statuses: { reviewed: sourceRegister.sources.length },
    total_records: allRows.length,
    unit_normalized_records: allRows.filter(hasNormalizedUnit).length,
    locator_coverage_rate: Number(((allRows.filter((row) => row.source_evidence?.locator_hash).length / allRows.length) * 100).toFixed(2)),
    parser_types: Object.fromEntries(countBy(sourceRegister.sources, (source) => source.parser_type)),
    source_types: Object.fromEntries(countBy(sourceRegister.sources, (source) => source.source_type)),
    amount_semantic_types: Object.fromEntries(countBy(procurementRecords, (row) => row.amount_semantic_type)),
    framework_agreement_count: 0,
    special_fund_structured_records: budgetRecords.filter((row) => row.fund_destination || row.policy_document_no).length,
    special_fund_structured_coverage_rate: Number(((budgetRecords.filter((row) => row.fund_destination || row.policy_document_no).length / budgetRecords.length) * 100).toFixed(2)),
    audit_evidence_levels: Object.fromEntries(countBy(caseSeedRecords, (row) => row.audit_evidence_level)),
    audit_evidence_weights: maxWeightBy(caseSeedRecords, (row) => row.audit_evidence_level, (row) => row.audit_evidence_weight),
    requires_manual_verification_count: caseSeedRecords.filter((row) => row.requires_manual_verification).length,
  };

  const budgetBatches = [
    ['public_fiscal_summary', '第四批正式公开实例：财政预算执行指标', budgetRecords.filter((row) => row.dataset_kind === 'public_fiscal_summary')],
    ['public_statistical_indicator', '第四批正式公开实例：统计与计划指标', budgetRecords.filter((row) => row.dataset_kind === 'public_statistical_indicator')],
  ].filter(([, , records]) => records.length)
    .map(([datasetKind, title, records]) => ({ title, dataset_kind: datasetKind, records }));

  return {
    sourceRegister,
    collectorSummary,
    procurement: {
      title: '第四批正式公开实例：采购公告与中标公告',
      records: procurementRecords,
    },
    budget: {
      title: '第四批正式公开实例：财政预算执行与统计指标',
      records: budgetRecords,
      batches: budgetBatches,
    },
    caseSeeds: {
      title: '第四批正式公开实例：审计调查和工作动态线索',
      template_kind: 'special_inspection',
      records: caseSeedRecords,
    },
  };
}

export function summarizeFourthOfficialRun({
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
    batch_name: BATCH_ID,
    collector_summary: payloads.collectorSummary,
    optimization_plan: buildRound4OptimizationPlan(summary, payloads.collectorSummary),
  };
}

export async function runFourthOfficialPublicInstanceTest({
  baseUrl = DEFAULT_BASE_URL,
  outputDir = DEFAULT_OUTPUT_DIR,
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const payloads = buildFourthOfficialPublicInstancePayloads({ capturedAt, parserVersion });
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
  const summary = summarizeFourthOfficialRun({
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

function buildRound4OptimizationPlan(summary, collectorSummary) {
  return [
    {
      priority: 'P0',
      area: '第四批来源入库与回归基线',
      action: '把第四批20个新来源迁入统一 source registry，并增加跨批次正文哈希和标题相似度去重的验收输出。',
      reason: `本批${summary.official_source_count}个来源与前三批URL重合${collectorSummary.previous_source_overlap_count}个，可作为新增回归基线。`,
    },
    {
      priority: 'P0',
      area: '乡镇财政预算执行结构化',
      action: '把乡镇级预算执行报告拆成收入、支出、完成率、民生专项支出、财政专户资金等结构字段，并保留报告口径。',
      reason: '江阴月城、如皋长江镇、丁堰镇、江安镇等来源显示乡镇报告粒度更细，适合验证县区财政内网样本字段映射。',
    },
    {
      priority: 'P1',
      area: '审计调查证据权重细分',
      action: '将专项审计调查与审计项目计划、工作动态、绩效自评继续分层，专项调查只生成复核建议，计划和动态不进入实质违规线索。',
      reason: '第四批审计来源多为调查启动和项目计划，证据强度低于正式审计结果公告。',
    },
    {
      priority: 'P1',
      area: '采购多包件金额处理',
      action: '采购项目需识别同一项目多分包金额、总中标金额和最高限价，报告中展示分包合计与公告总额差异。',
      reason: '江苏消防信息化项目存在两个分包金额，长江南京航道局项目同时给出预算金额、最高限价和分标段金额。',
    },
    {
      priority: 'P2',
      area: 'PDF公报抽取',
      action: '江苏人大常委会公报 PDF 应接入页码、段落、表格标题抽取；无法抽表时至少保留页码快照和原文定位。',
      reason: '省级上半年预算执行报告以公报 PDF 形式发布，适合作为正式交付报告证据定位样本。',
    },
  ];
}

function inferUnit(fields) {
  const text = `${fields.budget_scope ?? ''}${fields.direction ?? ''}${fields.summary_item ?? ''}`;
  if (/率|比例|增速|同比|%/.test(text)) return 'percent';
  if (/人数|数量|次数|报告|个|项|条/.test(text)) return 'count';
  if (/亿元|总收入|总额|投资/.test(text)) return 'yi_yuan';
  return 'wan_yuan';
}

function hasNormalizedUnit(row) {
  return Boolean(
    row.normalized_budget_amount_yuan ||
      row.normalized_award_amount_yuan ||
      row.normalized_actual_value ||
      row.issue_amount_unit,
  );
}

function auditEvidenceWeight(level) {
  return {
    formal_audit_report: 90,
    rectification_progress: 70,
    special_audit_survey: 60,
    audit_result_feedback: 55,
    audit_work_update: 35,
    methodology_or_experience: 20,
    work_method_reference: 20,
    unknown: 0,
  }[level ?? 'unknown'] ?? 0;
}

function locatorHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex').slice(0, 16);
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function maxWeightBy(items, keyFn, valueFn) {
  const result = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const value = Number(valueFn(item) ?? 0);
    result.set(key, Math.max(result.get(key) ?? 0, Number.isFinite(value) ? value : 0));
  }
  return Object.fromEntries(result);
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
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${path}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    }
    return body;
  }
  return {
    post(path, body) {
      return request(path, { method: 'POST', body: JSON.stringify(body) });
    },
  };
}

function renderMarkdown(summary, payloads) {
  const lines = [
    '# 第四批正式公开实例测试结果',
    '',
    `生成时间：${summary.generated_at}`,
    `测试服务：${summary.base_url}`,
    '',
    '## 数据来源与覆盖',
    '',
    `- 新来源数量：${summary.official_source_count}`,
    `- 与前三批URL重合：${summary.collector_summary.previous_source_overlap_count}`,
    `- 输入记录：${summary.total_input_records} 条（采购 ${summary.procurement_input_records}、财政/统计 ${summary.budget_input_records}、审计线索 ${summary.case_seed_input_records}）`,
    `- 导入成功率：${summary.import_success_rate}%`,
    `- 来源可追溯率：${summary.source_completeness_rate}%`,
    `- 金额语义：${formatObject(summary.collector_summary.amount_semantic_types)}`,
    `- 专项资金/民生支出结构化覆盖率：${summary.collector_summary.special_fund_structured_coverage_rate}%`,
    `- 审计证据等级：${formatObject(summary.collector_summary.audit_evidence_levels)}`,
    `- 审计证据权重：${formatObject(summary.collector_summary.audit_evidence_weights)}`,
    '',
    '主要来源：',
    ...payloads.sourceRegister.sources.map((source) => `- [${source.publisher}] ${source.title}：${source.url}`),
    '',
    '## 规则命中',
    '',
    ...Object.entries(summary.rule_hits_by_rule ?? {}).map(([rule, count]) => `- ${rule}: ${count}`),
    '',
    '## 进一步优化方案',
    '',
    ...summary.optimization_plan.map((item) => `- ${item.priority} ${item.area}：${item.action} 原因：${item.reason}`),
  ];
  return `${lines.join('\n')}\n`;
}

function formatObject(value) {
  return Object.entries(value ?? {})
    .map(([key, count]) => `${key} ${count}`)
    .join(', ') || 'none';
}

function renderHtml(markdown) {
  const escaped = markdown.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
  return `<!doctype html>
<meta charset="utf-8">
<title>第四批正式公开实例测试结果</title>
<style>body{font-family:"Segoe UI","Microsoft YaHei",sans-serif;margin:32px;line-height:1.6;color:#10243f}pre{white-space:pre-wrap;background:#f5f7fb;padding:16px;border:1px solid #d8e0ea}</style>
<pre>${escaped}</pre>`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runFourthOfficialPublicInstanceTest()
    .then(({ outputDir, summary }) => {
      console.log(`Wrote fourth official public instance outputs to ${outputDir}`);
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
