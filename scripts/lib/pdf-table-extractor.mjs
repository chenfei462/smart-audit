import { createHash } from 'node:crypto';

function isFinalAccountHeaderLine(line) {
  return /(科目编码|科目名称|金额|指标名称|指标值|单位)/.test(line) && !/\d/.test(line.replace(/\d{3,}/g, ''));
}

const BUDGET_TABLE_TITLES = [
  '收入总表',
  '支出总表',
  '财政拨款收支总表',
  '一般公共预算支出表',
  '政府性基金预算支出表',
  '“三公”经费预算表',
  '"三公"经费预算表',
  '三公经费预算表',
];

const FINAL_ACCOUNT_TABLES = [
  { title: '收入支出决算总表', type: 'final_income_expense' },
  { title: '财政拨款收入支出决算总表', type: 'fiscal_appropriation_final' },
  { title: '项目支出绩效自评价表', type: 'performance_self_evaluation' },
  { title: '项目支出绩效目标表', type: 'performance_self_evaluation' },
];

export function locatorHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex').slice(0, 16);
}

export function extractBudgetPdfTablesFromPages({ source, pages }) {
  const tables = [];
  const records = [];
  const qualityChecks = [];

  for (const page of pages) {
    const lines = String(page.text ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let index = 0; index < lines.length; index += 1) {
      const tableTitle = matchBudgetTableTitle(lines[index]);
      if (!tableTitle) continue;

      const tableLines = [];
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        if (matchBudgetTableTitle(lines[cursor])) break;
        tableLines.push(lines[cursor]);
      }

      const table = {
        source_id: source.source_id ?? source.id,
        source_title: source.title,
        source_url: source.url,
        page_number: page.pageNumber,
        table_title: tableTitle,
        row_count: 0,
        locator_hash: locatorHash(`${source.url}|${page.pageNumber}|${tableTitle}`),
      };
      tables.push(table);

      const dataRows = tableLines
        .filter((line) => !isHeaderLine(line))
        .map((line, rowIndex) => parseBudgetTableLine(line, {
          source,
          pageNumber: page.pageNumber,
          tableTitle,
          rowIndex: rowIndex + 1,
        }))
        .filter(Boolean);

      if (!dataRows.length) {
        qualityChecks.push({
          code: emptyTableCode(tableLines),
          severity: 'warning',
          message: `${tableTitle} has no extractable numeric rows`,
          source_id: table.source_id,
          page_number: page.pageNumber,
          table_title: tableTitle,
        });
      }

      table.row_count = dataRows.length;
      records.push(...dataRows);
    }
  }

  return {
    source,
    tables,
    records,
    quality_checks: qualityChecks,
  };
}

export function extractDepartmentFinalAccountTablesFromPages({ source, pages }) {
  const tables = [];
  const records = [];
  const qualityChecks = [];

  for (const page of pages) {
    const lines = String(page.text ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (let index = 0; index < lines.length; index += 1) {
      const definition = matchFinalAccountTable(lines[index]);
      if (!definition) continue;

      const tableLines = [];
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        if (matchFinalAccountTable(lines[cursor])) break;
        tableLines.push(lines[cursor]);
      }

      const table = {
        source_id: source.source_id ?? source.id,
        source_title: source.title,
        source_url: source.url,
        page_number: page.pageNumber,
        table_title: definition.title,
        department_final_account_table_type: definition.type,
        row_count: 0,
        locator_hash: locatorHash(`${source.url}|${page.pageNumber}|${definition.title}`),
      };
      tables.push(table);

      const dataRows = tableLines
        .filter((line) => !isFinalAccountHeaderLine(line))
        .map((line, rowIndex) => parseFinalAccountLine(line, {
          source,
          pageNumber: page.pageNumber,
          tableTitle: definition.title,
          tableType: definition.type,
          rowIndex: rowIndex + 1,
        }))
        .filter(Boolean);

      if (!dataRows.length) {
        qualityChecks.push({
          code: emptyTableCode(tableLines),
          severity: 'warning',
          message: `${definition.title} has no extractable final-account rows`,
          source_id: table.source_id,
          page_number: page.pageNumber,
          table_title: definition.title,
        });
      }

      table.row_count = dataRows.length;
      records.push(...dataRows);
    }
  }

  return {
    source,
    tables,
    records,
    quality_checks: qualityChecks,
  };
}

function matchBudgetTableTitle(line) {
  return BUDGET_TABLE_TITLES.find((title) => normalizeTitle(line).includes(normalizeTitle(title))) ?? null;
}

function matchFinalAccountTable(line) {
  return [...FINAL_ACCOUNT_TABLES]
    .sort((left, right) => normalizeTitle(right.title).length - normalizeTitle(left.title).length)
    .find((definition) =>
    normalizeTitle(line).includes(normalizeTitle(definition.title))
  ) ?? null;
}

function parseBudgetTableLine(line, { source, pageNumber, tableTitle, rowIndex }) {
  if (isEmptyTableLine(line)) return null;
  const amountMatch = line.replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)\s*$/);
  if (!amountMatch) return null;
  const amount = amountMatch[1];
  const beforeAmount = line.slice(0, amountMatch.index).trim();
  const parts = beforeAmount.split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const subjectCode = /^\d{3,}$/.test(parts[0]) ? parts.shift() : null;
  const subjectName = parts.join(' ') || beforeAmount;
  const rawExcerpt = `${tableTitle} ${line}`;
  return {
    source_id: source.source_id ?? source.id,
    source_title: source.title,
    source_url: source.url,
    page_number: pageNumber,
    table_title: tableTitle,
    row_index: rowIndex,
    column_name: '金额',
    subject_code: subjectCode,
    subject_name: subjectName,
    amount,
    raw_excerpt: rawExcerpt,
    locator_hash: locatorHash(`${source.url}|${pageNumber}|${tableTitle}|${rowIndex}|${line}`),
  };
}

function parseFinalAccountLine(line, { source, pageNumber, tableTitle, tableType, rowIndex }) {
  if (isEmptyTableLine(line)) return null;
  if (tableType === 'performance_self_evaluation') {
    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return null;
    const unit = parts.length >= 3 ? parts.pop() : '';
    const value = parts.pop();
    const name = parts.join(' ');
    if (!name || !value || !/^-?\d+(?:\.\d+)?%?$/.test(value.replace(/,/g, ''))) return null;
    const rawExcerpt = `${tableTitle} ${line}`;
    return {
      source_id: source.source_id ?? source.id,
      source_title: source.title,
      source_url: source.url,
      page_number: pageNumber,
      table_title: tableTitle,
      department_final_account_table_type: tableType,
      row_index: rowIndex,
      column_name: 'indicator value',
      subject_code: null,
      subject_name: null,
      amount: null,
      performance_indicator_name: name,
      performance_indicator_value: value.replace(/,/g, '').replace(/%$/, ''),
      performance_indicator_unit: unit || (value.endsWith('%') ? 'percent' : ''),
      raw_excerpt: rawExcerpt,
      locator_hash: locatorHash(`${source.url}|${pageNumber}|${tableTitle}|${rowIndex}|${line}`),
    };
  }
  const amountMatch = line.replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)\s*$/);
  if (!amountMatch) return null;
  const amount = amountMatch[1];
  const beforeAmount = line.slice(0, amountMatch.index).trim();
  const parts = beforeAmount.split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const subjectCode = /^\d{3,}$/.test(parts[0]) ? parts.shift() : null;
  const subjectName = parts.join(' ') || beforeAmount;
  const rawExcerpt = `${tableTitle} ${line}`;
  return {
    source_id: source.source_id ?? source.id,
    source_title: source.title,
    source_url: source.url,
    page_number: pageNumber,
    table_title: tableTitle,
    department_final_account_table_type: tableType,
    row_index: rowIndex,
    column_name: 'amount',
    subject_code: subjectCode,
    subject_name: subjectName,
    amount,
    performance_indicator_name: null,
    performance_indicator_value: null,
    performance_indicator_unit: null,
    raw_excerpt: rawExcerpt,
    locator_hash: locatorHash(`${source.url}|${pageNumber}|${tableTitle}|${rowIndex}|${line}`),
  };
}

function isHeaderLine(line) {
  return /科目编码|科目名称|金额|单位/.test(line) && !/\d/.test(line.replace(/\d{3,}/g, ''));
}

function isEmptyTableLine(line) {
  return /无数据|空表|不适用|本表无/.test(line);
}

function emptyTableCode(lines) {
  return lines.some(isEmptyTableLine) ? 'empty_table_detected' : 'not_applicable_table';
}

function normalizeTitle(value) {
  return String(value ?? '').replace(/\s+/g, '').replace(/[()（）]/g, '');
}
