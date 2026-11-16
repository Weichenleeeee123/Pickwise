const clip = (value, size=1000) => String(value ?? '').slice(0,size);
const num = value => {
  const n = value && typeof value === 'object' ? value.value ?? value.amount : value;
  return n !== null && n !== undefined && n !== '' && Number.isFinite(Number(n)) && Number(n) >= 0 ? Number(n) : null;
};
const date = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const link = value => { try { const u=new URL(value); return u.protocol==='https:' ? u.href : null; } catch { return null; } };
const us = value => !value || ['us','usa','united states','united states of america','com','amazon.com','www.amazon.com'].includes(String(value).trim().toLowerCase());
const bool = (...values) => values.find(value => typeof value === 'boolean') ?? null;
const base = (target,at,actor,title,sourceUrl) => ({asin:target.asin,title,marketplace:'Amazon US',source_mode:'live_api',observed_at:at,retrieved_at:at,provider_actor:actor,source_name:'Apify '+actor,source_url:sourceUrl ?? 'https://apify.com/'+actor});

export const EXPANSION_ACTORS = {
  keywordBackup:'pravus~amazon-keywords',
  reviewsPublic:'junglee~amazon-reviews-scraper',
  reviewsPublicBackup:'jdtpnjtp~amazon-reviews',
  marketOffers:'cleanpull~amazon-product-scraper',
  categoryRankings:'topapi~amazon-bestsellers-scraper'
};
export const LIST_TYPES=['bestsellers','new-releases','movers-and-shakers'];

export function normalizeBackupKeywords(items,target,at) {
  return (Array.isArray(items)?items:[]).filter(r=>r.found!==false && r.keyword && num(r.searchVolume)!==null && (!r.asin||r.asin===target.asin) && us(r.marketplace??r.market)).map(r=>({
    ...base(target,at,'pravus/amazon-keywords',clip(r.keyword,200)),
    evidence_kind:'keyword',nature:'estimate',keyword:clip(r.keyword,200),monthly_searches:num(r.searchVolume),
    organic_rank:r.resultType==='sponsored'?null:num(r.position??r.rank),
    sponsored_rank:r.resultType==='sponsored'?num(r.position):null,absolute_rank:num(r.absolutePosition),
    result_type:clip(r.resultType??'unknown',30),volume_updated_at:date(r.dataUpdatedAt??r.volumeUpdatedAt),
    rank_checked_at:date(r.rankCheckedAt??r.dataUpdatedAt),upstream_independence:'unverified',
    source_note:'备用 Actor 返回的月搜索量估算，不是销量。广告位与自然位分开；不同 Actor 不视为独立来源，不相加搜索量。'
  }));
}

export function normalizePublicReviews(items,target,at,{actor='junglee/amazon-reviews-scraper',sampleKind='public_sample'}={}) {
  const flattened=[];
  for(const product of Array.isArray(items)?items:[]) {
    if(product.localView===false)continue;
    const nested=product.featuredReviews??product.review_samples;
    if(Array.isArray(nested)) flattened.push(...nested.map(r=>({...r,asin:r.asin??product.asin,marketplace:r.marketplace??product.marketplace,productUrl:product.url,sample_kind:'featured'})));
    else flattened.push(product);
  }
  const seen=new Set(), samples=[];
  for(const r of flattened) {
    const body=r.text??r.body??r.reviewText??r.reviewBody??r.reviewDescription??r.content;
    if(typeof body!=='string'||!body.trim()||r.type==='product-summary')continue;
    const requestedAsin=r.inputAsin??r.requestedAsin??r.productOriginalAsin??r.productAsin??r.asin;
    if(requestedAsin&&requestedAsin!==target.asin)continue;
    if(!us(r.marketplace??r.domain??r.market)||r.countryCode&&!us(r.countryCode))continue;
    const url=link(r.url??r.reviewUrl??r.review_url??r.productUrl);
    if(url && !/(^|\.)amazon\.com$/.test(new URL(url).hostname))continue;
    const rating=num(r.rating??r.stars??r.reviewRating??r.ratingScore);
    const rawDate=r.date??r.reviewDate??r.reviewedAt??r.dateText;
    const reviewUrl=url&&(url.includes('customer-reviews')||url.includes('/review/'))?url:null;
    const id=clip(r.reviewId??r.review_id??r.id??reviewUrl??[r.title,body,rawDate].join('|'),250);
    if(seen.has(id))continue;seen.add(id);
    samples.push({review_id:id,title:clip(r.title??r.reviewTitle,180),text:clip(body.trim(),2200),
      rating:rating!==null&&rating<=5?rating:null,date:date(rawDate),date_raw:clip(rawDate,160),
      verified_purchase:bool(r.verifiedPurchase,r.isVerifiedPurchase,r.verified_purchase,r.verified,r.isVerified),
      variant_asin:r.variantAsin??r.variant_asin??null,variant:clip(r.variant??r.productVariant,180),
      source_url:url??'https://www.amazon.com/product-reviews/'+target.asin,
      marketplace:'US',marketplace_basis:r.marketplace||r.domain||url?'response':'strict_us_actor_request',
      reviewer_country:clip(r.country??r.countryName,100),sample_kind:r.sample_kind??sampleKind});
    if(samples.length>=20)break;
  }
  if(!samples.length)return [];
  return [{...base(target,at,actor,clip(target.title,220)+' 评论正文样本','https://www.amazon.com/product-reviews/'+target.asin),
    evidence_kind:'reviews',nature:'fact',review_samples:samples,sample_count:samples.length,
    requested_sort:'recent',sample_kind:sampleKind,
    source_note:'无需登录的美国站公开评论样本，保留日期、变体与来源。请求近期排序不代表完整近期历史；精选样本另行标注，不能推算差评率、退货率或代表全部买家。'}];
}

export function normalizeMarketOffers(items,target,at,{actor='cleanpull/amazon-product-scraper'}={}) {
  const r=(Array.isArray(items)?items:[]).find(r=>r.asin===target.asin&&r.localView!==false&&us(r.marketplace)&&(!r.currency||r.currency==='USD'));
  if(!r)return [];
  const offers=(Array.isArray(r.offers)?r.offers:[]).filter(o=>num(o.price)!==null&&(!o.currency||o.currency==='USD')).slice(0,10).map(o=>{
    const condition=clip(o.condition??o.conditionText,100),shipping=num(o.shipping??o.shippingPrice);
    return {seller_id:o.sellerId??o.seller_id??null,seller_name:clip(o.seller??o.sellerName??o.soldBy,200)||null,
      price:num(o.price),shipping_price:shipping,landed_price:shipping!==null?Math.round((num(o.price)+shipping)*100)/100:null,
      currency:'USD',condition,condition_group:/^new\b/i.test(condition)?'new':/^used\b/i.test(condition)?'used':'unknown',
      is_fba:bool(o.isFBA,o.isFba,o.fulfilledByAmazon),is_prime:bool(o.isPrime),is_amazon:bool(o.isAmazon,o.soldByAmazon),
      is_buy_box:bool(o.buyBox,o.isBuyBox),stock:num(o.stock),seller_rating:num(o.sellerRating),
      observed_at:date(o.lastSeenAt??o.observedAt)??at,delivery:clip(o.delivery,250)};
  });
  const buy=offers.find(o=>o.is_buy_box===true);
  const buyBox={seller_id:buy?.seller_id??r.buyBoxSellerId??null,seller_name:buy?.seller_name??r.buyBoxSeller??null,
    price:r.buyBoxSuppressed===true?null:buy?.price??num(r.buyBoxPrice??(r.buyBoxSeller||r.buyBoxSellerId?r.price:null)),currency:'USD',
    is_fba:buy?.is_fba??bool(r.buyBoxIsFBA),is_amazon:buy?.is_amazon??bool(r.buyBoxIsAmazon),
    is_prime:buy?.is_prime??bool(r.buyBoxIsPrime),suppressed:bool(r.buyBoxSuppressed)};
  if(!offers.length&&buyBox.price===null&&buyBox.suppressed!==true)return [];
  const sellers=new Set(offers.map(o=>o.seller_id??o.seller_name).filter(Boolean));
  return [{...base(target,at,actor,clip(target.title,220)+' Buy Box 与报价','https://www.amazon.com/dp/'+target.asin),
    evidence_kind:'market_offers',nature:'fact',currency:'USD',buy_box:buyBox,offers,
    returned_offer_count:offers.length,observed_seller_count:sellers.size,
    declared_offer_count:num(r.offersTotal??r.offerCount??r.numberOfOffers),
    observed_fba_offers:offers.filter(o=>o.is_fba===true).length,
    observed_fbm_offers:offers.filter(o=>o.is_fba===false).length,
    unknown_fulfilment_offers:offers.filter(o=>o.is_fba===null).length,
    new_offer_price_low:offers.filter(o=>o.condition_group==='new').length?Math.min(...offers.filter(o=>o.condition_group==='new').map(o=>o.price)):null,
    new_offer_price_high:offers.filter(o=>o.condition_group==='new').length?Math.max(...offers.filter(o=>o.condition_group==='new').map(o=>o.price)):null,
    source_note:'美国站报价快照，最多保留十条。已观察卖家数不等于市场全部卖家；新品与二手分开，运费未知不补零；Buy Box 与履约会变化，不代表品牌授权或新卖家可获得的报价。'}];
}

export function rankingCategoryUrl(target) {
  const ranks=target.bestseller_ranks??[];
  for(const rank of [...ranks].reverse()) {
    const url=link(rank.source_url??rank.url);if(!url)continue;
    const u=new URL(url);
    if(u.hostname==='www.amazon.com'&&/\/(?:gp\/bestsellers|zgbs)\/[^/]+\/\d+/.test(u.pathname)) {
      u.search='';u.hash='';u.pathname=u.pathname.replace(/\/ref=.*$/,'');return u.href;
    }
  }
  return null;
}

export function normalizeCategoryRankings(items,target,at,{categoryUrl=rankingCategoryUrl(target),cachedRecords=[]}={}) {
  if(!categoryUrl)return [];
  const groups=new Map();
  for(const r of Array.isArray(items)?items:[]) {
    const listType=r.listType??r.list_type;
    if(!LIST_TYPES.includes(listType)||!us(r.marketplace)||!r.asin||!num(r.position??r.rank))continue;
    const category=r.categoryUrl??categoryUrl;
    const key=listType+'|'+String(r.categoryId??category);
    const group=groups.get(key)??{listType,category,id:String(r.categoryId??''),name:r.categoryFullName??r.categoryName??'',rows:[]};
    group.rows.push(r);groups.set(key,group);
  }
  return [...groups.values()].map(g=>{
    const previous=cachedRecords.filter(r=>r.evidence_kind==='category_rankings'&&r.asin===target.asin&&r.list_type===g.listType&&
      String(r.category_id??'')===g.id&&(g.id||r.category_url===g.category)&&Date.parse(r.observed_at)<Date.parse(at)).sort((a,b)=>String(b.observed_at).localeCompare(String(a.observed_at)))[0];
    const oldRanks=new Map((previous?.ranked_products??[]).map(r=>[r.listed_asin,r.rank]));
    const products=[...new Map(g.rows.map(r=>[r.asin,r])).values()].slice(0,10).map(r=>{
      const rank=num(r.position??r.rank),before=oldRanks.get(r.asin)??null;
      return {listed_asin:r.asin,title:clip(r.name??r.title,300),rank,price:num(r.price),currency:r.currency==='USD'?'USD':null,
        rating:num(r.stars??r.rating),review_count:num(r.reviewsCount??r.reviewCount),source_url:link(r.url),
        previous_rank:before,rank_change:before===null?null:before-rank,
        movement_basis:before===null?'no_previous_observation':'local_previous_observation'};
    });
    const sourceUrl=g.listType==='bestsellers'?categoryUrl:categoryUrl.replace('/gp/bestsellers/','/gp/'+g.listType+'/').replace('/zgbs/','/gp/'+g.listType+'/');
    return {...base(target,at,'topapi/amazon-bestsellers-scraper',clip(g.name,200)+' '+g.listType,sourceUrl),
      evidence_kind:'category_rankings',nature:'fact',list_type:g.listType,category_id:g.id,category_name:clip(g.name,240),
      category_url:link(g.category)??categoryUrl,ranked_products:products,comparison_observed_at:previous?.observed_at??null,
      source_note:'美国站同类目榜单快照，不是销量、搜索量或商品可比性结论。涨跌仅比较本系统真实采样；首次没有历史则不显示涨跌，未上榜不能推断排名。'};
  });
}
// List positions discover candidates, never sales, product BSR or verified specs.
// Keep the list source and observation date when projecting its actual fields.
export function rankingCandidateEvidence(records, targetAsin) {
  const snapshots = new Map();
  for (const r of records.filter(r => !r.evidence_kind)) {
    const current = snapshots.get(r.asin);
    if (!current || String(r.observed_at) > String(current.observed_at)) snapshots.set(r.asin, r);
  }
  const seen = new Set();
  seen.add(targetAsin);
  const candidates = [];
  for (const list of records.filter(r => r.evidence_kind === 'category_rankings' && r.asin === targetAsin).sort((a, b) => String(b.observed_at).localeCompare(String(a.observed_at)))) {
    for (const p of list.ranked_products ?? []) {
      const previous = snapshots.get(p.listed_asin);
      if (seen.has(p.listed_asin) || (previous && (!previous.discovery_list_type || String(previous.observed_at) >= String(list.observed_at))) || !/^[A-Z0-9]{10}$/.test(p.listed_asin ?? '') || !p.title || p.currency !== 'USD' || !Number.isFinite(p.price) || p.price <= 0) continue;
      seen.add(p.listed_asin);
      candidates.push({ asin: p.listed_asin, title: p.title, marketplace: 'Amazon US', currency: 'USD', price: p.price, rating: p.rating ?? null, review_count: p.review_count ?? null, parent_asin: null, rank: null, product_attributes: {}, estimated_monthly_sales: null, source_name: list.source_name, source_url: p.source_url || list.source_url, source_mode: list.source_mode, observed_at: list.observed_at, nature: 'fact', discovery_list_type: list.list_type, discovery_rank: p.rank, source_note: '从目标细分类目榜单发现的候选快照；只保留来源返回的价格和评分。未取得父体、材质、尺寸和销量，榜单位置不作为商品 BSR 或销量。' });
      if (candidates.length >= 12) return candidates;
    }
  }
  return candidates;
}
