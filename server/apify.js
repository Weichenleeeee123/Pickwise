import { apifyResponseError, withApifyRun } from './apify-runtime.js';
import { matchCompetitors } from './business-evidence.js';
const RUN_URL = 'https://api.apify.com/v2/actors/api_creators~amazon-product-scraper/run-sync-get-dataset-items';
const DEFAULT_TTL = 6 * 60 * 60 * 1000;
const MAX_RESULTS = 20;
const MAX_DETAILED_COMPETITORS = 3;
const MAX_OFFERS = 3;
const CACHE_VERSION = 'v5';
const MAX_RUN_CHARGE_USD = 0.05;

function finite(value) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(number) ? number : null;
}

function currency(value) {
  const code = String(value ?? '').trim();
  return code === '$' || code === 'US$' || !code ? (code ? 'USD' : undefined) : code;
}

function displayText(value, limit = 500) {
  if (value === null || value === undefined || value === '') return undefined;
  const text = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.slice(0, limit);
}

function keyValueRows(value, limit = 20) {
  return (Array.isArray(value) ? value : []).slice(0, limit).map((row) => ({
    key: displayText(row?.key ?? row?.name ?? row?.label ?? row?.title, 120) ?? '',
    value: displayText(row?.value ?? row?.text ?? row?.description, 500) ?? ''
  })).filter((row) => row.key || row.value);
}

function priceRange(value) {
  if (!value || typeof value !== 'object') return undefined;
  const min = finite(value.min?.value ?? value.min ?? value.low?.value ?? value.low);
  const max = finite(value.max?.value ?? value.max ?? value.high?.value ?? value.high);
  if (min === null && max === null) return undefined;
  return { min, max, currency: currency(value.min?.currency ?? value.max?.currency ?? value.currency) ?? 'USD' };
}

function hasContent(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(String(value ?? '').trim());
}

function parsePurchaseSignal(value) {
  if (typeof value === 'number') return finite(value);
  const text = String(value ?? '').replace(/,/g, '').trim();
  const match = /([0-9]+(?:\.[0-9]+)?)\s*([KMB](?=\s*(?:\+|\b|$)))?\s*\+?/i.exec(text);
  if (!match) return null;
  const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[String(match[2] ?? '').toUpperCase()] ?? 1;
  return Number(match[1]) * multiplier;
}

function normalize(item, observedAt, cacheKey) {
  const asin = String(item.asin ?? item.dataAsin ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return null;
  const price = item.price?.value ?? item.price?.current ?? item.price;
  const shippingPrice = item.shippingPrice?.value ?? item.shippingPrice;
  const ranks = Array.isArray(item.bestsellerRanks) ? item.bestsellerRanks : [];
  const variants = Array.isArray(item.variantDetails) ? item.variantDetails : [];
  const features = Array.isArray(item.features) ? item.features : Array.isArray(item.bulletPoints) ? item.bulletPoints : [];
  const offers = Array.isArray(item.offers) ? item.offers : [];
  const monthly = finite(item.monthlyPurchaseVolumeMin) ?? parsePurchaseSignal(item.monthlyPurchaseVolume ?? item.boughtInPastMonth);
  const categoryPage = item.categoryPageData && typeof item.categoryPageData === 'object' ? item.categoryPageData : {};
  const buyBox = item.buyBox && typeof item.buyBox === 'object' ? item.buyBox : {};
  return {
    marketplace: 'Amazon US', asin,
    parent_asin: item.parentAsin ?? item.parent_asin ?? undefined,
    original_asin: item.originalAsin ?? undefined,
    title: String(item.title ?? asin).slice(0, 300),
    brand: item.brand ?? undefined,
    category_path: Array.isArray(item.breadCrumbs) ? item.breadCrumbs.join(' > ') : item.breadCrumbs ?? undefined,
    source_name: 'Apify Amazon Product Scraper',
    source_url: item.url ?? `https://www.amazon.com/dp/${asin}`,
    observed_at: observedAt,
    source_mode: 'live_api',
    price: finite(price),
    original_price: finite(item.listPrice?.value ?? item.listPrice),
    price_range: priceRange(item.priceRange),
    discount_percentage: finite(item.discountPercentage ?? item.discount?.percentage),
    currency: currency(item.price?.currency ?? item.currency),
    shipping_price: finite(shippingPrice),
    rating: finite(item.stars ?? item.rating),
    review_count: finite(item.reviewsCount ?? item.review_count),
    has_reviews: item.hasReviews ?? undefined,
    reviews_url: item.reviewsLink ?? undefined,
    answered_questions: finite(item.answeredQuestions),
    star_breakdown: item.starsBreakdown && typeof item.starsBreakdown === 'object' ? Object.fromEntries(Object.entries(item.starsBreakdown).slice(0, 5).map(([key, value]) => [key, finite(value)])) : undefined,
    monthly_purchase_signal: monthly,
    sales_signal_label: monthly === null ? undefined : `Amazon 页面显示的 ${String(item.monthlyPurchaseVolume ?? item.boughtInPastMonth ?? item.monthlyPurchaseVolumeMin)}；不是订单销量历史估算`,
    monthly_purchase_min: finite(item.monthlyPurchaseVolumeMin),
    condition: item.condition ?? undefined,
    amazon_choice: item.isAmazonChoice ?? undefined,
    amazon_choice_text: item.amazonChoiceText ?? undefined,
    bestseller_badge: item.bestsellerBadge ?? undefined,
    review_samples: [],
    review_sample_count: 0,
    review_summary: item.aiReviewsSummary?.text ?? item.reviewSummary ?? undefined,
    review_summary_aspects: Array.isArray(item.aiReviewsSummary?.keywords) ? item.aiReviewsSummary.keywords.slice(0, 8).map((aspect) => ({ name: String(aspect.name ?? '').slice(0, 80), mentions: finite(aspect.mentions), sentiment: aspect.sentiment ?? null })) : [],
    seller_name: item.seller?.name ?? undefined,
    seller_id: item.seller?.id ?? undefined,
    seller_url: item.seller?.url ?? undefined,
    seller_rating: finite(item.seller?.rating),
    offers_count: finite(item.offersTotal ?? item.offersCount ?? item.offerCount),
    lowest_offer_price: finite(item.lowestOfferPrice?.value ?? item.lowestOfferPrice),
    lowest_offer_currency: currency(item.lowestOfferPrice?.currency),
    lowest_offer_seller: displayText(item.lowestOfferSeller?.name ?? item.lowestOfferSeller?.seller?.name ?? item.lowestOfferSeller, 160),
    offers: offers.slice(0, MAX_OFFERS).map((offer) => ({
      price: finite(offer.price?.value ?? offer.price),
      currency: currency(offer.price?.currency ?? offer.currency),
      shipping_price: finite(offer.shippingPrice?.value ?? offer.shippingPrice),
      condition: offer.condition ?? null,
      seller_name: offer.seller?.name ?? offer.sellerName ?? null,
      seller_rating: finite(offer.seller?.rating ?? offer.sellerRating),
      delivery: offer.delivery ?? offer.deliveryDate ?? null,
      ships_from: offer.shipsFrom ?? offer.ships_from ?? null,
      is_prime: offer.isPrime ?? offer.is_prime ?? null
    })),
    delivery_text: item.delivery ?? undefined,
    featured_offer_condition: item.condition ?? undefined,
    ships_from: item.shipsFrom ?? buyBox.shipsFrom ?? undefined,
    sold_by: buyBox.soldBy ?? undefined,
    fulfillment: buyBox.fulfillment ?? undefined,
    is_amazon_seller: buyBox.isAmazonSeller ?? undefined,
    is_fba: buyBox.isFBA ?? undefined,
    fastest_delivery_text: item.fastestDelivery ?? undefined,
    delivery_location: item.locationText ?? undefined,
    return_policy: item.returnPolicy ?? undefined,
    stock_left: displayText(item.stockLeft, 120),
    max_order_quantity: finite(item.maxOrderQuantity),
    thumbnail_url: item.thumbnailImage ?? undefined,
    image_urls: Array.isArray(item.highResolutionImages) ? item.highResolutionImages.slice(0, 8).filter((url) => typeof url === 'string') : [],
    image_count: Math.max(Array.isArray(item.highResolutionImages) ? item.highResolutionImages.length : 0, Array.isArray(item.galleryThumbnails) ? item.galleryThumbnails.length : 0),
    videos_count: finite(item.videosCount),
    description: String(item.description ?? item.bookDescription ?? '').slice(0, 3000) || undefined,
    product_overview: keyValueRows(item.productOverview),
    product_attributes: item.attributesMapped && typeof item.attributesMapped === 'object'
      ? Object.fromEntries(Object.entries(item.attributesMapped).slice(0, 30).map(([key, value]) => [String(key).slice(0, 100), String(value ?? '').slice(0, 300)]))
      : {},
    dimensions: displayText(item.dimensions, 160),
    weight: displayText(item.weight, 120),
    model_number: displayText(item.modelNumber, 120),
    manufacturer: displayText(item.manufacturer, 160),
    gtin: displayText(item.gtin, 80),
    date_first_available: displayText(item.dateFirstAvailable, 40),
    support: displayText(item.support, 500),
    important_information: displayText(item.importantInformation, 1500),
    sustainability_features: keyValueRows(item.sustainabilityFeatures, 10),
    has_a_plus_content: hasContent(item.aPlusContent),
    has_brand_story: hasContent(item.brandStory),
    features: features.slice(0, 8).map((feature) => String(feature).slice(0, 220)),
    variant_details: variants.slice(0, 12).map((variant) => ({ asin: variant.asin ?? null, title: String(variant.title ?? '').slice(0, 160), attributes: variant.attributes ?? null, price: finite(variant.price?.value ?? variant.price) })),
    bestseller_ranks: ranks.map((rank) => ({ rank: finite(rank.rank), category: String(rank.category ?? '').slice(0, 120), source_url: rank.url ?? null })).filter((rank) => rank.rank !== null),
    rank: finite(ranks.at(-1)?.rank ?? item.bestsellerPageData?.rank),
    search_rank: finite(categoryPage.organicPosition ?? categoryPage.position ?? categoryPage.productPosition),
    search_position: finite(categoryPage.productPosition ?? categoryPage.position),
    search_page: finite(categoryPage.pageNumber),
    is_sponsored: typeof categoryPage.isSponsored === 'boolean' ? categoryPage.isSponsored : undefined,
    search_total_results: finite(categoryPage.totalResults),
    search_badge: categoryPage.badge ?? undefined,
    in_stock: item.inStock ?? undefined,
    stock_text: item.inStockText ?? undefined,
    _cache_key: cacheKey
  };
}

function fresh(records, cacheKey, nowMs, ttl) {
  const matching = records.filter((record) => record._cache_key === cacheKey && nowMs - Date.parse(record.observed_at) < ttl);
  if (!matching.length) return null;
  const latest = Math.max(...matching.map((record) => Date.parse(record.observed_at)));
  return dedupeRecords(matching.filter((record) => Date.parse(record.observed_at) === latest));
}

function dedupeRecords(records) {
  const unique = new Map();
  for (const record of records) {
    const key = `${record.asin}|${record.observed_at}`;
    if (!unique.has(key)) unique.set(key, record);
  }
  return [...unique.values()];
}

function enrichListing(listing, detail) {
  if (!detail) return listing;
  const merged = { ...listing };
  for (const [key, value] of Object.entries(detail)) {
    if (value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0 && Array.isArray(listing[key]) && listing[key].length > 0)) merged[key] = value;
  }
  merged.monthly_purchase_signal = listing.monthly_purchase_signal ?? detail.monthly_purchase_signal ?? null;
  merged.sales_signal_label = listing.sales_signal_label ?? detail.sales_signal_label;
  merged.rank = listing.rank ?? detail.rank;
  merged.search_rank = listing.search_rank ?? detail.search_rank;
  merged._cache_key = listing._cache_key;
  return merged;
}

function competitorQuery(product) {
  const categories = Array.isArray(product?.bestsellerRanks)
    ? product.bestsellerRanks.map((rank) => String(rank.category ?? '').trim()).filter(Boolean)
    : [];
  const category = categories.at(-1) ?? null;
  if (category) return category;
  const breadcrumbs = product?.breadCrumbs;
  if (Array.isArray(breadcrumbs) && breadcrumbs.length) return String(breadcrumbs.at(-1)).trim();
  if (typeof breadcrumbs === 'string') {
    const parts = breadcrumbs.split(/[›>]/).map((part) => part.trim()).filter(Boolean);
    if (parts.length) return parts.at(-1);
  }
  const brand = String(product?.brand ?? '').trim();
  const title = String(product?.title ?? '').replace(/\b[A-Z0-9]{10}\b/gi, ' ');
  const cleaned = brand ? title.replace(new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ') : title;
  return cleaned.replace(/\b(?:women's|women|men's|men|new|latest)\b/ig, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

export function createApify({ token, fetchImpl = globalThis.fetch, now = () => new Date(), cacheTtlMs = DEFAULT_TTL } = {}) {
  const configured = Boolean(token);
  const cache = new Map();

  async function request(input) {
    return withApifyRun(() => requestNow(input));
  }

  async function requestNow(input) {
    let response;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const endpoint = new URL(RUN_URL);
        endpoint.searchParams.set('token', token);
        endpoint.searchParams.set('maxTotalChargeUsd', String(MAX_RUN_CHARGE_USD));
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(120_000)
        });
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    if (!response) throw new Error(`Apify 网络请求失败：${lastError?.cause?.code ?? lastError?.message ?? 'unknown error'}`);
    if (!response.ok) throw await apifyResponseError(response, 'product', token);
    const text = await response.text();
    try { return JSON.parse(text); } catch { throw new Error('Apify 返回无效 JSON'); }
  }

  async function fetchEvidence({ query, asin, cachedRecords = [], cacheNamespace = 'legacy' } = {}) {
    if (!configured) return { records: [], cost: null, cached: false, unavailable: true };
    const normalizedAsin = String(asin ?? '').trim().toUpperCase();
    const normalizedQuery = String(query ?? '').trim();
    if (!normalizedAsin && !normalizedQuery) return { records: [], cost: null, cached: false };
    const cacheKey = normalizedAsin ? `amazon:${CACHE_VERSION}:asin:${normalizedAsin}` : `amazon:${CACHE_VERSION}:query:${normalizedQuery.toLowerCase()}`;
    const memoryKey = JSON.stringify([cacheNamespace, cacheKey]);
    const current = now();
    const cached = fresh(cache.get(memoryKey) ?? [], cacheKey, current.getTime(), cacheTtlMs) ?? fresh(cachedRecords, cacheKey, current.getTime(), cacheTtlMs);
    if (cached) {
      cache.set(memoryKey, cached);
      return { records: cached.map((record) => ({ ...record, source_mode: 'cached_snapshot' })), cost: null, cached: true };
    }
    const observedAt = current.toISOString();
    const targetUrl = normalizedAsin ? `https://www.amazon.com/dp/${normalizedAsin}` : `https://www.amazon.com/s?k=${encodeURIComponent(normalizedQuery)}`;
    const targetItems = await request({
      categoryOrProductUrls: [{ url: targetUrl }],
      maxItemsPerStartUrl: normalizedAsin ? 1 : MAX_RESULTS,
      scrapeProductDetails: Boolean(normalizedAsin),
      scrapeProductVariantPrices: Boolean(normalizedAsin),
      maxOffers: normalizedAsin ? MAX_OFFERS : 0,
      scrapeSellers: false
    });
    const errors = (Array.isArray(targetItems) ? targetItems : []).filter((item) => item?.error);
    const records = dedupeRecords((Array.isArray(targetItems) ? targetItems : []).map((item) => normalize(item, observedAt, cacheKey)).filter(Boolean));
    if (!records.length && errors.length) throw new Error(`Apify 商品抓取失败：${errors[0].errorDescription ?? errors[0].error}`);
    if (normalizedAsin && records.length) {
      const target = (Array.isArray(targetItems) ? targetItems : []).find((item) => String(item.asin ?? '').toUpperCase() === normalizedAsin);
      const query = competitorQuery(target);
      if (query) {
        try {
          const searchItems = await request({
            categoryOrProductUrls: [{ url: `https://www.amazon.com/s?k=${encodeURIComponent(query)}` }],
            maxItemsPerStartUrl: MAX_RESULTS,
            scrapeProductDetails: false,
            maxOffers: 0,
            scrapeSellers: false
          });
          const searchRows = (Array.isArray(searchItems) ? searchItems : []).filter((item) => !item?.error);
          let targetListing = searchRows.find((item) => String(item.asin ?? '').toUpperCase() === normalizedAsin);
          if (!targetListing && target?.title) {
            try {
              const targetSearch = await request({
                categoryOrProductUrls: [{ url: `https://www.amazon.com/s?k=${encodeURIComponent(String(target.title).slice(0, 100))}` }],
                maxItemsPerStartUrl: 5,
                scrapeProductDetails: false,
                maxOffers: 0,
                scrapeSellers: false
              });
              targetListing = (Array.isArray(targetSearch) ? targetSearch : []).find((item) => String(item.asin ?? '').toUpperCase() === normalizedAsin && !item?.error);
            } catch {
              // The target detail and category competitors remain available without the page signal.
            }
          }
          if (targetListing) {
            const enrichedTarget = enrichListing(records[0], normalize(targetListing, observedAt, cacheKey));
            records.splice(0, 1, enrichedTarget);
          }
          const competitors = dedupeRecords(searchRows
            .filter((item) => String(item.asin ?? '').toUpperCase() !== normalizedAsin)
            .map((item) => normalize(item, observedAt, cacheKey))
            .filter(Boolean));
          const ranked = matchCompetitors(records[0], competitors);
          const detailCandidates = ranked.filter(row => row.match.classification !== 'not_comparable').slice(0, MAX_DETAILED_COMPETITORS);
          if (detailCandidates.length) {
            try {
              const detailItems = await request({
                categoryOrProductUrls: detailCandidates.map((item) => ({ url: item.source_url })),
                maxItemsPerStartUrl: 1,
                scrapeProductDetails: true,
                scrapeProductVariantPrices: true,
                maxOffers: MAX_OFFERS,
                scrapeSellers: false
              });
              const detailsByAsin = new Map((Array.isArray(detailItems) ? detailItems : [])
                .map((item) => normalize(item, observedAt, cacheKey))
                .filter(Boolean)
                .map((item) => [item.asin, item]));
              for (const competitor of detailCandidates) {
                const detail = detailsByAsin.get(competitor.asin);
                if (!detail) continue;
                const index = competitors.findIndex((item) => item.asin === competitor.asin);
                if (index >= 0) competitors[index] = enrichListing(competitors[index], detail);
              }
            } catch {
              // Listing snapshots remain useful if paid detail enrichment is unavailable.
            }
          }
          records.push(...competitors);
        } catch {
          // Keep the target detail when the related-category search fails.
        }
      }
    }
    const uniqueRecords = dedupeRecords(records);
    cache.set(memoryKey, uniqueRecords);
    return { records: uniqueRecords, cost: null, cached: false };
  }

  async function fetchSnapshot({ asin }) {
    if (!configured || !/^[A-Z0-9]{10}$/.test(String(asin))) throw new Error('Apify 未配置或 ASIN 无效');
    const observedAt = now().toISOString();
    const items = await request({ categoryOrProductUrls: [{ url: `https://www.amazon.com/dp/${asin}` }], maxItemsPerStartUrl: 1, scrapeProductDetails: true, scrapeProductVariantPrices: true, maxOffers: 0, scrapeSellers: false });
    return { records: (Array.isArray(items) ? items : []).filter(item => !item.error).map(item => normalize(item, observedAt, `snapshot:${asin}`)).filter(row => row?.asin === asin), cost: null };
  }
  return { name: 'Apify', configured, fetchEvidence, fetchSnapshot };
}
