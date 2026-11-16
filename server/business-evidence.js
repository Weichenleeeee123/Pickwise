const stop = new Set(['the', 'and', 'with', 'for', 'from', 'new', 'by', 'of', 'a', 'an', 'in', 'to']);
const words = value => [...new Set(String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 2 && !stop.has(w)))];
const titleMatch = (target, candidate) => { const brand = words(target?.brand); const base = words(target?.title).filter(w => !brand.includes(w)); const other = words(candidate); return Math.round(base.filter(w => other.includes(w)).length / Math.max(1,base.length) * 100) / 100; };

export function matchCompetitors(target, candidates) {
  const tokens = words(target.title).filter(w => !words(target.brand).includes(w));
  const seen = new Set([target.asin, target.parent_asin].filter(Boolean));
  return candidates.map(row => {
    const limits = [];
    const reasons = [];
    const overlap = words(row.title).filter(w => tokens.includes(w)).length / Math.max(tokens.length, 1);
    let score = overlap;
    let rejected = false;
    const family = row.parent_asin || row.asin;
    if (seen.has(family) || row.asin === target.asin) { rejected = true; reasons.push('目标同父体或重复变体，不作为独立竞品'); }
    seen.add(family);
    if (/replacement|accessor|compatible with|case for|refill|cover for/i.test(row.title) && !/replacement|accessor|refill/i.test(target.title)) { rejected = true; reasons.push('疑似配件或耗材，不能与主商品直接比较'); }
    if (overlap < 0.2) { rejected = true; reasons.push('用途或标题词匹配不足'); }
    if (Number.isFinite(target.price) && target.price > 0 && Number.isFinite(row.price) && row.currency === target.currency) {
      const ratio = row.price / target.price;
      if (ratio < 0.35 || ratio > 3) { score -= 0.4; limits.push('与目标观察价差距较大，需要核实包装数量与定位'); }
    } else limits.push('价格或币种不足，不能核实价格带');
    const left = target.product_attributes ?? {};
    const right = row.product_attributes ?? {};
    const shared = Object.keys(left).filter(k => k in right && /size|capacity|count|material|technology|type/i.test(k));
    if (!shared.length) limits.push('缺少双方共同规格，尚不能确认完全可比');
    for (const key of shared) if (String(left[key]).toLowerCase() !== String(right[key]).toLowerCase()) limits.push(`规格不同：${key}（${left[key]} / ${right[key]}）`);
    if (row.brand && target.brand && row.brand.toLowerCase() === target.brand.toLowerCase()) limits.push('同品牌样本，不能代表新品牌进入条件');
    const classification = rejected ? 'not_comparable' : limits.length ? 'uncertain' : 'comparable';
    return { ...row, match: { classification, score: Math.round(Math.max(0, score) * 100) / 100, reasons: reasons.length ? reasons : ['按标题用途、父体、品牌、规格与观察价格筛选'], limits } };
  }).sort((a, b) => (a.match.classification === 'not_comparable') - (b.match.classification === 'not_comparable') || b.match.score - a.match.score);
}

export function snapshotHistory(session) {
  const unique = new Map();
  for (const row of session.evidence) {
    if (row.asin !== session.targetAsin || row.evidence_kind || !Number.isFinite(Date.parse(row.observed_at))) continue;
    const key = row.observed_at;
    if (!unique.has(key)) unique.set(key, { id: row.id, observed_at: row.observed_at, price: row.price ?? null, currency: row.currency ?? null, bsr: row.rank ?? null, bsr_category: row.bestseller_ranks?.at(-1)?.category ?? null, monthly_purchase_signal: row.monthly_purchase_signal ?? null, review_count: row.review_count ?? null, in_stock: row.in_stock ?? null });
  }
  return [...unique.values()].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
}

export function summarizeInterest(points) {
  const sorted = points.filter(p => Number.isFinite(Date.parse(p.date)) && Number.isFinite(p.value)).sort((a,b) => a.date.localeCompare(b.date));
  const years = new Map();
  for (const p of sorted) { const d = new Date(p.date); const year = d.getUTCFullYear(), month = d.getUTCMonth() + 1; const months = years.get(year) ?? new Map(); const values = months.get(month) ?? []; values.push(p.value); months.set(month, values); years.set(year, months); }
  const complete = [...years.entries()].filter(([, months]) => months.size === 12).map(([year, months]) => {
    const means = [...months].map(([month, values]) => ({ month, mean: values.reduce((s,v) => s + v, 0) / values.length }));
    const peak = means.sort((a,b) => b.mean - a.mean)[0];
    const trough = means.at(-1);
    return { year, peakMonth: peak.month, peakMean: +peak.mean.toFixed(2), troughMean: +trough.mean.toFixed(2) };
  });
  const votes = new Map(); for (const y of complete) votes.set(y.peakMonth, (votes.get(y.peakMonth) ?? 0) + 1);
  const strongest = [...votes].sort((a,b) => b[1] - a[1])[0];
  const recurringPeakMonth = complete.length >= 2 && strongest?.[1] >= Math.ceil(complete.length * 0.75) && complete.some(y => y.peakMean > y.troughMean * 1.2) ? strongest[0] : null;
  const means = ps => ps.length ? ps.reduce((s,p) => s+p.value, 0)/ps.length : null;
  const newest = sorted.at(-1); const recent = newest ? sorted.filter(p => Date.parse(p.date) >= Date.parse(newest.date) - 90 * 86400_000) : [];
  const prior = newest ? sorted.filter(p => Date.parse(p.date) < Date.parse(newest.date) - 90 * 86400_000 && Date.parse(p.date) >= Date.parse(newest.date) - 180 * 86400_000) : [];
  const recentMean = means(recent), previousMean = means(prior);
  return { completeYears: complete.length, annualPeaks: complete, recurringPeakMonth, recentMean: recentMean === null ? null : +recentMean.toFixed(2), previousMean: previousMean === null ? null : +previousMean.toFixed(2), changePct: previousMean > 0 && recentMean !== null ? +((recentMean/previousMean-1)*100).toFixed(1) : null, method: '按完整日历年的月均相对指数比较；至少两个完整年份且同月峰值覆盖四分之三年份才标记重复峰值。变化比较最近与之前各九十天的观测均值。', limitation: '仅说明对应搜索词在 Google 的历史相对关注，不能证明 Amazon 销量、未来需求或因果。' };
}

export function supplierScenario(target, records, competitors) {
  const tokens = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(w => w.length > 2 && !['the','for','with','and','from','women','woman','mens','men','shoes','shoe','sneakers','sneaker','casual'].includes(w));
  const targetTokens = tokens(target?.title).filter(w => !tokens(target?.brand).includes(w));
  const targetCategory = /shoe|sneaker|footwear|trainer/i.test(String(target?.title ?? ''));
  const quotes = records.filter(r => r.evidence_kind === 'supplier_quote').map(r => {
    const other = tokens(r.title); const overlap = targetTokens.filter(w => other.includes(w)).length / Math.max(1,targetTokens.length);
    const categoryMatch = targetCategory && /shoe|sneaker|footwear|trainer/i.test(String(r.title ?? ''));
    return { ...r, supplier_match_score: Math.round(Math.max(overlap, categoryMatch ? 0.22 : 0) * 100) / 100, supplier_match_mode: overlap >= 0.25 ? 'title_overlap' : categoryMatch ? 'category_match_uncertain' : 'unmatched' };
  }).filter(r => r.supplier_match_score >= 0.2).sort((a,b) => b.supplier_match_score-a.supplier_match_score).slice(0,6);
  const fees = records.filter(r => r.evidence_kind === 'amazon_fee_estimate' && r.asin === target?.asin).sort((a,b) => String(b.observed_at).localeCompare(String(a.observed_at)))[0];
  const comp = competitors.filter(r => r.currency === 'USD' && Number.isFinite(r.price) && r.price > 0 && r.match?.classification !== 'not_comparable').map(r => r.price).sort((a,b)=>a-b);
  const marketPriceScenario = comp.length ? comp[Math.floor((comp.length-1)/2)] : null;
  const rows = [];
  if (fees && marketPriceScenario !== null) for (const quote of quotes) {
    if (quote.currency !== 'USD' || !Number.isFinite(quote.moq)) continue;
    const tier = quote.price_tiers?.filter(r => r.price !== null && r.currency === 'USD' && r.minimum_quantity <= quote.moq && (!r.maximum_quantity || r.maximum_quantity >= quote.moq)).sort((a,b)=>b.minimum_quantity-a.minimum_quantity)[0];
    const buy = tier?.price ?? quote.price_max;
    if (!Number.isFinite(buy) || !Number.isFinite(fees.fba_fee) || !Number.isFinite(fees.referral_fee)) continue;
    const perUnit = marketPriceScenario - fees.fba_fee - fees.referral_fee;
    const contribution = Math.round((perUnit-buy)*100)/100;
    const cheapest = Number.isFinite(quote.price_min) ? quote.price_min : buy;
    const cheapestTier = quote.price_tiers?.filter(r => r.price !== null && r.currency === 'USD').sort((a,b)=>a.price-b.price)[0];
    const contributionAtBulkTier = Math.round((perUnit-(cheapestTier?.price ?? cheapest))*100)/100;
    rows.push({ supplier_id: quote.id, supplier: quote.supplier_name, product: quote.title, source_url: quote.source_url, currency: 'USD', market_price_scenario: marketPriceScenario, supplier_unit_cost_at_moq: buy, fba_fee_estimate: fees.fba_fee, referral_fee_estimate: fees.referral_fee, pre_ads_per_unit: contribution, pre_ads_per_unit_low: Math.min(contribution, contributionAtBulkTier), pre_ads_per_unit_high: Math.max(contribution, contributionAtBulkTier), higher_tier_minimum_quantity: cheapestTier?.minimum_quantity ?? null, break_even_acos: contribution > 0 ? Math.round(contribution / marketPriceScenario * 10000) / 10000 : null, minimum_order_quantity: quote.moq, minimum_purchase_cash: Math.round(quote.moq*buy*100)/100, supplier_match_score: quote.supplier_match_score, evidence_ids: [quote.id, fees.id, ...competitors.filter(r=>r.currency==='USD'&&r.price===marketPriceScenario).map(r=>r.id).slice(0,2)], excluded: '未包含国际运费、关税、保险、头程、退货、优惠券、广告、仓储、税费、支付周期。FBA/Referral 为历史均值估算；售价采用相近 Amazon listing 观察价情景，不是用户定价。高档位利润需达到该阶梯 MOQ。供应商报价需核实材质、尺寸、包装数量、样品和贸易条款。' });
  }
  return { status: rows.length ? 'estimated' : 'incomplete', nature: 'estimate', rows, matched_supplier_quotes: quotes, excluded_quote_ids: records.filter(r=>r.evidence_kind==='supplier_quote'&&!quotes.some(q=>q.id===r.id)).map(r=>r.id), selling_price_basis: comp.length ? '同用途候选商品当前观察价中位数' : '没有可比商品价格', fee_basis: fees ? '第三方来源平台费用近年均值估算' : '缺平台费用估算', note: 'Agent 自动生成采购初筛情景，不是供应商正式报价或 Amazon 费用承诺；物流、广告与私人经营约束仍不可由商品页面推导。' };
}

export function businessEvidence(session) {
  const rows = session.evidence;
  const target = rows.filter(r => r.asin === session.targetAsin && !r.evidence_kind).sort((a, b) => String(b.observed_at).localeCompare(String(a.observed_at)))[0];
  const latest = new Map();
  for (const row of rows) if (!row.evidence_kind && row.asin !== session.targetAsin && (!latest.has(row.asin) || row.observed_at > latest.get(row.asin).observed_at)) latest.set(row.asin, row);
  const latestKind = kind => {
    const latestRows = new Map();
    for (const row of rows) if (row.evidence_kind === kind && row.asin === session.targetAsin) {
      const key = kind === 'keyword' ? String(row.keyword ?? '').trim().toLowerCase() : `${row.keyword ?? row.source_url}|${row.mode ?? ''}|${row.geo ?? ''}`;
      if (!latestRows.has(key) || String(row.retrieved_at ?? row.observed_at) > String(latestRows.get(key).retrieved_at ?? latestRows.get(key).observed_at)) latestRows.set(key, row);
    }
    return [...latestRows.values()];
  };
  const keywords = latestKind('keyword');
  const trends = latestKind('search_interest').map(row => ({ ...row, summary: summarizeInterest(row.points ?? []) }));
  const latestBatch = kind => { const matches = rows.filter(r => r.asin === session.targetAsin && r.evidence_kind === kind); const latestAt = matches.map(r => r.observed_at).sort().at(-1); return matches.filter(r => r.observed_at === latestAt); };
  const recalls = latestBatch('recall');
  const sales = new Map();
  for (const row of rows) if (row.evidence_kind === 'seller_sales' && row.asin === session.targetAsin) sales.set(`${row.period_start}|${row.period_end}`, row);
  return {
    keywords, reviewRecords: latestBatch('reviews'), marketOffers: latestBatch('market_offers'), categoryRankings: latestBatch('category_rankings'), suggestions: latestKind('keyword_suggestion'), trends, recalls, salesEstimates: latestBatch('sales_estimate'), salesHistory: latestBatch('market_sales_estimate'), keepaHistory: latestBatch('keepa_history'), dimensions: latestBatch('package_dimensions'), suppliers: latestBatch('supplier_quote').map(r => ({...r, product_match_score: titleMatch(target, r.title)})), fees: latestBatch('amazon_fee_estimate'), sellerSales: [...sales.values()].sort((a,b) => a.period_start.localeCompare(b.period_start)), official: [...recalls, ...latestBatch('official_check'), ...latestBatch('official_policy')],
    supplierScenario: supplierScenario(target, rows, target ? matchCompetitors(target, [...latest.values()]) : []), history: snapshotHistory(session), competitors: target ? matchCompetitors(target, [...latest.values()]) : [],
    coverage: { public_review_text: latestBatch('reviews').some(r => r.review_samples?.length), buy_box_offer_data: latestBatch('market_offers').some(r => r.offers?.length || r.buy_box?.price != null), category_rankings: latestBatch('category_rankings').some(r => r.ranked_products?.length), market_snapshot: Boolean(target), keyword_estimates: keywords.some(r => r.relevance !== "excluded"), search_interest_history: trends.some(r => r.points?.length > 1), estimated_sales_history: latestBatch('market_sales_estimate').some(r => r.history?.length), product_dimension_data: latestBatch('package_dimensions').length > 0, supplier_shortlist: latestBatch('supplier_quote').length > 0, observed_product_history: snapshotHistory(session).length > 1, target_orders: rows.some(r => r.evidence_kind === 'seller_sales' && r.asin === session.targetAsin), official_recall_check: rows.some(r => r.evidence_kind === 'official_check' && r.check_type === 'recall'), compliance_verified: false },
    note: '关键词量是供应商估算；Google Trends 是全网相对关注度；商品快照不是订单历史；召回未命中不代表合规。'
  };
}
