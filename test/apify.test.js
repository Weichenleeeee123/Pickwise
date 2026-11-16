import test from 'node:test';
import assert from 'node:assert/strict';
import { createApify } from '../server/apify.js';
import { evidenceBrief } from '../server/agent/tools.js';

test('loads a keyword result and normalizes Apify Amazon fields without inventing sales history', async () => {
  let request;
  const source = createApify({ token: 'test-token', now: () => new Date('2026-11-14T00:00:00.000Z'), fetchImpl: async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return new Response(JSON.stringify([{ asin: 'B012345678', originalAsin: 'B012345678', title: 'Label Printer', url: 'https://www.amazon.com/dp/B012345678', price: { value: 29.99, currency: '$' }, priceRange: { min: { value: 24.99, currency: 'USD' }, max: { value: 39.99, currency: 'USD' } }, stars: 4.4, reviewsCount: 120, hasReviews: true, reviewsLink: 'https://www.amazon.com/product-reviews/B012345678', answeredQuestions: 18, condition: 'New', isAmazonChoice: true, amazonChoiceText: 'Amazon\'s Choice', bestsellerBadge: '#1 Best Seller', monthlyPurchaseVolume: '5K+ bought in past month', monthlyPurchaseVolumeMin: 5000, stockLeft: 'Only 4 left', maxOrderQuantity: 5, offersTotal: 7, lowestOfferPrice: { value: 27.99, currency: 'USD' }, lowestOfferSeller: { name: 'Lowest Seller' }, shipsFrom: 'Amazon.com', productOverview: [{ key: 'Print technology', value: 'Thermal' }], dimensions: '5 x 4 x 2 inches', weight: '1.2 pounds', modelNumber: 'LP-100', manufacturer: 'Acme', gtin: '123456789012', dateFirstAvailable: '2024-01-02', aPlusContent: { title: 'A+' }, brandStory: {}, categoryPageData: { pageNumber: 1, position: 3, productPosition: 3, organicPosition: 2, isSponsored: false, totalResults: 1000, badge: 'Amazon\'s Choice' }, bestsellerRanks: [{ rank: 17, category: 'Office Products' }] }]), { status: 200 });
  } });

  const result = await source.fetchEvidence({ query: 'wireless label printer' });

  const requestUrl = new URL(request.url);
  assert.match(requestUrl.pathname, /run-sync-get-dataset-items$/);
  assert.equal(requestUrl.searchParams.get('token'), 'test-token');
  assert.equal(requestUrl.searchParams.get('maxTotalChargeUsd'), '0.05');
  assert.equal(request.body.categoryOrProductUrls[0].url, 'https://www.amazon.com/s?k=wireless%20label%20printer');
  assert.equal(request.body.scrapeProductDetails, false);
  assert.equal(result.records[0].price, 29.99);
  assert.equal(result.records[0].currency, 'USD');
  assert.equal(result.records[0].monthly_purchase_signal, 5000);
  assert.equal(result.records[0].estimated_monthly_sales, undefined);
  assert.equal(result.records[0].monthly_purchase_min, 5000);
  assert.deepEqual(result.records[0].price_range, { min: 24.99, max: 39.99, currency: 'USD' });
  assert.equal(result.records[0].has_a_plus_content, true);
  assert.equal(result.records[0].has_brand_story, false);
  assert.equal(result.records[0].amazon_choice, true);
  assert.equal(result.records[0].bestseller_badge, '#1 Best Seller');
  assert.equal(result.records[0].answered_questions, 18);
  assert.equal(result.records[0].stock_left, 'Only 4 left');
  assert.equal(result.records[0].offers_count, 7);
  assert.equal(result.records[0].lowest_offer_price, 27.99);
  assert.equal(result.records[0].lowest_offer_seller, 'Lowest Seller');
  assert.equal(result.records[0].search_rank, 2);
  assert.equal(result.records[0].search_position, 3);
  assert.equal(result.records[0].is_sponsored, false);
  assert.deepEqual(result.records[0].product_overview, [{ key: 'Print technology', value: 'Thermal' }]);
  assert.equal(result.records[0].dimensions, '5 x 4 x 2 inches');
  assert.equal(result.records[0].date_first_available, '2024-01-02');
  assert.equal(result.cost, null);
});

test('loads an ASIN with full details and reuses the persisted cache', async () => {
  const calls = [];
  const source = createApify({ token: 'test-token', cacheTtlMs: 60_000, now: () => new Date('2026-11-14T00:00:00.000Z'), fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (calls.length === 1) {
      assert.equal(body.categoryOrProductUrls[0].url, 'https://www.amazon.com/dp/B012345678');
      assert.equal(body.maxOffers, 3);
      assert.equal(body.scrapeProductVariantPrices, true);
      return new Response(JSON.stringify([{ asin: 'B012345678', title: 'Label Printer', brand: 'Acme', bestsellerRanks: [{ category: 'Office Products', rank: 240 }, { category: 'Label Makers', rank: 4 }], price: { value: 29.99, currency: '$' }, aiReviewsSummary: { text: 'Easy to use' }, offers: [{ price: { value: 31 }, shippingPrice: { value: 2 }, condition: 'New', seller: { name: 'Other Seller' } }] }]), { status: 200 });
    }
    if (calls.length === 2) {
      assert.equal(body.categoryOrProductUrls[0].url, 'https://www.amazon.com/s?k=Label%20Makers');
      assert.equal(body.maxItemsPerStartUrl, 20);
      assert.equal(body.scrapeProductDetails, false);
      return new Response(JSON.stringify([
        { asin: 'B012345678', title: 'Label Printer', price: { value: 29.99, currency: '$' }, monthlyPurchaseVolume: '100 bought in past month', categoryPageData: { position: 1 } },
        { asin: 'B111111111', title: 'Comparable Label Maker', price: { value: 35, currency: '$' }, stars: 4.2, reviewsCount: 240, categoryPageData: { position: 2 } },
        { asin: 'B222222222', title: 'Second Label Maker', price: { value: 30, currency: '$' } },
        { asin: 'B333333333', title: 'Third Label Maker', price: { value: 32, currency: '$' } },
        { asin: 'B444444444', title: 'Fourth Label Maker', price: { value: 28, currency: '$' } }
      ]), { status: 200 });
    }
    assert.equal(body.scrapeProductDetails, true);
    assert.deepEqual(body.categoryOrProductUrls.map((entry) => entry.url), [
      'https://www.amazon.com/dp/B111111111', 'https://www.amazon.com/dp/B222222222', 'https://www.amazon.com/dp/B333333333'
    ]);
    return new Response(JSON.stringify([
      { asin: 'B111111111', title: 'Comparable Label Maker Full', price: { value: 35, currency: '$' }, listPrice: { value: 40 }, stars: 4.6, starsBreakdown: { '5star': 0.8, '4star': 0.1 }, reviewsCount: 840, bestsellerRanks: [{ rank: 12, category: 'Label Makers' }], aiReviewsSummary: { text: 'Reliable printing', keywords: [{ name: 'Reliability', mentions: 15, sentiment: 'positive' }] }, brand: 'Beta', seller: { name: 'Beta Official' }, features: ['Feature one'], variantDetails: [{ asin: 'B111111112', title: 'Blue' }], offers: [{ price: { value: 36 }, shippingPrice: { value: 0 }, condition: 'New', seller: { name: 'Third Party' }, isPrime: true }] },
      { asin: 'B222222222', title: 'Second Label Maker Full', price: { value: 30, currency: '$' }, stars: 4.1, reviewsCount: 220 },
      { asin: 'B333333333', title: 'Third Label Maker Full', price: { value: 32, currency: '$' }, stars: 4.3, reviewsCount: 310 }
    ]), { status: 200 });
  } });

  const first = await source.fetchEvidence({ asin: 'B012345678' });
  const second = await source.fetchEvidence({ asin: 'B012345678' });

  assert.equal(calls.length, 3);
  assert.equal(second.cached, true);
  assert.equal(first.records.length, 5);
  assert.equal(first.records[0].review_summary, 'Easy to use');
  assert.deepEqual(first.records[0].offers[0], {
    price: 31, currency: undefined, shipping_price: 2, condition: 'New', seller_name: 'Other Seller',
    seller_rating: null, delivery: null, ships_from: null, is_prime: null
  });
  assert.equal(first.records[0].monthly_purchase_signal, 100);
  assert.equal(first.records[0].rank, 4);
  assert.equal(first.records[0].search_rank, 1);
  assert.equal(first.records.filter((record) => record.asin === 'B012345678').length, 1);
  assert.equal(first.records.find((record) => record.asin === 'B111111111').title, 'Comparable Label Maker Full');
  assert.equal(first.records.find((record) => record.asin === 'B111111111').review_count, 840);
  assert.equal(first.records.find((record) => record.asin === 'B111111111').monthly_purchase_signal, null);
  assert.equal(first.records.find((record) => record.asin === 'B111111111').original_price, 40);
  assert.equal(first.records.find((record) => record.asin === 'B111111111').seller_name, 'Beta Official');
  assert.equal(first.records.find((record) => record.asin === 'B111111111').variant_details[0].asin, 'B111111112');
  assert.equal(first.records.find((record) => record.asin === 'B111111111').offers[0].price, 36);
  assert.equal(first.records.some((record) => record.asin === 'B444444444'), true);
});

test('looks up the target ASIN in a short title search when category results omit its purchase signal', async () => {
  const calls = [];
  const source = createApify({ token: 'test-token', fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (body.scrapeProductDetails) return new Response(JSON.stringify([{ asin: 'B012345678', title: 'Label Printer', bestsellerRanks: [{ category: 'Label Makers', rank: 4 }] }]), { status: 200 });
    const searchUrl = body.categoryOrProductUrls[0].url;
    if (searchUrl.includes('Label%20Makers')) return new Response(JSON.stringify([{ asin: 'B111111111', title: 'Another Label Maker', price: { value: 25, currency: '$' } }]), { status: 200 });
    assert.match(searchUrl, /s\?k=Label%20Printer/);
    assert.equal(body.maxItemsPerStartUrl, 5);
    return new Response(JSON.stringify([{ asin: 'B012345678', title: 'Label Printer', monthlyPurchaseVolume: '1K+ bought in past month' }]), { status: 200 });
  } });

  const result = await source.fetchEvidence({ asin: 'B012345678' });

  assert.equal(calls.length, 4);
  assert.equal(result.records.find((record) => record.asin === 'B012345678').monthly_purchase_signal, 1000);
  assert.equal(result.records.some((record) => record.asin === 'B111111111'), true);
});

test('deduplicates duplicate persisted rows when reusing a cache from an earlier session', async () => {
  let calls = 0;
  const source = createApify({ token: 'test-token', now: () => new Date('2026-11-14T00:00:00.000Z'), fetchImpl: async () => {
    calls++;
    return new Response(JSON.stringify([{ asin: 'B012345678', title: 'Label Printer' }]), { status: 200 });
  } });
  const duplicate = { asin: 'B012345678', title: 'Label Printer', observed_at: '2026-11-14T00:00:00.000Z', _cache_key: 'amazon:v5:asin:B012345678' };
  const result = await source.fetchEvidence({ asin: 'B012345678', cachedRecords: [duplicate, { ...duplicate }] });
  assert.equal(calls, 0);
  assert.equal(result.records.length, 1);
});

test('retries transient network resets before returning Apify evidence', async () => {
  let calls = 0;
  const source = createApify({ token: 'test-token', fetchImpl: async (_url, options) => {
    calls++;
    if (calls === 1) throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } });
    const input = JSON.parse(options.body);
    const asin = input.scrapeProductDetails ? 'B012345678' : 'B111111111';
    return new Response(JSON.stringify([{ asin, title: input.scrapeProductDetails ? 'Label Printer' : 'Nearby Label Maker' }]), { status: 200 });
  } });

  const result = await source.fetchEvidence({ asin: 'B012345678' });

  assert.ok(calls >= 3);
  assert.equal(result.records[0].asin, 'B012345678');
  assert.ok(result.records.some((record) => record.asin === 'B111111111'));
});

test('returns unavailable without a token and surfaces scraper errors', async () => {
  const disabled = createApify({});
  assert.deepEqual(await disabled.fetchEvidence({ asin: 'B012345678' }), { records: [], cost: null, cached: false, unavailable: true });
  const failing = createApify({ token: 'test-token', fetchImpl: async () => new Response(JSON.stringify([{ error: 'blocked', errorDescription: 'blocked by Amazon' }]), { status: 200 }) });
  await assert.rejects(failing.fetchEvidence({ asin: 'B012345678' }), /blocked by Amazon/);
});

test('passes the richer Apify product and search signals into the model evidence brief', () => {
  const brief = evidenceBrief({
    id: 'E1', asin: 'B012345678', title: 'Label Printer', source_name: 'Apify', observed_at: '2026-11-15T00:00:00.000Z', source_mode: 'live_api',
    amazon_choice: true, bestseller_badge: '#1 Best Seller', answered_questions: 18, search_rank: 2, search_position: 3,
    is_sponsored: false, monthly_purchase_min: 5000, lowest_offer_price: 27.99, lowest_offer_seller: 'Lowest Seller',
    product_overview: [{ key: 'Print technology', value: 'Thermal' }], dimensions: '5 x 4 x 2 inches',
    stock_left: 'Only 4 left', max_order_quantity: 5, image_count: 6, image_urls: ['https://images.example.com/label-printer.jpg']
  });

  assert.equal(brief.amazon_choice, true);
  assert.equal(brief.search_rank, 2);
  assert.equal(brief.search_position, 3);
  assert.equal(brief.is_sponsored, false);
  assert.equal(brief.monthly_purchase_min, 5000);
  assert.equal(brief.lowest_offer_price, 27.99);
  assert.deepEqual(brief.product_overview, [{ key: 'Print technology', value: 'Thermal' }]);
  assert.equal(brief.stock_left, 'Only 4 left');
  assert.equal(brief.image_urls.length, 1);
});
