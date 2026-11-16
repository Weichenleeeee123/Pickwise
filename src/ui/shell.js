import { esc, MODE, CHOICE, RESEARCH, LEARNING, OUTCOME, fmtTime, modeOf, safeLink, windowText, statusTag } from './common.js';
import { renderMarkdown } from './md.js';
import { reportTerms } from './common.js';

export function renderEntry(config, error) {
  const off = config && !config.llm.configured && !config.preloadedDemo;
  return `<div class="entry-page"><div class="entry-art entry-art--coach" aria-hidden="true"><img src="/assets/brand/pickwise-icon.svg" alt="" width="128" height="128"></div><div class="eyebrow">Pickwise · Amazon US</div>
    <h1>选得聪明，不是选得快</h1>
    <p class="subhead">AI 选品教练，陪你分析真实商品，让你逐渐学会自己选品。</p>
    <${config?.preloadedDemo ? 'div' : 'form id="entry-form"'} class="product-entry"><label for="product">你正在考虑哪个商品？</label>
      <div class="product-entry-row"><input class="input" id="product" name="product" required maxlength="120" autocomplete="off" ${config?.preloadedDemo ? 'readonly' : ''} placeholder="${config?.preloadedDemo ? '演示使用预制案例，点击右侧开始体验' : '输入商品名称、ASIN 或 Amazon.com 链接'}" />${config?.preloadedDemo ? '' : `<button class="btn primary" type="submit" ${off ? 'disabled' : ''}>开始分析</button>`}</div>
    </${config?.preloadedDemo ? 'div' : 'form'}>
    ${off ? `<div class="callout" role="alert"><b>模型尚未配置，现在不能开始分析。</b>请复制 <code>.env.example</code> 为 <code>.env</code>，填写 <code>LLM_BASE_URL</code>、<code>LLM_API_KEY</code>、<code>LLM_MODEL</code> 后重启服务。密钥只保存在服务端。</div>` : ''}
    ${config?.llm?.configured && !config?.apify?.configured && !config?.dataForSeo?.configured ? `<div class="callout blue"><b>实时商品数据源尚未配置。</b>配置服务端 <code>APIFY_API_TOKEN</code> 后，输入 ASIN 或关键词即可自动获取 Amazon 商品证据；也可继续导入授权数据。</div>` : ''}
    ${error ? `<div class="callout" role="alert">${esc(error)}</div>` : ''}
  </div>`;
}

export function renderHeader(view) {
  const mode = modeOf(view);
  return `<div class="page-head"><div><div class="eyebrow">${view.demo ? '教学模拟案例' : 'Amazon 美国站 · 选品辅导'}</div><h1>${esc(view.product.name)}</h1>
    <p class="subhead">${esc(view.targetAsin ?? '待识别')} <span class="tag ${view.demo ? 'orange' : 'blue'}">${MODE[mode]}</span> <span class="tag gray">研究：${RESEARCH[view.research.status]}</span> <span class="tag gray">学习：${LEARNING[view.learning.state]}</span>${view.analysis ? ` <span class="tag gray">分析版本 ${view.analysis.version}</span>` : ''}</p></div></div>`;
}

export function renderRunBanner(view) {
  if (view.preloadedDemo && view.analysis?.stale) return '<div class="callout blue" role="status">本地试算已调整；拆解讲解与报告保留原案例结论，最新数字见“证据与测算”。</div>';
  if (view.research.status === 'resolving') return '<div class="callout blue" role="status"><b>等你确认商品。</b>这是分析里唯一需要你停下来的地方，其余步骤会自动继续。</div>';
  if (['failed', 'partial'].includes(view.research.status)) {
    return `<div class="callout" role="alert"><b>${view.research.status === 'partial' ? '部分完成' : '分析没有完成'}。</b>${esc(view.research.error?.message ?? '已保存已有成果。')}<div class="btn-row" style="margin-top:8px"><button class="btn primary" data-action="retry" ${view.running ? 'disabled' : ''}>重试未完成的步骤</button></div></div>`;
  }
  if (view.analysis?.result?.fallback) return '<div class="callout blue" role="status"><b>五维结论使用程序兜底。</b>模型总结未通过数字核验，因此结论只按现有证据与程序计算生成；证据不足的维度保持未判定。</div>';
  if (view.reanalysis.status === 'failed') return `<div class="callout" role="alert"><b>重新分析失败。</b>${esc(view.reanalysis.error?.message ?? '')}数字已按新条件重算，但文字解释仍是旧版本。<div class="btn-row" style="margin-top:8px"><button class="btn" data-action="reanalyze" ${view.running ? 'disabled' : ''}>重新分析</button></div></div>`;
  if (view.cardsStale && view.research.status === 'analysis_ready') return '<div class="callout blue" role="status">成本已调整：拆解卡片里引用的数字是第一次分析时的，最新数字见“证据与测算”，文字更新后见“分析报告”。</div>';
  return '';
}

function renderEvidenceDetails(record) {
  const imageLinks = (record.image_urls ?? []).slice(0, 8).map((url, index) => safeLink(url, `图片 ${index + 1}`)).filter(Boolean).join(' · ');
  const rows = [
    record.brand ? `品牌：${record.brand}` : null,
    record.category_path ? `类目：${record.category_path}` : null,
    record.original_asin && record.original_asin !== record.asin ? `抓取入口 ASIN：${record.original_asin}` : null,
    record.condition ? `商品状态：${record.condition}` : null,
    record.amazon_choice ? (record.amazon_choice_text ?? "Amazon's Choice") : null,
    record.bestseller_badge,
    record.price_range ? `变体售价范围：${record.price_range.currency ?? record.currency ?? 'USD'} ${record.price_range.min ?? '未提供'} 至 ${record.price_range.max ?? '未提供'}` : null,
    record.original_price !== null ? `划线价：${record.currency ?? 'USD'} ${record.original_price}` : null,
    record.discount_percentage !== null ? `折扣：${record.discount_percentage}%` : null,
    record.shipping_price !== null ? `配送费：${record.currency ?? 'USD'} ${record.shipping_price}` : null,
    record.in_stock !== null ? `库存状态：${record.stock_text ?? (record.in_stock ? '有货' : '无货')}` : null,
    record.seller_name ? `卖家：${record.seller_name}${record.seller_rating !== null ? `（评分 ${record.seller_rating}）` : ''}` : null,
    record.sold_by ? `销售方：${record.sold_by}` : null,
    record.ships_from ? `发货方：${record.ships_from}` : null,
    record.fulfillment ? `履约方式：${record.fulfillment}${record.is_fba ? '（FBA）' : ''}` : null,
    record.seller_id ? `卖家编号：${record.seller_id}` : null,
    record.offers_count !== null ? `报价总数：${record.offers_count}` : null,
    record.lowest_offer_price !== null ? `最低报价：${record.lowest_offer_currency ?? record.currency ?? 'USD'} ${record.lowest_offer_price}${record.lowest_offer_seller ? `（${record.lowest_offer_seller}）` : ''}` : null,
    record.offers?.length ? `卖家报价快照：${record.offers.map((offer) => `${offer.seller_name ?? '未知卖家'}${offer.seller_rating !== null && offer.seller_rating !== undefined ? `（卖家评分 ${offer.seller_rating}）` : ''}｜${offer.condition ?? '条件未提供'}｜商品 ${offer.price ?? '未知'} ${offer.currency ?? ''}｜配送 ${offer.shipping_price ?? '未提供'}${offer.delivery ? `｜送达 ${offer.delivery}` : ''}${offer.ships_from ? `｜发货地 ${offer.ships_from}` : ''}${offer.is_prime ? '｜Prime' : ''}`).join('；')}` : null,
    record.delivery_text ? `预计配送：${record.delivery_text}` : null,
    record.fastest_delivery_text ? `最快配送：${record.fastest_delivery_text}` : null,
    record.delivery_location ? `配送地区：${record.delivery_location}` : null,
    record.return_policy ? `退货政策：${record.return_policy}` : null,
    record.stock_left ? `库存提示：${record.stock_left}` : null,
    record.max_order_quantity !== null ? `单次限购：${record.max_order_quantity}` : null,
    record.bestseller_ranks?.length ? `BSR：${record.bestseller_ranks.map((rank) => `${rank.rank} / ${rank.category}`).join('；')}` : null,
    record.search_position !== null ? `搜索结果位置：第 ${record.search_page ?? 1} 页第 ${record.search_position} 位` : record.search_rank !== null ? `搜索结果位置：${record.search_rank}` : null,
    record.search_rank !== null && record.search_rank !== record.search_position ? `自然搜索位：${record.search_rank}` : null,
    record.is_sponsored !== null ? `广告结果：${record.is_sponsored ? '是' : '否'}` : null,
    record.search_total_results !== null ? `搜索结果总数：${record.search_total_results}` : null,
    record.search_badge,
    record.sales_signal_label,
    record.review_summary ? `AI 评论摘要：${record.review_summary}` : null,
    record.review_summary_aspects?.length ? `评论主题：${record.review_summary_aspects.map((item) => `${item.name}${item.sentiment ? `（${item.sentiment}）` : ''}`).join('；')}` : null,
    record.star_breakdown ? `星级分布：${Object.entries(record.star_breakdown).map(([star, share]) => `${star} ${share}`).join('；')}` : null,
    record.answered_questions !== null ? `Answered questions：${record.answered_questions}` : null,
    record.has_reviews === false ? '当前页面未显示评论' : null,
    record.reviews_url ? `评论页：${record.reviews_url}` : null,
    record.features?.length ? `商品要点：${record.features.join('；')}` : null,
    record.product_overview?.length ? `商品概览：${record.product_overview.map((item) => `${item.key}：${item.value}`).join('；')}` : null,
    record.product_attributes && Object.keys(record.product_attributes).length ? `商品属性：${Object.entries(record.product_attributes).slice(0, 15).map(([key, value]) => `${key}：${value}`).join('；')}` : null,
    [record.dimensions && `尺寸 ${record.dimensions}`, record.weight && `重量 ${record.weight}`, record.model_number && `型号 ${record.model_number}`, record.manufacturer && `制造商 ${record.manufacturer}`, record.gtin && `GTIN ${record.gtin}`, record.date_first_available && `首次上架 ${record.date_first_available}`].filter(Boolean).length ? `商品规格：${[record.dimensions && `尺寸 ${record.dimensions}`, record.weight && `重量 ${record.weight}`, record.model_number && `型号 ${record.model_number}`, record.manufacturer && `制造商 ${record.manufacturer}`, record.gtin && `GTIN ${record.gtin}`, record.date_first_available && `首次上架 ${record.date_first_available}`].filter(Boolean).join('；')}` : null,
    record.image_count !== null ? `图片 ${record.image_count} 张` : null,
    record.videos_count !== null ? `视频 ${record.videos_count} 个` : null,
    record.has_a_plus_content ? '有 A+ 页面内容' : null,
    record.has_brand_story ? '有品牌故事' : null,
    record.sustainability_features?.length ? `可持续属性：${record.sustainability_features.map((item) => `${item.key}：${item.value}`).join('；')}` : null,
    record.important_information ? `重要说明：${record.important_information}` : null,
    record.support ? `商品支持：${record.support}` : null,
    record.description ? `商品描述：${record.description}` : null,
    record.variant_details?.length ? `变体：${record.variant_details.slice(0, 8).map((variant) => `${variant.title || variant.asin}${variant.price !== null ? ` ${variant.price}` : ''}`).join('；')}` : null,
    record.review_samples?.length ? `评论样本：${record.review_samples.slice(0, 5).map((review) => `${review.rating ?? '未评分'} 星 ${review.title} ${review.text}`).join('；')}` : null,
    record.quality_issue ? `数据质量：${record.quality_issue}` : null
  ].filter(Boolean);
  return `<details><summary>来源与商品详情</summary><p>${esc(record.source_name)} · ${esc(record.observed_at)}</p>${rows.length ? `<ul>${rows.map((row) => `<li>${esc(row)}</li>`).join('')}</ul>` : ''}${imageLinks ? `<p>${imageLinks}</p>` : ''}${safeLink(record.source_url)}${record.seller_url ? ` · ${safeLink(record.seller_url, '打开卖家页')}` : ''}</details>`;
}

export function renderSidebar(view, draft, { section = 'all' } = {}) {
  const j = view.judgment;
  const intuition = j
    ? `<section class="side-card"><h4>你的初判</h4><p><b>${CHOICE[j.choice]}</b></p><p class="muted">${esc(j.reason || '（没有写理由）')}</p><p class="muted">${j.eligible ? '已保存，结果页会拿它和证据对照。' : '在结果展示之后保存，不用于对照。'}</p></section>`
    : `<section class="side-card"><h4>说说你的直觉</h4><p class="muted">可选。等分析的这几分钟里，先写下你现在怎么看，结果出来后会和证据对照。不填也不影响分析。</p>
      <div class="choices" role="radiogroup" aria-label="初判">${['worth', 'not_worth', 'unsure'].map((key) => `<label class="pill"><input type="radio" name="jc" value="${key}" ${draft.choice === key ? 'checked' : ''}/><span>${CHOICE[key]}</span></label>`).join('')}</div>
      <textarea id="jr" maxlength="300" placeholder="一句话理由（可选）">${esc(draft.reason ?? '')}</textarea><button class="btn" data-action="save-judgment">保存直觉</button>
      ${view.research.firstResultAt ? '<p class="muted">结果已经展示，现在保存的直觉不会用于对照。</p>' : ''}</section>`;
  const sourceStatus = view.dataSource?.status === 'failed' ? ` · 数据源失败：${esc(view.dataSource.error)}` : view.dataSource?.status === 'loaded' ? (Number.isFinite(view.dataSource.cost) ? ` · 本次数据成本 $${Number(view.dataSource.cost).toFixed(4)}` : ' · 费用见数据源账单') : view.dataSource?.status === 'cached' ? ' · 使用近期缓存' : '';
  const modeBlock = `<section class="side-card"><h4>数据与来源</h4><p>${MODE[modeOf(view)]}${view.evidence.length ? ` · ${view.evidence.length} 条` : ''}${sourceStatus}</p>${view.evidence.length ? `<ul class="sources">${view.evidence.slice(0, 12).map((r) => `<li><div class="src-head"><b>${esc(r.id)}</b><span>${esc(r.title)}</span></div><div class="src-meta">${r.price !== null ? `${esc(r.currency ?? 'USD')} $${esc(r.price)}` : '价格未知'}${r.rating !== null ? ` · ${esc(r.rating)} 星` : ''}${r.review_count !== null ? ` · ${esc(r.review_count)} 条评论` : ''}${r.bestseller_rank !== null ? ` · BSR ${esc(r.bestseller_rank)}` : ''}${r.search_rank !== null ? ` · 搜索位 ${esc(r.search_rank)}` : ''}${r.monthly_purchase_signal !== null ? ` · 页面近月购买信号 ${esc(r.monthly_purchase_signal)}` : ''}${r.quality_issue ? ` · <span class="warn">有异常</span>` : ''}</div>${renderEvidenceDetails(r)}</li>`).join('')}</ul>${view.evidence.length > 12 ? `<p class="muted">另有 ${view.evidence.length - 12} 条，见交付页的证据明细。</p>` : ''}` : '<p class="muted">还没有导入证据。需求与竞争会显示“证据不足”。</p>'}
    ${view.running ? '' : `<label class="upload" for="evidence-file"><span><strong>导入你有授权的数据</strong><small>CSV / JSON，≤5 MB、≤2000 条。必需：marketplace、asin、title、source_name、observed_at。</small></span><input id="evidence-file" type="file" accept=".csv,.json,application/json,text/csv" /></label>`}
    ${view.evidenceRejected.length ? `<p class="muted warn">${view.evidenceRejected.length} 条记录因字段不完整或市场不符被排除。</p>` : ''}
    <div id="import-feedback"></div>${view.evidenceStale ? `<div class="callout blue">导入了新证据。点“重新分析”会用新证据重跑拆解。<div class="btn-row" style="margin-top:6px"><button class="btn" data-action="rerun" ${view.running ? 'disabled' : ''}>用新证据重新分析</button></div></div>` : ''}</section>`;
  const issues = view.dataIssues.length ? `<section class="side-card"><h4>数据里发现的问题</h4><ul class="issues">${view.dataIssues.map((i) => `<li>${esc(i.text)}</li>`).join('')}</ul><p class="muted">这些问题决定了本次讲哪个教学节点。</p></section>` : '';
  const usage = view.usage;
  const run = `<section class="side-card"><h4>运行记录</h4><p class="muted">模型调用 ${usage.llmCalls} 次 · 工具 ${usage.toolCalls} 次 · 失败 ${usage.failures} 次<br/>输入 ${usage.inputTokens} / 输出 ${usage.outputTokens} tokens · 模型费用未核算</p></section>`;
  return section === 'judgment' ? intuition : section === 'evidence' ? `${modeBlock}${issues}${run}` : `${intuition}${modeBlock}${issues}${run}`;
}

export function renderDeliverables(view, tab, texts) {
  const labels = { analysis: '选品分析报告', learning: '个人学习记录', transfer: '迁移练习反馈' };
  const learning = view.learning;
  const regen = tab === 'learning' ? `<div class="btn-row">${learning.recordStatus === 'failed' ? `<div class="callout">${esc(learning.error?.message ?? '学习记录生成失败')}</div>` : ''}<button class="btn" data-action="gen-learning" ${view.running ? 'disabled' : ''}>${learning.record ? (learning.recordStale ? '更新学习记录（内容已过期）' : '重新生成学习记录') : '生成学习记录正文'}</button></div>` : '';
  return `<section class="panel" id="deliver"><div class="panel-head"><div><div class="panel-title">交付成果</div><div class="panel-hint">${esc(view.product.name)} · ${MODE[modeOf(view)]} · 分析版本 ${view.analysis?.version ?? '—'} · 学习结果：${OUTCOME[view.learning.outcome]}（学习状态与研究状态分开显示）</div></div><div class="btn-row"><button class="btn primary" data-action="download" data-kind="${tab}">下载 Markdown</button><button class="btn" data-action="print">打印</button></div></div>
    <div class="tabs">${Object.entries(labels).map(([key, label]) => `<button class="${tab === key ? 'active' : ''}" data-tab="${key}">${label}</button>`).join('')}</div>
    <div class="panel-body"><article class="report">${regen}${texts[tab] !== undefined ? renderMarkdown(texts[tab],{glossary:reportTerms(view.analysis?.result,view.analysis?.figures)}) : '<p class="muted">加载中…</p>'}</article></div></section>`;
}

export function renderTitleless() { return ''; }
export { statusTag, fmtTime };
