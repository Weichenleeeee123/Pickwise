const API = 'https://api.dataforseo.com/v3';
const MARKET = { location_code: 2840, language_code: 'en_US' };
const DEFAULT_TTL = 6 * 60 * 60 * 1000;
const MAX_RESULTS = 20;
const MAX_COMPETITORS = 5;
const MAX_REVIEWS = 8;

function finite(value) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(number) ? number : null;
}

function itemsOf(payload) {
  return (payload.tasks ?? []).flatMap((task) => {
    if (task.status_code && task.status_code !== 20000) throw new Error(`任务失败 ${task.status_code}: ${task.status_message ?? ''}`);
    return (task.result ?? []).flatMap((result) => result.items ?? []);
  });
}

function taskCost(payload) {
  return finite(payload.tasks?.reduce((sum, task) => sum + (finite(task.cost) ?? 0), 0)) ?? 0;
}

function reviewsFrom(item) {
  return [...(item.top_local_reviews ?? []), ...(item.top_global_reviews ?? [])]
    .filter((review) => review.review_text || review.title)
    .slice(0, MAX_REVIEWS)
    .map((review) => ({
      title: String(review.title ?? '').slice(0, 160),
      text: String(review.review_text ?? '').slice(0, 500),
      rating: finite(review.rating?.value),
      published_at: review.publication_date ?? null,
      verified: review.verified ?? null,
      source_url: review.url ?? null
    }));
}

function rankingMetrics(metrics) {
  if (!metrics) return undefined;
  return Object.fromEntries(['amazon_serp', 'amazon_paid'].flatMap((key) => {
    const source = metrics[key];
    return source ? [[key, Object.fromEntries(['pos_1', 'pos_2_3', 'pos_4_10', 'pos_11_100', 'count'].map((field) => [field, finite(source[field])]))]] : [];
  }));
}

function normalize(item, observedAt, cacheKey, defaults = {}) {
  const asin = String(item.data_asin ?? item.asin ?? defaults.asin ?? '').toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return null;
  const reviews = reviewsFrom(item);
  return {
    marketplace: 'Amazon US', asin,
    parent_asin: item.parent_asin ?? undefined,
    title: String(item.title ?? asin).slice(0, 300),
    source_name: 'DataForSEO Amazon',
    source_url: item.url ?? `https://www.amazon.com/dp/${asin}`,
    observed_at: observedAt,
    source_mode: 'live_api',
    price: finite(item.price_from ?? item.price?.current),
    currency: item.currency ?? item.price?.currency ?? (item.price_from !== undefined ? 'USD' : undefined),
    rating: finite(item.rating?.value ?? item.rating),
    review_count: finite(item.rating?.votes_count ?? item.reviews_count),
    monthly_purchase_signal: finite(item.bought_past_month),
    sales_signal_label: item.bought_past_month === undefined ? undefined : 'Amazon 页面展示的近月购买信号；非销量历史数据商估算',
    review_samples: reviews,
    review_sample_count: reviews.length,
    rank: finite(item.rank_absolute),
    competitor_metrics: rankingMetrics(item.competitor_metrics),
    competitor_avg_position: finite(item.avg_position),
    competitor_keyword_intersections: finite(item.intersections),
    _cache_key: cacheKey
  };
}

function fresh(records, cacheKey, now, ttl) {
  const matching = records.filter((record) => record._cache_key === cacheKey && now - Date.parse(record.observed_at) < ttl);
  if (!matching.length) return null;
  const latest = Math.max(...matching.map((record) => Date.parse(record.observed_at)));
  return matching.filter((record) => Date.parse(record.observed_at) === latest);
}

export function createDataForSeo({ login, password, fetchImpl = globalThis.fetch, now = () => new Date(), cacheTtlMs = DEFAULT_TTL } = {}) {
  const configured = Boolean(login && password);
  const cache = new Map();

  async function request(path, body) {
    const authorization = `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;
    const response = await fetchImpl(`${API}${path}`, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`DataForSEO 请求返回 ${response.status}: ${text.slice(0, 160)}`);
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error('DataForSEO 返回无效 JSON'); }
    if (payload.status_code && payload.status_code !== 20000) throw new Error(`DataForSEO 请求失败 ${payload.status_code}: ${payload.status_message ?? ''}`);
    return payload;
  }

  async function fetchEvidence({ query, asin, cachedRecords = [], cacheNamespace = 'legacy' } = {}) {
    if (!configured) return { records: [], cost: 0, cached: false, unavailable: true };
    const normalizedAsin = String(asin ?? '').toUpperCase();
    const normalizedQuery = String(query ?? '').trim();
    if (!normalizedAsin && !normalizedQuery) return { records: [], cost: 0, cached: false };
    const cacheKey = normalizedAsin ? `amazon:asin:${normalizedAsin}` : `amazon:query:${normalizedQuery.toLowerCase()}`;
    const memoryKey = JSON.stringify([cacheNamespace, cacheKey]);
    const current = now();
    const cached = cache.get(memoryKey) ?? fresh(cachedRecords, cacheKey, current.getTime(), cacheTtlMs);
    if (cached && current.getTime() - Date.parse(cached[0].observed_at) < cacheTtlMs) {
      cache.set(memoryKey, cached);
      return { records: cached.map((record) => ({ ...record })), cost: 0, cached: true };
    }

    let payload;
    let cost = 0;
    if (normalizedAsin) {
      payload = await request('/merchant/amazon/asin/live/advanced', [{ ...MARKET, asin: normalizedAsin, depth: 20 }]);
      cost += taskCost(payload);
      const observedAt = current.toISOString();
      const targetItems = itemsOf(payload).filter((item) => item.type === 'amazon_product_info');
      const records = targetItems.slice(0, 1).map((item) => normalize(item, observedAt, cacheKey, { asin: normalizedAsin })).filter(Boolean);
      try {
        const competitorPayload = await request('/dataforseo_labs/amazon/product_competitors/live', [{ asin: normalizedAsin, location_code: MARKET.location_code, language_code: 'en', limit: MAX_COMPETITORS + 1 }]);
        cost += taskCost(competitorPayload);
        const competitorItems = (competitorPayload.tasks ?? []).flatMap((task) => task.result ?? []).flatMap((result) => result.items ?? [])
          .filter((item) => String(item.asin ?? '').toUpperCase() !== normalizedAsin)
          .slice(0, MAX_COMPETITORS);
        if (competitorItems.length) {
          const detailPayload = await request('/merchant/amazon/asin/live/advanced', competitorItems.map((item) => ({ ...MARKET, asin: item.asin, depth: 20 })));
          cost += taskCost(detailPayload);
          const details = new Map(itemsOf(detailPayload).filter((item) => item.type === 'amazon_product_info').map((item) => [String(item.data_asin ?? item.asin).toUpperCase(), item]));
          for (const competitor of competitorItems) {
            const detail = details.get(String(competitor.asin).toUpperCase());
            if (!detail) continue;
            records.push(normalize({ ...detail, ...competitor }, observedAt, cacheKey, { asin: competitor.asin }));
          }
        }
      } catch {
        // Keep the directly requested product if competitor enrichment is unavailable.
      }
      const complete = records.filter(Boolean);
      cache.set(memoryKey, complete);
      return { records: complete, cost, cached: false };
    } else {
      payload = await request('/merchant/amazon/products/live/advanced', [{ ...MARKET, keyword: normalizedQuery, depth: MAX_RESULTS }]);
    }
    const observedAt = current.toISOString();
    const records = itemsOf(payload)
      .filter((item) => normalizedAsin ? item.type === 'amazon_product_info' : ['organic', 'paid', 'amazon_serp', 'amazon_serp_element', 'amazon_paid', 'amazon_organic'].includes(item.type))
      .slice(0, normalizedAsin ? 1 : MAX_RESULTS)
      .map((item) => normalize(item, observedAt, cacheKey, { asin: normalizedAsin }))
      .filter(Boolean);
    cache.set(memoryKey, records);
    return { records, cost: cost + taskCost(payload), cached: false };
  }

  return { configured, fetchEvidence };
}
