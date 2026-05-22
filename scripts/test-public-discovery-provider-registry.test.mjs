import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadDiscoveryProviderRegistry,
  normalizeDiscoveryProviderRegistry,
  runOfficialPublicDiscoveryCrawlerSample,
  runOfficialPublicDiscoveryCrawlerWithProviders,
  sampleDiscoveryQueue,
} from './public-discovery-crawler.mjs';

test('official discovery provider registry normalizes live search sources', async () => {
  const registry = await loadDiscoveryProviderRegistry('data/source-registry/discovery_providers.json');
  assert.equal(registry.registry_version, 'discovery-provider-registry-v1');
  assert.ok(registry.providers.length >= 3);
  assert.ok(registry.providers.every((provider) => provider.provider_id));
  assert.ok(registry.providers.every((provider) => provider.searchUrlTemplate.includes('{query}')));
  assert.ok(registry.providers.some((provider) => provider.provider_id === 'ccgp_main_search'));
  assert.ok(registry.providers.some((provider) => provider.provider_id === 'jiangsu_ccgp_search'));
  assert.ok(registry.providers.every((provider) => Number.isInteger(provider.maxCandidatePages)));
});

test('official discovery crawler can run multiple configured providers and report hit rates', async () => {
  const queue = {
    items: [
      {
        queue_id: 'q-contract-multi-provider',
        target_stage: 'contract',
        project_code: 'R10-JS-001',
        purchaser_name: 'Jiangsu Test Purchaser',
        supplier_name: 'Supplier Contract',
      },
      {
        queue_id: 'q-payment-multi-provider',
        target_stage: 'payment',
        project_code: 'R10-JS-002',
        purchaser_name: 'Jiangsu Payment Purchaser',
        supplier_name: 'Supplier Payment',
      },
    ],
  };
  const providerRegistry = normalizeDiscoveryProviderRegistry({
    providers: [
      {
        provider_id: 'ccgp_main_search',
        name: 'CCGP Main Search',
        publisher: 'China Government Procurement Network',
        enabled: true,
        search_url_template: 'https://ccgp.example/search?q={query}',
        max_candidate_pages: 1,
      },
      {
        provider_id: 'jiangsu_ccgp_search',
        name: 'Jiangsu CCGP Search',
        publisher: 'Jiangsu Government Procurement Network',
        enabled: true,
        search_url_template: 'https://jiangsu.example/search?keyword={query}',
        max_candidate_pages: 2,
      },
    ],
  });
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(url);
    if (url.startsWith('https://ccgp.example/search')) {
      return {
        ok: true,
        status: 200,
        text: async () => '<html><body>No exact match</body></html>',
      };
    }
    if (url.startsWith('https://jiangsu.example/search')) {
      return {
        ok: true,
        status: 200,
        text: async () => `
          <html><body>
            <a href="/contract/r10-js-001.html">R10-JS-001 Supplier Contract contract notice</a>
            <a href="/payment/r10-js-002.html">R10-JS-002 Supplier Payment payment disclosure</a>
          </body></html>
        `,
      };
    }
    if (url.endsWith('/contract/r10-js-001.html')) {
      return {
        ok: true,
        status: 200,
        text: async () => '<title>R10-JS-001 Jiangsu Test Purchaser Supplier Contract contract notice</title>',
      };
    }
    if (url.endsWith('/payment/r10-js-002.html')) {
      return {
        ok: true,
        status: 200,
        text: async () => '<title>R10-JS-002 Jiangsu Payment Purchaser Supplier Payment payment disclosure</title>',
      };
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await runOfficialPublicDiscoveryCrawlerWithProviders({
    queue,
    providerRegistry,
    fetchImpl,
    searchedAt: '2026-04-27T12:30:00+08:00',
  });

  assert.equal(result.summary.total_items, 2);
  assert.equal(result.summary.by_status.matched, 2);
  assert.equal(result.summary.provider_count, 2);
  assert.equal(result.summary.provider_attempt_count, 4);
  assert.equal(result.summary.by_provider.ccgp_main_search.matched_count, 0);
  assert.equal(result.summary.by_provider.jiangsu_ccgp_search.matched_count, 2);
  assert.equal(result.summary.by_provider.jiangsu_ccgp_search.hit_rate, 100);
  assert.ok(result.items.every((item) => item.crawler_provider === 'jiangsu_ccgp_search'));
  assert.ok(fetched.some((url) => url.startsWith('https://ccgp.example/search')));
  assert.ok(fetched.some((url) => url.startsWith('https://jiangsu.example/search')));
});

test('official discovery crawler sample mode is deterministic and writes live-only summary data', async () => {
  const queue = {
    items: Array.from({ length: 30 }, (_, index) => ({
      queue_id: `sample-q-${String(index + 1).padStart(2, '0')}`,
      target_stage: index % 2 === 0 ? 'contract' : 'payment',
      project_code: `R11-SAMPLE-${String(index + 1).padStart(2, '0')}`,
      purchaser_name: 'Sample Purchaser',
      supplier_name: `Sample Supplier ${index + 1}`,
    })),
  };
  const firstSample = sampleDiscoveryQueue(queue, { sampleSize: 20, sampleSeed: 'round11-live' });
  const secondSample = sampleDiscoveryQueue(queue, { sampleSize: 20, sampleSeed: 'round11-live' });
  const otherSample = sampleDiscoveryQueue(queue, { sampleSize: 20, sampleSeed: 'round11-other' });

  assert.equal(firstSample.items.length, 20);
  assert.deepEqual(firstSample.items.map((item) => item.queue_id), secondSample.items.map((item) => item.queue_id));
  assert.notDeepEqual(firstSample.items.map((item) => item.queue_id), otherSample.items.map((item) => item.queue_id));
  assert.equal(queue.items.length, 30);

  const providerRegistry = normalizeDiscoveryProviderRegistry({
    providers: [{
      provider_id: 'sample_provider',
      name: 'Sample Provider',
      publisher: 'Sample Publisher',
      enabled: true,
      search_url_template: 'https://sample.example/search?q={query}',
      max_candidate_pages: 1,
    }],
  });
  const fetchImpl = async (url) => {
    if (url.startsWith('https://sample.example/search')) {
      return {
        ok: true,
        status: 200,
        text: async () => '<html><body>No exact live match</body></html>',
      };
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const result = await runOfficialPublicDiscoveryCrawlerSample({
    queue,
    providerRegistry,
    fetchImpl,
    sampleSize: 20,
    sampleSeed: 'round11-live',
    searchedAt: '2026-04-27T17:30:00+08:00',
  });

  assert.equal(result.summary.sample_mode, true);
  assert.equal(result.summary.sample_size, 20);
  assert.equal(result.summary.sample_seed, 'round11-live');
  assert.equal(result.summary.source_queue_total_items, 30);
  assert.equal(result.summary.total_items, 20);
  assert.equal(result.summary.stable_baseline_impact, false);
  assert.equal(result.summary.by_status.not_found, 20);
  assert.ok(result.items.every((item) => item.searched_at === '2026-04-27T17:30:00+08:00'));
});
