import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBackupKeywords,normalizePublicReviews,normalizeMarketOffers,normalizeCategoryRankings,rankingCategoryUrl} from '../server/market-expansion.js';
import {createResearchSources} from '../server/research-sources.js';
import {createSession} from '../server/session.js';
import {businessEvidence} from '../server/business-evidence.js';
import {marketBrief,researchCoverageBrief} from '../server/agent/tools.js';
import {renderExpandedEvidence} from '../src/ui/market-evidence.js';
import {expandedMarketMarkdown} from '../server/market-export.js';
const at='2026-11-16T01:00:00Z';
const category='https://www.amazon.com/gp/bestsellers/home-garden/123456';
const target={asin:'B012345678',title:'Kitchen storage rack',category_path:'Home & Kitchen > Kitchen Storage',bestseller_ranks:[{source_url:category}]};

test('backup keyword volume is an estimate and sponsored position is not organic rank',()=>{
 const rows=normalizeBackupKeywords([{asin:target.asin,keyword:'kitchen rack',found:true,searchVolume:1200,position:3,resultType:'sponsored',marketplace:'amazon.com',dataUpdatedAt:'2026-11-01'}],target,at);
 assert.equal(rows[0].organic_rank,null);assert.equal(rows[0].sponsored_rank,3);assert.equal(rows[0].nature,'estimate');assert.equal(rows[0].monthly_searches,1200);
 assert.equal(rows[0].upstream_independence,'unverified');
 assert.equal(normalizeBackupKeywords([{keyword:'x',searchVolume:10,marketplace:'UK'}],target,at).length,0);
});

test('public reviews preserve distinct text at the same product URL and reject other sites',()=>{
 const rows=normalizePublicReviews([
  {asin:target.asin,marketplace:'com',url:'https://www.amazon.com/dp/'+target.asin,title:'Good',text:'Public review one',rating:4,date:'2026-11-01',verifiedPurchase:true},
  {asin:target.asin,marketplace:'US',url:'https://www.amazon.com/dp/'+target.asin,title:'Bad',text:'Public review two',rating:2,date:'2026-11-02'},
  {asin:target.asin,marketplace:'UK',text:'Foreign review'},
  {asin:target.asin,marketplace:'US',url:'https://www.amazon.co.uk/review/R1',text:'Foreign URL'},
  {type:'product-summary',asin:target.asin,text:'This is only a generated summary'}
 ],target,at);
 assert.equal(rows[0].sample_count,2);assert.equal(rows[0].review_samples[0].verified_purchase,true);
 assert.notEqual(rows[0].review_samples[0].review_id,rows[0].review_samples[1].review_id);
 assert.equal(rows[0].review_samples[1].verified_purchase,null);
});

test('offer samples retain unknown shipping and fulfilment and separate new/used prices',()=>{
 const r=normalizeMarketOffers([{asin:target.asin,marketplace:'US',currency:'USD',offersTotal:20,offers:[
  {seller:'Seller A',price:20,condition:'New',buyBox:true,fulfilledByAmazon:true},
  {seller:'Seller A',price:10,condition:'Used - Good',fulfilledByAmazon:true},
  {sellerId:'B',price:22,condition:'New',isFBA:false,shipping:3},
  {sellerId:'C',price:23,condition:'New'}
 ]}],target,at)[0];
 assert.equal(r.observed_seller_count,3);assert.equal(r.declared_offer_count,20);assert.equal(r.observed_fbm_offers,1);assert.equal(r.unknown_fulfilment_offers,1);
 assert.equal(r.new_offer_price_low,20);assert.equal(r.new_offer_price_high,23);assert.equal(r.offers[0].shipping_price,null);assert.equal(r.offers[0].landed_price,null);assert.equal(r.offers[2].landed_price,25);
});

test('rank changes require an earlier observation of the same category and list',()=>{
 const raw=[{asin:'B000000001',name:'Kitchen Rack',position:2,listType:'bestsellers',categoryId:'123456',categoryUrl:category,marketplace:'amazon.com',price:20,currency:'USD'}];
 const first=normalizeCategoryRankings(raw,target,'2026-11-15',{categoryUrl:category})[0];
 assert.equal(first.ranked_products[0].rank_change,null);
 const next=normalizeCategoryRankings([{...raw[0],position:1}],target,at,{categoryUrl:category,cachedRecords:[first]})[0];
 assert.equal(next.ranked_products[0].rank_change,1);assert.equal(next.comparison_observed_at,'2026-11-15');
 const other=normalizeCategoryRankings([{...raw[0],listType:'new-releases'}],target,at,{categoryUrl:category,cachedRecords:[first]})[0];
 assert.equal(other.ranked_products[0].rank_change,null);
 assert.equal(rankingCategoryUrl({bestseller_ranks:[{source_url:'https://www.amazon.com.evil.test/gp/bestsellers/x/123'}]}),null);
});

test('four adapters flow through coverage, Agent material, UI and Markdown while login reviews stay off',async()=>{
 const calls=[];
 const provider=createResearchSources({token:'test',reviewsEnabled:false,noLoginReviewsEnabled:true,now:()=>new Date(at),fetchImpl:async(url,options={})=>{
  const u=String(url);if(options.body)calls.push({url:u,body:JSON.parse(options.body)});
  const json=value=>new Response(JSON.stringify(value));
  if(u.includes('plainrows~amazon-keyword'))return json([{found:false,notFoundReason:'free-plan-daily-quota'}]);
  if(u.includes('pravus~amazon-keywords'))return json([{asin:target.asin,keyword:'kitchen rack',found:true,searchVolume:1200,marketplace:'US',position:2,resultType:'organic'}]);
  if(u.includes('junglee~amazon-reviews-scraper'))return json([{productAsin:target.asin,countryCode:'US',reviewId:'R1',reviewDescription:'Public real-looking fixture text',reviewTitle:'Fits',ratingScore:4,isVerified:true,date:'2026-11-01',reviewUrl:'https://www.amazon.com/gp/customer-reviews/R1'}]);
  if(u.includes('cleanpull~amazon-product'))return json([{asin:target.asin,marketplace:'US',currency:'USD',offers:[{seller:'A',price:20,condition:'New',isFBA:true,buyBox:true}]}]);
  if(u.includes('topapi~amazon-bestsellers'))return json([{asin:'B000000001',name:'Rack',position:1,listType:'bestsellers',categoryId:'123456',categoryUrl:category,marketplace:'amazon.com',price:20,currency:'USD'}]);
  if(u.includes('apify.com')||u.includes('saferproducts'))return json([]);
  return new Response('<main>Official public product safety guidance and conditions.</main>');
 }});
 const result=await provider.fetchEvidence({target});
 assert.equal(result.sources.keywords.status,'quota_exceeded');assert.equal(result.sources.keywords_backup.status,'loaded');assert.equal(result.sources.reviews_public.status,'loaded');
 assert.equal(result.sources.reviews.status,'skipped');assert.equal(result.sources.market_offers.status,'loaded');assert.equal(result.sources.category_rankings.status,'loaded');
 assert.equal(calls.some(c=>c.url.includes('k-data-lab')),false);
 const s=createSession({input:target.asin,parsed:{asin:target.asin,productName:target.title,query:''}});
 s.evidence=[{...target,id:'E0',source_name:'Fixture',source_mode:'user_import',observed_at:at},...result.records.map((r,i)=>({...r,id:'E'+(i+1)}))];s.supplementalSources=result.sources;
 const b=businessEvidence(s),brief=marketBrief(s);
 assert.equal(b.coverage.public_review_text,true);assert.equal(b.coverage.buy_box_offer_data,true);assert.equal(b.coverage.category_rankings,true);
 assert.equal(brief.public_reviews[0].samples[0].text,'Public real-looking fixture text');assert.equal(brief.market_offers[0].offers.length,1);assert.equal(brief.category_rankings[0].ranked_products[0].rank,1);
 assert.equal(researchCoverageBrief(s).gaps.some(g=>g.topic==='reviews'),false);
 const html=renderExpandedEvidence({businessEvidence:b,supplementalSources:result.sources});
 assert.match(html,/Public real-looking fixture text/);assert.match(html,/Buy Box/);assert.match(html,/Movers/);assert.match(html,/本轮未返回/);
 const md=expandedMarketMarkdown(b,result.sources);assert.match(md,/Public real-looking fixture text/);assert.match(md,/bestsellers/);assert.match(md,/无历史对照/);
});

test('cross-site-only or empty review responses do not become loaded US review coverage',async()=>{
 const provider=createResearchSources({token:'test',reviewsEnabled:false,noLoginReviewsEnabled:true,fetchImpl:async(url)=>{
  const u=String(url);
  if(u.includes('jdtpnjtp')||u.includes('memo23'))return new Response(JSON.stringify([{asin:target.asin,marketplace:'UK',text:'Not an American site sample'}]));
  if(u.includes('cleanpull'))return new Response(JSON.stringify([{asin:target.asin,marketplace:'US',reviewsNeedSignIn:true}]));
  if(u.includes('apify.com')||u.includes('saferproducts'))return new Response('[]');
  return new Response('<main>Official public guidance for product safety conditions.</main>');
 }});
 const result=await provider.fetchEvidence({target});
 assert.equal(result.records.some(r=>r.evidence_kind==='reviews'),false);
 assert.equal(result.sources.reviews_public_featured.status,'needs_login');
});
test('verified Junglee response fields are parsed without retaining reviewer identifiers',()=>{
 const r=normalizePublicReviews([{productAsin:target.asin,productOriginalAsin:target.asin,variantAsin:target.asin,variant:'Size: 9',country:'United States',countryCode:'US',reviewDescription:'Observed review text',reviewTitle:'Title',ratingScore:3,isVerified:true,date:'2026-11-13',reviewUrl:'https://www.amazon.com/gp/customer-reviews/R1',userId:'private-test-id',userProfileLink:'https://example.com/profile'}],target,at)[0];
 assert.equal(r.sample_count,1);assert.equal(r.source_name,'Apify junglee/amazon-reviews-scraper');
 assert.equal(r.review_samples[0].text,'Observed review text');assert.equal(r.review_samples[0].rating,3);assert.equal(r.review_samples[0].verified_purchase,true);
 assert.equal(r.review_samples[0].variant,'Size: 9');assert.equal(JSON.stringify(r).includes('private-test-id'),false);assert.equal(JSON.stringify(r).includes('userProfileLink'),false);
 const foreign=normalizePublicReviews([{productAsin:target.asin,countryCode:'DE',reviewDescription:'Foreign-origin review',reviewUrl:'https://www.amazon.com/gp/customer-reviews/R2'}],target,at);
 assert.deepEqual(foreign,[]);
});

test('suppressed Buy Box does not inherit the ordinary product price',()=>{
 const r=normalizeMarketOffers([{asin:target.asin,marketplace:'US',currency:'USD',price:20,buyBoxSuppressed:true}],target,at)[0];
 assert.equal(r.buy_box.suppressed,true);assert.equal(r.buy_box.price,null);
 assert.deepEqual(normalizeMarketOffers([{asin:target.asin,marketplace:'US',localView:false,price:20,offers:[{price:20,condition:'New'}]}],target,at),[]);
});

test('empty no-login results are briefly cached to prevent repeat paid probes',async()=>{
 let reviewCalls=0;
 const provider=createResearchSources({token:'test',reviewsEnabled:false,noLoginReviewsEnabled:true,fetchImpl:async(url)=>{
  const u=String(url);if(u.includes('junglee~amazon-reviews')||u.includes('jdtpnjtp~amazon-reviews'))reviewCalls++;
  if(u.includes('apify.com')||u.includes('saferproducts'))return new Response('[]');
  return new Response('<main>Official public product safety guidance for businesses.</main>');
 }});
 await provider.fetchEvidence({target});const again=await provider.fetchEvidence({target});
 assert.equal(reviewCalls,2);assert.equal(again.sources.reviews_public.cached,true);
});
