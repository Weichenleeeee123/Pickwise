import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../server/session.js';
import * as calc from '../server/calc.js';

const session = () => createSession({ input: 'B012345678', parsed: { asin: 'B012345678', productName: 'Wireless Label Printer', query: '' } });

test('market observation never becomes a planned selling price implicitly', () => {
  const s = session();
  s.evidence.push({ id: 'E1', asin: s.targetAsin, price: 29.99, currency: 'USD', observed_at: '2026-11-15T00:00:00Z' });
  const result = calc.effectiveConstraints(s);
  assert.equal(result.values.price, null);
  assert.equal(result.marketPrice.value, 29.99);
  assert.equal(result.marketPrice.evidenceId, 'E1');
});

test('full launch funding includes landed inventory and launch reserves with unknowns preserved', () => {
  const s = session();
  Object.assign(s.constraints, { budget: 3000, moq: 100, launch: { freight: 300, duty: 100, prep: 50, advertising: 500, storage: 60, compliance: 200, fixed: 90, reserve: 100, leadDays: 20, inventoryDays: 60, payoutDays: 14 } });
  s.constraints.values.goodsCost = 8;
  const r = calc.computeFunding(s);
  assert.equal(r.totalRequired, 2200);
  assert.equal(r.budgetGap, -800);
  assert.equal(r.cashCycleDays, 94);
  s.constraints.launch.freight = null;
  assert.equal(calc.computeFunding(s).status, 'incomplete');
  assert.equal(calc.computeFunding(s).totalRequired, null);
});

test('sensitivity scenarios are explicit program calculations and never fill missing costs', () => {
  assert.equal(typeof calc.computeScenarios, 'function');
  const s = session();
  Object.assign(s.constraints.values, { price: 20, goodsCost: 8, logisticsCost: 2, platformCost: 1, returnsCost: 0.5, otherCost: 0.5, cpc: 0.6, cvr: 0.1 });
  const r = calc.computeScenarios(s);
  assert.equal(r.status, 'complete');
  assert.ok(r.rows.some(row => row.values.price === 18 && row.result.postAdContribution === 0));
  s.constraints.values.goodsCost = null;
  assert.equal(calc.computeScenarios(s).status, 'incomplete');
});

test('keyword evidence retains provider freshness and is never a sales series', async () => {
  const { normalizeKeywordRows } = await import('../server/research-sources.js');
  const rows = normalizeKeywordRows([{ mode: 'reverseAsin', asin: 'B012345678', keyword: 'label printer', found: true, searchVolume: 1200, rank: 7, rankCheckedAt: '2026-10-01T00:00:00Z', observedAt: '2026-11-15T00:00:00Z', market: 'US' }]);
  assert.equal(rows[0].monthly_searches, 1200);
  assert.equal(rows[0].rank_checked_at, '2026-10-01T00:00:00Z');
  assert.equal(rows[0].nature, 'estimate');
  assert.equal(rows[0].estimated_monthly_sales, undefined);
  assert.equal(normalizeKeywordRows([{ found: true, keyword: 'bad', searchVolume: -1 }]).length, 0);
});

test('recall brand matches cannot be mislabeled as exact target matches', async () => {
  const { normalizeRecalls } = await import('../server/research-sources.js');
  const rows = normalizeRecalls([{ RecallID: 1, Title: 'Acme recall', URL: 'https://www.cpsc.gov/Recalls/2026/acme', RecallDate: '2026-10-01', Products: [{ Name: 'Acme Other Printer', Model: 'LP-200' }], ProductUPCs: [] }], { brand: 'Acme', model_number: 'LP-100', gtin: '123456789012' }, '2026-11-15T00:00:00Z');
  assert.equal(rows[0].match, 'candidate');
  assert.equal(rows[0].nature, 'fact');
  assert.equal(rows[0].target_recalled, false);
});

test('candidate matching rejects accessories and keeps uncertain specifications visible', async () => {
  const { matchCompetitors } = await import('../server/business-evidence.js');
  const target = { asin: 'B012345678', title: 'Wireless Thermal Label Printer', price: 100, currency: 'USD', brand: 'Acme' };
  const rows = matchCompetitors(target, [{ asin: 'B111111111', title: 'Wireless Thermal Label Printer', price: 95, currency: 'USD', brand: 'Beta' }, { asin: 'B222222222', title: 'Replacement labels for Wireless Thermal Label Printer', price: 10, currency: 'USD' }]);
  assert.equal(rows.find(row => row.asin === 'B222222222').match.classification, 'not_comparable');
  assert.notEqual(rows.find(row => row.asin === 'B111111111').match.classification, 'not_comparable');
  assert.ok(rows[0].match.limits.length);
});

test('source adapter calls bounded specialist actors and preserves independent failures', async () => {
  const { createResearchSources } = await import('../server/research-sources.js');
  const calls = [];
  const provider = createResearchSources({ token: 'test-token', now: () => new Date('2026-11-15T00:00:00Z'), fetchImpl: async (url, init) => {
    calls.push({ url: String(url), body: init?.body && JSON.parse(init.body) });
    if (String(url).includes('amazon-keyword')) return new Response(JSON.stringify([{ found: true, keyword: 'label printer', searchVolume: 1200, market: 'US', mode: 'reverseAsin', asin: 'B012345678', observedAt: '2026-11-15T00:00:00Z' }]));
    if (String(url).includes('google-trends')) return new Response(JSON.stringify([{ rowType: 'interest_over_time', keyword: 'label printer', date: '2026-10-01', value: 80, isPartial: false, geo: 'US' }, { rowType: 'interest_over_time', keyword: 'label printer', date: '2026-11-01', value: 90, isPartial: true, geo: 'US' }]));
    if (String(url).includes('amazon-reviews')) return new Response(JSON.stringify({ data: { id: 'reviewrun', status: 'SUCCEEDED', defaultDatasetId: 'reviews', defaultKeyValueStoreId: 'reviews' } }));
    if (String(url).includes('/datasets/reviews/')) return new Response('[]');
    if (String(url).includes('/reviews/records/RUN_SUMMARY')) return new Response(JSON.stringify({ marketplaces: { com: { status: 'NEEDS_LOGIN' } } }));
    if (String(url).includes('saferproducts.gov')) return new Response('[]');
    return new Response('<html><title>Official policy</title><main>Official product safety requirements and guidance.</main></html>');
  } });
  const result = await provider.fetchEvidence({ target: { asin: 'B012345678', title: 'Label Printer', brand: 'Acme' } });
  assert.ok(result.records.some(row => row.evidence_kind === 'keyword'));
  assert.equal(result.records.find(row => row.evidence_kind === 'search_interest').points.length, 1);
  assert.equal(result.sources.reviews.status, 'needs_login');
  assert.equal(result.sources.recalls.status, 'loaded');
  for (const call of calls.filter(call => call.body)) assert.ok(Number(new URL(call.url).searchParams.get('maxTotalChargeUsd')) <= 0.1);
});

test('seller and quote imports keep source currency and date and calculate ads from actual totals', async () => {
  const { parseOperatingFile } = await import('../server/operating-import.js');
  const quotes = parseOperatingFile('quotes.json', JSON.stringify({ type: 'quotes', source: 'Supplier quote Q1', date: '2026-11-15', currency: 'USD', values: { goodsCost: 8 }, launch: { freight: 300 }, moq: 100 }));
  assert.equal(quotes.values.goodsCost, 8);
  assert.equal(quotes.provenance.source, 'Supplier quote Q1');
  const ads = parseOperatingFile('ads.csv', 'Date,Advertised ASIN,Spend,Clicks,Purchases,Currency\n2026-11-01,B012345678,60,100,10,USD', 'B012345678');
  assert.equal(ads.values.cpc, 0.6);
  assert.equal(ads.values.cvr, 0.1);
  assert.equal(ads.provenance.nature, 'fact');
  assert.throws(() => parseOperatingFile('quotes.json', JSON.stringify({ type: 'quotes', values: { goodsCost: 8 } })), /来源|source|日期/);
});

test('monitoring appends unique snapshots without deleting or overwriting historical evidence', async () => {
  const { collectSnapshot } = await import('../server/monitoring.js');
  const s = session();
  s.monitoring = { enabled: true, intervalHours: 24, maxSamples: 7, samples: 0 };
  const deps = { provider: { fetchSnapshot: async () => ({ records: [{ asin: s.targetAsin, observed_at: '2026-11-15T00:00:00Z', price: 20, currency: 'USD' }] }) }, persist: async () => {} };
  await collectSnapshot(s, deps);
  await collectSnapshot(s, deps);
  assert.equal(s.evidence.length, 1);
  assert.equal(s.evidence[0].id, 'E1');
  assert.equal(s.monitoring.samples, 2);
});

test('unrelated reverse ASIN keywords cannot drive the chosen trend query', async () => {
  const { classifyKeywords } = await import('../server/research-sources.js');
  const rows = classifyKeywords([{ keyword: 'new balance' }, { keyword: 'womens shoes' }, { keyword: 'adidas vl court' }], { title: 'adidas Womens VL Court Sneakers', brand: 'adidas', category_path: 'Womens Shoes' });
  assert.equal(rows[0].relevance, 'excluded');
  assert.equal(rows[1].relevance, 'category');
  assert.equal(rows[2].relevance, 'target');
});

test('business evidence panel shows real-source gaps relevance and dated observations', async () => {
  const { renderBusinessEvidence } = await import('../src/ui/business.js');
  const html = renderBusinessEvidence({ targetAsin: 'B012345678', running: false, demo: false, monitoring: { enabled: true, samples: 1, maxSamples: 7, intervalHours: 24 }, businessEvidence: { keywords: [{ id: 'E2', keyword: 'printer', monthly_searches: 1200, relevance: 'category', source_url: 'https://apify.com/plainrows/amazon-keyword-research', observed_at: '2026-11-15' }], trends: [], competitors: [], official: [], history: [] }, supplementalSources: { reviews: { status: 'needs_login', message: '需要登录' } } });
  assert.match(html, /1200/); assert.match(html, /需要登录/); assert.match(html, /2026-11-15/);
  assert.match(html, /采样/); assert.match(html, /不是销量/);
});

test('policy login shells and unrelated model tokens are not accepted as verified evidence', async () => {
  const { parseOfficialPolicy, normalizeRecalls } = await import('../server/research-sources.js');
  assert.equal(typeof parseOfficialPolicy, 'function');
  assert.throws(() => parseOfficialPolicy('<html>You need to enable JavaScript to run this app.</html>'), /正文|JavaScript|登录/);
  assert.throws(() => parseOfficialPolicy('<html>请登录亚马逊卖家平台，注册开始销售。</html>'), /正文|登录/);
  const rows = normalizeRecalls([{ Title: 'Other brand model', URL: 'https://www.cpsc.gov/Recalls/2026/x', Products: [{ Name: 'Other brand', Model: '100' }] }], { asin: 'B012345678', brand: 'Acme', model_number: '100' }, '2026-11-15');
  assert.equal(rows[0].target_recalled, false);
});

test('latest keyword and trend samples supersede old values without erasing stored history', async () => {
  const { businessEvidence } = await import('../server/business-evidence.js');
  const s = session();
  s.evidence = [{ evidence_kind: 'keyword', asin: s.targetAsin, keyword: 'printer', monthly_searches: 100, relevance: 'category', observed_at: '2026-10-01' }, { evidence_kind: 'keyword', asin: s.targetAsin, keyword: 'printer', monthly_searches: 200, relevance: 'category', observed_at: '2026-11-15' }];
  assert.equal(businessEvidence(s).keywords.length, 1);
  assert.equal(businessEvidence(s).keywords[0].monthly_searches, 200);
  assert.equal(s.evidence.length, 2);
});

test('null sales cannot count as an observed sales trend', async () => {
  const { hasSalesTrendHistory } = await import('../src/domain.js');
  assert.equal(hasSalesTrendHistory([{ asin: 'B012345678', period_start: '2026-09-01', period_end: '2026-09-30', sales_scope: 'child', estimated_monthly_sales: null }, { asin: 'B012345678', period_start: '2026-10-01', period_end: '2026-10-31', sales_scope: 'child', estimated_monthly_sales: null }]), false);
});

test('competitor branded keywords are not treated as generic category demand', async () => {
  const { classifyKeywords } = await import('../server/research-sources.js');
  const rows = classifyKeywords([{ keyword: 'vans shoes' }, { keyword: 'womens shoes' }], { title: 'adidas Womens VL Court Sneakers', brand: 'adidas', category_path: 'Womens Shoes' });
  assert.equal(rows[0].relevance, 'excluded');
  assert.equal(rows[1].relevance, 'category');
});

test('seller sales reports preserve actual units by date and do not relabel daily units as monthly estimates', async () => {
  const { parseOperatingFile, applyOperatingImport } = await import('../server/operating-import.js');
  const parsed = parseOperatingFile('sales.csv', 'Date,Child ASIN,Units Ordered,Ordered Product Sales,Currency\n2026-11-01,B012345678,12,240,USD\n2026-11-02,B012345678,10,200,USD', 'B012345678');
  assert.equal(parsed.sales.length, 2);
  assert.equal(parsed.sales[0].units_ordered, 12);
  assert.equal(parsed.sales[0].estimated_monthly_sales, undefined);
  const s = session(); applyOperatingImport(s, parsed);
  assert.equal(s.evidence.length, 2);
  assert.equal(s.evidence[0].evidence_kind, 'seller_sales');
  assert.equal(s.evidence[0].nature, 'fact');
});

test('agent cannot fill unknown economics inputs by proposing arbitrary scenario overrides', async () => {
  const { buildTools } = await import('../server/agent/tools.js');
  const s = session();
  const tool = buildTools(s, ['compute_unit_economics'])[0];
  const r = tool.handler({ price: 20, goodsCost: 8, logisticsCost: 2, platformCost: 1, returnsCost: 0.5, otherCost: 0.5, cpc: 0.6, cvr: 0.1 });
  assert.equal(r.status, 'incomplete');
  assert.equal(r.postAdContribution, undefined);
});

test('unchanged saves preserve imported provenance instead of relabeling it as a manual assumption', async () => {
  const { validateConstraints } = await import('../server/app.js');
  const s = session();
  s.constraints.values.cpc = 0.6; s.constraints.inputSources = { cpc: { source: 'ads.csv', date: '2026-11-01', nature: 'fact' } };
  const r = validateConstraints({ values: { cpc: 0.6 } }, s.constraints);
  assert.equal(r.inputSources.cpc.source, 'ads.csv');
});

test('keyword and seller identity mismatches are excluded during normalization', async () => {
  const { normalizeKeywordRows } = await import('../server/research-sources.js');
  const rows = normalizeKeywordRows([{ found: true, keyword: 'printer', asin: 'B999999999', searchVolume: 100 }], { asin: 'B012345678' });
  assert.equal(rows.length, 0);
});

test('launch currency changes invalidate imported cost provenance', async () => {
  const { validateConstraints } = await import('../server/app.js');
  const s = session();
  s.constraints.values.goodsCost = 8; s.constraints.inputSources = { goodsCost: { source: 'USD quote', date: '2026-11-01', nature: 'assumption' } };
  const next = validateConstraints({ goodsCostCurrency: 'CNY' }, s.constraints);
  assert.equal(next.inputSources.goodsCost.source, '用户手工输入');
});

test('review status is read from the actual run summary rather than guessed from an empty dataset', async () => {
  const { createResearchSources } = await import('../server/research-sources.js');
  const provider = createResearchSources({ token: 'test', fetchImpl: async (url) => {
    const path = String(url);
    if (path.includes('amazon-reviews-scraper/runs?')) return new Response(JSON.stringify({ data: { id: 'run1', status: 'SUCCEEDED', defaultDatasetId: 'dataset1', defaultKeyValueStoreId: 'store1' } }));
    if (path.includes('/datasets/dataset1/')) return new Response('[]');
    if (path.includes('/store1/records/RUN_SUMMARY')) return new Response(JSON.stringify({ marketplaces: { com: { status: 'OK', reviews: 0, signedIn: true } } }));
    if (path.includes('saferproducts')) return new Response('[]');
    if (path.includes('api.apify')) return new Response('[]');
    return new Response('<main>Official source policy text has been returned for inspection.</main>');
  } });
  const r = await provider.fetchEvidence({ target: { asin: 'B012345678', title: 'Printer', brand: 'Acme' } });
  assert.equal(r.sources.reviews.status, 'no_data');
  assert.doesNotMatch(r.sources.reviews.message ?? '', /需要.*登录/);
});

test('zero order advertising reports preserve actual CPC and leave CVR unusable rather than discard all data', async () => {
  const { parseOperatingFile } = await import('../server/operating-import.js');
  const r = parseOperatingFile('ads.csv', 'Date,Advertised ASIN,Spend,Clicks,Purchases,Currency\n2026-11-01,B012345678,60,100,0,USD', 'B012345678');
  assert.equal(r.values.cpc, 0.6);
  assert.equal(r.values.cvr, null);
  assert.equal(r.totals.orders, 0);
});

test('search interest seasonality only reports repeated calendar patterns with enough complete years', async () => {
  const { summarizeInterest } = await import('../server/business-evidence.js');
  const points = [];
  for (let year = 2022; year <= 2025; year++) for (let month = 1; month <= 12; month++) points.push({ date: `${year}-${String(month).padStart(2, '0')}-01`, value: month === 12 ? 100 : 20 });
  const summary = summarizeInterest(points);
  assert.equal(summary.completeYears, 4);
  assert.equal(summary.recurringPeakMonth, 12);
  assert.equal(summarizeInterest(points.slice(-12)).recurringPeakMonth, null);
});

test('plural shopping terms remain relevant while other brand terms stay excluded', async () => {
  const { classifyKeywords } = await import('../server/research-sources.js');
  const r = classifyKeywords([{ keyword: 'womens shoes' }, { keyword: 'vans shoes' }], { title: "adidas Women's VL Court Sneakers", brand: 'adidas', category_path: "Women's Fashion Sneakers" });
  assert.equal(r[0].relevance, 'category'); assert.equal(r[1].relevance, 'excluded');
});

test('corrected seller report replaces analysis value but preserves the original imported record', async () => {
  const { parseOperatingFile, applyOperatingImport } = await import('../server/operating-import.js');
  const { businessEvidence } = await import('../server/business-evidence.js');
  const s = session();
  for (const units of [12, 14]) applyOperatingImport(s, parseOperatingFile('sales.csv', `Date,Child ASIN,Units Ordered,Ordered Product Sales,Currency\n2026-11-01,B012345678,${units},240,USD`, s.targetAsin));
  assert.equal(s.evidence.length, 2);
  assert.equal(businessEvidence(s).sellerSales.length, 1);
  assert.equal(businessEvidence(s).sellerSales[0].units_ordered, 14);
});

test('targeted policy discovery only follows relevant official CPSC guidance links', async () => {
  const { relevantPolicyLinks } = await import('../server/research-sources.js');
  const links = relevantPolicyLinks('<main><a href="/Business--Manufacturing/Business-Education/FAQ?p=1&amp;tid=2">Clothing and footwear</a><a href="https://attacker.test/policy">Shoes</a><a href="/Business--Manufacturing/Business-Education/FAQ?p=3">Batteries</a></main>', { title: 'Women Shoes', category_path: 'Fashion Sneakers' });
  assert.equal(links.length, 1);
  assert.equal(new URL(links[0].url).hostname, "www.cpsc.gov");
  assert.match(links[0].url, /&tid=2/);
  const adult = relevantPolicyLinks('<main><a href="/Business--Manufacturing/Business-Education/FAQ?p=1">Bibs, Burp Cloths, and Blankets</a><a href="/Business--Manufacturing/Business-Education/FAQ?p=2">Cloth Diapers</a><a href="/Business--Manufacturing/Business-Education/FAQ?p=3">Clothing</a></main>', { title: 'Women Shoes' });
  assert.equal(adult.length, 1); assert.equal(adult[0].title, 'Clothing');
  const footwear = relevantPolicyLinks('<main><a href="/Business--Manufacturing/Business-Education/FAQ?p=3">Clothing</a><a href="/Business--Manufacturing/Business-Education/FAQ?p=4">Clothing Storage Units</a></main>', { title: 'Women Shoes' });
  assert.equal(footwear.length, 1);
});

test('fresh evidence does not trigger a false cost-changed banner', async () => {
  const { buildView } = await import('../server/view.js');
  const { constraintsHash } = await import('../server/agent/pipeline.js');
  const s = session();
  s.research.constraintsHash = constraintsHash(s);
  s.evidence.push({ id: 'E1', asin: s.targetAsin, title: 'Printer', observed_at: '2026-11-15', price: 20, currency: 'USD' });
  s.research.evidenceCount = s.evidence.length;
  assert.equal(buildView(s).cardsStale, false);
});

test('sampling attempt is persisted before starting a paid provider call', async () => {
  const { collectSnapshot } = await import('../server/monitoring.js');
  const s = session(); let saved = false;
  await collectSnapshot(s, { persist: async () => { saved = true; }, provider: { fetchSnapshot: async () => { assert.equal(saved, true); return { records: [{ asin: s.targetAsin, observed_at: '2026-11-15', price: 20 }] }; } } });
  assert.equal(s.monitoring.lastError, null);
});

test('explicitly skipping review collection prevents paid review Actor calls', async () => {
  const { createResearchSources } = await import('../server/research-sources.js');
  let called = false;
  const provider = createResearchSources({ token: 'test', fetchImpl: async url => { if (String(url).includes('amazon-reviews')) called = true; if (String(url).includes('api.apify') || String(url).includes('saferproducts')) return new Response('[]'); return new Response('<main>Official policy text returned for business verification.</main>'); } });
  const result = await provider.fetchEvidence({ target: { asin: 'B012345678', title: 'Printer' }, skipReviews: true });
  assert.equal(called, false); assert.equal(result.sources.reviews.status, 'skipped');
});

test('old policy cache versions never bypass corrected product relevance rules', async () => {
  const { createResearchSources } = await import('../server/research-sources.js');
  const cached = { asin: 'B012345678', title: 'CPSC Cloth Diapers', evidence_kind: 'official_policy', observed_at: new Date().toISOString(), source_url: 'https://www.cpsc.gov/irrelevant', _research_key: 'v3:B012345678:policies' };
  const p = createResearchSources({ token: 'test', fetchImpl: async url => String(url).includes('api.apify') || String(url).includes('saferproducts') ? new Response('[]') : new Response('<main>Correct official general guidance for inspection.</main>') });
  const r = await p.fetchEvidence({ target: { asin: 'B012345678', title: 'Women Shoes' }, cachedRecords: [cached], skipReviews: true });
  assert.equal(r.records.some(row => row.title === 'CPSC Cloth Diapers'), false);
});

test('new official policy batch supersedes obsolete discovered links in analysis without deleting evidence', async () => {
  const { businessEvidence } = await import('../server/business-evidence.js');
  const s = session();
  s.evidence = [{ id: 'E1', asin: s.targetAsin, evidence_kind: 'official_policy', title: 'CPSC Cloth Diapers', observed_at: '2026-11-14T00:00:00Z' }, { id: 'E2', asin: s.targetAsin, evidence_kind: 'official_policy', title: 'CPSC Clothing', observed_at: '2026-11-15T00:00:00Z' }];
  assert.equal(businessEvidence(s).official.length, 1); assert.equal(businessEvidence(s).official[0].id, 'E2');
  assert.equal(s.evidence.length, 2);
});

test('scheduler performs due work once and disables sampling at its persisted attempt limit', async () => {
  const { startMonitor } = await import('../server/monitoring.js');
  const s = session(); s.monitoring = { enabled: true, intervalHours: 24, maxSamples: 1, samples: 0, nextAt: '2026-01-01' };
  let calls = 0;
  const monitor = startMonitor({ store: { list: () => [s], save: async () => {} }, provider: { fetchSnapshot: async () => { calls++; return { records: [{ asin: s.targetAsin, observed_at: '2026-11-15', price: 20 }] }; } }, intervalMs: 60000 });
  try { await monitor.tick(); await monitor.tick(); assert.equal(calls, 1); assert.equal(s.monitoring.enabled, false); assert.equal(s.evidence.length, 1); } finally { monitor.stop(); }
});

test('model market brief stays compact while preserving trend calculations official excerpts and IDs', async () => {
  const { marketBrief } = await import('../server/agent/tools.js');
  const s = session();
  s.evidence = [{ id: 'E1', asin: s.targetAsin, evidence_kind: 'search_interest', title: 'Printer', keyword: 'printer', points: Array.from({ length: 260 }, (_, i) => ({ date: `${2021+Math.floor(i/52)}-${String(i%12+1).padStart(2,'0')}-01`, value: i%100 })), observed_at: '2026-11-15' }, { id: 'E2', asin: s.targetAsin, evidence_kind: 'official_policy', title: 'Official policy', excerpt: 'policy text '.repeat(2000), observed_at: '2026-11-15' }];
  const r = marketBrief(s);
  assert.ok(JSON.stringify(r).length < 15000);
  assert.equal(r.official[0].id, 'E2'); assert.ok(r.trends[0].summary); assert.equal(s.evidence[0].points.length, 260);
});

test('research coverage tool reports available evidence, source dates, estimate nature, and explicit collection gaps', async () => {
  const { buildTools } = await import('../server/agent/tools.js');
  const s = session();
  s.supplementalSources = {
    reviews: { status: 'needs_login', observedAt: '2026-11-15T00:00:00Z', message: '评论 Actor 需要登录' },
    dimensions: { status: 'loaded', observedAt: '2026-11-15T00:00:00Z' },
    alibaba1688: { status: 'no_data', observedAt: '2026-11-15T00:00:00Z', message: '公开搜索无带价 MOQ 结果' }
  };
  s.evidence = [
    { id: 'E1', asin: s.targetAsin, evidence_kind: 'package_dimensions', nature: 'fact', source_name: 'Amazon package data', observed_at: '2026-11-15T00:00:00Z', package_weight: 1.2 },
    { id: 'E2', asin: s.targetAsin, evidence_kind: 'market_sales_estimate', nature: 'estimate', source_name: 'Amazon history API', observed_at: '2026-11-15T00:00:00Z', purchases_last30_days: 40 }
  ];
  const result = buildTools(s, ['inspect_research_coverage'])[0].handler();
  assert.equal(result.sources.reviews.status, 'needs_login');
  assert.equal(result.sources.dimensions.observedAt, '2026-11-15T00:00:00Z');
  assert.ok(result.available.some(row => row.evidence_kind === 'market_sales_estimate' && row.nature === 'estimate' && row.evidence_ids.includes('E2')));
  assert.ok(result.available.some(row => row.evidence_kind === 'package_dimensions' && row.evidence_ids.includes('E1')));
  assert.ok(result.gaps.some(row => row.topic === 'reviews' && /登录/.test(row.reason)));
  assert.ok(result.gaps.some(row => row.topic === 'supplier_quotes' && /MOQ/.test(row.reason)));
  assert.equal(JSON.stringify(result).includes('密钥'), false);
});

test('market screening can support a verify decision while leaving private go/no-go facts unknown', async () => {
  const { marketScreening, marketVerdictProblems } = await import('../server/agent/pipeline.js');
  const s = session();
  s.evidence.push(
    { id: 'E0', asin: s.targetAsin, title: 'Wireless Label Printer', price: 29, currency: 'USD', observed_at: '2026-11-15' },
    { id: 'E1', asin: s.targetAsin, evidence_kind: 'keyword', nature: 'estimate', relevance: 'category', monthly_searches: 1200, observed_at: '2026-11-15' },
    { id: 'E2', asin: s.targetAsin, evidence_kind: 'search_interest', nature: 'estimate', points: [{ date: '2026-10-01', value: 40 }, { date: '2026-11-01', value: 55 }], observed_at: '2026-11-15' },
    { id: 'E3', asin: s.targetAsin, evidence_kind: 'market_sales_estimate', nature: 'estimate', history: [{ date: '2026-09-01', purchases: 9 }, { date: '2026-10-01', purchases: 12 }, { date: '2026-11-01', purchases: 11 }], observed_at: '2026-11-15' },
    { id: 'E4', asin: 'B111111111', title: 'Comparable label printer', price: 25, currency: 'USD', observed_at: '2026-11-15', match: { classification: 'uncertain' } }
  );
  const result = marketScreening(s);
  assert.equal(result.ready, true);
  assert.equal(result.veto, false);
  assert.deepEqual(result.evidence_ids.sort(), ['E1', 'E2', 'E3', 'E4']);
  assert.equal(result.scope, 'market_screen_only');
  assert.match(result.not_established, /个人利润|真实订单|合规/);
  assert.match(marketVerdictProblems(s, 'need_more')[0], /worth_verifying/);
  assert.deepEqual(marketVerdictProblems(s, 'worth_verifying'), []);
  assert.equal(s.constraints.values.goodsCost, null);
  assert.equal(s.evidence.find(row => row.id === 'E3').nature, 'estimate');
});

test('zero demand market veto requires consistently empty independent estimate families', async () => {
  const { marketScreening, marketVerdictProblems } = await import('../server/agent/pipeline.js');
  const s = session();
  s.evidence.push(
    { id: 'E0', asin: s.targetAsin, title: 'Wireless Label Printer', price: 29, currency: 'USD', observed_at: '2026-11-15' },
    { id: 'E1', asin: s.targetAsin, evidence_kind: 'keyword', nature: 'estimate', relevance: 'category', monthly_searches: 0 },
    { id: 'E2', asin: s.targetAsin, evidence_kind: 'search_interest', nature: 'estimate', points: [{ date: '2026-10-01', value: 0 }, { date: '2026-11-01', value: 0 }] },
    { id: 'E3', asin: s.targetAsin, evidence_kind: 'market_sales_estimate', nature: 'estimate', history: [{ date: '2026-10-01', purchases: 0 }, { date: '2026-11-01', purchases: 0 }] },
    { id: 'E4', asin: 'B111111111', title: 'Comparable label printer', price: 25, currency: 'USD', observed_at: '2026-11-15' }
  );
  assert.equal(marketScreening(s).veto, true);
  assert.match(marketVerdictProblems(s, 'worth_verifying')[0], /not_recommended/);
  assert.deepEqual(marketVerdictProblems(s, 'not_recommended'), []);
  s.evidence.find(row => row.id === 'E2').points[1].value = 1;
  assert.equal(marketScreening(s).veto, false);
});

test('unmatched recall evidence tells the model status is unverified rather than not recalled', async () => {
  const { evidenceBrief, marketBrief } = await import('../server/agent/tools.js');
  const s = session();
  const record = { id: 'E1', asin: s.targetAsin, evidence_kind: 'recall', title: 'Brand recall candidate', match: 'candidate', target_recalled: false, observed_at: '2026-11-15' };
  s.evidence.push(record);
  assert.equal(evidenceBrief(record).target_recalled, undefined);
  assert.equal(marketBrief(s).official[0].target_recall_status, 'unverified');
});

test('persisted source caches retain partial failure warnings instead of implying complete collection', async () => {
  const { createResearchSources } = await import('../server/research-sources.js');
  const p = createResearchSources({ token: 'test', fetchImpl: async url => String(url).includes('api.apify') || String(url).includes('saferproducts') ? new Response('[]') : new Response('blocked', { status: 403 }) });
  const r = await p.fetchEvidence({ target: { asin: 'B012345678', title: 'Printer' }, skipReviews: true, cachedRecords: [{ asin: 'B012345678', evidence_kind: 'official_policy', title: 'CPSC', observed_at: new Date().toISOString(), _research_key: 'v4:B012345678:policies', _source_message: 'Amazon policy requires login' }] });
  assert.equal(r.sources.policies.message, 'Amazon policy requires login');
});

test('normalizes weekly Amazon research as estimates separately from target seller order facts', async () => {
  const { normalizeSalesHistory } = await import('../server/research-sources.js');
  const rows = normalizeSalesHistory([{ asin: 'B012345678', marketplace: 'US', purchases_last30_days: 40, fees: { fba_fee_last360_days: 6.3, referral_fee_last360_days: 8 }, history: [{ date: '2026-11-01', purchases: 10, views: 120, average_price: 50, best_seller_rank: 4 }] }], 'B012345678', '2026-11-15T00:00:00Z');
  assert.equal(rows.find(r => r.evidence_kind === 'market_sales_estimate').nature, 'estimate');
  assert.equal(rows.find(r => r.evidence_kind === 'market_sales_estimate').purchases_last30_days, 40);
  assert.equal(rows.find(r => r.evidence_kind === 'market_sales_estimate').history[0].purchases, 10);
  assert.equal(rows.find(r => r.evidence_kind === 'amazon_fee_estimate').fba_fee, 6.3);
  assert.equal(rows.find(r => r.evidence_kind === 'seller_sales'), undefined);
});

test('Amazon secondary actors normalize history, fee, package and free uncovered sales estimate with explicit nature', async () => {
  const sources = await import('../server/research-sources.js');
  const { normalizeSalesHistory, normalizePackageDimensions, normalizeSalesEstimate } = sources;
  const history = normalizeSalesHistory([{ asin: 'B012345678', marketplace: 'US', purchases_last30_days: 40, fees: { fba_fee_last360_days: 6.3, referral_fee_last360_days: 8 }, history: [{ date: '2026-11-01', purchases: 10, views: 120, average_price: 50, best_seller_rank: 4 }] }], 'B012345678', '2026-11-15T00:00:00Z');
  assert.equal(history.find(r => r.evidence_kind === 'market_sales_estimate').nature, 'estimate');
  assert.equal(history.find(r => r.evidence_kind === 'amazon_fee_estimate').fba_fee, 6.3);
  const dims = normalizePackageDimensions([{ asin: 'B012345678', fee_category: 'BASE_PRODUCT', package_length: 12, package_width: 8, package_height: 4, package_weight: 1.6, package_dimension_unit: 'inches', package_weight_unit: 'pounds' }], 'B012345678', '2026-11-15');
  assert.equal(dims[0].package_length, 12); assert.equal(dims[0].source_mode, 'live_api');
  const note = normalizeSalesEstimate([{ recordType: 'NOTE', asin: 'B012345678', note: 'No category curve' }], 'B012345678', '2026-11-15');
  assert.equal(note[0].estimate_available, false); assert.equal(note[0].sales_estimate, undefined);
});

test('supplier source rows require public price MOQ and marketplace URL before becoming offers', async () => {
  const { normalizeSupplierQuotes } = await import('../server/research-sources.js');
  const rows = normalizeSupplierQuotes([{ title: 'Women casual fashion sneaker shoes', productUrl: 'https://www.alibaba.com/product-detail/item.html', minimumPrice: 80, maximumPrice: 90, currency: 'USD', minimumOrder: 5, supplierName: 'Supplier', supplierCountry: 'China', verifiedSupplier: true, tradeAssurance: true, priceTiers: [{ minimumQuantity: 5, price: 90, currency: 'USD' }] }], { asin: 'B012345678' }, 'Alibaba', '2026-11-15');
  assert.equal(rows[0].evidence_kind, 'supplier_quote'); assert.equal(rows[0].price_min, 80); assert.equal(rows[0].moq, 5); assert.equal(rows[0].nature, 'estimate');
  assert.equal(normalizeSupplierQuotes([{ title: 'invalid price', productUrl: 'https://www.alibaba.com/x' }], { asin: 'B012345678' }, 'Alibaba', '2026-11-15').length, 0);
});

test('research adapters collect estimate and supplier evidence under bounded Apify run caps', async () => {
  const { createResearchSources } = await import('../server/research-sources.js');
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = String(url); const body = init?.body ? JSON.parse(init.body) : null;
    if (body) calls.push({ url: u, body });
    if (u.includes('easyparser~amazon-sales-history')) return new Response(JSON.stringify([{ asin: 'B012345678', marketplace: 'US', data_captured_at: '2026-11-15', history_range_months: 3, sales: { purchases_last30_days: 40 }, fees: { fba_fee_last360_days: 6, referral_fee_last360_days: 8 }, history: [{ date: '2026-11-01', purchases: 10, views: 100, average_price: 50 }] }]));
    if (u.includes('easyparser~amazon-package-dimensions')) return new Response(JSON.stringify([{ asin: 'B012345678', package_length: 12, package_width: 8, package_height: 4, package_weight: 1.5, package_dimension_unit: 'inches', package_weight_unit: 'pounds', fee_category: 'BASE' }]));
    if (u.includes('vant47~amazon-sales-estimator')) return new Response(JSON.stringify([{ asin: 'B012345678', recordType: 'NOTE', note: 'Department not calibrated' }]));
    if (u.includes('automation-lab~alibaba-products-scraper')) return new Response(JSON.stringify([{ title: 'Wireless label printer replacement label refill roll', productUrl: 'https://www.alibaba.com/product-detail/roll.html', minimumPrice: 1, maximumPrice: 2, currency: 'USD', minimumOrder: 100 }]));
    if (u.includes('zen-studio~1688-wholesale-scraper')) return new Response(JSON.stringify([{ title: 'Thermal Label Printer', offerUrl: 'https://detail.1688.com/offer/123.html', priceMinCny: 40, priceMaxCny: 50, currency: 'CNY', minOrderQuantity: 5 }]));
    if (u.includes('maximedupre~amazon-keywords-discovery-tool')) return new Response(JSON.stringify([{ keyword: 'wireless label printer', position: 1 }]));
    if (u.includes('plainrows~google-trends-explorer')) return new Response(JSON.stringify([{ rowType: 'interest_over_time', keyword: 'wireless label printer', date: '2026-10-01', value: 50, geo: 'US' }]));
    if (u.includes('plainrows~amazon-keyword-research')) return new Response(JSON.stringify([{ found: true, mode: body.mode, keyword: 'wireless label printer', searchVolume: 1200, market: 'US', asin: 'B012345678' }]));
    if (u.includes('saferproducts')) return new Response('[]');
    return new Response('<main>Official public guidance for product safety and business compliance.</main>');
  };
  const p = createResearchSources({ token: 'test', fetchImpl });
  const r = await p.fetchEvidence({ target: { asin: 'B012345678', title: 'Wireless Label Printer', brand: 'Acme' }, skipReviews: true });
  assert.ok(r.records.some(x => x.evidence_kind === 'market_sales_estimate'));
  assert.ok(r.records.some(x => x.evidence_kind === 'package_dimensions'));
  assert.ok(r.records.some(x => x.evidence_kind === 'sales_estimate' && !x.estimate_available));
  assert.ok(r.records.some(x => x.evidence_kind === 'supplier_quote' && x.currency === 'USD'));
  assert.ok(r.records.some(x => x.evidence_kind === 'supplier_quote' && x.currency === 'CNY'));
  assert.ok(r.records.some(x => x.evidence_kind === 'keyword_suggestion'));
  assert.ok(calls.filter(x => x.url.includes('/acts/')).every(x => Number(new URL(x.url).searchParams.get('maxTotalChargeUsd')) > 0 && Number(new URL(x.url).searchParams.get('maxTotalChargeUsd')) <= 0.05));
});

test('Keepa enrichment is one-ASIN 90-day capped, disabled for offers, and normalizes dated market histories as estimates', async () => {
  const { createResearchSources } = await import('../server/research-sources.js');
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = String(url); const body = init?.body ? JSON.parse(init.body) : null;
    if (u.includes('silentflow~keepa-scraper')) {
      calls.push({ url: u, body });
      return new Response(JSON.stringify([{
        asin: 'B012345678', marketplace: 'US', currency: 'USD',
        buyBoxPriceHistory: [{ date: '2026-10-01', price: 24.5 }, { date: '2026-11-01', price: 22.9 }],
        amazonPriceHistory: [{ date: '2026-10-01', price: 25 }], newPriceHistory: [{ date: '2026-11-01', price: 23 }],
        usedPriceHistory: [{ date: '2026-11-01', price: 12 }],
        buyBoxAvg90: 24.1, buyBoxAvg180: 26.2, amazonPriceAvg90: 25.4, newPriceAvg90: 23.8, usedPriceAvg90: 13,
        salesRankDrops30: 4, salesRankDrops90: 14, salesRankDrops180: 28, salesRankDrops365: 62,
        writtenReviewsHistory: [{ date: '2026-10-01', count: 220 }, { date: '2026-11-01', count: 236 }],
        fbaFee: 5.8, referralFeePercent: 15,
        packageLengthMm: 203.2, packageWidthMm: 152.4, packageHeightMm: 76.2, packageWeightGrams: 544.3,
        offers: [{ seller: 'Should not be collected' }]
      }]));
    }
    if (body) calls.push({ url: u, body });
    if (u.includes('api.apify.com') || u.includes('saferproducts')) return new Response('[]');
    return new Response('<main>Official public guidance for product safety and business compliance.</main>');
  };
  const provider = createResearchSources({ token: 'test', now: () => new Date('2026-11-15T00:00:00.000Z'), fetchImpl });
  const result = await provider.fetchEvidence({ target: { asin: 'B012345678', title: 'Portable Printer' }, skipReviews: true });
  const keepaCall = calls.find(call => call.url.includes('silentflow~keepa-scraper'));
  assert.ok(keepaCall, 'Keepa Actor must be called for the target ASIN');
  assert.equal(keepaCall.body.maxItems, 1);
  assert.equal(keepaCall.body.historyDays, 90);
  assert.equal(keepaCall.body.includeOffers, false);
  assert.equal(keepaCall.body.marketplace, 'US');
  const row = result.records.find(record => record.evidence_kind === 'keepa_history');
  assert.equal(row.nature, 'estimate');
  assert.equal(row.source_name, 'Apify Silentflow Keepa Scraper');
  assert.equal(row.asin, 'B012345678');
  assert.equal(row.history_days, 90);
  assert.equal(row.price_history.buy_box.length, 2);
  assert.equal(row.price_history.buy_box[1].value, 22.9);
  assert.equal(row.price_averages_90d.buy_box, 24.1);
  assert.equal(row.price_averages_180d.buy_box, 26.2);
  assert.deepEqual(row.bsr_drops, { '30d': 4, '90d': 14, '180d': 28, '365d': 62 });
  assert.equal(row.written_review_history[1].count, 236);
  assert.equal(row.fees.fba_fee, 5.8);
  assert.equal(row.fees.referral_fee_percent, 15);
  assert.equal(row.package_size.length_mm, 203.2);
  assert.equal(row.observed_at, '2026-11-15T00:00:00.000Z');
  assert.equal(row.source_mode, 'live_api');
  assert.equal(row.review_samples, undefined);
  assert.equal(row.units_ordered, undefined);
  assert.deepEqual(row.offers, undefined);
  assert.equal(row.source_note.includes('不等于销量或订单'), true);
  const { marketBrief } = await import('../server/agent/tools.js');
  const s = session(); s.evidence.push({ ...row, id: 'E99' });
  const brief = marketBrief(s).keepa_history[0];
  assert.equal(brief.id, 'E99');
  assert.equal(brief.nature, 'estimate');
  assert.equal(brief.price_history.buy_box.length, 2);
  assert.deepEqual(brief.bsr_drops, row.bsr_drops);
  assert.equal(Number(new URL(keepaCall.url).searchParams.get('maxTotalChargeUsd')), 0.02);
});

test('Keepa failures retain per-source status and untracked history is never filled with zeroes', async () => {
  const { createResearchSources, normalizeKeepaHistory } = await import('../server/research-sources.js');
  const provider = createResearchSources({ token: 'test', now: () => new Date('2026-11-15T00:00:00.000Z'), fetchImpl: async url => {
    const u = String(url);
    if (u.includes('silentflow~keepa-scraper')) return new Response('unavailable', { status: 503 });
    if (u.includes('api.apify.com') || u.includes('saferproducts')) return new Response('[]');
    return new Response('<main>Official public guidance for product safety and business compliance.</main>');
  } });
  const result = await provider.fetchEvidence({ target: { asin: 'B012345678', title: 'Portable Printer' }, skipReviews: true });
  assert.equal(result.sources.keepa_history.status, 'failed');
  assert.match(result.sources.keepa_history.message, /HTTP 503/);
  const rows = normalizeKeepaHistory([{ asin: 'B012345678', marketplace: 'US', trackingSince: '2026-11-01', buyBoxPriceHistory: [] }], 'B012345678', '2026-11-15T00:00:00.000Z');
  assert.equal(rows[0].tracking_since, '2026-11-01');
  assert.deepEqual(rows[0].price_history, {});
  assert.deepEqual(rows[0].bsr_drops, {});
  assert.equal(rows[0].bsr_history, undefined);
});

test('supplier quote matching produces a transparent pre-ad contribution range from public quotes and Amazon fee estimates', async () => {
  const { supplierScenario } = await import('../server/business-evidence.js');
  const target = { title: 'Women casual fashion sneakers', brand: 'adidas', product_attributes: {} };
  const records = [
    { id: 'E1', evidence_kind: 'supplier_quote', title: 'Women casual fashion sneaker shoes', currency: 'USD', price_min: 8, price_max: 10, moq: 100, price_tiers: [{ min: 100, price: 10 }] },
    { id: 'E2', evidence_kind: 'amazon_fee_estimate', fba_fee: 6, referral_fee: 8, fee_date: '2026-11-15' }
  ];
  const s = supplierScenario(target, records, [{ asin: 'B012345678', price: 50, currency: 'USD', observed_at: '2026-11-15', match: { classification: 'comparable' } }]);
  assert.equal(s.status, 'estimated'); assert.equal(s.rows[0].pre_ads_per_unit_low, 26); assert.equal(s.rows[0].minimum_purchase_cash, 1000);
  assert.match(s.rows[0].excluded, /运费|广告/);
});

test('generic same-category supplier offers remain uncertain candidates when exact title overlap is absent', async () => {
  const { supplierScenario } = await import('../server/business-evidence.js');
  const r = supplierScenario({ title: 'adidas Womens VL Court 3.0 Sneakers', brand: 'adidas' }, [{ id: 'E1', evidence_kind: 'supplier_quote', title: 'Women casual walking sneakers', currency: 'USD', price_min: 8, price_max: 10, moq: 100, price_tiers: [{ minimum_quantity: 100, price: 10, currency: 'USD' }] }, { id: 'E2', evidence_kind: 'amazon_fee_estimate', fba_fee: 6, referral_fee: 8 }], [{ id: 'E3', price: 50, currency: 'USD', match: { classification: 'comparable' } }]);
  assert.equal(r.rows.length, 1); assert.equal(r.matched_supplier_quotes[0].supplier_match_mode, 'category_match_uncertain');
});

test('search autocomplete suggestions are kept separate from monthly search volume estimates', async () => {
  const { normalizeKeywordSuggestions } = await import('../server/research-sources.js');
  const rows = normalizeKeywordSuggestions([{ keyword: 'portable kitchen rack', position: 2, marketplace: 'US' }], { asin: 'B012345678', observedAt: '2026-11-15' });
  assert.equal(rows[0].evidence_kind, 'keyword_suggestion'); assert.equal(rows[0].monthly_searches, undefined); assert.equal(rows[0].nature, 'fact');
});
