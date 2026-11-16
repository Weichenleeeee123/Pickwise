import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateUnitEconomics,
  calculatePurchaseExposure,
  inspectEvidence,
  hasSalesTrendHistory,
  summarizeTransfer,
  parseProductReference
} from '../src/domain.js';

test('calculates contribution and break-even from explicit costs', () => {
  const result = calculateUnitEconomics({
    price: 20,
    goodsCost: 8,
    logisticsCost: 2,
    platformCost: 1,
    returnsCost: 0.5,
    otherCost: 0.5,
    cpc: 0.6,
    cvr: 0.1
  });

  assert.equal(result.preAdContribution, 8);
  assert.equal(result.acquisitionCost, 6);
  assert.equal(result.postAdContribution, 2);
  assert.equal(result.breakEvenCvr, 0.075);
});

test('keeps missing costs unknown instead of treating them as zero', () => {
  const result = calculateUnitEconomics({ price: 20, goodsCost: 8, cpc: 0.6, cvr: 0.1 });
  assert.equal(result.status, 'incomplete');
  assert.deepEqual(result.missing, ['logisticsCost', 'platformCost', 'returnsCost', 'otherCost']);
});

test('rejects invalid conversion rates and negative costs', () => {
  assert.throws(() => calculateUnitEconomics({ price: 20, goodsCost: 8, logisticsCost: 1, platformCost: 1, returnsCost: 0, otherCost: 0, cpc: 0.5, cvr: 0 }), /CVR/);
  assert.throws(() => calculateUnitEconomics({ price: 20, goodsCost: -1, logisticsCost: 1, platformCost: 1, returnsCost: 0, otherCost: 0, cpc: 0.5, cvr: 0.1 }), /non-negative/);
});

test('compares MOQ purchase cash with budget without claiming total startup funding', () => {
  assert.deepEqual(calculatePurchaseExposure({ budget: 2000, moq: 300, goodsCost: 8 }), {
    status: 'over_budget', purchaseAmount: 2400, budgetGap: 400
  });
  assert.deepEqual(calculatePurchaseExposure({ budget: 3000, moq: 300, goodsCost: 8 }), {
    status: 'within_budget', purchaseAmount: 2400, budgetGap: -600
  });
  assert.deepEqual(calculatePurchaseExposure({ budget: 2000, moq: 300, goodsCost: null }), {
    status: 'incomplete', missing: ['goodsCost']
  });
});

test('excludes incomplete sales windows and identifies parent-level duplicate sales', () => {
  const result = inspectEvidence([
    { asin: 'A-1', parent_asin: 'P-1', estimated_monthly_sales: 120, sales_scope: 'parent', period_start: '2026-10-01', period_end: '2026-10-31' },
    { asin: 'A-2', parent_asin: 'P-1', estimated_monthly_sales: 120, sales_scope: 'parent', period_start: '2026-10-01', period_end: '2026-10-31' },
    { asin: 'B-1', estimated_monthly_sales: 55, sales_scope: 'child' },
    { asin: 'C-1', estimated_monthly_sales: 0, sales_scope: 'child', period_start: '2026-10-01', period_end: '2026-10-31' }
  ]);

  assert.equal(result.usableSales.length, 3);
  assert.equal(result.excluded.length, 1);
  assert.equal(result.excluded[0].asin, 'B-1');
  assert.equal(result.duplicateGroups.length, 1);
  assert.equal(result.usableSales.find((row) => row.asin === 'A-2').includedForAggregation, false);
  assert.equal(result.usableSales.find((row) => row.asin === 'C-1').estimated_monthly_sales, 0);
});

test('does not mistake multiple products in one month for a sales history', () => {
  assert.equal(hasSalesTrendHistory([
    { asin: 'A-1', estimated_monthly_sales: 10, sales_scope: 'child', period_start: '2026-10-01', period_end: '2026-10-31' },
    { asin: 'B-1', estimated_monthly_sales: 12, sales_scope: 'child', period_start: '2026-10-01', period_end: '2026-10-31' }
  ]), false);
  assert.equal(hasSalesTrendHistory([
    { asin: 'A-1', estimated_monthly_sales: 9, sales_scope: 'child', period_start: '2026-09-01', period_end: '2026-09-30' },
    { asin: 'A-1', estimated_monthly_sales: 10, sales_scope: 'child', period_start: '2026-10-01', period_end: '2026-10-31' }
  ]), true);
});

test('summarizes transfer scores into the PRD outcome states', () => {
  assert.equal(summarizeTransfer({ scores: [2, 2, 2, 2], hints: 0 }).outcome, 'independent_application');
  assert.equal(summarizeTransfer({ scores: [2, 2, 2, 2], hints: 1 }).outcome, 'assisted_completion');
  assert.equal(summarizeTransfer({ scores: [2, 2, 2, 0], hints: 0 }).outcome, 'needs_practice');
  assert.equal(summarizeTransfer({ scores: [2, 2, 1, 1], hints: 0 }).outcome, 'independent_application');
  assert.equal(summarizeTransfer({ scores: [2, 2, 2, 1], hints: 0 }).total, 7);
  assert.equal(summarizeTransfer({ skipped: true }).outcome, 'unverified');
  assert.equal(summarizeTransfer({ scores: [2, 2, 2] }).outcome, 'unverified');
});

test('accepts a product name, ASIN, or Amazon US product link at the single-entry step', () => {
  assert.deepEqual(parseProductReference('B012345678'), { asin: 'B012345678', productName: 'B012345678', query: '' });
  assert.deepEqual(parseProductReference('https://www.amazon.com/dp/B012345678'), { asin: 'B012345678', productName: 'B012345678', query: '' });
  assert.deepEqual(parseProductReference('wireless label printer'), { asin: '待识别', productName: 'wireless label printer', query: 'wireless label printer' });
  assert.throws(() => parseProductReference('https://etsy.com/listing/123'), /Amazon.com/);
});
