import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const STAGE_KEYWORDS = {
  penalty_followup: ['penalty follow-up', 'penalty rectification', 'administrative penalty follow-up'],
  credit_restriction: ['credit restriction', 'market entry restriction', 'supplier credit restriction'],
  credit_repair: ['credit repair', 'credit restoration'],
  re_participation: ['re-participation', 'new procurement participation', 'participation review'],
  complaint_notice: ['complaint', 'complaint notice', 'supervision', 'handling decision', '投诉', '监督', '处理决定'],
  correction_notice: ['correction', 'correction notice', 'clarification', '更正', '澄清', '变更'],
  award_invalidated: ['award invalidated', 'invalid award', 'termination', '中标无效', '废标', '终止'],
  rebid_notice: ['rebid', 'rebid notice', '重新采购', '重新招标', '重采'],
  new_award: ['new award', 'award result', '成交', '中标', '重新中标'],
  contract: ['contract', '合同公告', '采购合同'],
  acceptance: ['acceptance', '验收公告', '履约验收'],
  payment: ['payment', '支付公开', '国库集中支付'],
  rectification: ['rectification', '整改公告', '整改结果'],
};

const VALID_STATUSES = new Set(['new', 'searched', 'matched', 'not_found', 'parse_failed', 'manual_review']);

export function buildCrawlerSearchKeywords(item = {}) {
  const stageTokens = STAGE_KEYWORDS[item.target_stage] || [item.target_stage].filter(Boolean);
  const baseParts = [
    item.project_code,
    item.package_no,
    item.package_name,
    item.purchaser_name,
    item.supplier_name,
    item.platform_order_no,
    item.item_name,
    item.service_period,
    item.maintenance_period,
    item.warranty_period,
    item.acceptance_standard,
    item.acceptance_result,
    item.procurement_exception_type,
    item.complaint_decision_no,
    item.complaint_issue_summary,
    item.complaint_handling_result,
    item.allegation_type,
    item.allegation_outcome,
    item.remedy_action,
    item.affected_package_no,
    item.supervision_penalty_subject,
    item.penalty_decision_no,
    item.penalty_basis,
    item.penalty_basis_article,
    item.penalty_period,
    item.market_entry_restriction_scope,
    item.penalty_subject_type,
    item.penalty_subject_name,
    item.credit_repair_status,
    item.credit_repair_source_url,
    item.exception_evidence_category,
  ].filter(Boolean);
  const combined = [...baseParts, ...stageTokens].join(' ').trim();
  return [...new Set([
    combined,
    ...baseParts,
    ...stageTokens.map((stage) => [...baseParts, stage].filter(Boolean).join(' ').trim()),
  ].filter(Boolean))];
}

export function runOfficialPublicDiscoveryCrawler({
  queue = { items: [] },
  sourceRegistry = { sources: [] },
  searchedAt = new Date().toISOString(),
  crawlerProvider = 'registry_snapshot',
} = {}) {
  const sources = Array.isArray(sourceRegistry?.sources) ? sourceRegistry.sources : [];
  const items = (queue.items || []).map((item) => crawlItem(item, sources, searchedAt, crawlerProvider));
  const byStatus = countBy(items, (item) => item.crawler_status);
  return {
    summary: {
      total_items: items.length,
      processed_count: items.filter((item) => item.crawler_status !== 'new').length,
      matched_count: byStatus.matched || 0,
      not_found_count: byStatus.not_found || 0,
      parse_failed_count: byStatus.parse_failed || 0,
      manual_review_count: byStatus.manual_review || 0,
      match_rate: items.length ? Number((((byStatus.matched || 0) / items.length) * 100).toFixed(2)) : 0,
      by_status: byStatus,
      by_target_stage: countBy(items, (item) => item.target_stage),
      crawler_provider: crawlerProvider,
    },
    items,
  };
}

export async function runOfficialPublicDiscoveryCrawlerWithProvider({
  queue = { items: [] },
  sourceRegistry = { sources: [] },
  searchProvider = {},
  fetchImpl = globalThis.fetch,
  searchedAt = new Date().toISOString(),
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetchImpl is required for provider-backed discovery crawling');
  }
  const normalizedProvider = normalizeDiscoveryProvider(searchProvider);
  const providerName = normalizedProvider.provider_id || normalizedProvider.name || 'official_search_provider';
  const registrySources = Array.isArray(sourceRegistry?.sources) ? sourceRegistry.sources : [];
  const items = [];
  for (const item of queue.items || []) {
    items.push(await crawlItemWithSearchProvider({
      item,
      registrySources,
      searchProvider: normalizedProvider,
      fetchImpl,
      searchedAt,
      crawlerProvider: providerName,
    }));
  }
  const byStatus = countBy(items, (item) => item.crawler_status);
  return {
    summary: {
      total_items: items.length,
      processed_count: items.filter((item) => item.crawler_status !== 'new').length,
      matched_count: byStatus.matched || 0,
      not_found_count: byStatus.not_found || 0,
      parse_failed_count: byStatus.parse_failed || 0,
      manual_review_count: byStatus.manual_review || 0,
      match_rate: items.length ? Number((((byStatus.matched || 0) / items.length) * 100).toFixed(2)) : 0,
      by_status: byStatus,
      by_target_stage: countBy(items, (item) => item.target_stage),
      crawler_provider: providerName,
    },
    items,
  };
}

export async function runOfficialPublicDiscoveryCrawlerWithProviders({
  queue = { items: [] },
  sourceRegistry = { sources: [] },
  providerRegistry = { providers: [] },
  searchProviders = null,
  fetchImpl = globalThis.fetch,
  searchedAt = new Date().toISOString(),
} = {}) {
  const providers = (Array.isArray(searchProviders) ? searchProviders : providerRegistry.providers || [])
    .map(normalizeDiscoveryProvider)
    .filter((provider) => provider.enabled);
  const byProvider = Object.fromEntries(providers.map((provider) => [
    provider.provider_id,
    {
      provider_id: provider.provider_id,
      name: provider.name,
      attempted_count: 0,
      matched_count: 0,
      not_found_count: 0,
      parse_failed_count: 0,
      manual_review_count: 0,
      hit_rate: 0,
    },
  ]));
  const items = [];
  for (const item of queue.items || []) {
    const attempts = [];
    for (const provider of providers) {
      const result = await runOfficialPublicDiscoveryCrawlerWithProvider({
        queue: { items: [item] },
        sourceRegistry,
        searchProvider: provider,
        fetchImpl,
        searchedAt,
      });
      const attemptedItem = result.items[0];
      attempts.push(attemptedItem);
      const providerStats = byProvider[provider.provider_id];
      providerStats.attempted_count += 1;
      incrementProviderStatus(providerStats, attemptedItem.crawler_status);
    }
    const selected = selectBestProviderAttempt(item, attempts, searchedAt);
    items.push({
      ...selected,
      provider_attempts: attempts.map((attempt) => ({
        provider_id: attempt.crawler_provider,
        crawler_status: attempt.crawler_status,
        matched_source_url: attempt.matched_source_url,
        matched_source_title: attempt.matched_source_title,
        matched_stage: attempt.matched_stage,
        match_confidence: attempt.match_confidence,
        candidate_count: attempt.candidate_count,
        failure_reason: attempt.failure_reason,
      })),
    });
  }
  for (const stats of Object.values(byProvider)) {
    stats.hit_rate = stats.attempted_count
      ? Number(((stats.matched_count / stats.attempted_count) * 100).toFixed(2))
      : 0;
  }
  const byStatus = countBy(items, (item) => item.crawler_status);
  return {
    summary: {
      total_items: items.length,
      processed_count: items.filter((item) => item.crawler_status !== 'new').length,
      matched_count: byStatus.matched || 0,
      not_found_count: byStatus.not_found || 0,
      parse_failed_count: byStatus.parse_failed || 0,
      manual_review_count: byStatus.manual_review || 0,
      match_rate: items.length ? Number((((byStatus.matched || 0) / items.length) * 100).toFixed(2)) : 0,
      by_status: byStatus,
      by_target_stage: countBy(items, (item) => item.target_stage),
      crawler_provider: providers.map((provider) => provider.provider_id).join(',') || 'none',
      provider_count: providers.length,
      provider_attempt_count: Object.values(byProvider).reduce((sum, stats) => sum + stats.attempted_count, 0),
      by_provider: byProvider,
    },
    items,
  };
}

export function sampleDiscoveryQueue(queue = { items: [] }, {
  sampleSize = 20,
  sampleSeed = 'official-live-crawl-sample',
} = {}) {
  const items = Array.isArray(queue?.items) ? queue.items : [];
  const boundedSize = Math.max(0, Math.min(Number(sampleSize) || 0, items.length));
  const sampled = items
    .map((item, index) => ({
      item,
      index,
      score: stableHash(`${sampleSeed}|${item.queue_id || item.project_code || index}|${index}`),
    }))
    .sort((left, right) => left.score.localeCompare(right.score) || left.index - right.index)
    .slice(0, boundedSize)
    .map(({ item }) => ({ ...item }));
  return {
    ...queue,
    items: sampled,
    sample: {
      sample_mode: true,
      sample_size: boundedSize,
      sample_seed: sampleSeed,
      source_queue_total_items: items.length,
    },
  };
}

export async function runOfficialPublicDiscoveryCrawlerSample({
  queue = { items: [] },
  sourceRegistry = { sources: [] },
  providerRegistry = null,
  searchProviders = null,
  searchProvider = null,
  fetchImpl = globalThis.fetch,
  searchedAt = new Date().toISOString(),
  sampleSize = 20,
  sampleSeed = 'official-live-crawl-sample',
} = {}) {
  const sampledQueue = sampleDiscoveryQueue(queue, { sampleSize, sampleSeed });
  let result;
  if (providerRegistry || searchProviders) {
    result = await runOfficialPublicDiscoveryCrawlerWithProviders({
      queue: sampledQueue,
      sourceRegistry,
      providerRegistry: providerRegistry || { providers: [] },
      searchProviders,
      fetchImpl,
      searchedAt,
    });
  } else if (searchProvider) {
    result = await runOfficialPublicDiscoveryCrawlerWithProvider({
      queue: sampledQueue,
      sourceRegistry,
      searchProvider,
      fetchImpl,
      searchedAt,
    });
  } else {
    result = runOfficialPublicDiscoveryCrawler({
      queue: sampledQueue,
      sourceRegistry,
      searchedAt,
      crawlerProvider: 'registry_snapshot_live_sample',
    });
  }
  return {
    ...result,
    summary: {
      ...result.summary,
      sample_mode: true,
      sample_size: sampledQueue.sample.sample_size,
      sample_seed: sampleSeed,
      sampled_item_count: sampledQueue.items.length,
      source_queue_total_items: sampledQueue.sample.source_queue_total_items,
      stable_baseline_impact: false,
      report_kind: 'live_crawl_sample',
    },
  };
}

export async function loadDiscoveryProviderRegistry(filePath) {
  return normalizeDiscoveryProviderRegistry(JSON.parse(await readFile(filePath, 'utf8')));
}

export function normalizeDiscoveryProviderRegistry(raw = {}) {
  const providers = Array.isArray(raw.providers) ? raw.providers : [];
  return {
    registry_version: raw.registry_version || 'discovery-provider-registry-v1',
    captured_at: raw.captured_at || raw.updated_at || '',
    providers: providers.map(normalizeDiscoveryProvider),
  };
}

export function parseOfficialSearchCandidatesFromHtml({ html = '', baseUrl = '' } = {}) {
  const candidates = [];
  const seen = new Set();
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const rawHref = decodeHtml(match[1]).trim();
    const title = stripHtml(match[2]);
    if (!rawHref || !title) continue;
    let url;
    try {
      url = new URL(rawHref, baseUrl || undefined).toString();
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    candidates.push({
      title,
      url,
      raw_excerpt: title,
      discovered_from_url: baseUrl,
    });
  }
  return candidates;
}

async function crawlItemWithSearchProvider({
  item,
  registrySources,
  searchProvider,
  fetchImpl,
  searchedAt,
  crawlerProvider,
}) {
  const searchKeywords = Array.isArray(item.search_keywords) && item.search_keywords.length
    ? item.search_keywords
    : buildCrawlerSearchKeywords(item);
  const fallbackSearchUrl = (() => {
    try {
      return providerSearchUrl(searchProvider, searchKeywords[0] || '');
    } catch {
      return '';
    }
  })();
  try {
    const discovered = await discoverCandidateSources({
      item,
      searchKeywords,
      searchProvider,
      fetchImpl,
    });
    return crawlItem(
      item,
      [...registrySources, ...discovered.sources],
      searchedAt,
      crawlerProvider,
      {
        providerId: searchProvider.provider_id,
        searchUrl: discovered.searchUrl,
        searchCandidates: discovered.sources.map((source) => ({
          title: source.title,
          url: source.url,
          raw_excerpt: source.raw_excerpt,
        })),
      },
    );
  } catch (error) {
    return finalItem(item, {
      searchKeywords,
      candidates: [],
      providerId: searchProvider.provider_id,
      searchUrl: fallbackSearchUrl,
      searchCandidates: [],
      searchedAt,
      crawlerProvider,
      crawler_status: 'parse_failed',
      matched_source_url: '',
      matched_source_title: '',
      matched_stage: item.target_stage || '',
      match_confidence: 0,
      failure_reason: error instanceof Error ? error.message : String(error),
    });
  }
}

async function discoverCandidateSources({ item, searchKeywords, searchProvider, fetchImpl }) {
  const searchUrl = providerSearchUrl(searchProvider, searchKeywords[0] || '');
  const searchResponse = await fetchText(fetchImpl, searchUrl);
  const searchCandidates = parseOfficialSearchCandidatesFromHtml({
    html: searchResponse.text,
    baseUrl: searchUrl,
  });
  const maxCandidatePages = Number.isFinite(Number(searchProvider.maxCandidatePages))
    ? Number(searchProvider.maxCandidatePages)
    : 5;
  const sources = [];
  for (const candidate of searchCandidates.slice(0, maxCandidatePages)) {
    sources.push(await candidateSourceFromPage({
      candidate,
      item,
      searchProvider,
      fetchImpl,
      searchKeyword: searchKeywords[0] || '',
    }));
  }
  return {
    sources,
    searchUrl,
    searchCandidates,
  };
}

async function candidateSourceFromPage({ candidate, item, searchProvider, fetchImpl, searchKeyword }) {
  try {
    const response = await fetchText(fetchImpl, candidate.url);
    const pageTitle = titleFromHtml(response.text) || candidate.title;
    const pageText = stripHtml(response.text).slice(0, 3000);
    return {
      title: [candidate.title, pageTitle].filter(Boolean).join(' '),
      url: candidate.url,
      publisher: searchProvider.publisher || '',
      source_type: `${inferStageFromText([candidate.title, pageTitle, pageText].join(' '), item.target_stage)}_candidate`,
      parser_type: 'candidate_page_html',
      review_status: 'reviewed',
      discovered_by_keyword: searchKeyword,
      raw_excerpt: [candidate.raw_excerpt, pageText].filter(Boolean).join(' '),
      discovered_from_url: candidate.discovered_from_url,
    };
  } catch (error) {
    return {
      title: candidate.title,
      url: candidate.url,
      publisher: searchProvider.publisher || '',
      source_type: 'parse_failed_candidate',
      parser_type: 'candidate_page_html',
      review_status: 'parse_failed',
      failure_reason: error instanceof Error ? error.message : String(error),
      discovered_by_keyword: searchKeyword,
      raw_excerpt: candidate.raw_excerpt,
      discovered_from_url: candidate.discovered_from_url,
    };
  }
}

function crawlItem(item, sources, searchedAt, crawlerProvider, diagnostics = {}) {
  const searchKeywords = Array.isArray(item.search_keywords) && item.search_keywords.length
    ? item.search_keywords
    : buildCrawlerSearchKeywords(item);
  const candidates = sources
    .map((source) => {
      const scoreDetails = scoreSourceDetails(item, source, searchKeywords);
      return { source, score: scoreDetails.chainScore, scoreDetails };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];

  if (best?.source?.review_status === 'parse_failed' || best?.source?.status === 'parse_failed') {
    return finalItem(item, {
      searchKeywords,
      candidates,
      ...diagnostics,
      searchedAt,
      crawlerProvider,
      crawler_status: 'parse_failed',
      matched_source_url: best.source.url || '',
      matched_source_title: best.source.title || '',
      matched_stage: item.target_stage || '',
      match_confidence: best.score,
      failure_reason: best.source.failure_reason || 'candidate source exists but parser failed',
    });
  }
  if (best && best.score >= 0.62) {
    return finalItem(item, {
      searchKeywords,
      candidates,
      ...diagnostics,
      searchedAt,
      crawlerProvider,
      crawler_status: 'matched',
      matched_source_url: best.source.url || '',
      matched_source_title: best.source.title || '',
      matched_stage: inferStage(best.source, item.target_stage),
      match_confidence: best.score,
      failure_reason: '',
    });
  }
  if (best && best.score >= 0.45) {
    return finalItem(item, {
      searchKeywords,
      candidates,
      ...diagnostics,
      searchedAt,
      crawlerProvider,
      crawler_status: 'manual_review',
      matched_source_url: best.source.url || '',
      matched_source_title: best.source.title || '',
      matched_stage: inferStage(best.source, item.target_stage),
      match_confidence: best.score,
      failure_reason: 'candidate below automatic match confidence threshold',
    });
  }
  return finalItem(item, {
    searchKeywords,
    candidates,
    ...diagnostics,
    searchedAt,
    crawlerProvider,
    crawler_status: 'not_found',
    matched_source_url: '',
    matched_source_title: '',
    matched_stage: '',
    match_confidence: 0,
    failure_reason: 'no official source matched generated project, package, purchaser, supplier, and stage keywords',
  });
}

function normalizeDiscoveryProvider(provider = {}) {
  const providerId = provider.provider_id || provider.id || provider.name || 'unnamed_provider';
  return {
    ...provider,
    provider_id: providerId,
    name: provider.name || providerId,
    publisher: provider.publisher || '',
    enabled: provider.enabled !== false,
    searchUrlTemplate: provider.searchUrlTemplate || provider.search_url_template || '',
    baseUrl: provider.baseUrl || provider.base_url || '',
    maxCandidatePages: Number.isFinite(Number(provider.maxCandidatePages ?? provider.max_candidate_pages))
      ? Number(provider.maxCandidatePages ?? provider.max_candidate_pages)
      : 5,
  };
}

function incrementProviderStatus(stats, status) {
  if (status === 'matched') stats.matched_count += 1;
  else if (status === 'manual_review') stats.manual_review_count += 1;
  else if (status === 'parse_failed') stats.parse_failed_count += 1;
  else stats.not_found_count += 1;
}

function selectBestProviderAttempt(item, attempts, searchedAt) {
  if (!attempts.length) {
    return finalItem(item, {
      searchKeywords: buildCrawlerSearchKeywords(item),
      candidates: [],
      searchedAt,
      crawlerProvider: 'none',
      crawler_status: 'not_found',
      matched_source_url: '',
      matched_source_title: '',
      matched_stage: '',
      match_confidence: 0,
      failure_reason: 'no enabled discovery providers configured',
    });
  }
  return [...attempts].sort(compareProviderAttempts)[0];
}

function compareProviderAttempts(left, right) {
  const rankDiff = statusRank(right.crawler_status) - statusRank(left.crawler_status);
  if (rankDiff !== 0) return rankDiff;
  return Number(right.match_confidence || 0) - Number(left.match_confidence || 0);
}

function statusRank(status) {
  if (status === 'matched') return 4;
  if (status === 'manual_review') return 3;
  if (status === 'parse_failed') return 2;
  if (status === 'not_found') return 1;
  return 0;
}

function finalItem(item, data) {
  const crawlerStatus = VALID_STATUSES.has(data.crawler_status) ? data.crawler_status : 'manual_review';
  const searchCandidates = Array.isArray(data.searchCandidates) ? data.searchCandidates : [];
  const bestCandidate = data.candidates[0] || null;
  const scoreDetails = bestCandidate?.scoreDetails || emptyScoreDetails();
  const candidateTitles = data.candidates
    .slice(0, 5)
    .map((candidate) => candidate.source.title || candidate.source.url || 'untitled source');
  const candidateUrls = data.candidates
    .slice(0, 5)
    .map((candidate) => candidate.source.url || '')
    .filter(Boolean);
  const providerCandidateTitles = searchCandidates
    .slice(0, 5)
    .map((candidate) => candidate.title || candidate.url || 'untitled source')
    .filter(Boolean);
  const providerCandidateUrls = searchCandidates
    .slice(0, 5)
    .map((candidate) => candidate.url || '')
    .filter(Boolean);
  const failureReason = crawlerStatus === 'matched'
    ? ''
    : data.failure_reason || 'crawler finished without a confident official-source match';
  return {
    ...item,
    search_keywords: data.searchKeywords,
    query_terms: data.searchKeywords,
    crawler_status: crawlerStatus,
    crawler_provider: data.crawlerProvider,
    provider_id: data.providerId || data.crawlerProvider,
    search_url: data.searchUrl || '',
    searched_at: data.searchedAt,
    matched_source_url: data.matched_source_url,
    matched_source_title: data.matched_source_title,
    matched_stage: data.matched_stage,
    match_confidence: Number((data.match_confidence || 0).toFixed(2)),
    candidate_count: data.candidates.length,
    top_candidate_titles: candidateTitles.slice(0, 3),
    candidate_source_urls: candidateUrls,
    candidate_urls: providerCandidateUrls.length ? providerCandidateUrls : candidateUrls,
    candidate_titles: providerCandidateTitles.length ? providerCandidateTitles : candidateTitles,
    candidate_stage_scores: stageScoreSummary(data.candidates),
    chain_score: Number((bestCandidate?.score || 0).toFixed(2)),
    exception_chain_score: roundScore(scoreDetails.exceptionChainScore),
    candidate_exception_stage_scores: exceptionStageScoreSummary(data.candidates, item.target_stage),
    score_reasons: scoreDetails.reasons,
    project_code_score: roundScore(scoreDetails.projectCodeScore),
    package_no_score: roundScore(scoreDetails.packageNoScore),
    supplier_score: roundScore(scoreDetails.supplierScore),
    service_period_score: roundScore(scoreDetails.servicePeriodScore),
    acceptance_clause_score: roundScore(scoreDetails.acceptanceClauseScore),
    complaint_decision_score: roundScore(scoreDetails.complaintDecisionScore),
    complaint_handling_result_score: roundScore(scoreDetails.complaintHandlingResultScore),
    remedy_action_score: roundScore(scoreDetails.remedyActionScore),
    allegation_outcome_score: roundScore(scoreDetails.allegationOutcomeScore),
    affected_package_score: roundScore(scoreDetails.affectedPackageScore),
    penalty_decision_score: roundScore(scoreDetails.penaltyDecisionScore),
    penalty_subject_score: roundScore(scoreDetails.penaltySubjectScore),
    credit_repair_score: roundScore(scoreDetails.creditRepairScore),
    best_candidate_excerpt: bestCandidate
      ? String(bestCandidate.source.raw_excerpt || bestCandidate.source.title || '').slice(0, 240)
      : '',
    failure_reason: failureReason,
    not_found_reason: crawlerStatus === 'not_found' ? failureReason : '',
  };
}

function stageScoreSummary(candidates) {
  const scores = {};
  for (const candidate of candidates || []) {
    const stage = inferStage(candidate.source, 'unknown');
    scores[stage] = Math.max(scores[stage] || 0, Number((candidate.score || 0).toFixed(2)));
  }
  return scores;
}

function exceptionStageScoreSummary(candidates, targetStage = '') {
  const scores = {};
  if (['complaint_notice', 'correction_notice', 'award_invalidated', 'rebid_notice', 'new_award'].includes(targetStage)) {
    const bestScore = candidates?.[0]?.score || 0;
    scores[targetStage] = Number(bestScore.toFixed(2));
  }
  for (const candidate of candidates || []) {
    const stage = inferExceptionStage(candidate.source, '');
    if (!stage) continue;
    scores[stage] = Math.max(scores[stage] || 0, Number((candidate.score || 0).toFixed(2)));
  }
  return scores;
}

function scoreSource(item, source, searchKeywords) {
  return scoreSourceDetails(item, source, searchKeywords).chainScore;
}

function scoreSourceDetails(item, source, searchKeywords) {
  const sourceText = normalize([
    source.title,
    source.url,
    source.publisher,
    source.source_type,
    source.parser_type,
    source.raw_excerpt,
  ].filter(Boolean).join(' '));
  if (!sourceText) return emptyScoreDetails();

  let score = 0;
  const reasons = [];
  for (const token of STAGE_KEYWORDS[item.target_stage] || []) {
    if (sourceText.includes(normalize(token))) {
      score += 0.3;
      reasons.push('target_stage');
      break;
    }
  }
  let projectCodeScore = 0;
  let packageNoScore = 0;
  let supplierScore = 0;
  let servicePeriodScore = 0;
  let acceptanceClauseScore = 0;
  let complaintDecisionScore = 0;
  let complaintHandlingResultScore = 0;
  let remedyActionScore = 0;
  let allegationOutcomeScore = 0;
  let affectedPackageScore = 0;
  let penaltyDecisionScore = 0;
  let penaltySubjectScore = 0;
  let creditRepairScore = 0;
  for (const [field, weight] of [
    ['project_code', 0.3],
    ['package_no', 0.12],
    ['purchaser_name', 0.16],
    ['supplier_name', 0.12],
    ['package_name', 0.1],
    ['platform_order_no', 0.18],
    ['item_name', 0.08],
  ]) {
    const value = normalize(item[field]);
    if (value && value.length >= 2 && sourceText.includes(value)) {
      score += weight;
      reasons.push(field);
      if (field === 'project_code') projectCodeScore += weight;
      if (field === 'package_no') packageNoScore += weight;
      if (field === 'supplier_name') supplierScore += weight;
    }
  }
  for (const [field, weight] of [
    ['complaint_decision_no', 0.22],
    ['complaint_handling_result', 0.16],
    ['allegation_type', 0.1],
    ['allegation_outcome', 0.12],
    ['remedy_action', 0.14],
    ['affected_package_no', 0.1],
    ['supervision_penalty_subject', 0.08],
    ['complaint_issue_summary', 0.08],
    ['procurement_exception_type', 0.06],
    ['penalty_decision_no', 0.22],
    ['penalty_subject_name', 0.14],
    ['penalty_basis', 0.08],
    ['market_entry_restriction_scope', 0.08],
    ['credit_repair_status', 0.12],
    ['credit_repair_source_url', 0.06],
    ['exception_evidence_category', 0.06],
  ]) {
    const value = normalize(item[field]);
    if (value && value.length >= 2 && sourceText.includes(value)) {
      score += weight;
      reasons.push(field);
      if (field === 'complaint_decision_no') complaintDecisionScore += weight;
      if (field === 'complaint_handling_result') complaintHandlingResultScore += weight;
      if (field === 'remedy_action') remedyActionScore += weight;
      if (field === 'allegation_outcome') allegationOutcomeScore += weight;
      if (field === 'affected_package_no') affectedPackageScore += weight;
      if (field === 'penalty_decision_no') penaltyDecisionScore += weight;
      if (field === 'penalty_subject_name') penaltySubjectScore += weight;
      if (field === 'credit_repair_status' || field === 'credit_repair_source_url') creditRepairScore += weight;
    }
  }
  for (const [field, weight] of [
    ['service_period', 0.08],
    ['maintenance_period', 0.06],
    ['warranty_period', 0.06],
  ]) {
    const value = normalize(item[field]);
    if (value && value.length >= 2 && sourceText.includes(value)) {
      score += weight;
      servicePeriodScore += weight;
      reasons.push('service_period');
    }
  }
  for (const [field, weight] of [
    ['acceptance_standard', 0.08],
    ['acceptance_result', 0.06],
    ['acceptance_issue_summary', 0.04],
  ]) {
    const value = normalize(item[field]);
    if (value && value.length >= 2 && sourceText.includes(value)) {
      score += weight;
      acceptanceClauseScore += weight;
      reasons.push('acceptance_clause');
    }
  }
  const keywordHits = searchKeywords
    .map(normalize)
    .filter((keyword) => keyword.length >= 3 && sourceText.includes(keyword))
    .length;
  score += Math.min(keywordHits * 0.08, 0.24);
  if ((source.review_status || '') === 'reviewed') score += 0.03;
  if (source.url) score += 0.02;
  return {
    chainScore: Math.min(score, 0.99),
    exceptionChainScore: isExceptionDiscoveryItem(item) ? Math.min(score, 0.99) : 0,
    reasons: [...new Set(reasons)],
    projectCodeScore,
    packageNoScore,
    supplierScore,
    servicePeriodScore,
    acceptanceClauseScore,
    complaintDecisionScore,
    complaintHandlingResultScore,
    remedyActionScore,
    allegationOutcomeScore,
    affectedPackageScore,
    penaltyDecisionScore,
    penaltySubjectScore,
    creditRepairScore,
  };
}

function emptyScoreDetails() {
  return {
    chainScore: 0,
    reasons: [],
    projectCodeScore: 0,
    packageNoScore: 0,
    supplierScore: 0,
    servicePeriodScore: 0,
    acceptanceClauseScore: 0,
    complaintDecisionScore: 0,
    complaintHandlingResultScore: 0,
    remedyActionScore: 0,
    allegationOutcomeScore: 0,
    affectedPackageScore: 0,
    penaltyDecisionScore: 0,
    penaltySubjectScore: 0,
    creditRepairScore: 0,
    exceptionChainScore: 0,
  };
}

function roundScore(value) {
  return Number((value || 0).toFixed(2));
}

function inferStage(source, fallback) {
  const text = normalize([source.source_type, source.title, source.url, source.raw_excerpt].filter(Boolean).join(' '));
  return inferStageFromText(text, fallback);
}

function inferStageFromText(value, fallback) {
  const text = normalize(value);
  const exceptionStage = inferExceptionStageFromText(text, '');
  if (exceptionStage) return exceptionStage;
  for (const [stage, tokens] of Object.entries(STAGE_KEYWORDS)) {
    if (tokens.some((token) => text.includes(normalize(token)))) return stage;
  }
  return fallback || 'unknown';
}

function inferExceptionStage(source, fallback) {
  const text = normalize([source.source_type, source.title, source.url, source.raw_excerpt].filter(Boolean).join(' '));
  return inferExceptionStageFromText(text, fallback);
}

function inferExceptionStageFromText(text, fallback) {
  for (const stage of ['penalty_followup', 'credit_restriction', 'credit_repair', 're_participation', 'complaint_notice', 'correction_notice', 'award_invalidated', 'rebid_notice', 'new_award']) {
    const tokens = STAGE_KEYWORDS[stage] || [];
    if (tokens.some((token) => text.includes(normalize(token)))) return stage;
  }
  return fallback || '';
}

function isExceptionDiscoveryItem(item) {
  return Boolean(item.exception_target_stage || item.exception_chain_reason)
    || ['complaint_notice', 'correction_notice', 'award_invalidated', 'rebid_notice', 'new_award'].includes(item.target_stage);
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function providerSearchUrl(searchProvider, keyword) {
  const template = searchProvider.searchUrlTemplate;
  if (!template) {
    throw new Error('search provider is missing searchUrlTemplate');
  }
  return template.replace('{query}', encodeURIComponent(keyword));
}

async function fetchText(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response || response.ok === false) {
    throw new Error(`fetch failed for ${url}: HTTP ${response?.status ?? 'unknown'}`);
  }
  return {
    url,
    status: response.status ?? 200,
    text: await response.text(),
  };
}

function titleFromHtml(html) {
  const match = String(html ?? '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]) : '';
}

function stripHtml(value) {
  return decodeHtml(String(value ?? '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function stableHash(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const queue = await readJson(options.queue);
  const sourceRegistry = await readJson(options.registry);
  const providerRegistry = options.providerRegistry
    ? await loadDiscoveryProviderRegistry(options.providerRegistry)
    : null;
  const searchedAt = options.searchedAt || new Date().toISOString();
  const result = options.liveReport
    ? await runOfficialPublicDiscoveryCrawlerSample({
      queue,
      sourceRegistry,
      providerRegistry,
      searchProvider: options.searchUrlTemplate ? {
        name: options.provider || 'official_search_cli',
        searchUrlTemplate: options.searchUrlTemplate,
        publisher: options.publisher,
        maxCandidatePages: options.maxCandidatePages,
      } : null,
      sampleSize: options.sampleSize,
      sampleSeed: options.sampleSeed,
      searchedAt,
    })
    : providerRegistry
    ? await runOfficialPublicDiscoveryCrawlerWithProviders({
      queue,
      sourceRegistry,
      providerRegistry,
      searchedAt,
    })
    : options.searchUrlTemplate
    ? await runOfficialPublicDiscoveryCrawlerWithProvider({
      queue,
      sourceRegistry,
      searchProvider: {
        name: options.provider || 'official_search_cli',
        searchUrlTemplate: options.searchUrlTemplate,
        publisher: options.publisher,
        maxCandidatePages: options.maxCandidatePages,
      },
      searchedAt,
    })
    : runOfficialPublicDiscoveryCrawler({
      queue,
      sourceRegistry,
      searchedAt,
      crawlerProvider: options.provider || 'registry_snapshot_cli',
    });
  if (options.liveReport) {
    const outputDir = dirname(options.out);
    await mkdir(outputDir, { recursive: true });
    await writeFile(`${outputDir}/live_crawler_results.json`, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    await writeFile(`${outputDir}/live_crawl_summary.json`, `${JSON.stringify(result.summary, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${outputDir}/live_crawler_results.json`);
    console.log(`Wrote ${outputDir}/live_crawl_summary.json`);
  } else {
    await mkdir(dirname(options.out), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${options.out}`);
  }
  console.log(JSON.stringify(result.summary, null, 2));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function parseArgs(args) {
  const options = {
    queue: 'data/real-integration/official-public-instances-round9-20260427/public_discovery_queue.json',
    registry: 'data/real-integration/official-public-instances-round9-20260427/source_register.json',
    out: 'data/real-integration/official-public-instances-round9-20260427/crawler_results.json',
    provider: 'registry_snapshot_cli',
    searchedAt: '',
    searchUrlTemplate: '',
    providerRegistry: '',
    publisher: '',
    maxCandidatePages: 5,
    sampleSize: 20,
    sampleSeed: 'official-live-crawl-sample',
    liveReport: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--queue') options.queue = args[++index];
    else if (arg === '--registry') options.registry = args[++index];
    else if (arg === '--out') options.out = args[++index];
    else if (arg === '--provider') options.provider = args[++index];
    else if (arg === '--searched-at') options.searchedAt = args[++index];
    else if (arg === '--search-url-template') options.searchUrlTemplate = args[++index];
    else if (arg === '--provider-registry') options.providerRegistry = args[++index];
    else if (arg === '--publisher') options.publisher = args[++index];
    else if (arg === '--max-candidate-pages') options.maxCandidatePages = Number(args[++index]);
    else if (arg === '--sample-size') options.sampleSize = Number(args[++index]);
    else if (arg === '--sample-seed') options.sampleSeed = args[++index];
    else if (arg === '--live-report') options.liveReport = true;
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
