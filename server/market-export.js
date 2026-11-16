export function expandedMarketMarkdown(b,sources={}) {
  const out=['## 评论、报价与类目榜单',''];
  out.push('### 美国站公开评论正文','评论是样本，不是总体差评率或退货率。');
  const reviews=b.reviewRecords??[];
  if(!reviews.length)out.push(sources.reviews_public_featured?.message??sources.reviews_public?.message??'本次没有取得公开评论正文。');
  for(const r of reviews){
    out.push('- '+r.id+'｜'+r.source_name+'｜'+r.observed_at+'｜'+r.source_url);
    for(const s of r.review_samples??[])out.push('- '+(s.title||'评论')+'｜'+(s.rating??'未知')+' 星｜'+(s.date??s.date_raw??'日期未知')+'｜美国站｜验证购买 '+(s.verified_purchase===null?'未知':s.verified_purchase)+'｜'+s.sample_kind+'｜变体 '+(s.variant??'未提供')+' / '+(s.variant_asin??'ASIN未提供')+'｜评论地区 '+(s.reviewer_country||'未知')+'｜'+s.source_url,'  '+s.text);
  }
  out.push('','### Buy Box 与报价快照');
  for(const r of b.marketOffers??[]){
    out.push('- '+r.id+'｜'+r.source_name+'｜'+r.observed_at+'｜'+r.source_url,
      '- Buy Box：'+(r.buy_box?.seller_name??r.buy_box?.seller_id??'卖家未知')+'｜USD '+(r.buy_box?.price??'未知'),
      '- 返回报价 '+r.returned_offer_count+'；观察卖家 '+r.observed_seller_count+'；来源声明总报价 '+(r.declared_offer_count??'未知')+'。');
    for(const o of r.offers??[])out.push('- '+(o.seller_name??o.seller_id??'未知卖家')+'｜'+(o.condition||'条件未知')+'｜USD '+o.price+'｜运费 '+(o.shipping_price??'未知')+'｜FBA '+(o.is_fba===null?'未知':o.is_fba)+'｜Prime '+(o.is_prime===null?'未知':o.is_prime)+'｜观察 '+o.observed_at);
    out.push(r.source_note);
  }
  if(!(b.marketOffers??[]).length)out.push(sources.market_offers?.message??'未取得有效报价。');
  out.push('','### 同类目榜单（不是销量）');
  for(const type of ['bestsellers','new-releases','movers-and-shakers']){
    out.push('#### '+type);
    const lists=(b.categoryRankings??[]).filter(r=>r.list_type===type);
    if(!lists.length)out.push('本轮未返回，不补造排名或涨跌。');
    for(const r of lists){
      out.push('- '+r.id+'｜'+r.category_name+'｜'+r.observed_at+'｜'+r.source_url,'- 对照采样：'+(r.comparison_observed_at??'无，首次不推算涨跌'));
      for(const p of r.ranked_products??[])out.push('- '+p.rank+'｜'+p.listed_asin+'｜'+p.title+'｜USD '+(p.price??'未知')+'｜排名变化 '+(p.rank_change??'无历史对照')+'｜'+(p.source_url??''));
    }
  }
  return out.join(String.fromCharCode(10));
}
