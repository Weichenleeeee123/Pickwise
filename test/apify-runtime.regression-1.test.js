import test from 'node:test';
import assert from 'node:assert/strict';
import { apifyResponseError, withApifyRun } from '../server/apify-runtime.js';
import { normalizeKeepaHistory } from '../server/research-sources.js';

test('Apify run queue shares a two-run ceiling across simultaneous work', async () => {
  let active = 0;
  let peak = 0;
  const values = await Promise.all(Array.from({ length: 10 }, (_, i) => withApifyRun(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 3));
    active--;
    return i;
  })));
  assert.equal(peak, 2);
  assert.deepEqual(values, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('402 errors retain their reason and only resource rejection is retryable', async () => {
  const memory = await apifyResponseError(new Response(JSON.stringify({ error: {
    type: 'actor-memory-limit-exceeded', message: 'Not enough free memory. token=secret-value'
  } }), { status: 402 }), 'dimensions', 'secret-value');
  assert.equal(memory.apifyResourceLimit, true);
  assert.match(memory.message, /actor-memory-limit-exceeded/);
  assert.doesNotMatch(memory.message, /secret-value/);
  const billing = await apifyResponseError(new Response(JSON.stringify({ error: {
    type: 'usage-limit-exceeded', message: 'Monthly usage limit reached.'
  } }), { status: 402 }), 'dimensions');
  assert.equal(billing.apifyResourceLimit, false);
  assert.match(billing.message, /Monthly usage limit/);
});

test('Keepa lowercase US marketplace retains already-purchased price and review history', () => {
  const rows = normalizeKeepaHistory([{
    asin: 'B0C2JXSHSK', marketplace: 'us', currency: 'USD',
    buyBoxPriceHistory: [{ date: '2026-11-15T09:00:00Z', price: 59.95 }],
    writtenReviewsHistory: [{ date: '2026-11-01', value: 236 }],
    fbaFee: 8.29, packageWeightGrams: 730
  }], 'B0C2JXSHSK', '2026-11-16T00:00:00Z');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].price_history.buy_box[0].value, 59.95);
  assert.equal(rows[0].written_review_history[0].count, 236);
  assert.equal(rows[0].fees.fba_fee, 8.29);
  assert.equal(rows[0].package_size.weight_grams, 730);
  assert.deepEqual(normalizeKeepaHistory([{ asin: 'B0C2JXSHSK', marketplace: 'uk' }], 'B0C2JXSHSK', '2026-11-16'), []);
});
