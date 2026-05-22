import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCrawlerSearchKeywords,
  loadDiscoveryProviderRegistry,
  normalizeDiscoveryProviderRegistry,
  parseOfficialSearchCandidatesFromHtml,
  runOfficialPublicDiscoveryCrawler,
  runOfficialPublicDiscoveryCrawlerWithProvider,
  runOfficialPublicDiscoveryCrawlerWithProviders,
} from './public-discovery-crawler.mjs';

test('provider-backed not_found results include query, provider and candidate diagnostics', async () => {
  const queue = {
    items: [{
      queue_id: 'q-r15-not-found',
      target_stage: 'acceptance',
      project_code: 'R15-PROC-NOTFOUND',
      package_no: '02',
      package_name: 'acceptance package',
      purchaser_name: 'Jiangsu Test Purchaser',
      supplier_name: 'Supplier R15',
    }],
  };
  const fetchImpl = async (url) => {
    if (url.includes('/search?')) {
      return {
        ok: true,
        status: 200,
        text: async () => `
          <html><body>
            <a href="/notice/unrelated.html">unrelated notice without project code</a>
          </body></html>
        `,
      };
    }
    if (url.endsWith('/notice/unrelated.html')) {
      return {
        ok: true,
        status: 200,
        text: async () => '<html><title>unrelated procurement notice</title><body>different project</body></html>',
      };
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await runOfficialPublicDiscoveryCrawlerWithProvider({
    queue,
    searchProvider: {
      provider_id: 'r15_provider',
      name: 'round15 provider',
      searchUrlTemplate: 'https://official.example/search?q={query}',
      baseUrl: 'https://official.example',
      maxCandidatePages: 3,
    },
    fetchImpl,
    searchedAt: '2026-04-27T22:40:00+08:00',
  });

  assert.equal(result.summary.by_status.not_found, 1);
  const item = result.items[0];
  assert.equal(item.crawler_status, 'not_found');
  assert.equal(item.provider_id, 'r15_provider');
  assert.ok(Array.isArray(item.query_terms));
  assert.ok(item.query_terms.some((term) => term.includes('R15-PROC-NOTFOUND')));
  assert.ok(item.search_url.includes(encodeURIComponent('R15-PROC-NOTFOUND')));
  assert.deepEqual(item.candidate_urls, ['https://official.example/notice/unrelated.html']);
  assert.ok(item.candidate_titles.some((title) => title.includes('unrelated procurement notice')));
  assert.ok(item.candidate_stage_scores && typeof item.candidate_stage_scores === 'object');
  assert.ok(item.not_found_reason.includes('no official source matched'));
  assert.equal(item.searched_at, '2026-04-27T22:40:00+08:00');
});

test('official discovery crawler resolves queue items with explicit statuses and diagnostics', () => {
  const searchedAt = '2026-04-27T11:00:00+08:00';
  const queue = {
    items: [
      {
        queue_id: 'q-contract-1',
        target_stage: 'contract',
        project_code: 'R9-PROC-001',
        package_no: 'pkg1',
        package_name: 'network switch package',
        purchaser_name: 'Hubei Tax Bureau',
        supplier_name: 'Supplier A',
      },
      {
        queue_id: 'q-acceptance-1',
        target_stage: 'acceptance',
        project_code: 'R9-PROC-002',
        package_no: 'pkg2',
        package_name: 'screen package',
        purchaser_name: 'Central University',
        supplier_name: 'Supplier B',
      },
      {
        queue_id: 'q-payment-1',
        target_stage: 'payment',
        project_code: 'R9-PROC-003',
        package_no: 'pkg3',
        package_name: 'medical device package',
        purchaser_name: 'Nanjing Hospital',
        supplier_name: 'Supplier C',
      },
      {
        queue_id: 'q-rectification-1',
        target_stage: 'rectification',
        project_code: 'R9-AUDIT-001',
        purchaser_name: 'Jiangsu Audit Office',
        supplier_name: '',
      },
    ],
  };
  const sourceRegistry = {
    sources: [
      {
        title: 'R9-PROC-001 pkg1 Hubei Tax Bureau Supplier A contract notice',
        url: 'https://www.ccgp.gov.cn/contract/r9-001.html',
        source_type: 'contract_notice',
        parser_type: 'ccgp_procurement_html',
        review_status: 'reviewed',
      },
      {
        title: 'R9-PROC-002 pkg2 Central University Supplier B acceptance notice',
        url: 'https://www.ccgp.gov.cn/acceptance/r9-002.html',
        source_type: 'acceptance_notice',
        parser_type: 'ccgp_procurement_html',
        review_status: 'reviewed',
      },
      {
        title: 'R9-PROC-003 Nanjing Hospital payment notice',
        url: 'https://www.ccgp.gov.cn/payment/r9-003.html',
        source_type: 'payment_notice',
        parser_type: 'ccgp_procurement_html',
        review_status: 'parse_failed',
        failure_reason: 'payment page layout changed',
      },
    ],
  };

  const result = runOfficialPublicDiscoveryCrawler({
    queue,
    sourceRegistry,
    searchedAt,
    crawlerProvider: 'registry_snapshot',
  });

  assert.equal(result.summary.total_items, 4);
  assert.equal(result.summary.processed_count, 4);
  assert.equal(result.summary.by_status.matched, 2);
  assert.equal(result.summary.by_status.parse_failed, 1);
  assert.equal(result.summary.by_status.not_found, 1);
  assert.ok(result.items.every((item) => item.crawler_status !== 'new'));
  assert.ok(result.items.every((item) => item.crawler_provider === 'registry_snapshot'));
  assert.ok(result.items.every((item) => item.searched_at === searchedAt));
  assert.ok(result.items.every((item) => Number.isInteger(item.candidate_count)));
  assert.ok(result.items.every((item) => Array.isArray(item.top_candidate_titles)));
  assert.ok(result.items.every((item) => item.crawler_status === 'matched' || item.failure_reason));

  const contractKeywords = buildCrawlerSearchKeywords(queue.items[0]);
  assert.ok(contractKeywords.some((keyword) => keyword.includes('R9-PROC-001')));
  assert.ok(contractKeywords.some((keyword) => keyword.toLowerCase().includes('contract')));
});

test('official discovery crawler scores chain candidates by project package supplier service period and acceptance clauses', () => {
  const result = runOfficialPublicDiscoveryCrawler({
    queue: {
      items: [{
        queue_id: 'q-r17-acceptance-score',
        target_stage: 'acceptance',
        project_code: 'R17-SVC-001',
        package_no: '02',
        package_name: 'service maintenance package',
        purchaser_name: 'Jiangsu Test Purchaser',
        supplier_name: 'Supplier R17',
        service_period: '12 months',
        acceptance_standard: 'deliverables accepted',
      }],
    },
    sourceRegistry: {
      sources: [{
        title: 'R17-SVC-001 02 Supplier R17 acceptance notice',
        url: 'https://example.gov.cn/r17/acceptance.html',
        source_type: 'acceptance_notice',
        parser_type: 'official_html',
        review_status: 'reviewed',
        raw_excerpt: 'Jiangsu Test Purchaser service maintenance package 12 months deliverables accepted acceptance result',
      }],
    },
    searchedAt: '2026-04-28T10:00:00+08:00',
    crawlerProvider: 'registry_snapshot_round17',
  });

  assert.equal(result.summary.by_status.matched, 1);
  const item = result.items[0];
  assert.equal(item.crawler_status, 'matched');
  assert.ok(item.chain_score >= 0.62);
  assert.ok(Array.isArray(item.score_reasons));
  assert.ok(item.score_reasons.includes('project_code'));
  assert.ok(item.score_reasons.includes('package_no'));
  assert.ok(item.score_reasons.includes('supplier_name'));
  assert.ok(item.score_reasons.includes('service_period'));
  assert.ok(item.score_reasons.includes('acceptance_clause'));
  assert.ok(item.project_code_score > 0);
  assert.ok(item.package_no_score > 0);
  assert.ok(item.supplier_score > 0);
  assert.ok(item.service_period_score > 0);
  assert.ok(item.acceptance_clause_score > 0);
  assert.ok(item.best_candidate_excerpt.includes('deliverables accepted'));
});

test('official discovery crawler scores procurement exception candidates by decision result and affected package', () => {
  const result = runOfficialPublicDiscoveryCrawler({
    queue: {
      items: [{
        queue_id: 'q-r19-exception-rebid',
        target_stage: 'rebid_notice',
        exception_chain_stage_from: 'complaint_notice',
        exception_target_stage: 'rebid_notice',
        exception_chain_reason: 'complaint_partly_established_requires_rebid',
        project_code: 'R19-EX-001',
        package_no: '02',
        purchaser_name: 'Central Unit',
        supplier_name: 'Supplier R19',
        complaint_decision_no: 'MOF-R19-0001',
        complaint_handling_result: 'award invalidated and rebid required',
        affected_package_no: '02',
      }],
    },
    sourceRegistry: {
      sources: [{
        title: 'R19-EX-001 package 02 MOF-R19-0001 rebid notice Supplier R19',
        url: 'https://example.gov.cn/r19/rebid.html',
        source_type: 'rebid_notice',
        parser_type: 'official_html',
        review_status: 'reviewed',
        raw_excerpt: 'Central Unit award invalidated and rebid required for affected package 02',
      }],
    },
    searchedAt: '2026-04-27T19:00:00+08:00',
    crawlerProvider: 'registry_snapshot_round19',
  });

  assert.equal(result.summary.by_status.matched, 1);
  const item = result.items[0];
  assert.equal(item.crawler_status, 'matched');
  assert.ok(item.chain_score >= 0.62);
  assert.ok(item.exception_chain_score >= 0.62);
  assert.ok(item.score_reasons.includes('complaint_decision_no'));
  assert.ok(item.score_reasons.includes('complaint_handling_result'));
  assert.ok(item.score_reasons.includes('affected_package_no'));
  assert.ok(item.candidate_exception_stage_scores.rebid_notice >= 0.62);
  assert.ok(item.best_candidate_excerpt.includes('award invalidated'));
});

test('official discovery crawler scores complaint adjudication outcome and remedy action fields', () => {
  const result = runOfficialPublicDiscoveryCrawler({
    queue: {
      items: [{
        queue_id: 'q-r23-complaint-remedy',
        target_stage: 'correction_notice',
        exception_chain_stage_from: 'complaint_notice',
        exception_target_stage: 'correction_notice',
        exception_chain_reason: 'complaint_established_requires_correction',
        complaint_chain_stage_from: 'complaint_notice',
        complaint_target_stage: 'correction_notice',
        complaint_chain_reason: 'remedy_action_correction_notice',
        project_code: 'R23-COMP-001',
        package_no: '01',
        purchaser_name: 'Central Complaint Purchaser',
        supplier_name: 'Supplier R23',
        complaint_decision_no: 'MOF-R23-0001',
        allegation_type: 'false_material',
        allegation_outcome: 'established',
        confirmed_fact_flag: true,
        remedy_action: 'correction_notice',
        remedy_required_flag: true,
      }],
    },
    sourceRegistry: {
      sources: [{
        title: 'R23-COMP-001 package 01 MOF-R23-0001 correction notice Supplier R23',
        url: 'https://example.gov.cn/r23/correction.html',
        source_type: 'correction_notice',
        parser_type: 'official_html',
        review_status: 'reviewed',
        raw_excerpt: 'Central Complaint Purchaser false_material allegation established remedy_action correction_notice package 01',
      }],
    },
    searchedAt: '2026-04-27T23:00:00+08:00',
    crawlerProvider: 'registry_snapshot_round23',
  });

  assert.equal(result.summary.by_status.matched, 1);
  const item = result.items[0];
  assert.equal(item.crawler_status, 'matched');
  assert.ok(item.chain_score >= 0.62);
  assert.ok(item.exception_chain_score >= 0.62);
  assert.ok(item.score_reasons.includes('allegation_type'));
  assert.ok(item.score_reasons.includes('allegation_outcome'));
  assert.ok(item.score_reasons.includes('remedy_action'));
  assert.ok(item.remedy_action_score > 0);
  assert.ok(item.allegation_outcome_score > 0);
  assert.ok(item.candidate_exception_stage_scores.correction_notice >= 0.62);
});

test('official discovery crawler scores penalty credit candidates by decision subject and repair status', () => {
  const result = runOfficialPublicDiscoveryCrawler({
    queue: {
      items: [{
        queue_id: 'q-r21-credit-repair',
        target_stage: 'credit_repair',
        exception_chain_stage_from: 'credit_restriction',
        exception_target_stage: 'credit_repair',
        exception_chain_reason: 'administrative_penalty_requires_credit_repair',
        project_code: 'R21-PEN-001',
        package_no: '01',
        purchaser_name: 'Central Unit',
        supplier_name: 'Penalty Supplier',
        penalty_decision_no: 'MOF-R21-0001',
        penalty_subject_name: 'Penalty Supplier',
        credit_repair_status: 'pending',
        market_entry_restriction_scope: 'government procurement market',
      }],
    },
    sourceRegistry: {
      sources: [{
        title: 'R21-PEN-001 MOF-R21-0001 Penalty Supplier credit repair notice',
        url: 'https://example.gov.cn/r21/credit-repair.html',
        source_type: 'credit_repair_notice',
        parser_type: 'official_html',
        review_status: 'reviewed',
        raw_excerpt: 'Central Unit Penalty Supplier pending credit repair after government procurement market restriction',
      }],
    },
    searchedAt: '2026-04-27T21:00:00+08:00',
    crawlerProvider: 'registry_snapshot_round21',
  });

  assert.equal(result.summary.by_status.matched, 1);
  const item = result.items[0];
  assert.equal(item.crawler_status, 'matched');
  assert.ok(item.chain_score >= 0.62);
  assert.ok(item.exception_chain_score >= 0.62);
  assert.ok(item.score_reasons.includes('penalty_decision_no'));
  assert.ok(item.score_reasons.includes('penalty_subject_name'));
  assert.ok(item.score_reasons.includes('credit_repair_status'));
  assert.ok(item.candidate_exception_stage_scores.credit_repair >= 0.62);
  assert.ok(item.best_candidate_excerpt.includes('credit repair'));
});

test('official discovery crawler can search a real provider and score downloaded candidate pages', async () => {
  const queue = {
    items: [
      {
        queue_id: 'q-market-contract',
        target_stage: 'contract',
        project_code: 'R10-MARKET-001',
        package_no: '01',
        purchaser_name: 'Central Office Service Center',
        supplier_name: 'Supplier Z',
        platform_order_no: 'DD-2026-0001',
        item_name: 'Printer cartridge',
      },
      {
        queue_id: 'q-market-payment',
        target_stage: 'payment',
        project_code: 'R10-MARKET-002',
        purchaser_name: 'Nanjing Agency',
        supplier_name: 'Supplier Y',
        platform_order_no: 'DD-2026-0002',
      },
    ],
  };
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(url);
    if (url.includes('/search?')) {
      return {
        ok: true,
        status: 200,
        text: async () => `
          <html><body>
            <a href="/contract/r10-market-001.html">contract candidate</a>
            <a href="https://official.example/payment/r10-market-002.html">payment candidate</a>
          </body></html>
        `,
      };
    }
    if (url.endsWith('/contract/r10-market-001.html')) {
      return {
        ok: true,
        status: 200,
        text: async () => `
          <html>
            <head><title>R10-MARKET-001 01 Central Office Service Center Supplier Z electronic marketplace contract notice</title></head>
            <body>DD-2026-0001 Printer cartridge government procurement contract notice</body>
          </html>
        `,
      };
    }
    if (url.endsWith('/payment/r10-market-002.html')) {
      return {
        ok: true,
        status: 200,
        text: async () => `
          <html>
            <head><title>R10-MARKET-002 Nanjing Agency Supplier Y payment disclosure</title></head>
            <body>DD-2026-0002 treasury payment public disclosure</body>
          </html>
        `,
      };
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await runOfficialPublicDiscoveryCrawlerWithProvider({
    queue,
    searchProvider: {
      name: 'official_test_search',
      searchUrlTemplate: 'https://official.example/search?q={query}',
      baseUrl: 'https://official.example',
      maxCandidatePages: 2,
    },
    fetchImpl,
    searchedAt: '2026-04-27T12:00:00+08:00',
  });

  assert.equal(result.summary.total_items, 2);
  assert.equal(result.summary.by_status.matched, 2);
  assert.equal(result.summary.crawler_provider, 'official_test_search');
  assert.ok(fetched.some((url) => url.includes(encodeURIComponent('DD-2026-0001'))));

  const contract = result.items.find((item) => item.queue_id === 'q-market-contract');
  assert.equal(contract.crawler_status, 'matched');
  assert.equal(contract.matched_stage, 'contract');
  assert.equal(contract.matched_source_url, 'https://official.example/contract/r10-market-001.html');
  assert.ok(contract.top_candidate_titles.some((title) => title.includes('contract notice')));

  const payment = result.items.find((item) => item.queue_id === 'q-market-payment');
  assert.equal(payment.crawler_status, 'matched');
  assert.equal(payment.matched_stage, 'payment');
  assert.equal(payment.matched_source_url, 'https://official.example/payment/r10-market-002.html');
});

test('official discovery candidate parser normalizes result URLs and snippets', () => {
  const candidates = parseOfficialSearchCandidatesFromHtml({
    html: `
      <html><body>
        <a href="/contract/abc.html">合同公告 ABC</a>
        <a href="https://official.example/payment/def.html"><span>支付公开 DEF</span></a>
      </body></html>
    `,
    baseUrl: 'https://official.example/search',
  });

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].url, 'https://official.example/contract/abc.html');
  assert.equal(candidates[0].title, '合同公告 ABC');
  assert.equal(candidates[1].url, 'https://official.example/payment/def.html');
  assert.equal(candidates[1].title, '支付公开 DEF');
});
