import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataForSeo } from '../server/dataforseo.js';

function response(tasks, cost = 0.0015) {
  return new Response(JSON.stringify({ status_code: 20000, tasks: tasks.map((items) => ({ status_code: 20000, cost, result: [{ items }] })) }), { status: 200 });
}

test('loads keyword product results as timestamped live evidence with purchase signal kept as estimate', async () => {
  const calls = [];
  const source = createDataForSeo({ login: 'user', password: 'pass', fetchImpl: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return response([{ type: 'amazon_serp', data_asin: 'B012345678', title: 'Label Printer', url: 'https://amazon.com/dp/B012345678', price_from: 29.99, currency: 'USD', rating: { value: 4.4, votes_count: 120 }, bought_past_month: 500 }]);
  }, now: () => new Date('2026-11-14T00:00:00.000Z') });

  const result = await source.fetchEvidence({ query: 'wireless label printer' });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /merchant\/amazon\/products\/live\/advanced$/);
  assert.equal(calls[0].body[0].keyword, 'wireless label printer');
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].asin, 'B012345678');
  assert.equal(result.records[0].price, 29.99);
  assert.equal(result.records[0].review_count, 120);
  assert.equal(result.records[0].monthly_purchase_signal, 500);
  assert.equal(result.records[0].estimated_monthly_sales, undefined);
  assert.equal(result.records[0].observed_at, '2026-11-14T00:00:00.000Z');
  assert.equal(result.cost, 0.0015);
});

test('uses cached keyword evidence inside the configured TTL without a paid request', async () => {
  let calls = 0;
  const source = createDataForSeo({ login: 'user', password: 'pass', cacheTtlMs: 60_000, fetchImpl: async () => {
    calls++;
    return response([{ type: 'amazon_serp', data_asin: 'B012345678', title: 'Label Printer' }]);
  }, now: () => new Date('2026-11-14T00:00:00.000Z') });

  await source.fetchEvidence({ query: 'label printer' });
  const second = await source.fetchEvidence({ query: 'label printer' });

  assert.equal(calls, 1);
  assert.equal(second.cached, true);
  assert.equal(second.cost, 0);
});

test('loads ASIN details and a bounded review sample from the Amazon ASIN endpoint', async () => {
  const calls = [];
  const source = createDataForSeo({ login: 'user', password: 'pass', fetchImpl: async (url, options) => {
    const call = { url, body: JSON.parse(options.body) };
    calls.push(call);
    if (url.endsWith('/dataforseo_labs/amazon/product_competitors/live')) return new Response(JSON.stringify({ status_code: 20000, tasks: [{ status_code: 20000, cost: 0.01, result: [{ items: [{ asin: 'B111111111', avg_position: 2, intersections: 4, competitor_metrics: { amazon_serp: { pos_1: 1, count: 4, search_volume: 4200 } } }] }] }] }), { status: 200 });
    if (call.body[0].asin === 'B111111111') return response([{ type: 'amazon_product_info', data_asin: 'B111111111', title: 'Another Label Printer', price_from: 34.99, currency: 'USD', rating: { value: 4.1, votes_count: 80 } }]);
    return response([{ type: 'amazon_product_info', data_asin: 'B012345678', title: 'Label Printer', price_from: 29.99, currency: 'USD', rating: { value: '4.4', votes_count: 120 }, top_local_reviews: [
      { title: 'Works well', review_text: 'Easy to set up', publication_date: '2026-11-01 00:00:00 +00:00', verified: true, rating: { value: 5 }, url: 'https://amazon.com/review/1' }
    ] }]);
  } });

  const result = await source.fetchEvidence({ asin: 'B012345678' });

  assert.match(calls[0].url, /merchant\/amazon\/asin\/live\/advanced$/);
  assert.equal(calls[0].body[0].asin, 'B012345678');
  assert.equal(calls.length, 3);
  assert.equal(result.records[0].rating, 4.4);
  assert.equal(result.records[0].review_samples[0].verified, true);
  assert.equal(result.records[0].review_samples[0].text, 'Easy to set up');
  assert.equal(result.records[1].competitor_avg_position, 2);
  assert.equal(result.records[1].competitor_metrics.amazon_serp.pos_1, 1);
  assert.equal(result.records[1].competitor_metrics.amazon_serp.search_volume, undefined);
});

test('returns no evidence when credentials are absent and fails clearly on provider errors', async () => {
  const disabled = createDataForSeo({});
  assert.equal(disabled.configured, false);
  assert.deepEqual(await disabled.fetchEvidence({ asin: 'B012345678' }), { records: [], cost: 0, cached: false, unavailable: true });

  const failing = createDataForSeo({ login: 'user', password: 'pass', fetchImpl: async () => new Response('denied', { status: 401 }) });
  await assert.rejects(failing.fetchEvidence({ asin: 'B012345678' }), /DataForSEO.*401/);
});

test('reuses recent persisted evidence from an earlier session', async () => {
  let calls = 0;
  const now = new Date('2026-11-14T00:00:00.000Z');
  const source = createDataForSeo({ login: 'user', password: 'pass', now: () => now, fetchImpl: async () => {
    calls++;
    return response([{ type: 'amazon_serp', data_asin: 'B012345678', title: 'Label Printer' }]);
  } });
  const first = await source.fetchEvidence({ query: 'label printer' });
  const restarted = createDataForSeo({ login: 'user', password: 'pass', now: () => now, fetchImpl: async () => {
    calls++;
    return response([]);
  } });

  const reused = await restarted.fetchEvidence({ query: 'label printer', cachedRecords: first.records });

  assert.equal(calls, 1);
  assert.equal(reused.cached, true);
  assert.equal(reused.records[0].asin, 'B012345678');
});
