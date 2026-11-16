import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSidebar } from '../src/ui/shell.js';
import { performCoachAction, renderCoach, renderDimensions, renderNextSteps } from '../src/ui/results.js';
import { renderTimeline } from '../src/ui/steps.js';
import { renderAnalysisTeam, teamDiscussionState, teamSpriteState } from '../src/ui/team.js';

test('computer office keeps names and status outside the shared world', () => {
  const html = renderAnalysisTeam({ teamAssetsAvailable: true, running: true, steps: [{id: 'summary', status:'running'}] });
  assert.match(html, /office-world/);
  assert.match(html, /office-people/);
  assert.match(html, /office-empty-seats/);
  assert.doesNotMatch(html, /office-desk|roundtable.webp/);
  assert.equal((html.match(/class="office-role-item"/g) ?? []).length, 6);
  assert.equal(teamDiscussionState({running:false,steps:[{id:'summary',status:'done'}]}), 'review');
  assert.equal(teamDiscussionState({running:true,steps:[{id:'summary',status:'running'}]}), 'discussion');
});

test('unavailable scene assets show local fallback without broken image URLs', () => {
  const html = renderAnalysisTeam({teamAssetsAvailable:false,steps:[],events:[]});
  assert.doesNotMatch(html, /<image /);
  assert.match(html, /office-scenery/);
});

test('preview playback is explicitly local and includes pause replay and seeking', () => {
  const html = renderAnalysisTeam(null,{playback:{elapsed:10000,paused:false,speed:1}});
  assert.match(html,/本地模拟/);
  assert.match(html,/data-action="office-pause"/);
  assert.match(html,/data-action="office-replay"/);
  assert.match(html,/data-sim-seek/);
});

test('analysis team uses real step states and server events without inventing progress', () => {
  const html = renderAnalysisTeam({
    running: true,
    steps: [
      { id: 'identify', status: 'done' },
      { id: 'demand', status: 'running', activity: '读取销量证据' },
      { id: 'competition', status: 'pending' },
      { id: 'profit', status: 'pending' },
      { id: 'risk', status: 'pending' },
      { id: 'summary', status: 'pending' }
    ],
    events: [
      { seq: 4, ts: '2026-11-15T02:00:00.000Z', type: 'tool', step: 'demand', label: '读取趋势数据', name: 'keyword_trend', ok: true, ms: 320 },
      { seq: 3, ts: '2026-11-15T01:59:00.000Z', type: 'step_start', step: 'demand', label: '需求证据' }
    ]
  });

  assert.match(html, /analysis-team/);
  assert.match(html, /需求研究/);
  assert.match(html, /分析中/);
  assert.match(html, /读取趋势数据/);
  assert.match(html, /keyword_trend/);
  assert.match(html, /完成/);
  assert.match(html, /待命/);
  assert.doesNotMatch(html, /%|width:\\s*\\d/);
});

test('analysis team safely displays optional specialist messages and tolerates missing events', () => {
  const html = renderAnalysisTeam({
    running: false,
    steps: [{ id: 'risk', status: 'failed' }],
    events: [
      { seq: 9, type: 'step_done', step: 'risk', status: 'failed' },
      { seq: 8, type: 'agent_start', step: 'risk', agent_id: 'risk_review_specialist', agent_role: '风险核验', responsibility: '整理待核实事项', message: '<script>alert(1)</script>', status: 'running' }
    ]
  });

  assert.match(html, /风险核验/);
  assert.match(html, /office-role-list/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotThrow(() => renderAnalysisTeam({ steps: [], events: null }));
});

test('teaching timeline states evidence boundaries and final report exposes term help and evidence coach', () => {
  const view = {
    steps: [{ id: 'identify', status: 'done', card: { why: '确认商品', found: [], how_to_read: '候选需进一步核对', scope: { can_show: '输入能匹配到 ASIN。', cannot_show: '这不证明规格与实物一致。' }, misread: { mistake: '把标题相近当成同款', verify: '查规格' } } }],
    teaching: { templates: {}, reasons: {}, lessons: {}, deferred: [] }, identity: {}, running: false,
    analysis: { version: 1, createdAt: '2026-11-15', stale: false, result: { verdict: { bucket: 'need_more' }, dimensions: [{ key: 'demand', signal: 'neutral', judgment: 'BSR 可以说明观察到的类目位置。', basis: [], annotations: [] }], glossary: [{ key: 'bsr', explanation: 'BSR 是商品在类目中的销售排名，排名变化不能直接换算为订单。' }], assumptions: [], next_steps: [] }, figures: [] },
    dimensions: [{ key: 'demand', name: '需求', ask: '看需求' }], buckets: { need_more: '补资料后再判断' }, coach: [], viz: { demand: null, profit: null }
  };
  const timeline = renderTimeline(view, new Set(['identify']));
  assert.match(timeline, /输入能匹配到 ASIN。/);
  assert.match(timeline, /这不证明规格与实物一致。/);
  assert.doesNotMatch(renderDimensions(view), /本次报告术语|更多常见术语/);
  assert.match(renderDimensions(view), /BSR 是商品在类目中的销售排名，排名变化不能直接换算为订单。/);
  assert.match(renderDimensions(view), /<abbr class="term-help" tabindex="0" role="button" aria-expanded="false" title="BSR 是商品在类目中的销售排名，排名变化不能直接换算为订单。">BSR<\/abbr>/);
  assert.match(renderCoach(view), /coach-use-selection/);
  assert.match(renderCoach(view), /纸箱小教练/);
  assert.match(renderCoach(view), /coach-question/);
  assert.match(renderCoach(view), /coach-panel/);
  assert.doesNotMatch(renderDimensions(view), /<details class="term-help">/);
  const selectedField = { value: '', focus() { this.focused = true; } };
  assert.equal(performCoachAction('coach-quote', { getSelection: () => '引用文本', getField: () => selectedField, toast() {}, submit() {} }), true);
  assert.equal(selectedField.value, '引用文本');
  assert.equal(selectedField.focused, true);
  let submitted;
  performCoachAction('coach-ask', { getSelection: () => '', getField: (id) => ({ value: id === 'coach-selection' ? '引用文本' : '解释一下' }), toast() {}, submit: (...args) => { submitted = args; } });
  assert.deepEqual(submitted, ['引用文本', '解释一下']);
});

test('shows the seller, delivery, and fulfillment details returned for an Apify offer', () => {
  const record = {
    id: 'E1', asin: 'B012345678', title: 'Label Printer', source_name: 'Apify', observed_at: '2026-11-15T00:00:00.000Z',
    source_mode: 'live_api', price: 29.99, currency: 'USD', rating: 4.4, review_count: 120, bestseller_rank: null,
    search_rank: 2, search_position: 3, search_page: 1, is_sponsored: false, search_total_results: 1000,
    monthly_purchase_signal: null, quality_issue: null,
    original_price: null, price_range: { min: 24.99, max: 39.99, currency: 'USD' }, discount_percentage: null, shipping_price: null, in_stock: null, seller_name: null,
    seller_rating: null, seller_id: null, offers_count: 1, delivery_text: null, fastest_delivery_text: null,
    delivery_location: null, return_policy: null, bestseller_ranks: [], sales_signal_label: null, review_summary: null,
    review_summary_aspects: [], star_breakdown: null, features: [], product_attributes: {}, description: null,
    amazon_choice: true, amazon_choice_text: 'Amazon\'s Choice', bestseller_badge: '#1 Best Seller',
    answered_questions: 18, has_reviews: true, reviews_url: 'https://www.amazon.com/product-reviews/B012345678',
    stock_left: 'Only 4 left', max_order_quantity: 5, lowest_offer_price: 27.99, lowest_offer_currency: 'USD',
    lowest_offer_seller: 'Lowest Seller', featured_offer_condition: 'New', sold_by: 'Amazon.com', ships_from: 'Amazon.com',
    fulfillment: 'AMAZON', is_amazon_seller: true, is_fba: false,
    product_overview: [{ key: 'Print technology', value: 'Thermal' }], dimensions: '5 x 4 x 2 inches', weight: '1.2 pounds',
    model_number: 'LP-100', manufacturer: 'Acme', gtin: '123456789012', date_first_available: '2024-01-02',
    support: null, important_information: null, sustainability_features: [], image_count: 6, image_urls: ['https://images.example.com/label-printer.jpg'], videos_count: 2,
    has_a_plus_content: true, has_brand_story: true,
    variant_details: [], review_samples: [], quality_issue: null,
    offers: [{
      seller_name: 'Marketplace Seller', seller_rating: 98, condition: 'New', price: 31, currency: 'USD',
      shipping_price: 2, delivery: 'Wednesday, Nov 18', ships_from: 'United States', is_prime: true
    }]
  };
  const html = renderSidebar({
    judgment: null, evidence: [record], dataSource: null, research: {}, running: true, dataIssues: [],
    evidenceRejected: [], usage: { llmCalls: 0, toolCalls: 0, failures: 0, inputTokens: 0, outputTokens: 0 }, evidenceStale: false
  }, { choice: null, reason: '' });

  assert.match(html, /Marketplace Seller/);
  assert.match(html, /卖家评分 98/);
  assert.match(html, /Wednesday, Nov 18/);
  assert.match(html, /United States/);
  assert.match(html, /Prime/);
  assert.match(html, /Amazon&#39;s Choice/);
  assert.match(html, /#1 Best Seller/);
  assert.match(html, /自然搜索位：2/);
  assert.match(html, /广告结果：否/);
  assert.match(html, /Answered questions：18/);
  assert.match(html, /最低报价：USD 27.99/);
  assert.match(html, /变体售价范围：USD 24.99 至 39.99/);
  assert.match(html, /Thermal/);
  assert.match(html, /图片 6 张/);
  assert.match(html, /图片 1/);
  assert.match(html, /images.example.com\/label-printer.jpg/);
});
