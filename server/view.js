import { completeReport } from './report.js';
import { TRANSFER_CASES } from './demo.js';
import { allDiagnosis, buildFigures, computeEconomics, computeFunding, demandViz, effectiveConstraints, missingLabels, profitViz, targetDiagnosis } from './calc.js';
import { describeIssues } from '../src/diagnosis.js';
import { constraintsHash } from './agent/pipeline.js';
import { publicTransferCase } from './agent/coaching.js';
import { DIMENSIONS, BUCKETS, NODE_TEMPLATES } from './agent/templates.js';
import { latestAnalysis, learningOutcome, learningState } from './session.js';
import { businessEvidence } from './business-evidence.js';
import { computeScenarios } from './calc.js';

export function summaryOf(session, running) {
  return {
    id: session.id, createdAt: session.createdAt, name: session.product.name, asin: session.targetAsin, demo: session.demo,
    research: session.research.status, learning: learningState(session), running, evidenceCount: session.evidence.length
  };
}

// 浏览器拿到的视图：数字全部由服务端程序计算，浏览器只负责展示。
export function buildView(session, { after = 0, running = false, llmConfigured = true } = {}) {
  const analysis = latestAnalysis(session);
  const econ = computeEconomics(session);
  const funding = computeFunding(session);
  const eff = effectiveConstraints(session);
  const target = targetDiagnosis(session);
  const all = allDiagnosis(session);
  const stale = Boolean(analysis) && analysis.constraintsHash !== constraintsHash(session);
  let cardsStale = false;
  if (session.research.constraintsHash) {
    try { const previous = JSON.parse(session.research.constraintsHash); const current = JSON.parse(constraintsHash(session)); previous.pop(); current.pop(); cardsStale = JSON.stringify(previous) !== JSON.stringify(current); }
    catch { cardsStale = true; }
  }
  const transferData = session.transfer ? TRANSFER_CASES.find((item) => item.id === session.transfer.caseId) : null;
  return {
    id: session.id, createdAt: session.createdAt, updatedAt: session.updatedAt, input: session.input, demo: session.demo, market: session.market,
    product: session.product, targetAsin: session.targetAsin,
    research: session.research, resultViewedAt: session.resultViewedAt, running, llmConfigured, dataSource: session.dataSource ?? null,
    reanalysis: session.reanalysis ?? { status: 'idle' },
    businessEvidence: businessEvidence(session), supplementalSources: session.supplementalSources ?? {}, monitoring: session.monitoring ?? null, scenarios: computeScenarios(session), operatingImports: session.operatingImports ?? [],
    identity: session.identity,
    steps: session.steps,
    events: session.events.filter((event) => event.seq > after).map(({ seq, ts, type, step, label, name, ok, ms, status, problems, agent_id, agent_role, responsibility, message }) => ({ seq, ts, type, step, label, name, ok, ms, status, problems, agent_id, agent_role, responsibility, message })),
    seq: session.seq,
    evidence: session.evidence.map((record) => ({
      id: record.id, asin: record.asin, parent_asin: record.parent_asin ?? null, title: record.title,
      brand: record.brand ?? null, category_path: record.category_path ?? null,
      source_name: record.source_name, source_url: record.source_url ?? '', observed_at: record.observed_at, source_mode: record.source_mode,
      sales_scope: record.sales_scope ?? null, period_start: record.period_start ?? null, period_end: record.period_end ?? null,
      estimated_monthly_sales: record.estimated_monthly_sales ?? null, monthly_purchase_signal: record.monthly_purchase_signal ?? null,
      monthly_purchase_min: record.monthly_purchase_min ?? null,
      sales_signal_label: record.sales_signal_label ?? null, review_samples: record.review_samples ?? [], review_sample_count: record.review_sample_count ?? 0,
      review_summary: record.review_summary ?? null, review_summary_aspects: record.review_summary_aspects ?? [], has_reviews: record.has_reviews ?? null,
      reviews_url: record.reviews_url ?? null, answered_questions: record.answered_questions ?? null, star_breakdown: record.star_breakdown ?? null,
      amazon_choice: record.amazon_choice ?? null, amazon_choice_text: record.amazon_choice_text ?? null, bestseller_badge: record.bestseller_badge ?? null,
      original_price: record.original_price ?? null, price_range: record.price_range ?? null, discount_percentage: record.discount_percentage ?? null, shipping_price: record.shipping_price ?? null,
      seller_name: record.seller_name ?? null, seller_id: record.seller_id ?? null, seller_url: record.seller_url ?? null, seller_rating: record.seller_rating ?? null,
      offers_count: record.offers_count ?? null, lowest_offer_price: record.lowest_offer_price ?? null, lowest_offer_currency: record.lowest_offer_currency ?? null,
      lowest_offer_seller: record.lowest_offer_seller ?? null, featured_offer_condition: record.featured_offer_condition ?? null,
      sold_by: record.sold_by ?? null, ships_from: record.ships_from ?? null, fulfillment: record.fulfillment ?? null,
      is_amazon_seller: record.is_amazon_seller ?? null, is_fba: record.is_fba ?? null, offers: record.offers ?? [], delivery_text: record.delivery_text ?? null, fastest_delivery_text: record.fastest_delivery_text ?? null,
      delivery_location: record.delivery_location ?? null, return_policy: record.return_policy ?? null, thumbnail_url: record.thumbnail_url ?? null,
      stock_left: record.stock_left ?? null, max_order_quantity: record.max_order_quantity ?? null,
      description: record.description ?? null, product_overview: record.product_overview ?? [], product_attributes: record.product_attributes ?? {}, features: record.features ?? [], variant_details: record.variant_details ?? [],
      dimensions: record.dimensions ?? null, weight: record.weight ?? null, model_number: record.model_number ?? null, manufacturer: record.manufacturer ?? null,
      gtin: record.gtin ?? null, date_first_available: record.date_first_available ?? null, support: record.support ?? null,
      important_information: record.important_information ?? null, sustainability_features: record.sustainability_features ?? [],
      image_count: record.image_count ?? null, image_urls: (record.image_urls ?? []).slice(0, 8), videos_count: record.videos_count ?? null, has_a_plus_content: record.has_a_plus_content ?? null, has_brand_story: record.has_brand_story ?? null,
      bestseller_rank: record.rank ?? null, bestseller_ranks: record.bestseller_ranks ?? [], search_rank: record.search_rank ?? null,
      search_position: record.search_position ?? null, search_page: record.search_page ?? null, is_sponsored: record.is_sponsored ?? null,
      search_total_results: record.search_total_results ?? null, search_badge: record.search_badge ?? null, in_stock: record.in_stock ?? null,
      rating: record.rating ?? null, review_count: record.review_count ?? null, competitor_avg_position: record.competitor_avg_position ?? null,
      competitor_keyword_intersections: record.competitor_keyword_intersections ?? null, price: record.price ?? null, currency: record.currency ?? null,
      quality_issue: record._qualityIssue ?? null
    })),
    evidenceRejected: session.evidenceRejected,
    importLog: session.importLog,
    dataIssues: describeIssues({ ...all, noSales: target.noSales, singlePeriodOnly: target.singlePeriodOnly }),
    evidenceStale: session.research.evidenceCount !== undefined && session.research.evidenceCount !== session.evidence.length && ['analysis_ready', 'partial'].includes(session.research.status),
    constraints: { currency: eff.currency, values: session.constraints.values, effective: eff.values, sources: eff.sources, marketPrice: eff.marketPrice, launch: eff.launch, inputSources: session.constraints.inputSources ?? {}, budget: session.constraints.budget, moq: session.constraints.moq, goodsCostCurrency: session.constraints.goodsCostCurrency ?? 'USD', fx: session.constraints.fx ?? null, fxNote: eff.fxNote, fxMissing: eff.fxMissing },
    econ: { ...econ, eff: undefined, missingLabels: missingLabels(econ) },
    funding,
    figures: buildFigures(session),
    viz: { profit: profitViz(session), demand: demandViz(session) },
    teaching: { ...session.teaching, templates: Object.fromEntries(Object.entries(NODE_TEMPLATES).map(([id, t]) => [id, { title: t.title, goal: t.goal, rule: t.rule, misread: t.misread, verify: t.verify }])) },
    practice: Object.fromEntries(Object.entries(session.practice).map(([id, record]) => [id, { ...record, stale: Boolean(record.hash) && record.hash !== constraintsHash(session) && record.status === 'ready' }])),
    coach: (session.coach ?? []).map(({ selectedText, question, answer, at, analysisVersion }) => ({ selectedText, question, answer, at, analysisVersion })),
    cardsStale,
    judgment: session.judgment,
    analysis: analysis ? { version: analysis.version, createdAt: analysis.createdAt, reason: analysis.reason, figures: analysis.figures, result: analysis.result.report?.detailVersion || stale ? analysis.result : completeReport(session, analysis.result, analysis.figures), stale } : null,
    analysisVersions: session.analyses.map((item) => ({ version: item.version, createdAt: item.createdAt, reason: item.reason, bucket: item.result.verdict.bucket, post: item.figures.find((figure) => figure.id === 'F_post')?.display ?? null, changeNote: item.result.change_note ?? null })),
    comparison: session.comparison,
    transfer: session.transfer ? { ...session.transfer, case: publicTransferCase(transferData) } : null,
    transferCases: TRANSFER_CASES.length,
    learning: { state: learningState(session), outcome: learningOutcome(session), record: session.learning.record, recordStale: session.learning.recordStale, recordStatus: session.learning.recordStatus, error: session.learning.error ?? null },
    usage: session.usage,
    dimensions: DIMENSIONS,
    buckets: BUCKETS
  };
}
