import { EXPANSION_ACTORS, LIST_TYPES, normalizeBackupKeywords, normalizePublicReviews, normalizeMarketOffers, normalizeCategoryRankings, rankingCategoryUrl } from './market-expansion.js';
import { apifyResponseError, withApifyRun } from './apify-runtime.js';
const ACTORS = { ...EXPANSION_ACTORS, keywords: 'plainrows~amazon-keyword-research', suggestions: 'maximedupre~amazon-keywords-discovery-tool', trends: 'plainrows~google-trends-explorer', reviews: 'k-data-lab~amazon-reviews-scraper', salesHistory: 'easyparser~amazon-sales-history', keepa: 'silentflow~keepa-scraper', dimensions: 'easyparser~amazon-package-dimensions', salesEstimator: 'vant47~amazon-sales-estimator', alibaba: 'automation-lab~alibaba-products-scraper', alibaba1688: 'zen-studio~1688-wholesale-scraper' };
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const text = (v, n = 1000) => String(v ?? '').slice(0, n);
const validDate = value => Number.isFinite(Date.parse(value));
const safeUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' ? u.href : null; } catch { return null; } };

export function normalizeKeywordRows(items, { asin, observedAt = new Date().toISOString() } = {}) {
  return (Array.isArray(items) ? items : []).filter(r => (!asin || !r.asin || r.asin === asin) && r.found === true && r.keyword && finite(r.searchVolume) !== null && (!r.market || r.market === 'US')).map(r => ({
    evidence_kind: 'keyword', asin: r.asin || asin, title: text(r.keyword, 200), keyword: text(r.keyword, 200), nature: 'estimate', marketplace: 'Amazon US',
    monthly_searches: finite(r.searchVolume), organic_rank: finite(r.rank), absolute_rank: finite(r.rankAbsolute),
    volume_updated_at: validDate(r.volumeUpdatedAt) ? r.volumeUpdatedAt : null, rank_checked_at: validDate(r.rankCheckedAt) ? r.rankCheckedAt : null,
    observed_at: validDate(r.observedAt) ? r.observedAt : observedAt, retrieved_at: observedAt, mode: r.mode,
    source_name: 'Apify PlainRows Amazon Keyword Research', source_url: 'https://apify.com/plainrows/amazon-keyword-research', source_mode: 'live_api',
    source_note: '商业数据商月搜索量估算；不是购买量，不将不同关键词量相加当作独立需求；排名按 rank_checked_at。'
  }));
}

export function normalizeKeywordSuggestions(items, { asin, observedAt = new Date().toISOString() } = {}) {
  return (Array.isArray(items) ? items : []).map(r => typeof r === 'string' ? { keyword: r } : r).filter(r => r.keyword ?? r.suggestion ?? r.query).map(r => ({ evidence_kind: 'keyword_suggestion', asin, title: text(r.keyword ?? r.suggestion ?? r.query, 200), keyword: text(r.keyword ?? r.suggestion ?? r.query, 200), nature: 'fact', position: finite(r.position ?? r.rank), marketplace: r.marketplace ?? 'US', source_name: 'Apify Amazon Autocomplete', source_url: 'https://www.amazon.com/s?k=' + encodeURIComponent(r.keyword ?? r.suggestion ?? r.query), source_mode: 'live_api', observed_at: validDate(r.observedAt ?? r.scrapedAt) ? r.observedAt ?? r.scrapedAt : observedAt, source_note: 'Amazon 自动补全词，证明搜索提示存在，不代表搜索量、购买量或目标 ASIN 转化。' }));
}

export function normalizeSalesHistory(items, asin, observedAt) {
  const p = (Array.isArray(items) ? items : []).find(r => r.asin === asin && r.marketplace === 'US' && Array.isArray(r.history));
  if (!p) return [];
  const history = p.history.filter(r => validDate(r.date) && finite(r.purchases) !== null && finite(r.views) !== null).map(r => ({ date: r.date, purchases: finite(r.purchases), views: finite(r.views), average_price: finite(r.average_price), best_seller_rank: finite(r.best_seller_rank), offers: finite(r.total_offers) })).sort((a,b) => a.date.localeCompare(b.date));
  const snapshot = { evidence_kind: 'market_sales_estimate', asin, title: `${text(p.name, 250)} 商品历史估算`, nature: 'estimate', source_name: 'Apify Easyparser Amazon Sales History', source_url: `https://www.amazon.com/dp/${asin}`, source_mode: 'live_api', observed_at: validDate(p.data_captured_at) ? p.data_captured_at : observedAt, history, purchases_last30_days: finite(p.sales?.purchases_last30_days ?? p.purchases_last30_days), purchases_last90_days: finite(p.sales?.purchases_last90_days ?? p.purchases_last90_days), purchases_last360_days: finite(p.sales?.purchases_last360_days ?? p.purchases_last360_days), views_last30_days: finite(p.traffic?.views_last30_days), views_last90_days: finite(p.traffic?.views_last90_days), views_last360_days: finite(p.traffic?.views_last360_days), current_bsr: finite(p.ranking?.current_rank), average_bsr: finite(p.ranking?.average_rank), bsr_category: text(p.ranking?.category, 160), history_weeks: history.length, history_range_months: finite(p.history_range_months), age_years: finite(p.age), source_note: '第三方商业数据 API 对全市场购买量与流量的估算，不是卖家后台订单；周级历史不可视为精确订单流水。' };
  const fees = { evidence_kind: 'amazon_fee_estimate', asin, title: 'Amazon 费用历史估算', nature: 'estimate', source_name: 'Apify Easyparser Amazon Sales History', source_url: `https://www.amazon.com/dp/${asin}`, source_mode: 'live_api', observed_at: snapshot.observed_at, fba_fee: finite(p.fees?.fba_fee_last360_days), referral_fee: finite(p.fees?.referral_fee_last360_days), price_average_90d: finite(p.average_price_last_90_days), price_average_360d: finite(p.average_price_last_360_days), source_note: '数据商最近 360 天均值估算，可能与当前类目、尺寸或佣金不同；待 Amazon Revenue Calculator 或卖家账户费用验证。' };
  return [snapshot, fees];
}

export function normalizePackageDimensions(items, asin, observedAt) {
  const r = (Array.isArray(items) ? items : []).find(x => x.asin === asin && [x.package_length, x.package_width, x.package_height, x.package_weight].some(v => finite(v) !== null));
  return r ? [{ evidence_kind: 'package_dimensions', asin, title: text(r.title, 250), nature: 'estimate', source_name: 'Apify Easyparser Package Dimensions', source_url: safeUrl(r.link) ?? `https://www.amazon.com/dp/${asin}`, source_mode: 'live_api', observed_at: observedAt, fee_category: text(r.fee_category, 100), product_group: text(r.gl, 120), package_length: finite(r.package_length), package_width: finite(r.package_width), package_height: finite(r.package_height), package_dimension_unit: text(r.package_dimension_unit, 20), package_weight: finite(r.package_weight), package_weight_unit: text(r.package_weight_unit, 20), product_length: finite(r.product_length), product_width: finite(r.product_width), product_height: finite(r.product_height), product_weight: finite(r.product_weight), product_dimension_unit: text(r.product_dimension_unit, 20), source_note: '包装尺寸和计费分类来自公开数据供应商查询；用作 Amazon 费用估算输入，最终以卖家账户费用预览和实测包装为准。' }] : [];
}

export function normalizeSalesEstimate(items, asin, observedAt) {
  return (Array.isArray(items) ? items : []).filter(r => r.asin === asin && ['ESTIMATE','NOTE'].includes(r.recordType)).map(r => ({ evidence_kind: 'sales_estimate', asin, title: text(r.title, 250), nature: 'estimate', source_name: 'Apify Vant Amazon Sales Estimator', source_url: safeUrl(r.productUrl) ?? `https://www.amazon.com/dp/${asin}`, source_mode: 'live_api', observed_at: validDate(r.checkedAt) ? r.checkedAt : observedAt, estimate_available: r.recordType === 'ESTIMATE' && finite(r.estimatedMonthlyUnits) !== null, monthly_units: finite(r.estimatedMonthlyUnits), monthly_units_low: finite(r.monthlyUnitsLow), monthly_units_high: finite(r.monthlyUnitsHigh), monthly_revenue: finite(r.estimatedMonthlyRevenue), method: text(r.method, 80), method_note: text(r.methodNote ?? r.note ?? r.verdict, 700), amazon_badge: text(r.amazonBoughtBadge, 100), best_seller_rank: finite(r.bestSellerRank), best_seller_category: text(r.bestSellerCategory, 160), charged: r.charged === true, source_note: '数据商利用页面购买徽标或类目 BSR 曲线推算全市场销售量；非卖家订单事实。无徽标/未校准品类返回免费 NOTE。' }));
}

function normalizeHistorySeries(items, fields = ['value', 'price', 'rank', 'count'], outputKey = 'value') {
  return (Array.isArray(items) ? items : []).map(row => {
    const date = row?.date ?? row?.observedAt ?? row?.timestamp;
    const value = fields.map(key => row?.[key]).find(item => finite(item) !== null);
    return validDate(date) && finite(value) !== null ? { date, [outputKey]: finite(value) } : null;
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
}

export function normalizeKeepaHistory(items, asin, observedAt) {
  const item = (Array.isArray(items) ? items : []).find(row => row.asin === asin && (!row.marketplace || ['US', 'AMAZON.COM', 'COM'].includes(String(row.marketplace).toUpperCase())));
  if (!item) return [];
  const averages = days => ({
    buy_box: finite(item[`buyBoxAvg${days}`]), amazon: finite(item[`amazonPriceAvg${days}`]),
    new: finite(item[`newPriceAvg${days}`]), used: finite(item[`usedPriceAvg${days}`])
  });
  const priceHistory = {
    buy_box: normalizeHistorySeries(item.buyBoxPriceHistory ?? item.buyBoxHistory),
    amazon: normalizeHistorySeries(item.amazonPriceHistory),
    new: normalizeHistorySeries(item.newPriceHistory),
    used: normalizeHistorySeries(item.usedPriceHistory)
  };
  const reviewHistory = normalizeHistorySeries(item.writtenReviewsHistory ?? item.writtenReviewHistory ?? item.reviewCountHistory, ['count', 'value'], 'count');
  const record = {
    evidence_kind: 'keepa_history', asin, title: `${asin} Keepa 市场历史`, nature: 'estimate', marketplace: 'Amazon US', currency: item.currency ?? 'USD',
    source_name: 'Apify Silentflow Keepa Scraper', source_url: `https://www.amazon.com/dp/${asin}`, source_mode: 'live_api', observed_at: observedAt,
    history_days: 90, tracking_since: validDate(item.trackingSince) ? item.trackingSince : null,
    price_history: Object.fromEntries(Object.entries(priceHistory).filter(([, series]) => series.length)),
    price_averages_90d: averages(90),
    price_averages_180d: averages(180),
    bsr_drops: Object.fromEntries([30, 90, 180, 365].map(days => [`${days}d`, finite(item[`salesRankDrops${days}`])]).filter(([, value]) => value !== null)),
    written_review_history: reviewHistory,
    data_nature: { price_history: 'keepa_tracked_observation', written_review_history: 'keepa_tracked_observation', sales_rank_drops: 'activity_estimate', fees: 'estimate', package_size: 'estimate' },
    fees: Object.fromEntries([['fba_fee', finite(item.fbaFee)], ['referral_fee_percent', finite(item.referralFeePercent)]].filter(([, value]) => value !== null)),
    package_size: ['packageLengthMm', 'packageWidthMm', 'packageHeightMm', 'packageWeightGrams'].some(key => finite(item[key]) !== null) ? {
      length_mm: finite(item.packageLengthMm), width_mm: finite(item.packageWidthMm), height_mm: finite(item.packageHeightMm), weight_grams: finite(item.packageWeightGrams)
    } : null,
    source_note: 'Keepa 提供的价格与书面评论数量历史是第三方追踪/估算数据；salesRankDrops 只表示排名变化活跃度，不等于销量或订单，且没有 BSR 日序列。追踪开始前没有数据的区间保持未知，不补零；FBA 费用、Referral 百分比与公制包装尺寸用于估算，需以当前 Seller Central 核实。'
  };
  return [record];
}

export function normalizeSupplierQuotes(items, target, source, observedAt) {
  return (Array.isArray(items) ? items : []).filter(r => (r.productUrl ?? r.url ?? r.offerUrl) && safeUrl(r.productUrl ?? r.url ?? r.offerUrl) && finite(r.minimumPrice ?? r.priceMin ?? r.priceMinCny ?? r.price ?? r.unitPrice) !== null && finite(r.maximumPrice ?? r.priceMax ?? r.priceMaxCny ?? r.price ?? r.unitPrice) !== null && finite(r.minimumOrder ?? r.minimumOrderQuantity ?? r.moq ?? r.minOrderQuantity) !== null).map(r => {
    const tiers = (r.priceTiers ?? r.price_tiers ?? []).map(t => ({ minimum_quantity: finite(t.minimumQuantity ?? t.minQty ?? t.minQuantity), maximum_quantity: finite(t.maximumQuantity ?? t.maxQty ?? t.maxQuantity), price: finite(t.price ?? t.priceCny ?? t.unitPrice), currency: t.currency ?? r.currency ?? (t.priceCny ? 'CNY' : undefined) })).filter(t => t.minimum_quantity && t.price !== null);
    return { evidence_kind: 'supplier_quote', asin: target.asin, title: text(r.titleEn ?? r.title ?? r.name, 300), nature: 'estimate', source_name: source, source_url: safeUrl(r.productUrl ?? r.url ?? r.offerUrl), source_mode: 'live_api', observed_at: validDate(r.scrapedAt ?? r.updatedAt) ? r.scrapedAt ?? r.updatedAt : observedAt, currency: r.currency ?? (r.priceMinCny !== undefined || r.priceCny !== undefined ? 'CNY' : 'USD'), price_min: finite(r.minimumPrice ?? r.priceMin ?? r.priceMinCny ?? r.price ?? r.unitPrice), price_max: finite(r.maximumPrice ?? r.priceMax ?? r.priceMaxCny ?? r.price ?? r.unitPrice), moq: finite(r.minimumOrder ?? r.minimumOrderQuantity ?? r.moq ?? r.minOrderQuantity), unit: text(r.unit ?? r.unitName ?? r.moqUnit, 50), price_tiers: tiers.slice(0, 12), supplier_name: text(r.supplierName ?? r.companyName ?? r.supplier?.name, 200), supplier_country: text(r.supplierCountry ?? r.country ?? r.supplier?.country, 80), supplier_years: finite(r.supplierYears ?? r.yearsOnPlatform), supplier_verified: r.verifiedSupplier ?? r.isVerified ?? null, trade_assurance: r.tradeAssurance ?? r.hasTradeAssurance ?? null, seller_rating: finite(r.rating ?? r.supplierRating), supplier_match_score: 0, source_note: '公开 B2B 货盘展示的供应商报价和 MOQ，未核实可供货、质量、运费、关税、付款条件或授权；购买前需向供应商核价并取样。' };
  });
}

export function normalizeRecalls(items, target, observedAt) {
  const normalizeId = v => String(v ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  return items.slice(0, 30).filter(r => safeUrl(r.URL) && /(^|\.)cpsc\.gov$/.test(new URL(r.URL).hostname)).map(r => {
    const models = (r.Products ?? []).map(p => normalizeId(p.Model)).filter(Boolean);
    const upcs = (r.ProductUPCs ?? []).map(p => normalizeId(typeof p === 'string' ? p : p.UPC ?? p.Name)).filter(Boolean);
    const brandMatches = target.brand && JSON.stringify([r.Title, r.Products, r.Manufacturers]).toLowerCase().includes(String(target.brand).toLowerCase());
    const exact = Boolean(target.gtin && upcs.includes(normalizeId(target.gtin))) || Boolean(brandMatches && target.model_number && normalizeId(target.model_number).length >= 4 && models.includes(normalizeId(target.model_number)));
    return { evidence_kind: 'recall', asin: target.asin, title: text(r.Title, 300), nature: 'fact', source_name: 'CPSC 官方召回数据库', source_url: r.URL, source_mode: 'live_api', observed_at: observedAt, recall_id: r.RecallID, recall_date: r.RecallDate, description: text(r.Description, 2200), products: (r.Products ?? []).slice(0, 10), hazards: (r.Hazards ?? []).map(h => text(h.Name, 500)), match: exact ? 'identifier_match' : 'candidate', target_recalled: exact, match_note: exact ? '结构化型号或 UPC 匹配，仍需核对批次和销售窗口' : '仅检索候选，不代表目标 ASIN 被召回' };
  });
}

export function normalizeTrendRows(items, target, observedAt) {
  const groups = new Map();
  for (const r of items) {
    if (r.rowType !== 'interest_over_time' || r.found === false || r.isPartial === true || !validDate(r.dateTime ?? r.date) || finite(r.value) === null || Number(r.value) > 100) continue;
    const key = String(r.keyword ?? r.search ?? '');
    const group = groups.get(key) ?? { first: r, points: [] };
    group.points.push({ date: r.dateTime ?? r.date, value: Number(r.value) }); groups.set(key, group);
  }
  return [...groups.entries()].map(([keyword, g]) => ({ evidence_kind: 'search_interest', asin: target.asin, title: keyword, keyword, nature: 'estimate', source_name: 'Google Trends via Apify', source_url: safeUrl(g.first.trendsUrl) ?? `https://trends.google.com/trends/explore?geo=US&q=${encodeURIComponent(keyword)}`, source_mode: 'live_api', observed_at: observedAt, geo: g.first.geo ?? 'US', search_type: g.first.searchType ?? 'web', time_range: g.first.timeRange ?? 'past_5_years', points: [...new Map(g.points.map(p => [p.date, p])).values()].sort((a, b) => a.date.localeCompare(b.date)), source_note: 'Google 全网相对搜索关注度指数；不是 Amazon 搜索量或销量；未完成周期已排除，不能跨独立查询比较指数。' }));
}

export function classifyKeywords(rows, target) {
  const tokens = v => String(v ?? '').toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 2).map(w => w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w).map(w => ({ sneaker: 'shoe', women: 'woman', men: 'man' }[w] ?? w));
  const title = tokens(target.title), brand = tokens(target.brand), category = tokens(target.category_path);
  return rows.map(row => {
    const words = tokens(row.keyword), hits = words.filter(w => title.includes(w) || category.includes(w));
    const relevance = brand.some(w => words.includes(w)) ? 'target' : hits.length && hits.length === words.length ? 'category' : 'excluded';
    return { ...row, relevance, relevance_note: relevance === 'excluded' ? '返回词与目标标题/类目缺少匹配，不用于需求结论' : relevance === 'target' ? '包含目标品牌，仅反映已有品牌搜索需求' : '标题或类目词匹配，仍需核实购买意图与规格' };
  });
}

export function parseOfficialPolicy(html) {
  const main = new RegExp('<(?:main|article)[^>]*>([^]*?)</(?:main|article)>', 'i').exec(html)?.[1];
  if (!main || /you need to enable javascript|sign in to your account|robot check|请登录|卖家登录后/i.test(main)) throw new Error('官方页面未返回政策正文，可能需要登录或 JavaScript');
  const content = main.replace(new RegExp('<script[^]*?</script>', 'gi'), '').replace(new RegExp('<style[^]*?</style>', 'gi'), '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/ +/g, ' ').trim();
  if (content.length < 30) throw new Error('官方页面未返回可用正文');
  return content.replace(new RegExp(String.fromCharCode(92) + 's+', 'g'), ' ').slice(0, 18000);
}

export function relevantPolicyLinks(html, target) {
  const topic = `${target.title ?? ''} ${target.category_path ?? ''}`.toLowerCase();
  const patterns = [];
  if (/shoe|sneaker|cloth|apparel|textile|wear/i.test(topic)) patterns.push(/^(?:clothing|clothing and footwear|textiles|footwear|apparel)$/i);
  if (/child|baby|infant|kid|toy/i.test(topic)) patterns.push(/children.*product|children.*certificate|toy/i);
  if (/storage|cabinet|dresser|furniture|chair/i.test(topic)) patterns.push(/storage units|furniture|chair/i);
  if (/battery|charger|electric|printer|light/i.test(topic)) patterns.push(/battery|electric|lead|chemical/i);
  const links = [...html.matchAll(new RegExp('<a[^>]+href=["' + String.fromCharCode(39) + ']([^"' + String.fromCharCode(39) + ']+)["' + String.fromCharCode(39) + '][^>]*>([^]*?)</a>', 'gi'))].map(m => ({ url: new URL(m[1].replace(/&amp;/g, '&'), 'https://www.cpsc.gov').href, title: m[2].replace(/<[^>]+>/g, ' ').replace(/&#039;/g, String.fromCharCode(39)).trim() }));
  return [...new Map(links.filter(l => { const u = new URL(l.url); return u.protocol === 'https:' && u.hostname === 'www.cpsc.gov' && patterns.some(p => p.test(l.title)) && !u.pathname.endsWith('.pdf'); }).map(l => [l.url, l])).values()].slice(0, 2);
}

const POLICY_URLS = [
  ['CPSC 产品安全法规指引', 'https://www.cpsc.gov/Business--Manufacturing/Business-Education'],
  ['USPTO 商标检索说明', 'https://www.uspto.gov/trademarks/search'],
  ['Amazon 受限商品政策', 'https://sellercentral.amazon.com/help/hub/reference/external/G200164330']
];

export function createResearchSources({ token, fetchImpl = fetch, now = () => new Date(), ttlMs = 24 * 3600_000, reviewsEnabled = true, noLoginReviewsEnabled = false } = {}) {
  const cache = new Map();
  const policyCache = new Map();
  async function actor(name, body, maxChargeUsd = 0.1) {
    if (!token) throw new Error('Apify 凭证未配置');
    return withApifyRun(() => actorRequest(name, body, maxChargeUsd));
  }
  async function actorRequest(name, body, maxChargeUsd) {
    if (name === 'reviews') {
      const response = await fetchImpl(`https://api.apify.com/v2/acts/${ACTORS[name]}/runs?waitForFinish=60&maxTotalChargeUsd=0.1&timeout=100`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(70000) });
      if (!response.ok) throw await apifyResponseError(response, 'reviews', token);
      let run = (await response.json()).data;
      if (!run?.id || !run.defaultDatasetId) throw new Error('评论 Actor 返回的运行信息不完整');
      for (let attempt = 0; !['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status) && attempt < 2; attempt++) {
        const poll = await fetchImpl(`https://api.apify.com/v2/actor-runs/${run.id}?waitForFinish=25`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
        if (!poll.ok) throw new Error(`评论运行状态 HTTP ${poll.status}`);
        run = (await poll.json()).data;
      }
      if (run.status !== 'SUCCEEDED') throw new Error(`评论采集未成功完成：${run.status}`);
      const [dataset, summary] = await Promise.all([fetchImpl(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) }), fetchImpl(`https://api.apify.com/v2/key-value-stores/${run.defaultKeyValueStoreId}/records/RUN_SUMMARY`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) })]);
      if (!dataset.ok) throw new Error(`评论数据集 HTTP ${dataset.status}`);
      const rows = await dataset.json();
      if (!Array.isArray(rows)) throw new Error('评论数据集格式错误');
      rows.runSummary = summary.ok ? await summary.json() : null;
      return rows;
    }
    const url = `https://api.apify.com/v2/acts/${ACTORS[name]}/run-sync-get-dataset-items?maxTotalChargeUsd=${maxChargeUsd}&timeout=100`;
    const r = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(115000) });
    if (!r.ok) throw await apifyResponseError(r, name, token);
    const rows = await r.json();
    if (!Array.isArray(rows)) throw new Error(`${name} 返回格式不正确`);
    return rows;
  }
  async function fetchEvidence({ target, cachedRecords = [], refresh = false, skipReviews, cacheNamespace = 'legacy' }) {
    if (!target?.asin) return { records: [], sources: {} };
    const at = now().toISOString();
    const records = [], sources = {};
    const run = async (name, work) => {
      const key = `${['policies', 'keepa_history'].includes(name) ? 'v4' : 'v3'}:${target.asin}:${name}`;
      const memoryKey = JSON.stringify([cacheNamespace, key]);
      const saved = cache.get(memoryKey);
      if (!refresh && saved && now() - Date.parse(saved.at) < (saved.ttlMs ?? ttlMs)) { records.push(...saved.records); sources[name] = { ...saved.status, cached: true }; return; }
      const persisted = cachedRecords.filter(r => r.asin === target.asin && r._research_key === key && now() - Date.parse(r.retrieved_at ?? r.observed_at) < ttlMs);
      if (!refresh && persisted.length) { records.push(...persisted); sources[name] = { status: 'cached', observedAt: persisted[0].observed_at, message: persisted.find(r => r._source_message)?._source_message ?? (name === 'policies' ? '只复用已成功取得的正文；未采到的政策仍需人工核实。' : null) }; return; }
      try {
        const result = await work();
        const rows = result.records.map(r => ({ ...r, _research_key: key, _source_message: result.message ?? null }));
        const status = { status: rows.length ? 'loaded' : result.status ?? 'no_data', observedAt: at, message: result.message ?? null };
        records.push(...rows); sources[name] = status;
        cache.set(memoryKey, { at, records: rows, status, ttlMs: rows.length ? ttlMs : 10 * 60_000 });
      } catch (e) { sources[name] = { status: 'failed', observedAt: at, message: text(e.message, 220) }; }
    };
    await run('keywords', async () => {
      const items = await actor('keywords', { mode: 'reverseAsin', asins: [target.asin], market: 'US', maxResultsPerQuery: 20, sortBy: 'searchVolume', ignoreSynonyms: true }, 0.04);
      let rows = classifyKeywords(normalizeKeywordRows(items, { asin: target.asin, observedAt: at }), target);
      let reason = items.find(r => r.notFoundReason)?.notFoundReason;
      if (!rows.length && !reason?.includes('quota')) {
        const seed = String(target.category_path ?? '').split('>').at(-1)?.trim() || String(target.title).split(/\s+/).slice(0, 5).join(' ');
        const related = await actor('keywords', { mode: 'relatedKeywords', keywords: [seed.slice(0, 80)], market: 'US', maxResultsPerQuery: 20, depth: 1 }, 0.04);
        rows = classifyKeywords(normalizeKeywordRows(related, { asin: target.asin, observedAt: at }), target);
        reason = related.find(r => r.notFoundReason)?.notFoundReason ?? reason;
      }
      return { records: rows, status: reason?.includes('quota') ? 'quota_exceeded' : 'no_data', message: reason ?? null };
    });
    if (!records.some(r => r.evidence_kind === 'keyword' && r.relevance !== 'excluded')) {
      await run('keywords_backup', async () => {
        const items = await actor('keywordBackup', { mode:'reverseAsin', asins:[target.asin], marketplace:'US', maxKeywordsPerAsin:20, sortBy:'searchVolume', maxPosition:100, minSearchVolume:0 }, 0.07);
        const rows = classifyKeywords(normalizeBackupKeywords(items,target,at),target);
        return { records:rows, status:'no_data', message:rows.length?'原关键词源不可用或无相关结果，已使用 Pravus 备用 Actor；不同 Actor 的上游独立性未核验。':'备用 Actor 也未返回可用搜索量；不以自动补全代替。' };
      });
    }
    let publicProductRows = [];
    const skipPublicReviews = skipReviews === true || !noLoginReviewsEnabled;
    const relevant = records.filter(r => r.evidence_kind === 'keyword' && r.relevance !== 'excluded');
    const seed = relevant.filter(r => r.relevance === 'category').sort((a,b) => b.monthly_searches-a.monthly_searches)[0]?.keyword || relevant[0]?.keyword || String(target.category_path ?? target.title).split('>').at(-1).trim();
    const brand = String(target.brand ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const supplierSearch = String(target.title ?? '').replace(new RegExp(brand, 'ig'), ' ').replace(/\b[A-Z0-9]{10}\b/gi, ' ').replace(/\s+/g, ' ').trim().split(/[,|]/)[0].split(/\s+/).slice(0, 8).join(' ').slice(0, 80);
    await Promise.all([
      run('market_offers', async () => {
        publicProductRows = await actor('marketOffers', { asins:[target.asin], marketplace:'US', includeOffers:true, maxOffers:10, includeReviews:!skipPublicReviews, maxItems:1, maxConcurrency:1, fullPageRetries:1 }, 0.02);
        const rows=normalizeMarketOffers(publicProductRows,target,at);
        return { records:rows, status:'no_data', message:rows.length?null:'未取得目标 ASIN 美国站的有效报价；价格与履约保持未知。' };
      }),
      run('category_rankings', async () => {
        const url=rankingCategoryUrl(target);
        if(!url)return {records:[],status:'no_data',message:'缺少目标商品明确的细分类目榜单链接，未默认抓取无关大类。'};
        const items=await actor('categoryRankings',{categoryUrls:[url],listTypes:LIST_TYPES,marketplace:'amazon.com',maxCategories:3,depthOfCrawl:1,maxItemsPerStartUrl:10,maxItems:30,detailedInformation:false,monitorMode:false,compact:false,maxConcurrency:1},0.02);
        const rows=normalizeCategoryRankings(items,target,at,{categoryUrl:url,cachedRecords});
        const missing=LIST_TYPES.filter(type=>!rows.some(r=>r.list_type===type));
        return {records:rows,status:'no_data',message:missing.length?'本轮未返回 '+missing.join('、')+'；空榜不补造，首次采样不推算涨跌。':null};
      }),
      run('reviews_public', async () => {
        if(skipPublicReviews)return {records:[],status:'skipped',message:'本次免登录评论采集关闭。'};
        const attempts=[];
        try {
          const items=await actor('reviewsPublic',{productUrls:[{url:'https://www.amazon.com/dp/'+target.asin}],maxReviews:10,sort:'recent',includeGdprSensitive:false,scrapeProductDetails:false,reviewsUseProductVariantFilter:false,reviewsAlwaysSaveCategoryData:true,deduplicateRedirectedAsins:true},0.5);
          const rows=normalizePublicReviews(items,target,at);
          if(rows.length)return {records:rows,message:'无需 Amazon 登录；仅保留美国站公开正文样本。'};
          attempts.push('Junglee 未返回美国站公开正文');
        }catch(e){attempts.push(text(e.message,180));}
        try {
          const items=await actor('reviewsPublicBackup',{products:['https://www.amazon.com/dp/'+target.asin],country:'us',maxReviewsPerAsin:10,sort:'recent',starFilter:'all_stars',includeTopReviewsFallback:false,stopOnError:false},0.03);
          const rows=normalizePublicReviews(items,target,at,{actor:'jdtpnjtp/amazon-reviews'});
          if(rows.length)return {records:rows,message:'Junglee 无可用正文，已使用 Jdtp；仅保留美国站样本。'};
          attempts.push('Jdtp 未返回美国站公开正文');
        }catch(e){attempts.push(text(e.message,180));}
        return {records:[],status:'no_data',message:attempts.join('；')+'。不使用外站评论冒充美国站，不需要用户提供登录凭证。'};
      }),
      run('trends', async () => { const rows = await actor('trends', { searchTerms: [seed.slice(0, 80)], country: 'US', timeRange: 'past_5_years', searchType: 'web', includeRegions: false, includeRelated: true, speed: 'fast' }, 0.01); return { records: normalizeTrendRows(rows, target, at), message: rows.find(r => r.rowType === 'not_found')?.note }; }),
      run('sales_history', async () => { const rows = await actor('salesHistory', { asin: target.asin, domain: '.com', history_range: '3' }, 0.025); const normalized = normalizeSalesHistory(rows, target.asin, at); return { records: normalized, status: 'no_data', message: normalized.length ? null : '历史 API 未返回该 ASIN 的周级数据。' }; }),
      run('keepa_history', async () => { const rows = await actor('keepa', { asins: [target.asin], marketplace: 'US', historyDays: 90, includeOffers: false, maxItems: 1 }, 0.02); const normalized = normalizeKeepaHistory(rows, target.asin, at); return { records: normalized, status: 'no_data', message: normalized.length ? null : 'Keepa 未返回该目标 ASIN 的历史记录。' }; }),
      run('dimensions', async () => { const rows = await actor('dimensions', { asin: target.asin, domain: '.com' }, 0.01); const normalized = normalizePackageDimensions(rows, target.asin, at); return { records: normalized, status: 'no_data', message: normalized.length ? null : '未取得计费包装尺寸。' }; }),
      run('sales_estimator', async () => { const rows = await actor('salesEstimator', { asins: [target.asin], marketplace: 'US' }, 0.012); const normalized = normalizeSalesEstimate(rows, target.asin, at); return { records: normalized, status: normalized.some(r => r.estimate_available) ? 'loaded' : 'no_data', message: normalized.find(r => !r.estimate_available)?.method_note ?? null }; }),
      run('alibaba', async () => { const rows = await actor('alibaba', { queries: [supplierSearch], maxItems: 5, maxPagesPerQuery: 1 }, 0.02); const normalized = normalizeSupplierQuotes(rows, target, 'Apify Alibaba Products', at); return { records: normalized, status: 'no_data', message: normalized.length ? null : '公开 Alibaba 搜索未返回带价格/MOQ 的供应商条目。' }; }),
      run('alibaba1688', async () => { const rows = await actor('alibaba1688', { keywords: [supplierSearch], maxResults: 2, sortBy: 'relevance', includeSkuDetails: false, includeDescriptionHtml: false, includeSupplierIntelligence: false, proxyCountryMode: 'rotate' }, 0.02); const normalized = normalizeSupplierQuotes(rows, target, 'Apify 1688 Wholesale', at); return { records: normalized, status: 'no_data', message: normalized.length ? null : rows.some(r => r.retry_later) ? '1688 免费预览暂时不可用。' : '公开 1688 搜索未返回带价格/MOQ 的供应商条目。' }; }),
      run('suggestions', async () => {
        const seeds = [...new Set([seed, supplierSearch])].filter(Boolean).slice(0, 2);
        const rows = await actor('suggestions', { keywords: seeds, marketplace: 'amazon.com', expansionMode: 'buyerModifiers', maxSuggestionsPerKeyword: 10, maxTotalResults: 20 }, 0.005);
        return { records: normalizeKeywordSuggestions(rows, { asin: target.asin, observedAt: at }) };
      }),
      run('reviews', async () => {
        if (skipReviews ?? !reviewsEnabled) return { records: [], status: 'skipped', message: '按用户选择跳过评论登录与采集，保留评论正文证据缺口。' };
        const rows = await actor('reviews', { mode: 'scrape', products: [target.asin], marketplace: 'com', maxReviewsPerProduct: 20, sort: 'recent', useSavedSessions: true });
        const samples = rows.filter(r => typeof (r.text ?? r.body ?? r.reviewText) === 'string' && (r.text ?? r.body ?? r.reviewText).trim()).map(r => ({ review_id: r.reviewId ?? r.id, title: text(r.title, 160), text: text(r.text ?? r.body ?? r.reviewText, 2200), rating: finite(r.rating), date: r.date ?? null, source_url: safeUrl(r.url ?? r.reviewUrl), verified_purchase: r.verifiedPurchase ?? null, variant_asin: r.variantAsin ?? null }));
        const summary = rows.runSummary?.marketplaces?.com;
        const loginRequired = ['NEEDS_LOGIN', 'SESSION_EXPIRED'].includes(summary?.status) || rows.some(r => ['NEEDS_LOGIN', 'SESSION_EXPIRED'].includes(r.status));
        return { records: samples.length ? [{ evidence_kind: 'reviews', asin: target.asin, title: `${target.title} 评论样本`, nature: 'fact', source_name: 'Apify Amazon Reviews Scraper', source_url: `https://www.amazon.com/product-reviews/${target.asin}`, source_mode: 'live_api', observed_at: at, review_samples: samples, review_sample_count: samples.length, source_note: '近期便利样本，不代表全体购买者或差评占比。' }] : [], status: loginRequired ? 'needs_login' : 'no_data', message: samples.length ? null : loginRequired ? 'Actor 运行摘要确认需要登录：请在该 Actor 的 Login 模式完成 amazon.com 买家账号登录后重试。' : summary?.message ?? 'Actor 未返回可用评论正文，原因以运行摘要为准；未标记为已取得评论。' };
      }),
      run('recalls', async () => {
        const query = text(target.brand || target.manufacturer || seed, 100);
        const url = `https://www.saferproducts.gov/RestWebServices/Recall?format=json&ProductName=${encodeURIComponent(query)}`;
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(25000) });
        if (!response.ok) throw new Error(`CPSC HTTP ${response.status}`);
        const items = await response.json();
        if (!Array.isArray(items)) throw new Error('CPSC 返回格式不正确');
        return { records: [{ evidence_kind: 'official_check', check_type: 'recall', asin: target.asin, title: 'CPSC 召回检索', query, result_count: items.length, nature: 'fact', source_name: 'CPSC 官方召回 API', source_url: url, source_mode: 'live_api', observed_at: at, scope: '按产品名称/品牌查询公开召回，未命中不代表合规或无召回；不是按 ASIN 的全面匹配。' }, ...normalizeRecalls(items, target, at)] };
      }),
      run('policies', async () => {
        const discovered = [];
        const results = await Promise.all(POLICY_URLS.map(async ([title, url]) => {
          try {
            let saved = policyCache.get(url);
            if (!saved || now() - Date.parse(saved.at) >= ttlMs) {
              const response = await fetchImpl(url, { signal: AbortSignal.timeout(18000) });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const html = await response.text();
              if (url.includes('cpsc.gov')) discovered.push(...relevantPolicyLinks(html, target));
              if (/captcha|automated access|sign.in to your account|robot check/i.test(html.slice(0, 30000))) throw new Error('页面需要登录或验证，未当作已核验政策');
              const content = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
              if (content.length < 30) throw new Error('页面未返回可用正文');
              saved = { at, content: parseOfficialPolicy(html) }; policyCache.set(url, saved);
            }
            return { evidence_kind: 'official_policy', asin: target.asin, title, nature: 'fact', source_name: title, source_url: url, source_mode: 'live_api', observed_at: saved.at, excerpt: saved.content, scope: '官方通用指引，不是对目标商品的认证、授权或准入判定。' };
          } catch (e) { return { failed: true, title, url, message: text(e.message, 160) }; }
        }));
        for (const link of discovered) {
          try {
            const response = await fetchImpl(link.url, { signal: AbortSignal.timeout(18000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const excerpt = parseOfficialPolicy(await response.text());
            results.push({ evidence_kind: 'official_policy', asin: target.asin, title: `CPSC ${link.title}`, nature: 'fact', source_name: 'CPSC 品类法规指引', source_url: link.url, source_mode: 'live_api', observed_at: at, excerpt, scope: '按商品标题/类目发现的官方指引，适用性、年龄、材质与具体义务仍需核实；不是认证结论。' });
          } catch (e) { results.push({ failed: true, title: link.title, url: link.url, message: text(e.message, 160) }); }
        }
        return { records: results.filter(r => !r.failed), message: results.filter(r => r.failed).map(r => `${r.title}: ${r.message}`).join('；') || null };
      })
    ]);
    if (!skipPublicReviews && !records.some(r=>r.evidence_kind==='reviews')) {
      await run('reviews_public_featured', async () => {
        const rows=normalizePublicReviews(publicProductRows,target,at,{actor:'cleanpull/amazon-product-scraper',sampleKind:'featured'});
        const blocked=publicProductRows.some(r=>r.reviewsNeedSignIn||r.reviewsMissing==='sign-in');
        return {records:rows,status:blocked?'needs_login':'no_data',message:rows.length?'仅取得商品页精选评论，不是近期评论列表。':blocked?'该商品美国站页面要求登录才能查看正文；免登录来源已尝试，保持证据缺口。':'商品页也未返回公开评论正文。'};
      });
    }
    const uncoveredSuggestions = [...new Set(records.filter(r => r.evidence_kind === 'keyword_suggestion' && !records.some(k => k.evidence_kind === 'keyword' && k.keyword.toLowerCase() === r.keyword.toLowerCase())).map(r => r.keyword))].slice(0, 10);
    if (uncoveredSuggestions.length) await run('suggestion_volume', async () => {
      const useBackup=records.some(r=>r.evidence_kind==='keyword'&&r.provider_actor==='pravus/amazon-keywords')||['quota_exceeded','failed'].includes(sources.keywords?.status);
      const items = useBackup ? await actor('keywordBackup',{mode:'volume',keywords:uncoveredSuggestions,marketplace:'US'},0.05) : await actor('keywords', { mode: 'searchVolume', keywords: uncoveredSuggestions, market: 'US' }, 0.04);
      const normalized = classifyKeywords(useBackup?normalizeBackupKeywords(items,target,at):normalizeKeywordRows(items, { asin: target.asin, observedAt: at }), target);
      return { records: normalized, status: 'no_data', message: items.find(r => r.notFoundReason)?.notFoundReason ?? null };
    });
    return { records, sources };
  }
  return { name: 'Research sources', configured: true, fetchEvidence };
}
