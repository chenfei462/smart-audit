import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOfficialPublicInstancePayloads,
  summarizeOfficialRun,
} from './test-official-public-instances.mjs';
import {
  buildOfficialSourceRegistry,
  detectOfficialSourceDuplicates,
  collectOfficialSources,
  normalizeOfficialSourceRegistryEntries,
  inspectSource,
  locatorHash,
  normalizePublicValue,
} from './collect-official-public-sources.mjs';

test('official public instance payloads keep source evidence and coverage metadata', () => {
  const payloads = buildOfficialPublicInstancePayloads({
    capturedAt: '2026-04-26T16:40:00+08:00',
    parserVersion: 'official-public-instance-v1',
  });

  assert.ok(payloads.procurement.records.length >= 8);
  assert.ok(payloads.budget.records.length >= 8);
  assert.ok(payloads.caseSeeds.records.length >= 5);

  const allRows = [
    ...payloads.procurement.records,
    ...payloads.budget.records,
    ...payloads.caseSeeds.records,
  ];
  for (const row of allRows) {
    assert.ok(row.source_evidence.title);
    assert.ok(row.source_evidence.url.startsWith('https://'));
    assert.match(row.source_evidence.published_at, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(row.source_evidence.captured_at, '2026-04-26T16:40:00+08:00');
    assert.equal(row.source_evidence.parser_version, 'official-public-instance-v1');
    assert.equal(typeof row.source_evidence.row_number, 'number');
    assert.ok(
      row.source_evidence.page_number || row.source_evidence.section_title,
      'source evidence must include a PDF page or web section locator',
    );
    assert.ok(row.source_evidence.locator_hash);
    assert.ok(row.source_evidence.raw_excerpt);
  }

  for (const row of payloads.procurement.records) {
    if (row.budget_amount) {
      assert.equal(row.budget_amount_unit, 'wan_yuan');
      assert.ok(row.normalized_budget_amount_yuan);
    }
    if (row.award_amount) {
      assert.equal(row.award_amount_unit, 'wan_yuan');
      assert.ok(row.normalized_award_amount_yuan);
    }
  }

  for (const row of payloads.budget.records) {
    assert.ok(row.actual_value_unit);
    assert.ok(row.normalized_actual_value);
  }

  for (const row of payloads.caseSeeds.records) {
    assert.ok(row.issue_amount);
    assert.ok(row.issue_amount_unit);
    assert.ok(row.responsible_subject);
    assert.ok(row.issue_category);
    assert.ok(Array.isArray(row.required_next_data));
    assert.ok(row.required_next_data.length > 0);
    assert.ok(row.rectification_status);
  }

  const stages = new Set(payloads.procurement.records.map((row) => row.procurement_stage));
  assert.ok(stages.has('announcement'));
  assert.ok(stages.has('award'));
  assert.ok(stages.has('contract'));

  const datasetKinds = new Set(payloads.budget.records.map((row) => row.dataset_kind));
  assert.ok(datasetKinds.has('public_fiscal_summary'));
  assert.ok(datasetKinds.has('public_statistical_indicator'));
  assert.ok(datasetKinds.has('investment_review_summary'));
});

test('official run summary extracts task and import counts', () => {
  const summary = summarizeOfficialRun({
    generatedAt: '2026-04-26T16:50:00+08:00',
    payloads: {
      procurement: { records: [{}, {}] },
      budget: { records: [{}, {}, {}] },
      caseSeeds: { records: [{}] },
    },
    procurementResponse: {
      detail: {
        payload: {
          accepted_rows: 2,
          rejected_rows: 0,
          quality_report: [{ severity: 'warning' }],
        },
      },
      findings: [{ rule_code: 'PROC-CHAIN-001', severity: 'Medium' }],
    },
    budgetResponse: {
      detail: {
        payload: {
          accepted_rows: 3,
          rejected_rows: 0,
          quality_report: [],
        },
      },
      findings: [{ rule_code: 'BUDGET-PUBLIC-TREND-001', severity: 'Low' }],
    },
    caseSeedResponse: { imported: 1, cases: [{}] },
  });

  assert.equal(summary.total_input_records, 6);
  assert.equal(summary.total_accepted_records, 6);
  assert.equal(summary.import_success_rate, 100);
  assert.equal(summary.quality_warning_count, 1);
  assert.deepEqual(summary.rule_hits_by_rule, {
    'BUDGET-PUBLIC-TREND-001': 1,
    'PROC-CHAIN-001': 1,
  });
});

test('collector helpers normalize units and create stable source locators', () => {
  assert.deepEqual(normalizePublicValue('1.5亿元', 'wan_yuan'), {
    raw_value: '1.5亿元',
    unit: 'yi_yuan',
    normalized_value: '150000000',
  });
  assert.deepEqual(normalizePublicValue('136万元', 'wan_yuan'), {
    raw_value: '136万元',
    unit: 'wan_yuan',
    normalized_value: '1360000',
  });
  assert.deepEqual(normalizePublicValue('74.54%', 'wan_yuan'), {
    raw_value: '74.54%',
    unit: 'percent',
    normalized_value: '74.54',
  });
  assert.deepEqual(normalizePublicValue('36个', 'wan_yuan'), {
    raw_value: '36个',
    unit: 'count',
    normalized_value: '36',
  });
  assert.equal(locatorHash('page 1: 江苏预算报告'), locatorHash('page 1: 江苏预算报告'));
});

test('official source collector emits the PoC payloads and collector summary', async () => {
  const registry = buildOfficialSourceRegistry({ capturedAt: '2026-04-26T16:40:00+08:00' });
  assert.equal(registry.sources.length, 12);
  assert.ok(new Set(registry.sources.map((source) => source.parser_type)).has('ccgp_procurement_html'));
  assert.ok(new Set(registry.sources.map((source) => source.parser_type)).has('fiscal_report_pdf'));
  assert.ok(new Set(registry.sources.map((source) => source.parser_type)).has('audit_report_pdf'));
  assert.ok(new Set(registry.sources.map((source) => source.parser_type)).has('government_metric_html'));

  const result = await collectOfficialSources({
    capturedAt: '2026-04-26T16:40:00+08:00',
    fetchMode: 'fixture',
    writeFiles: false,
  });

  assert.equal(result.procurement.records.length, 9);
  assert.equal(result.budget.records.length, 32);
  assert.equal(result.caseSeeds.records.length, 8);
  assert.equal(result.collectorSummary.total_records, 49);
  assert.equal(result.collectorSummary.source_success_rate, 100);
  assert.equal(result.collectorSummary.unit_normalized_records, 49);
});

test('official source registry normalizes entries and detects cross-batch duplicates', () => {
  const entries = normalizeOfficialSourceRegistryEntries([
    {
      id: 'round1-a',
      title: '南京市财政局2025年度部门预算公开',
      url: 'https://example.gov.cn/report.pdf',
      publisher: '南京市财政局',
      source_type: '部门预算公开PDF',
      parser_type: 'fiscal_report_pdf',
      raw_excerpt: '财政拨款收入 12009.78 万元',
    },
    {
      id: 'round2-a',
      title: '南京财政局2025年度部门预算公开',
      url: 'https://example.gov.cn/report.pdf',
      publisher: '南京市财政局',
      source_type: '部门预算公开PDF',
      parser_type: 'fiscal_report_pdf',
      raw_excerpt: '财政拨款收入 12009.78 万元',
    },
    {
      id: 'round2-b',
      title: '南通市财政局2025年度部门预算公开',
      url: 'https://example.gov.cn/nantong.pdf',
      publisher: '南通市财政局',
      source_type: '部门预算公开PDF',
      parser_type: 'fiscal_report_pdf',
      raw_excerpt: '一般公共预算拨款收入 8283.01 万元',
    },
  ], {
    batchId: 'official_public_instances_round2',
    discoveredByKeyword: '江苏 部门预算 PDF',
    discoveredAt: '2026-04-26T18:30:00+08:00',
  });

  assert.equal(entries.length, 3);
  assert.ok(entries.every((entry) => entry.source_id));
  assert.ok(entries.every((entry) => entry.url_hash));
  assert.ok(entries.every((entry) => entry.content_hash));
  assert.ok(entries.every((entry) => entry.review_status === 'new'));
  assert.equal(entries[0].discovered_by_keyword, '江苏 部门预算 PDF');

  const deduped = detectOfficialSourceDuplicates(entries);
  assert.equal(deduped[0].review_status, 'new');
  assert.equal(deduped[1].review_status, 'duplicate');
  assert.equal(deduped[1].duplicate_of, 'round1-a');
  assert.equal(deduped[2].review_status, 'new');
});

test('official source registry detects same-publisher similar-title duplicates', () => {
  const entries = normalizeOfficialSourceRegistryEntries([
    {
      id: 'round2-budget',
      title: '南京市财政局2025年度部门预算公开',
      url: 'https://example.gov.cn/nanjing-budget-a.pdf',
      publisher: '南京市财政局',
      source_type: '部门预算公开PDF',
      parser_type: 'fiscal_report_pdf',
      raw_excerpt: '财政拨款收入 12009.78 万元',
    },
    {
      id: 'round3-budget',
      title: '南京财政局2025年度部门预算公开表',
      url: 'https://example.gov.cn/nanjing-budget-b.pdf',
      publisher: '南京市财政局',
      source_type: '部门预算公开PDF',
      parser_type: 'fiscal_report_pdf',
      raw_excerpt: '一般公共预算支出 12009.78 万元',
    },
  ], {
    batchId: 'official_public_instances_round3',
    discoveredByKeyword: '南京 财政局 部门预算',
    discoveredAt: '2026-04-26T20:10:00+08:00',
  });

  const deduped = detectOfficialSourceDuplicates(entries);
  assert.equal(deduped[1].review_status, 'duplicate');
  assert.equal(deduped[1].duplicate_of, 'round2-budget');
  assert.equal(deduped[1].duplicate_reason, 'title_similarity');
  assert.ok(deduped[1].title_similarity_score >= 0.92);
});

test('official source collector records retry diagnostics and validates registered snapshots', async () => {
  const result = await collectOfficialSources({
    capturedAt: '2026-04-26T16:40:00+08:00',
    fetchMode: 'live',
    writeFiles: false,
    fetchOptions: { attempts: 2, timeoutMs: 1000, retryDelayMs: 0 },
    fetchFn: async () => {
      const error = new TypeError('fetch failed');
      error.cause = {
        code: 'ECONNRESET',
        message: 'Client network socket disconnected before secure TLS connection was established',
      };
      throw error;
    },
  });

  assert.equal(result.collectorSummary.network_failure_count, 12);
  assert.equal(result.collectorSummary.offline_snapshot_verified_count, 12);
  assert.equal(result.collectorSummary.failed_source_count, 0);
  assert.deepEqual(result.collectorSummary.failure_kinds, { tls_handshake_reset: 12 });

  const firstSource = result.sourceRegister.sources[0];
  assert.equal(firstSource.status, 'parsed_from_registered_snapshot');
  assert.equal(firstSource.network_failure_kind, 'tls_handshake_reset');
  assert.equal(firstSource.fetch_attempt_count, 2);
  assert.equal(firstSource.offline_snapshot_status, 'verified');
  assert.equal(firstSource.fetch_attempts.length, 2);
  assert.equal(firstSource.fetch_attempts[0].error_code, 'ECONNRESET');
  assert.match(firstSource.network_failure_reason, /ECONNRESET/);
});

test('official source collector records proxy configuration on fetch attempts', async () => {
  const requestedOptions = [];
  const result = await collectOfficialSources({
    capturedAt: '2026-04-26T16:40:00+08:00',
    fetchMode: 'live',
    writeFiles: false,
    fetchOptions: {
      attempts: 1,
      timeoutMs: 1000,
      retryDelayMs: 0,
      proxyUrl: 'http://audit-proxy.local:8080',
    },
    fetchFn: async (_url, options) => {
      requestedOptions.push(options);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      };
    },
  });

  assert.equal(result.collectorSummary.proxy_configured, true);
  assert.equal(result.collectorSummary.proxy_origin, 'audit-proxy.local');
  assert.equal(result.collectorSummary.network_failure_count, 0);
  assert.equal(result.sourceRegister.sources[0].proxy_configured, true);
  assert.equal(result.sourceRegister.sources[0].fetch_attempts[0].proxy_configured, true);
  assert.equal(requestedOptions[0].proxy_url, 'http://audit-proxy.local:8080');
});

test('official source collector can recover a TLS fetch failure with an external downloader', async () => {
  const payloads = buildOfficialPublicInstancePayloads({
    capturedAt: '2026-04-26T16:40:00+08:00',
    parserVersion: 'official-public-instance-v1',
  });
  const registry = buildOfficialSourceRegistry({ capturedAt: '2026-04-26T16:40:00+08:00' });
  const source = registry.sources[0];
  const expectedRecords = [
    ...payloads.procurement.records,
    ...payloads.budget.records,
    ...payloads.caseSeeds.records,
  ].filter((row) => row.source_evidence.url === source.url);

  const status = await inspectSource(source, expectedRecords, 'live', {
    fetchOptions: { attempts: 1, timeoutMs: 1000, retryDelayMs: 0 },
    fetchFn: async () => {
      const error = new TypeError('fetch failed');
      error.cause = {
        code: 'ECONNRESET',
        message: 'Client network socket disconnected before secure TLS connection was established',
      };
      throw error;
    },
    externalDownloader: async () => ({
      ok: true,
      status: 200,
      contentBytes: 4096,
      method: 'mock-downloader',
      diagnostic: 'downloaded through configured proxy',
    }),
  });

  assert.equal(status.status, 'parsed');
  assert.equal(status.download_method, 'mock-downloader');
  assert.equal(status.external_downloader_status, 'success');
  assert.equal(status.content_bytes, 4096);
  assert.equal(status.network_failure_kind, 'tls_handshake_reset');
  assert.equal(status.fetch_attempt_count, 1);
});

test('official source collector masks proxy credentials in downloader diagnostics', async () => {
  const payloads = buildOfficialPublicInstancePayloads({
    capturedAt: '2026-04-26T16:40:00+08:00',
    parserVersion: 'official-public-instance-v1',
  });
  const registry = buildOfficialSourceRegistry({ capturedAt: '2026-04-26T16:40:00+08:00' });
  const source = registry.sources[0];
  const expectedRecords = [
    ...payloads.procurement.records,
    ...payloads.budget.records,
    ...payloads.caseSeeds.records,
  ].filter((row) => row.source_evidence.url === source.url);

  const status = await inspectSource(source, expectedRecords, 'live', {
    fetchOptions: {
      attempts: 1,
      timeoutMs: 1000,
      retryDelayMs: 0,
      proxyUrl: 'http://user:secret@audit-proxy.local:8080',
    },
    fetchFn: async () => {
      const error = new TypeError('fetch failed via http://user:secret@audit-proxy.local:8080');
      error.cause = { code: 'ECONNRESET' };
      throw error;
    },
    externalDownloader: async () => {
      throw new Error('curl failed --proxy http://user:secret@audit-proxy.local:8080');
    },
  });

  assert.equal(status.external_downloader_status, 'failed');
  assert.match(status.network_failure_reason, /http:\/\/\*\*\*@audit-proxy\.local:8080/);
  assert.match(status.external_downloader_error, /http:\/\/\*\*\*@audit-proxy\.local:8080/);
  assert.doesNotMatch(status.network_failure_reason, /secret/);
  assert.doesNotMatch(status.external_downloader_error, /secret/);
});

test('official source collector fails a source when network and registered snapshot are both unavailable', async () => {
  const status = await inspectSource(
    {
      id: 'empty-source',
      title: 'Empty source',
      url: 'https://example.invalid/missing.pdf',
      published_at: '2026-04-26',
      publisher: 'Test',
      source_type: 'Test PDF',
      parser_type: 'fiscal_report_pdf',
      expected_record_count: 1,
    },
    [],
    'live',
    {
      fetchOptions: { attempts: 2, timeoutMs: 1000, retryDelayMs: 0 },
      fetchFn: async () => {
        const error = new Error('network unavailable');
        error.cause = { code: 'ENOTFOUND', hostname: 'example.invalid' };
        throw error;
      },
    },
  );

  assert.equal(status.status, 'failed');
  assert.equal(status.offline_snapshot_status, 'missing_records');
  assert.equal(status.fetch_attempt_count, 2);
  assert.equal(status.network_failure_kind, 'dns_or_connectivity');
  assert.match(status.network_failure_reason, /ENOTFOUND/);
});
