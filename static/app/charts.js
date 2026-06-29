import { $ } from './services.js';
import { UI_COPY } from './config.js';

const RISK_SERIES = [
  { key: 'Critical', label: '极高', color: '#c0392b' },
  { key: 'High', label: '高', color: '#e67e22' },
  { key: 'Medium', label: '中', color: '#c49a3c' },
  { key: 'Low', label: '低', color: '#27724b' },
];

const QUALITY_SERIES = [
  { key: 'Error', label: '错误', color: '#c0392b' },
  { key: 'Warning', label: '警告', color: '#c49a3c' },
  { key: 'Info', label: '提示', color: '#2d4a7a' },
];

const PALETTE = ['#1a2a4a', '#c49a3c', '#27724b', '#2d4a7a', '#c0392b', '#5a6577'];

function prepareCanvas(id) {
  const canvas = $(id);
  if (!canvas) return null;
  const width = canvas.clientWidth || canvas.width || 360;
  const height = canvas.clientHeight || canvas.height || 220;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function drawEmptyChart(id, message) {
  const canvas = prepareCanvas(id);
  if (!canvas) return;
  const { ctx, width, height } = canvas;
  ctx.fillStyle = '#5a6577';
  ctx.font = '14px Segoe UI';
  ctx.textAlign = 'center';
  ctx.fillText(message, width / 2, height / 2);
}

function countBy(items, keyGetter) {
  const counts = new Map();
  for (const item of items || []) {
    const key = keyGetter(item) || 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function fixedSeries(definitions, items, keyGetter, labelGetter) {
  const counts = countBy(items, keyGetter);
  return definitions.map((definition) => ({
    ...definition,
    label: labelGetter ? labelGetter(definition.key) : definition.label,
    value: counts.get(definition.key) || 0,
  }));
}

function seriesFromCounts(counts, labelGetter, colorOffset = 0) {
  return Array.from(counts.entries())
    .map(([key, value], index) => ({
      key,
      label: labelGetter(key),
      value,
      color: PALETTE[(index + colorOffset) % PALETTE.length],
    }))
    .sort((left, right) => (
      right.value - left.value
      || String(left.label).localeCompare(String(right.label), 'zh-Hans-CN')
    ));
}

function qualityReportFromTask(task) {
  return task?.detail?.payload?.quality_report
    || task?.detail?.quality_report
    || task?.quality_report
    || null;
}

export function aggregateOverviewCharts(tasks = [], labels = {}) {
  const taskKindLabel = labels.taskKindLabel || ((value) => value || '未知任务');
  const sourceKindLabel = labels.sourceKindLabel || ((value) => value || '未知来源');
  const riskDisplay = labels.riskDisplay || ((value) => value || '未知风险');
  return {
    total: tasks.length,
    risk: fixedSeries(RISK_SERIES, tasks, (task) => task.risk_level, riskDisplay),
    taskKinds: seriesFromCounts(countBy(tasks, (task) => task.task_kind), taskKindLabel),
    sources: seriesFromCounts(countBy(tasks, (task) => task.source_kind), sourceKindLabel, 2),
  };
}

export function aggregateTaskResultCharts(task = null, labels = {}) {
  const riskDisplay = labels.riskDisplay || ((value) => value || '未知风险');
  const findings = Array.isArray(task?.findings) ? task.findings : [];
  const qualityReport = qualityReportFromTask(task);
  const qualityChecks = Array.isArray(qualityReport?.checks) ? qualityReport.checks : [];
  return {
    findingRisk: fixedSeries(RISK_SERIES, findings, (finding) => finding.risk_level, riskDisplay),
    ruleCategories: seriesFromCounts(
      countBy(findings, (finding) => finding.rule_category || '未分类规则'),
      (value) => value,
      1,
    ),
    qualityChecks: fixedSeries(
      QUALITY_SERIES,
      qualityChecks,
      (check) => check.severity || check.level || 'Info',
    ),
  };
}

function drawDonutSeries(id, series, emptyMessage) {
  const total = (series || []).reduce((sum, item) => sum + item.value, 0);
  if (!total) {
    drawEmptyChart(id, emptyMessage);
    return;
  }

  const canvas = prepareCanvas(id);
  if (!canvas) return;
  const { ctx, width, height } = canvas;
  const centerX = width * 0.31;
  const centerY = height * 0.48;
  const radius = Math.min(width, height) * 0.25;
  const innerRadius = radius * 0.58;
  let startAngle = -Math.PI / 2;

  for (const item of series) {
    if (!item.value) continue;
    const angle = item.value / total * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    startAngle += angle;
  }

  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#1a2a4a';
  ctx.font = 'bold 17px Segoe UI';
  ctx.textAlign = 'center';
  ctx.fillText(String(total), centerX, centerY + 4);
  ctx.font = '12px Segoe UI';
  ctx.fillText('合计', centerX, centerY + 23);

  series.forEach((item, index) => {
    const y = 28 + index * 24;
    ctx.fillStyle = item.color;
    ctx.fillRect(width * 0.58, y, 11, 11);
    ctx.fillStyle = '#1a2a4a';
    ctx.textAlign = 'left';
    ctx.font = '12px Segoe UI';
    ctx.fillText(`${item.label}: ${item.value}`, width * 0.58 + 17, y + 10);
  });
}

function drawBarSeries(id, series, emptyMessage) {
  const maxValue = Math.max(0, ...(series || []).map((item) => item.value));
  if (!maxValue) {
    drawEmptyChart(id, emptyMessage);
    return;
  }

  const canvas = prepareCanvas(id);
  if (!canvas) return;
  const { ctx, width, height } = canvas;
  const rows = (series || []).slice(0, 6);
  const chartLeft = 88;
  const chartRight = width - 22;
  const rowHeight = Math.max(22, Math.min(34, (height - 26) / rows.length));

  rows.forEach((item, index) => {
    const y = 18 + index * rowHeight;
    const barWidth = Math.max(3, (chartRight - chartLeft) * item.value / maxValue);
    ctx.fillStyle = '#5a6577';
    ctx.font = '12px Segoe UI';
    ctx.textAlign = 'right';
    const label = String(item.label || item.key || '-');
    ctx.fillText(label.length > 8 ? `${label.slice(0, 8)}...` : label, chartLeft - 10, y + 13);
    ctx.fillStyle = '#e6e9ef';
    ctx.fillRect(chartLeft, y, chartRight - chartLeft, 14);
    ctx.fillStyle = item.color || PALETTE[index % PALETTE.length];
    ctx.fillRect(chartLeft, y, barWidth, 14);
    ctx.fillStyle = '#1a2a4a';
    ctx.textAlign = 'left';
    ctx.fillText(String(item.value), chartLeft + barWidth + 6, y + 13);
  });
}

export function renderOverviewCharts(tasks = [], labels = {}) {
  const data = aggregateOverviewCharts(tasks, labels);
  drawDonutSeries('overviewRiskChart', data.risk, '暂无风险分布');
  drawBarSeries('overviewTaskKindChart', data.taskKinds, '暂无任务类型分布');
  drawBarSeries('overviewSourceChart', data.sources, '暂无来源分布');
}

export function renderTaskResultCharts(task = null, labels = {}) {
  const data = aggregateTaskResultCharts(task, labels);
  drawDonutSeries('taskFindingRiskChart', data.findingRisk, '暂无规则风险分布');
  drawBarSeries('taskRuleCategoryChart', data.ruleCategories, '暂无规则类别分布');
  drawBarSeries('taskQualityChart', data.qualityChecks, '暂无导入质量问题');
}

export function drawRiskChart(counts) {
  const total = counts.Critical + counts.High + counts.Medium + counts.Low;
  if (!total) {
    drawEmptyChart('severityChart', UI_COPY.emptyRiskChart);
    return;
  }

  const canvas = prepareCanvas('severityChart');
  if (!canvas) return;
  const { ctx, width, height } = canvas;
  const centerX = width * 0.33;
  const centerY = height * 0.48;
  const radius = Math.min(width, height) * 0.26;
  const innerRadius = radius * 0.58;
  const segments = [
    { label: '极高', value: counts.Critical, color: '#c0392b' },
    { label: '高', value: counts.High, color: '#e67e22' },
    { label: '中', value: counts.Medium, color: '#c49a3c' },
    { label: '低', value: counts.Low, color: '#27724b' },
  ];

  let startAngle = -Math.PI / 2;
  for (const segment of segments) {
    if (!segment.value) continue;
    const angle = segment.value / total * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = segment.color;
    ctx.fill();
    startAngle += angle;
  }

  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#1a2a4a';
  ctx.font = 'bold 18px Segoe UI';
  ctx.textAlign = 'center';
  ctx.fillText(String(total), centerX, centerY + 4);
  ctx.font = '12px Segoe UI';
  ctx.fillText('问题总数', centerX, centerY + 24);

  segments.forEach((segment, index) => {
    const y = 34 + index * 28;
    ctx.fillStyle = segment.color;
    ctx.fillRect(width * 0.60, y, 12, 12);
    ctx.fillStyle = '#1a2a4a';
    ctx.textAlign = 'left';
    ctx.fillText(`${segment.label}: ${segment.value}`, width * 0.60 + 18, y + 11);
  });
}

export function drawWorkflowChart(counts) {
  const values = [
    { label: 'Open', value: counts.Open, color: '#c0392b' },
    { label: 'InReview', value: counts.InReview, color: '#c49a3c' },
    { label: 'Resolved', value: counts.Resolved, color: '#2d4a7a' },
    { label: 'Closed', value: counts.Closed, color: '#27724b' },
  ];
  const maxValue = Math.max(...values.map((item) => item.value));
  if (!maxValue) {
    drawEmptyChart('workflowChart', UI_COPY.emptyWorkflowChart);
    return;
  }

  const canvas = prepareCanvas('workflowChart');
  if (!canvas) return;
  const { ctx, width, height } = canvas;
  const chartLeft = 28;
  const chartBottom = height - 36;
  const barWidth = 42;
  const gap = 28;

  ctx.strokeStyle = '#d0d4dc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(chartLeft, 16);
  ctx.lineTo(chartLeft, chartBottom);
  ctx.lineTo(width - 16, chartBottom);
  ctx.stroke();

  values.forEach((item, index) => {
    const x = chartLeft + 18 + index * (barWidth + gap);
    const barHeight = item.value / maxValue * (chartBottom - 30);
    const y = chartBottom - barHeight;
    ctx.fillStyle = item.color;
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = '#1a2a4a';
    ctx.font = '12px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(String(item.value), x + barWidth / 2, y - 8);
    ctx.fillStyle = '#5a6577';
    ctx.fillText(item.label, x + barWidth / 2, chartBottom + 18);
  });
}
