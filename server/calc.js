import { calculatePurchaseExposure, calculateUnitEconomics } from '../src/domain.js';
import { diagnoseEvidence } from '../src/diagnosis.js';
import { COST_LABELS, money, percent } from '../src/format.js';
import { businessEvidence } from './business-evidence.js';

const ERROR_TEXT = [
  [/CVR must/, 'CVR 须大于 0 且不超过 100%'],
  [/non-negative/, '售价与各项成本不能为负数'],
  [/valid numbers/, '存在无效数字']
];

export function translateError(message) {
  return ERROR_TEXT.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

export function targetFamily(session) {
  const target = session.targetAsin;
  if (!target) return [];
  const own = session.evidence.filter((record) => record.asin === target);
  const parents = new Set(own.map((record) => record.parent_asin).filter(Boolean));
  return session.evidence.filter((record) => record.asin === target || (record.parent_asin && (record.parent_asin === target || parents.has(record.parent_asin))) || parents.has(record.asin));
}

export function otherProducts(session) {
  const family = new Set(targetFamily(session).map((record) => record.id));
  const latest = new Map();
  for (const record of session.evidence) {
    if (family.has(record.id) || record.evidence_kind) continue;
    const current = latest.get(record.asin);
    if (!current || String(record.observed_at) > String(current.observed_at)) latest.set(record.asin, record);
  }
  return [...latest.values()];
}

export function targetDiagnosis(session) {
  return diagnoseEvidence(targetFamily(session));
}

export function allDiagnosis(session) {
  return diagnoseEvidence(session.evidence);
}

export function effectiveConstraints(session) {
  const c = session.constraints;
  const values = { ...c.values };
  const sources = Object.fromEntries(Object.keys(values).map((key) => [key, values[key] === null ? null : 'user']));
  const priced = targetFamily(session).filter(record => !record.evidence_kind && record.asin === session.targetAsin && Number.isFinite(record.price) && record.currency === 'USD').sort((a, b) => String(b.observed_at).localeCompare(String(a.observed_at)));
  const marketPrice = priced[0] ? { value: priced[0].price, currency: 'USD', evidenceId: priced[0].id, observedAt: priced[0].observed_at } : null;
  let fxMissing = false;
  let fxNote = null;
  if (values.goodsCost !== null && c.goodsCostCurrency !== 'USD') {
    const fx = c.fx;
    if (fx && Number(fx.rate) > 0 && fx.source && fx.date) {
      values.goodsCost = Math.round(values.goodsCost * Number(fx.rate) * 10000) / 10000;
      fxNote = `采购价按 1 ${c.goodsCostCurrency} = ${fx.rate} USD 折算（来源：${fx.source}，日期：${fx.date}）`;
    } else fxMissing = true;
  }
  return { currency: 'USD', values, sources, marketPrice, budget: c.budget, moq: c.moq, launch: c.launch ?? {}, goodsCostCurrency: c.goodsCostCurrency, fx: c.fx, fxMissing, fxNote };
}

export function computeEconomics(session) {
  const eff = effectiveConstraints(session);
  if (eff.fxMissing) return { status: 'fx_required', missing: ['goodsCost'], message: `采购价使用 ${eff.goodsCostCurrency}，缺少带来源和日期的汇率，不能与美元售价相减`, eff };
  try { return { ...calculateUnitEconomics(eff.values), eff }; }
  catch (error) { return { status: 'invalid', error: translateError(error.message), eff }; }
}

export function computeFunding(session) {
  const eff = effectiveConstraints(session);
  if (eff.fxMissing) return { status: 'incomplete', missing: ['goodsCost'] };
  try {
    const purchase = calculatePurchaseExposure({ budget: eff.budget, moq: eff.moq, goodsCost: eff.values.goodsCost });
    const cashKeys = ['freight', 'duty', 'prep', 'advertising', 'storage', 'compliance', 'fixed', 'reserve'];
    const timingKeys = ['leadDays', 'inventoryDays', 'payoutDays'];
    const missing = [...(purchase.missing ?? []), ...cashKeys.filter(k => !Number.isFinite(eff.launch[k]))];
    for (const key of [...cashKeys, ...timingKeys]) if (eff.launch[key] != null && (!Number.isFinite(eff.launch[key]) || eff.launch[key] < 0)) throw new Error('Launch inputs must be non-negative valid numbers');
    const cashCycleDays = timingKeys.every(k => Number.isFinite(eff.launch[k])) ? timingKeys.reduce((s, k) => s + eff.launch[k], 0) : null;
    if (missing.length) return { status: 'incomplete', missing, purchaseAmount: purchase.purchaseAmount ?? null, totalRequired: null, cashCycleDays, timingMissing: timingKeys.filter(k => !Number.isFinite(eff.launch[k])) };
    const totalRequired = Math.round((purchase.purchaseAmount + cashKeys.reduce((s, k) => s + eff.launch[k], 0)) * 100) / 100;
    const budgetGap = Math.round((totalRequired - eff.budget) * 100) / 100;
    return { status: budgetGap > 0 ? 'over_budget' : 'within_budget', purchaseAmount: purchase.purchaseAmount, totalRequired, budgetGap, cashCycleDays, timingMissing: timingKeys.filter(k => !Number.isFinite(eff.launch[k])), breakdown: Object.fromEntries(cashKeys.map(k => [k, eff.launch[k]])), note: '首批采购加独立现金支出及预留；物流总额与单件履约费用需核对，避免重复。现金周期是用户假设，不是销量预测。' };
  }
  catch (error) { return { status: 'invalid', error: translateError(error.message), missing: [] }; }
}

export function computeScenarios(session) {
  const base = computeEconomics(session);
  if (base.status !== 'complete') return { status: base.status, rows: [], missing: base.missing ?? [] };
  const v = effectiveConstraints(session).values;
  const definitions = [['基准输入', {}], ['目标售价降低一成', { price: v.price * 0.9 }], ['CPC 增加两成', { cpc: v.cpc * 1.2 }], ['CVR 减半', { cvr: v.cvr * 0.5 }], ['采购成本增加一成', { goodsCost: v.goodsCost * 1.1 }]];
  return { status: 'complete', nature: 'assumption', note: '程序压力情景，不是市场预测。平台费保持用户输入；若为按售价计费，需重新取得费用估算。', rows: definitions.map(([label, overrides]) => { const values = { ...v, ...overrides }; return { label, values, overrides, result: calculateUnitEconomics(values) }; }) };
}

export function missingLabels(result) {
  return (result?.missing ?? []).map((key) => COST_LABELS[key] ?? key);
}

function fig(id, label, display, nature, extra = {}) {
  return { id, label, display, nature, refs: [], ...extra };
}

// 结果页和教学讲解引用的“主要数字”。数字只由代码生成，LLM 只为它们写“怎么读”批注。
export function buildFigures(session) {
  const figures = [];
  const diag = targetDiagnosis(session);
  const rows = diag.checked.usableSales.filter((row) => row.includedForAggregation).slice(0, 4);
  for (const row of rows) {
    figures.push(fig(`F_sales_${row.id}`, `月销估算 ${row.asin}（${row.sales_scope}）`, `${row.estimated_monthly_sales} 件`, 'estimate', { refs: [row.id], meta: `${row.period_start} 至 ${row.period_end}` }));
  }
  const eff = effectiveConstraints(session);
  const econ = computeEconomics(session);
  const funding = computeFunding(session);
  const cur = eff.currency;
  if (eff.values.price !== null) {
    const fromEvidence = String(eff.sources.price).startsWith('evidence:');
    figures.push(fig('F_price', '预期售价', money(eff.values.price, cur), fromEvidence ? 'fact' : 'assumption', { refs: fromEvidence ? [eff.sources.price.slice(9)] : ['user'] }));
  }
  if (econ.status === 'complete') {
    figures.push(fig('F_pre', '广告前单件贡献', money(econ.preAdContribution, cur), 'estimate', { refs: ['user'], meta: '售价 − 各项非广告变动成本' }));
    figures.push(fig('F_cac', '广告获客成本 CAC', money(econ.acquisitionCost, cur), 'estimate', { refs: ['user'], meta: 'CPC ÷ CVR' }));
    figures.push(fig('F_post', '广告后单件贡献', money(econ.postAdContribution, cur), 'estimate', { refs: ['user'], meta: '广告前贡献 − CAC' }));
    figures.push(fig('F_be', '保本转化率', econ.breakEvenCvr === null ? '无正贡献' : percent(econ.breakEvenCvr), 'estimate', { refs: ['user'], meta: econ.breakEvenUnreachable ? '高于 100%，当前假设不可实现' : 'CPC ÷ 广告前贡献' }));
  } else {
    const why = econ.status === 'invalid' ? econ.error : econ.status === 'fx_required' ? econ.message : `缺少 ${missingLabels(econ).join('、')}`;
    figures.push(fig('F_post', '广告后单件贡献', '未提供', 'unknown', { meta: why }));
  }
  if (funding.status === 'within_budget' || funding.status === 'over_budget') {
    figures.push(fig('F_purchase', '起订采购金额', money(funding.purchaseAmount, cur), 'estimate', { refs: ['user'], meta: 'MOQ × 单件采购价，不含运输与广告' }));
    figures.push(fig('F_launch', '启动资金需求', money(funding.totalRequired, cur), 'estimate', { refs: ['user'], meta: '采购、运输、税费、广告、仓储、检测与预留现金' }));
    figures.push(fig('F_gap', funding.budgetGap > 0 ? '启动现金缺口' : '启动后剩余预算', money(Math.abs(funding.budgetGap), cur), 'estimate', { refs: ['user'], meta: '按已填完整启动现金支出计算' }));
  }
  return figures;
}

export function profitViz(session) {
  const eff = effectiveConstraints(session);
  const econ = computeEconomics(session);
  const v = eff.values;
  const parts = [
    ['售价', v.price, 'in'], ['采购', v.goodsCost, 'out'], ['运输与履约', v.logisticsCost, 'out'], ['平台费', v.platformCost, 'out'], ['退货预留', v.returnsCost, 'out'], ['其他变动成本', v.otherCost, 'out']
  ].map(([label, value, kind]) => ({ label, value, kind, unknown: value === null }));
  const bars = [...parts];
  if (econ.status === 'complete') {
    bars.push({ label: '广告前贡献', value: econ.preAdContribution, kind: 'subtotal' });
    bars.push({ label: '广告获客 CAC', value: econ.acquisitionCost, kind: 'out' });
    bars.push({ label: '广告后贡献', value: econ.postAdContribution, kind: 'total' });
  }
  return { type: 'waterfall', currency: eff.currency, bars, nature: 'estimate', complete: econ.status === 'complete', note: econ.status === 'complete' ? '数字来自用户提供或假设的成本，程序按公式计算' : '成本项缺失，未提供的项目不画示意值' };
}

export function demandViz(session) {
  const diag = targetDiagnosis(session);
  const rows = [...diag.checked.usableSales, ...diag.checked.excluded].filter((row) => row.estimated_monthly_sales !== undefined);
  if (!rows.length) {
    const source = businessEvidence(session).salesHistory.find(r => r.history?.some(p => Number.isFinite(p.purchases) && p.purchases >= 0 && Number.isFinite(Date.parse(p.date))));
    if (source) return {
      type: 'bars', nature: 'estimate', title: '购买量历史估算（件）',
      note: '保留来源的观察周期；不是月销量或卖家订单，不将多个来源重复相加。',
      bars: source.history.filter(p => Number.isFinite(p.purchases) && p.purchases >= 0 && Number.isFinite(Date.parse(p.date))).sort((a, b) => a.date.localeCompare(b.date)).slice(-13).map(p => ({ id: source.id, label: p.date, window: `${p.date} · ${source.history_weeks != null ? '周级历史' : '来源周期'}，非月销量`, scope: 'ASIN 购买量估算', value: p.purchases, included: true, reason: null }))
    };
  }
  return {
    type: 'bars',
    nature: 'estimate',
    bars: rows.slice(0, 8).map((row) => ({ id: row.id, label: `${row.asin}`, window: row.period_start && row.period_end ? `${row.period_start}~${row.period_end}` : '无窗口', scope: row.sales_scope ?? '无层级', value: Number.isFinite(row.estimated_monthly_sales) ? row.estimated_monthly_sales : null, included: row.includedForAggregation === true, reason: row.excludedReason ?? null }))
  };
}
