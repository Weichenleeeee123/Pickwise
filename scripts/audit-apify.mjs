// Read-only public Apify Store inventory. This script never starts paid Actors.
import { mkdir, writeFile } from 'node:fs/promises';
const queries = [
  'amazon product search results', 'amazon product details offers', 'amazon best sellers new releases movers',
  'amazon reviews no login', 'amazon question answers product questions', 'amazon keyword search volume reverse asin',
  'amazon sales estimator monthly sales', 'amazon price history wayback keepa', 'amazon product dimensions package weight',
  'amazon fee calculator referral fba', 'amazon advertising suggested bid cpc', 'amazon buy box offers sellers',
  'amazon barcode asin lookup upc', 'amazon seller storefront catalog', 'amazon search autocomplete keywords',
  'alibaba products price tiers moq verified supplier', '1688 wholesale price tiers moq sku', '1688 landed cost shipping duty freight',
  'freight rate shipping cost quote china usa', 'google trends seasonality', 'tiktok shop products sales estimate',
  'google shopping products pricing', 'patent trademark product search', 'amazon product monthly sales data history'
];
const output = 'data/verification/apify-capability-audit';
await mkdir(output, { recursive: true });
const pricing = p => p ? { model: p.pricingModel, minimumRunCapUsd: p.minimalMaxTotalChargeUsd ?? null, pricePerUnitUsd: p.pricePerUnitUsd ?? null, unitName: p.unitName ?? null, startedAt: p.startedAt ?? null, events: Object.entries(p.pricingPerEvent?.actorChargeEvents ?? {}).map(([key, e]) => ({ key, title: e.eventTitle, description: e.eventDescription, oneTime: e.isOneTimeEvent ?? false, priceUsd: e.eventPriceUsd ?? null, freeTierUsd: e.eventTieredPricingUsd?.FREE?.tieredEventPriceUsd ?? null, starterTierUsd: e.eventTieredPricingUsd?.BRONZE?.tieredEventPriceUsd ?? null })) } : null;
async function pool(items, fn, limit = 4) { const results = new Array(items.length); let index = 0; await Promise.all(Array.from({ length: limit }, async () => { while (index < items.length) { const i = index++; try { results[i] = await fn(items[i]); } catch (e) { results[i] = { query: items[i], error: e.message }; } } })); return results; }
const found = await pool(queries, async query => {
  const r = await fetch(`https://api.apify.com/v2/store?search=${encodeURIComponent(query)}&limit=15`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()).data;
  return { query, total: d.total, actors: d.items.map(a => ({ actor: `${a.username}/${a.name}`, id: a.id, title: a.title, description: a.description, url: a.url, users30Days: a.stats?.totalUsers30Days ?? null, reviews: a.actorReviewCount, rating: a.actorReviewRating, runs30Days: a.stats?.publicActorRunStats30Days ?? null, notice: a.notice, pricing: pricing(a.currentPricingInfo) })) };
});
await writeFile(`${output}/catalog.json`, JSON.stringify({ researchedAt: new Date().toISOString(), queries: found }, null, 2));
for (const q of found) console.log(JSON.stringify(q.error ? q : { query: q.query, total: q.total, actors: q.actors.map(a => ({ actor: a.actor, users: a.users30Days, model: a.pricing?.model, minimumRunCapUsd: a.pricing?.minimumRunCapUsd, events: a.pricing?.events?.map(e => ({ name: e.key, free: e.freeTierUsd, event: e.priceUsd, start: e.oneTime })) ?? [], description: String(a.description ?? '').slice(0, 220) })) }));
