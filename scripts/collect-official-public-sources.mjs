import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { buildOfficialPublicInstancePayloads } from './test-official-public-instances.mjs';

const DEFAULT_OUTPUT_DIR = join(
  'data',
  'real-integration',
  'official-public-instances-20260426',
);
const DEFAULT_SOURCE_REGISTRY_FILE = join('data', 'source-registry', 'official_sources.json');
const DEFAULT_BATCH_ID = 'official_public_instances_round1';
const DEFAULT_CAPTURED_AT = '2026-04-26T16:40:00+08:00';
const DEFAULT_PARSER_VERSION = 'official-public-collector-v1';
const TITLE_SIMILARITY_DUPLICATE_THRESHOLD = 0.92;
const DEFAULT_FETCH_OPTIONS = {
  attempts: 3,
  timeoutMs: 15000,
  retryDelayMs: 750,
};
const execFile = promisify(execFileCallback);

export function locatorHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex').slice(0, 16);
}

export function registryHash(value) {
  return createHash('sha256').update(normalizeRegistryText(value), 'utf8').digest('hex');
}

export function normalizeOfficialSourceRegistryEntries(
  sources,
  {
    batchId = DEFAULT_BATCH_ID,
    discoveredByKeyword = '',
    discoveredAt = DEFAULT_CAPTURED_AT,
    reviewStatus = 'new',
  } = {},
) {
  return sources.map((source) => {
    const sourceId = source.source_id ?? source.id;
    const contentBasis = source.raw_excerpt ?? source.content_snapshot ?? `${source.title ?? ''}|${source.url ?? ''}`;
    return {
      ...source,
      id: source.id ?? sourceId,
      source_id: sourceId,
      title: source.title ?? '',
      url: source.url ?? '',
      publisher: source.publisher ?? '',
      source_type: source.source_type ?? '',
      parser_type: source.parser_type ?? parserTypeForSource(source),
      discovered_by_keyword: source.discovered_by_keyword ?? discoveredByKeyword,
      discovered_at: source.discovered_at ?? discoveredAt,
      review_status: source.review_status ?? reviewStatus,
      batch_id: source.batch_id ?? batchId,
      url_hash: source.url_hash ?? registryHash(source.url ?? ''),
      content_hash: source.content_hash ?? registryHash(contentBasis),
      duplicate_of: source.duplicate_of ?? null,
      duplicate_reason: source.duplicate_reason ?? null,
      title_similarity_score: source.title_similarity_score ?? null,
      manual_review_note: source.manual_review_note ?? '',
    };
  });
}

export function detectOfficialSourceDuplicates(entries) {
  const seenUrl = new Map();
  const seenContent = new Map();
  const accepted = [];
  return entries.map((entry) => {
    const urlDuplicate = seenUrl.get(entry.url_hash);
    const contentDuplicate = seenContent.get(entry.content_hash);
    const similarTitle = accepted
      .map((candidate) => ({
        candidate,
        score: candidate.publisher === entry.publisher ? titleSimilarity(candidate.title, entry.title) : 0,
      }))
      .filter((item) => item.score >= TITLE_SIMILARITY_DUPLICATE_THRESHOLD)
      .sort((left, right) => right.score - left.score)[0];
    const duplicateOf =
      urlDuplicate ??
      contentDuplicate ??
      similarTitle?.candidate.source_id ??
      null;
    const duplicateReason = urlDuplicate
      ? 'url_hash'
      : contentDuplicate
        ? 'content_hash'
        : similarTitle
          ? 'title_similarity'
          : null;
    const next = {
      ...entry,
      review_status: duplicateOf ? 'duplicate' : entry.review_status ?? 'new',
      duplicate_of: duplicateOf,
      duplicate_reason: duplicateReason,
      title_similarity_score: similarTitle ? Number(similarTitle.score.toFixed(4)) : entry.title_similarity_score ?? null,
    };
    if (!duplicateOf) {
      seenUrl.set(next.url_hash, next.source_id);
      seenContent.set(next.content_hash, next.source_id);
      accepted.push(next);
    }
    return next;
  });
}

export function readOfficialSourceRegistry(filePath = DEFAULT_SOURCE_REGISTRY_FILE) {
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) return null;
  const parsed = JSON.parse(readFileSync(resolvedPath, 'utf8').replace(/^\uFEFF/, ''));
  const rawSources = Array.isArray(parsed) ? parsed : parsed.sources ?? [];
  return {
    ...parsed,
    sources: detectOfficialSourceDuplicates(normalizeOfficialSourceRegistryEntries(rawSources)),
  };
}

export function normalizePublicValue(rawValue, defaultUnit = 'unknown') {
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

export function buildOfficialSourceRegistry({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
} = {}) {
  const payloads = buildOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const sources = normalizeOfficialSourceRegistryEntries(payloads.sourceRegister.sources, {
    batchId: DEFAULT_BATCH_ID,
    discoveredByKeyword: '江苏 正式公开数据 PoC 第一批',
    discoveredAt: capturedAt,
    reviewStatus: 'reviewed',
  }).map((source) => ({
    ...source,
    parser_type: parserTypeForSource(source),
    expected_record_count: recordsForSource(payloads, source).length,
  }));
  return {
    captured_at: capturedAt,
    parser_version: parserVersion,
    sources: detectOfficialSourceDuplicates(sources),
  };
}

export async function collectOfficialSources({
  capturedAt = DEFAULT_CAPTURED_AT,
  parserVersion = DEFAULT_PARSER_VERSION,
  outputDir = DEFAULT_OUTPUT_DIR,
  fetchMode = process.env.OFFICIAL_COLLECTOR_FETCH_MODE || 'live',
  fetchOptions = {},
  fetchFn = globalThis.fetch,
  externalDownloader = createExternalDownloader({
    command: process.env.OFFICIAL_COLLECTOR_EXTERNAL_DOWNLOADER,
    proxyUrl: fetchOptions.proxyUrl ?? process.env.OFFICIAL_COLLECTOR_PROXY_URL,
  }),
  sourceRegistryFile = DEFAULT_SOURCE_REGISTRY_FILE,
  batchId = DEFAULT_BATCH_ID,
  writeFiles = true,
} = {}) {
  const payloads = buildOfficialPublicInstancePayloads({ capturedAt, parserVersion });
  const generatedRegistry = buildOfficialSourceRegistry({ capturedAt, parserVersion });
  const storedRegistry = readOfficialSourceRegistry(sourceRegistryFile);
  const registry = storedRegistry
    ? registryForBatch(storedRegistry, batchId, generatedRegistry, payloads)
    : generatedRegistry;
  const sourceStatuses = [];

  for (const source of registry.sources) {
    const expectedRecords = recordsForSource(payloads, source);
    const status = await inspectSource(source, expectedRecords, fetchMode, {
      fetchOptions,
      fetchFn,
      externalDownloader,
    });
    sourceStatuses.push(status);
  }

  const allRows = [
    ...payloads.procurement.records,
    ...payloads.budget.records,
    ...payloads.caseSeeds.records,
  ];
  const budgetRows = payloads.budget.records;
  const caseSeedRows = payloads.caseSeeds.records;
  const collectorSummary = {
    generated_at: new Date().toISOString(),
    captured_at: capturedAt,
    fetch_mode: fetchMode,
    source_count: registry.sources.length,
    source_count_by_batch: Object.fromEntries(countBy(registry.sources, (source) => source.batch_id ?? 'unknown')),
    third_round_source_count: registry.sources.filter(
      (source) => source.batch_id === 'official_public_instances_round3',
    ).length,
    parsed_source_count: sourceStatuses.filter((item) => item.status !== 'failed').length,
    failed_source_count: sourceStatuses.filter((item) => item.status === 'failed').length,
    network_failure_count: sourceStatuses.filter((item) => item.network_failure_reason).length,
    proxy_configured: sourceStatuses.some((item) => item.proxy_configured),
    proxy_origin: sourceStatuses.find((item) => item.proxy_origin)?.proxy_origin ?? null,
    external_downloader_configured: sourceStatuses.some((item) => item.external_downloader_configured),
    external_downloader_success_count: sourceStatuses.filter(
      (item) => item.external_downloader_status === 'success',
    ).length,
    external_downloader_failure_count: sourceStatuses.filter(
      (item) => item.external_downloader_status === 'failed',
    ).length,
    offline_snapshot_verified_count: sourceStatuses.filter(
      (item) => item.offline_snapshot_status === 'verified',
    ).length,
    offline_snapshot_issue_count: sourceStatuses.filter(
      (item) => item.offline_snapshot_status !== 'verified',
    ).length,
    retry_attempt_count: sourceStatuses.reduce(
      (total, item) => total + Math.max((item.fetch_attempt_count ?? 0) - 1, 0),
      0,
    ),
    source_success_rate: Number(
      (
        (sourceStatuses.filter((item) => item.status !== 'failed').length /
          registry.sources.length) *
        100
      ).toFixed(2),
    ),
    total_records: allRows.length,
    unit_normalized_records: allRows.filter(hasNormalizedUnit).length,
    locator_coverage_rate: Number(
      ((allRows.filter((row) => row.source_evidence?.locator_hash).length / allRows.length) * 100).toFixed(2),
    ),
    parser_types: Object.fromEntries(countBy(registry.sources, (source) => source.parser_type)),
    failure_kinds: Object.fromEntries(
      countBy(
        sourceStatuses.filter((item) => item.network_failure_kind),
        (source) => source.network_failure_kind,
      ),
    ),
    duplicate_source_count: sourceStatuses.filter((item) => item.review_status === 'duplicate').length,
    url_duplicate_source_count: sourceStatuses.filter((item) => item.duplicate_reason === 'url_hash').length,
    content_duplicate_source_count: sourceStatuses.filter((item) => item.duplicate_reason === 'content_hash').length,
    title_duplicate_source_count: sourceStatuses.filter((item) => item.duplicate_reason === 'title_similarity').length,
    review_statuses: Object.fromEntries(countBy(sourceStatuses, (source) => source.review_status)),
    manual_review_statuses: Object.fromEntries(countBy(sourceStatuses, (source) => source.review_status)),
    download_methods: Object.fromEntries(countBy(sourceStatuses, (source) => source.download_method ?? 'snapshot')),
    amount_semantic_types: Object.fromEntries(countBy(payloads.procurement.records, (row) => row.amount_semantic_type ?? 'unknown')),
    framework_agreement_count: payloads.procurement.records.filter((row) => row.framework_agreement_flag).length,
    framework_limit_review_count: payloads.procurement.records.filter(
      (row) => row.amount_semantic_type === 'framework_limit',
    ).length,
    unit_price_or_rate_review_count: payloads.procurement.records.filter(
      (row) => row.amount_semantic_type === 'unit_price',
    ).length,
    special_fund_structured_records: budgetRows.filter(
      (row) => row.policy_document_no || row.budget_subject_code || row.fund_destination,
    ).length,
    special_fund_structured_coverage_rate: structuredCoverageRate(budgetRows),
    audit_evidence_levels: Object.fromEntries(countBy(caseSeedRows, (row) => row.audit_evidence_level ?? 'unknown')),
    audit_evidence_weights: maxWeightBy(
      caseSeedRows,
      (row) => row.audit_evidence_level ?? 'unknown',
      (row) => row.audit_evidence_weight,
    ),
    requires_manual_verification_count: caseSeedRows.filter((row) => row.requires_manual_verification).length,
    unit_distribution: Object.fromEntries(
      countBy(allRows, (row) =>
        row.actual_value_unit || row.award_amount_unit || row.budget_amount_unit || row.issue_amount_unit || 'unknown',
      ),
    ),
    sources: sourceStatuses,
  };

  const result = {
    sourceRegister: { ...registry, sources: sourceStatuses },
    collectorSummary,
    procurement: payloads.procurement,
    budget: payloads.budget,
    caseSeeds: payloads.caseSeeds,
  };

  if (writeFiles) {
    const absoluteOutputDir = resolve(outputDir);
    await mkdir(absoluteOutputDir, { recursive: true });
    await writeJson(join(absoluteOutputDir, 'source_register.json'), result.sourceRegister);
    await writeJson(join(absoluteOutputDir, 'collector_summary.json'), collectorSummary);
    await writeJson(join(absoluteOutputDir, 'collector_payloads.json'), result);
    await writeJson(join(absoluteOutputDir, 'procurement_batch.json'), payloads.procurement);
    await writeJson(join(absoluteOutputDir, 'budget_combined_records.json'), payloads.budget);
    await writeJson(join(absoluteOutputDir, 'case_seed_batch.json'), payloads.caseSeeds);
  }

  return result;
}

export async function inspectSource(
  source,
  expectedRecords,
  fetchMode,
  { fetchOptions = {}, fetchFn = globalThis.fetch, externalDownloader = null } = {},
) {
  const snapshotStatus = validateRegisteredSnapshot(source, expectedRecords);
  const resolvedFetchOptions = resolveFetchOptions(fetchOptions);
  const proxyMetadata = proxyMetadataFor(resolvedFetchOptions.proxyUrl);
  const base = {
    id: source.id ?? source.source_id,
    source_id: source.source_id ?? source.id,
    title: source.title,
    url: source.url,
    published_at: source.published_at,
    publisher: source.publisher,
    source_type: source.source_type,
    parser_type: source.parser_type,
    batch_id: source.batch_id ?? null,
    review_status: source.review_status ?? 'new',
    duplicate_of: source.duplicate_of ?? null,
    duplicate_reason: source.duplicate_reason ?? null,
    title_similarity_score: source.title_similarity_score ?? null,
    url_hash: source.url_hash ?? registryHash(source.url ?? ''),
    content_hash: source.content_hash ?? registryHash(`${source.title ?? ''}|${source.url ?? ''}`),
    discovered_by_keyword: source.discovered_by_keyword ?? '',
    discovered_at: source.discovered_at ?? null,
    expected_record_count: source.expected_record_count,
    parsed_record_count: expectedRecords.length,
    offline_snapshot_status: snapshotStatus,
    proxy_configured: proxyMetadata.configured,
    proxy_origin: proxyMetadata.origin,
    external_downloader_configured: Boolean(externalDownloader),
    locator_hashes: expectedRecords
      .map((row) => row.source_evidence?.locator_hash)
      .filter(Boolean),
  };

  if (fetchMode === 'fixture') {
    return {
      ...base,
      status: snapshotStatus === 'verified' ? 'parsed' : 'failed',
      review_status: snapshotStatus === 'verified' ? base.review_status : 'parse_failed',
      http_status: null,
      content_bytes: null,
      fetch_attempt_count: 0,
      fetch_attempts: [],
      download_method: 'fixture',
    };
  }

  try {
    const { response, attempts } = await fetchWithRetry(source.url, {
      ...resolvedFetchOptions,
    }, fetchFn);
    const bytes = (await response.arrayBuffer()).byteLength;
    const networkFailureReason = response.ok ? null : `HTTP ${response.status}`;
    return {
      ...base,
      status: response.ok
        ? 'parsed'
        : snapshotStatus === 'verified'
          ? 'parsed_from_registered_snapshot'
          : 'failed',
      review_status: response.ok || snapshotStatus === 'verified' ? base.review_status : 'parse_failed',
      http_status: response.status,
      content_bytes: bytes,
      fetch_attempt_count: attempts.length,
      fetch_attempts: attempts,
      network_failure_kind: response.ok ? null : 'http_error',
      network_failure_reason: networkFailureReason,
      download_method: 'fetch',
      external_downloader_status: externalDownloader ? 'not_needed' : 'not_configured',
    };
  } catch (error) {
    const attempts = Array.isArray(error?.fetch_attempts) ? error.fetch_attempts : [];
    const diagnostic = fetchErrorDiagnostic(error);
    if (externalDownloader) {
      try {
        const externalResult = await externalDownloader(source.url, {
          source,
          headers: officialRequestHeaders(source.url, resolvedFetchOptions.headers),
          proxyUrl: resolvedFetchOptions.proxyUrl,
          timeoutMs: resolvedFetchOptions.timeoutMs,
        });
        if (externalResult?.ok !== false) {
          return {
            ...base,
            status: 'parsed',
            review_status: base.review_status,
            http_status: externalResult?.status ?? 200,
            content_bytes: Number(
              externalResult?.contentBytes ?? externalResult?.body?.byteLength ?? 0,
            ),
            fetch_attempt_count: attempts.length,
            fetch_attempts: attempts,
            network_failure_kind: diagnostic.error_kind,
            network_failure_reason: diagnostic.error_message,
            download_method: externalResult?.method ?? 'external_downloader',
            external_downloader_status: 'success',
            external_downloader_diagnostic: externalResult?.diagnostic ?? null,
          };
        }
      } catch (externalError) {
        const externalDiagnostic = fetchErrorDiagnostic(externalError);
        return {
          ...base,
          status: snapshotStatus === 'verified' ? 'parsed_from_registered_snapshot' : 'failed',
          review_status: snapshotStatus === 'verified' ? base.review_status : 'parse_failed',
          http_status: null,
          content_bytes: null,
          fetch_attempt_count: attempts.length,
          fetch_attempts: attempts,
          network_failure_kind: diagnostic.error_kind,
          network_failure_reason: diagnostic.error_message,
          download_method: snapshotStatus === 'verified' ? 'registered_snapshot' : 'none',
          external_downloader_status: 'failed',
          external_downloader_error_kind: externalDiagnostic.error_kind,
          external_downloader_error: externalDiagnostic.error_message,
        };
      }
    }
    return {
      ...base,
      status: snapshotStatus === 'verified' ? 'parsed_from_registered_snapshot' : 'failed',
      review_status: snapshotStatus === 'verified' ? base.review_status : 'parse_failed',
      http_status: null,
      content_bytes: null,
      fetch_attempt_count: attempts.length,
      fetch_attempts: attempts,
      network_failure_kind: diagnostic.error_kind,
      network_failure_reason: diagnostic.error_message,
      download_method: snapshotStatus === 'verified' ? 'registered_snapshot' : 'none',
      external_downloader_status: externalDownloader ? 'failed' : 'not_configured',
    };
  }
}

export async function fetchWithRetry(
  url,
  { attempts = 3, timeoutMs = 15000, retryDelayMs = 750, headers = {}, proxyUrl = null } = {},
  fetchFn = globalThis.fetch,
) {
  const requestHeaders = officialRequestHeaders(url, headers);
  const proxyMetadata = proxyMetadataFor(proxyUrl);
  const attemptCount = Math.max(1, Number(attempts) || 1);
  const attemptLogs = [];
  let lastError = null;

  for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetchWithTimeout(url, timeoutMs, fetchFn, requestHeaders, proxyUrl);
      attemptLogs.push({
        attempt,
        ok: response.ok,
        http_status: response.status,
        duration_ms: Date.now() - startedAt,
        proxy_configured: proxyMetadata.configured,
        proxy_origin: proxyMetadata.origin,
      });
      if (response.ok || attempt === attemptCount || !shouldRetryHttpStatus(response.status)) {
        return { response, attempts: attemptLogs };
      }
    } catch (error) {
      lastError = error;
      const diagnostic = fetchErrorDiagnostic(error);
      attemptLogs.push({
        attempt,
        ok: false,
        http_status: null,
        duration_ms: Date.now() - startedAt,
        error_kind: diagnostic.error_kind,
        error_code: diagnostic.error_code,
        error_message: diagnostic.error_message,
        proxy_configured: proxyMetadata.configured,
        proxy_origin: proxyMetadata.origin,
      });
      if (attempt === attemptCount) break;
    }

    if (retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }
  }

  const finalError = lastError ?? new Error('fetch failed without response');
  finalError.fetch_attempts = attemptLogs;
  throw finalError;
}

async function fetchWithTimeout(url, timeoutMs, fetchFn, headers, proxyUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers,
      proxy_url: proxyUrl ?? undefined,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function resolveFetchOptions(fetchOptions) {
  return {
    ...DEFAULT_FETCH_OPTIONS,
    ...fetchOptions,
    proxyUrl: fetchOptions.proxyUrl ?? process.env.OFFICIAL_COLLECTOR_PROXY_URL ?? null,
  };
}

function proxyMetadataFor(proxyUrl) {
  if (!proxyUrl) return { configured: false, origin: null };
  try {
    const parsed = new URL(proxyUrl);
    return { configured: true, origin: parsed.hostname };
  } catch {
    return { configured: true, origin: 'invalid_proxy_url' };
  }
}

export function createExternalDownloader({
  command,
  proxyUrl = process.env.OFFICIAL_COLLECTOR_PROXY_URL,
} = {}) {
  if (!command) return null;
  return async (url, { headers = {}, timeoutMs = 15000 } = {}) => {
    const commandName = basename(command).toLowerCase();
    if (commandName === 'curl' || commandName === 'curl.exe') {
      return runCurlDownloader(command, url, { headers, proxyUrl, timeoutMs });
    }
    return runCustomDownloader(command, url, { proxyUrl, timeoutMs });
  };
}

async function runCurlDownloader(command, url, { headers, proxyUrl, timeoutMs }) {
  const marker = '\n__SMART_AUDIT_HTTP_STATUS__:';
  const args = [
    '--location',
    '--silent',
    '--show-error',
    '--max-time',
    String(Math.max(1, Math.ceil(timeoutMs / 1000))),
    '--user-agent',
    headers['User-Agent'] ?? 'smart-audit-poc/1.0',
    '--header',
    `Accept: ${headers.Accept ?? '*/*'}`,
    '--header',
    `Accept-Language: ${headers['Accept-Language'] ?? 'zh-CN,zh;q=0.9'}`,
    '--write-out',
    `${marker}%{http_code}`,
  ];
  if (proxyUrl) args.push('--proxy', proxyUrl);
  args.push(url);

  const { stdout, stderr } = await execFile(command, args, {
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs + 5000,
    env: downloaderEnv(proxyUrl),
  });
  const markerBuffer = Buffer.from(marker, 'utf8');
  const markerIndex = stdout.lastIndexOf(markerBuffer);
  const body = markerIndex >= 0 ? stdout.subarray(0, markerIndex) : stdout;
  const status = markerIndex >= 0
    ? Number(stdout.subarray(markerIndex + markerBuffer.length).toString('utf8').trim())
    : 200;
  return {
    ok: status >= 200 && status < 400,
    status,
    contentBytes: body.byteLength,
    body,
    method: 'curl',
    diagnostic: stderr?.toString('utf8').trim() || null,
  };
}

async function runCustomDownloader(command, url, { proxyUrl, timeoutMs }) {
  const { stdout, stderr } = await execFile(command, [url], {
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs + 5000,
    env: downloaderEnv(proxyUrl),
  });
  return {
    ok: true,
    status: 200,
    contentBytes: stdout.byteLength,
    body: stdout,
    method: basename(command),
    diagnostic: stderr?.toString('utf8').trim() || null,
  };
}

function downloaderEnv(proxyUrl) {
  if (!proxyUrl) return process.env;
  return {
    ...process.env,
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    https_proxy: proxyUrl,
  };
}

function validateRegisteredSnapshot(source, expectedRecords) {
  if (!expectedRecords.length) return 'missing_records';
  if (expectedRecords.length !== source.expected_record_count) return 'record_count_mismatch';
  if (expectedRecords.some((row) => row.source_evidence?.url !== source.url)) return 'source_url_mismatch';
  if (expectedRecords.some((row) => !row.source_evidence?.locator_hash)) return 'missing_locator';
  return 'verified';
}

function officialRequestHeaders(url, overrides = {}) {
  const isPdf = url.toLowerCase().includes('.pdf');
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 smart-audit-poc/1.0',
    Accept: isPdf
      ? 'application/pdf,application/octet-stream,*/*;q=0.8'
      : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    ...overrides,
  };
  try {
    const parsedUrl = new URL(url);
    if (!headers.Referer && parsedUrl.hostname.endsWith('ccgp.gov.cn')) {
      headers.Referer = 'https://www.ccgp.gov.cn/';
    } else if (!headers.Referer && parsedUrl.hostname.endsWith('jiangsu.gov.cn')) {
      headers.Referer = `${parsedUrl.protocol}//${parsedUrl.hostname}/`;
    }
  } catch {
    // Leave headers without referer for invalid URLs; the fetch path will report the URL error.
  }
  return headers;
}

function shouldRetryHttpStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function fetchErrorDiagnostic(error) {
  const code = error?.cause?.code || error?.code || null;
  const causeMessage = error?.cause?.message || null;
  const message = String(error?.message ?? error ?? 'fetch failed');
  return {
    error_code: code,
    error_kind: classifyFetchFailure(error),
    error_message: sanitizeDiagnosticMessage([code, causeMessage || message].filter(Boolean).join(': ')),
  };
}

function sanitizeDiagnosticMessage(value) {
  return String(value).replace(/\b(https?:\/\/)([^/@\s]+:[^/@\s]+)@/gi, '$1***@');
}

function classifyFetchFailure(error) {
  const code = error?.cause?.code || error?.code || '';
  const message = `${error?.cause?.message ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || message.includes('abort')) {
    return 'timeout';
  }
  if (code === 'ECONNRESET' && message.includes('tls')) return 'tls_handshake_reset';
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH'].includes(code)) {
    return 'dns_or_connectivity';
  }
  if (code === 'ECONNRESET') return 'connection_reset';
  return 'network_error';
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function parserTypeForSource(source) {
  if (source.url.toLowerCase().endsWith('.pdf')) {
    return source.source_type.includes('审计') ? 'audit_report_pdf' : 'fiscal_report_pdf';
  }
  if (source.publisher.includes('政府采购网')) return 'ccgp_procurement_html';
  return 'government_metric_html';
}

function registryForBatch(storedRegistry, batchId, generatedRegistry, payloads) {
  const generatedByUrl = new Map(generatedRegistry.sources.map((source) => [source.url, source]));
  const generatedById = new Map(generatedRegistry.sources.map((source) => [source.source_id ?? source.id, source]));
  const selected = storedRegistry.sources.filter((source) => source.batch_id === batchId);
  const sources = selected.map((entry) => {
    const generated = generatedByUrl.get(entry.url) ?? generatedById.get(entry.source_id) ?? {};
    const merged = {
      ...generated,
      ...entry,
      id: entry.id ?? entry.source_id ?? generated.id,
      source_id: entry.source_id ?? entry.id ?? generated.source_id ?? generated.id,
      title: entry.title || generated.title || '',
      publisher: entry.publisher || generated.publisher || '',
      source_type: entry.source_type || generated.source_type || '',
      parser_type: entry.parser_type || generated.parser_type || parserTypeForSource(entry),
    };
    return {
      ...merged,
      expected_record_count: recordsForSource(payloads, merged).length,
    };
  });
  return {
    captured_at: storedRegistry.captured_at ?? generatedRegistry.captured_at,
    parser_version: storedRegistry.parser_version ?? generatedRegistry.parser_version,
    sources: sources.length ? detectOfficialSourceDuplicates(sources) : generatedRegistry.sources,
  };
}

function recordsForSource(payloads, source) {
  const allRows = [
    ...payloads.procurement.records,
    ...payloads.budget.records,
    ...payloads.caseSeeds.records,
  ];
  return allRows.filter((row) => row.source_evidence?.url === source.url);
}

function hasNormalizedUnit(row) {
  return Boolean(
    row.normalized_budget_amount_yuan ||
      row.normalized_award_amount_yuan ||
      row.normalized_actual_value ||
      row.framework_limit_amount ||
      row.discount_rate ||
      row.unit_price ||
      row.quote_amount ||
      row.issue_amount_unit,
  );
}

function structuredCoverageRate(rows) {
  if (!rows.length) return 0;
  const structured = rows.filter(
    (row) => row.policy_document_no || row.budget_subject_code || row.fund_destination,
  ).length;
  return Number(((structured / rows.length) * 100).toFixed(2));
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

function detectUnit(raw, defaultUnit) {
  if (/%|％/.test(raw)) return 'percent';
  if (raw.includes('亿元') || raw.includes('亿')) return 'yi_yuan';
  if (raw.includes('万元') || raw.includes('万')) return 'wan_yuan';
  if (raw.includes('元')) return 'yuan';
  if (/[个项条家所]/.test(raw)) return 'count';
  return defaultUnit;
}

function formatNumber(value) {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(6))).replace(/\.0+$/, '');
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function normalizeRegistryText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。、“”‘’（）()【】[\]{}:：;；,.!?？！\-_/\\]/g, '');
}

function titleSimilarity(a, b) {
  const left = normalizeRegistryText(a);
  const right = normalizeRegistryText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  const intersection = [...leftBigrams].filter((item) => rightBigrams.has(item)).length;
  const union = new Set([...leftBigrams, ...rightBigrams]).size;
  const bigramScore = union ? intersection / union : 0;
  const sequenceScore = longestCommonSubsequenceLength(left, right) / Math.max(left.length, right.length);
  return Math.max(bigramScore, sequenceScore);
}

function longestCommonSubsequenceLength(left, right) {
  const previous = new Array(right.length + 1).fill(0);
  const current = new Array(right.length + 1).fill(0);
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = left[i - 1] === right[j - 1]
        ? previous[j - 1] + 1
        : Math.max(previous[j], current[j - 1]);
    }
    previous.splice(0, previous.length, ...current);
    current.fill(0);
  }
  return previous[right.length];
}

function bigrams(value) {
  if (value.length <= 1) return new Set([value]);
  const grams = new Set();
  for (let index = 0; index < value.length - 1; index += 1) {
    grams.add(value.slice(index, index + 2));
  }
  return grams;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  collectOfficialSources()
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            source_count: result.collectorSummary.source_count,
            total_records: result.collectorSummary.total_records,
            source_success_rate: result.collectorSummary.source_success_rate,
            unit_normalized_records: result.collectorSummary.unit_normalized_records,
            fetch_mode: result.collectorSummary.fetch_mode,
            network_failure_count: result.collectorSummary.network_failure_count,
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
