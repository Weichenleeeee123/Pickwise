import { businessEvidence } from './business-evidence.js';
import { computeEconomics, computeFunding, effectiveConstraints, missingLabels, targetDiagnosis } from './calc.js';
import { money, percent } from '../src/format.js';
import { dimensionInterpretations, dimensionSourceRecords, publicSourceRecord } from './report-detail.js';

const cashLabels = { budget: '可用预算', moq: '首批数量', goodsCost: '采购成本', freight: '头程', duty: '关税', prep: '包装贴标', advertising: '广告预留', storage: '仓储预留', compliance: '检测费用', fixed: '固定启动支出', reserve: '现金缓冲' };
const refs = rows => [...new Set(rows.map(r => r.id).filter(Boolean))];
const basis = (text, evidence_ids = [], nature = 'estimate') => ({ text, evidence_ids, nature });
const metric = (key, label, value, nature, evidence_ids, note = '') => ({ key, label, value, nature, evidence_ids, note });

// A versioned report is built from the same evidence and calculations for model and
// fallback paths. This never fills private operating assumptions from public prices.
export function reportFacts(session) {
  const b = businessEvidence(session), econ = computeEconomics(session), funding = computeFunding(session), inputs = effectiveConstraints(session);
  const keywords = b.keywords.filter(r => r.relevance !== 'excluded' && Number.isFinite(r.monthly_searches));
  const trends = b.trends.filter(r => (r.points ?? []).filter(p => Number.isFinite(p.value)).length > 1);
  const history = b.salesHistory.filter(r => (r.history ?? []).filter(p => Number.isFinite(p.purchases)).length > 1);
  const diagnosis = targetDiagnosis(session);
  const direct = diagnosis.checked.usableSales.filter(r => r.includedForAggregation);
  const comparable = b.competitors.filter(r => r.match.classification === 'comparable');
  const candidates = b.competitors.filter(r => r.match.classification !== 'not_comparable');
  const prices = comparable.filter(r => r.currency === 'USD' && Number.isFinite(r.price)).map(r => r.price).sort((a, z) => a - z);
  const median = prices.length ? (prices[Math.floor((prices.length - 1) / 2)] + prices[Math.floor(prices.length / 2)]) / 2 : null;
  const zero = keywords.length && trends.length && history.length && candidates.length
    && keywords.every(r => r.monthly_searches === 0)
    && trends.every(r => r.points.filter(p => Number.isFinite(p.value)).every(p => p.value === 0))
    && history.every(r => r.history.filter(p => Number.isFinite(p.purchases)).every(p => p.purchases === 0));
  const demand = direct.length > 0 || history.length > 0 || keywords.some(r => r.monthly_searches > 0) || trends.length > 0 || b.sellerSales.length > 0;
  const matchedRecall = b.recalls.some(r => r.match === 'identifier_match');
  const supplier = b.supplierScenario.rows.filter(r => Number.isFinite(r.pre_ads_per_unit));
  const available = [
    ['需求记录', demand, refs([...direct, ...keywords, ...trends, ...history, ...b.sellerSales])],
    ['独立竞品候选', candidates.length > 0, refs(candidates)],
    ['评论正文', b.reviewRecords.some(r => r.review_samples?.length), refs(b.reviewRecords)],
    ['卖家报价', b.marketOffers.some(r => r.offers?.length || r.buy_box?.price != null), refs(b.marketOffers)],
    ['类目榜单', b.categoryRankings.some(r => r.ranked_products?.length), refs(b.categoryRankings)],
    ['货源与费用', supplier.length > 0, [...new Set(supplier.flatMap(r => r.evidence_ids))]],
    ['风险检索', b.official.length > 0, refs(b.official)]
  ].map(([label, available, evidence_ids]) => ({ label, available: Boolean(available), evidence_ids }));
  const sustainedDemand = history.length > 0 || (direct.length > 1 && !diagnosis.singlePeriodOnly) || b.sellerSales.length > 1;
  return { b, econ, funding, inputs, keywords, trends, history, direct, comparable, candidates, median, zero: Boolean(zero), demand, sustainedDemand, matchedRecall, supplier, available };
}

export function buildReportPlan(session) {
  const f = reportFacts(session), { b, econ, funding, inputs } = f;
  const metrics = [];
  if (econ.status === 'complete') {
    metrics.push(metric('contribution', '广告后单件贡献', money(econ.postAdContribution), 'estimate', ['calc', 'user'], '按已填成本计算，非企业净利润'), metric('break_even', '保本转化率', percent(econ.breakEvenCvr), 'estimate', ['calc', 'user'], '以当前 CPC 与广告前贡献为条件'));
  } else if (f.supplier.length) {
    const row = f.supplier[0];
    metrics.push(metric('supplier_margin', '货源初筛贡献', money(row.pre_ads_per_unit), 'estimate', row.evidence_ids, '仅扣货盘与平台费用，未扣头程、税费、广告等'), metric('supplier_cash', '候选 MOQ 货值', money(row.minimum_purchase_cash), 'estimate', row.evidence_ids, `${row.minimum_order_quantity} 件；不是完整启动资金`));
  } else metrics.push(metric('contribution', '广告后单件贡献', '待补成本', 'unknown', [], econ.message ?? econ.error ?? `缺少${missingLabels(econ).join('、')}`));
  if (['within_budget', 'over_budget'].includes(funding.status)) {
    metrics.push(metric('launch', '完整启动现金', money(funding.totalRequired), 'estimate', ['calc', 'user'], `首批 ${inputs.moq} 件`), metric('budget', funding.budgetGap > 0 ? '资金缺口' : '预算余量', money(Math.abs(funding.budgetGap)), 'estimate', ['calc', 'user'], '按首批现金支出与预留计算'));
  } else metrics.push(metric('launch', '完整启动现金', '待补资金项', 'unknown', [], (funding.missing ?? []).map(k => cashLabels[k] ?? k).join('、') || funding.error || '需要首批现金支出与预算'));

  let decision;
  if (f.zero || (econ.status === 'complete' && econ.postAdContribution <= 0)) {
    decision = { stage: 'stop', title: '不建议做，当前条件下先停止采购', reason: econ.status === 'complete' && econ.postAdContribution <= 0 ? `按已填写成本，广告后单件贡献为 ${money(econ.postAdContribution)}。先调整售价、货源或广告条件，再决定是否推进。` : '本次相关关键词、关注度与多期销量估算均为零，当前证据不支持投入；先核对来源与统计范围。' };
  } else if (f.matchedRecall) {
    decision = { stage: 'hold', title: '暂不采购，先核对召回型号与批次', reason: '已取得标识符匹配的召回候选。确认具体型号、批次与适用范围后，再决定是否继续；其他市场信号不能覆盖该项风险。' };
  } else if (funding.status === 'over_budget') {
    decision = { stage: 'hold', title: '暂不下单，先缩减首批资金占用', reason: `完整启动现金为 ${money(funding.totalRequired)}，超出预算 ${money(funding.budgetGap)}。先降低起订量或重排启动支出。` };
  } else if (f.sustainedDemand && f.comparable.length && econ.status === 'complete' && funding.status === 'within_budget' && Number.isInteger(inputs.moq) && inputs.moq > 0) {
    decision = { stage: 'pilot', title: `建议做，按 ${inputs.moq} 件方案准备试销`, reason: `现有需求与独立可比竞品支持继续推进；按售价 ${money(inputs.values.price)} 和已填成本，广告后单件贡献 ${money(econ.postAdContribution)}，启动现金 ${money(funding.totalRequired)}。先完成样品、成本分工、授权与政策核验，再执行首批方案。` };
  } else if (f.demand && f.candidates.length) {
    decision = { stage: 'sample', title: '建议推进打样，先核价再决定首单', reason: `${f.comparable.length ? '已有独立可比竞品与需求记录' : '已有需求记录与竞品候选，规格可比性还需核对'}。${f.supplier.length ? `候选货源与平台费用初筛贡献为 ${money(f.supplier[0].pre_ads_per_unit)}，尚未扣物流、税费、广告等。` : '先确认同规格货源与正式报价。'}本轮建议进入样品与核价阶段，首批数量以经营成本和预算核算后确定。` };
  } else {
    decision = { stage: 'hold', title: '暂不投入采购，先确认需求与可比商品', reason: '当前资料不足以支持备货。先完成下列关键任务，再更新判断；未取得的数据保留未知，不按零值或演示参数代入。' };
  }
  decision = { ...decision, scope: '当前推进阶段建议；风险与经营条件分别核验', purchaseCleared: false, evidence_ids: [...new Set([...f.available.flatMap(r => r.evidence_ids), ...(econ.status === 'complete' || funding.totalRequired != null ? ['calc', 'user'] : [])])].slice(0, 30) };
  const actions = [];
  const add = (task, why, where, evidence_ids = [], gate = 'next') => actions.push({ task, why, where, evidence_ids, gate });
  if (decision.stage === 'stop') add('调整当前不成立的条件', decision.reason, '成本输入、广告报表与原始需求来源', decision.evidence_ids.slice(0, 8), 'before_order');
  if (f.matchedRecall) add('核对召回型号与批次', '型号匹配尚不代表批次已确认，核验前暂停采购。', '召回记录详情、供应商型号与批次材料', refs(b.recalls), 'before_order');
  if (!f.demand) add('取得目标商品的需求记录', '本轮缺少有效销量、搜索或趋势信号，不能用星级和评论数代替需求。', '关键词工具、同口径销量历史或卖家报表');
  else if (!f.sustainedDemand) add('补连续的同口径需求历史', '已有时点信号，持续性尚未核实；不要混加不同商品、父子层级或窗口。', '目标 ASIN 历史估算或卖家后台报表', refs([...f.direct, ...f.keywords, ...f.trends]));
  if (!f.comparable.length) add('核对独立竞品的用途与规格', f.candidates.length ? '已有候选，先核对共同规格、价格带与独立父体，避免把候选直接视为可比。' : '当前没有合适独立竞品，先取得同用途商品快照。', 'Amazon 商品详情与供应商规格表', refs(f.candidates));
  if (econ.status !== 'complete') add('取得正式报价并补齐单件成本', `${f.supplier.length ? '货源与平台费用初筛已提供，继续核对物流、税费与广告。' : '公开售价不自动成为你的定价。'}${econ.message ?? econ.error ?? `当前缺少${missingLabels(econ).join('、')}。`}`, '供应商报价、货代、Amazon 费用预览与实际广告报表', refs([...b.suppliers, ...b.fees]), 'before_order');
  else if (decision.stage !== 'stop') add('打样并复核单件成本', `当前广告后单件贡献 ${money(econ.postAdContribution)}；核对头程、关税、贴标和履约是否已计入且没有重复。`, '实物样品、货代报价与当期平台费用预览', ['calc', 'user'], 'before_order');
  if (funding.status !== 'within_budget') add('确定首批数量与启动预算', funding.status === 'over_budget' ? `当前超出预算 ${money(funding.budgetGap)}，需先缩减资金占用。` : `缺少${(funding.missing ?? []).map(k => cashLabels[k] ?? k).join('、') || '完整启动支出'}；不把 MOQ 货值当作全部启动资金。`, '经营预算、供应商 MOQ、货代与启动支出表', ['user'], 'before_order');
  if (!f.matchedRecall) add('完成下单前的授权与政策核验', '官方检索或未命中不代表全面合规；核对目标型号、材质、标签、品牌权利和类目要求。', 'Amazon 卖家中心、权利人材料与对应官方机构', refs(b.official), 'before_order');
  if (decision.stage === 'pilot') add(`执行 ${inputs.moq} 件试销并复盘`, `按 ${money(inputs.values.price)} 定价；广告预留 ${money(inputs.launch.advertising)}，保本转化率 ${percent(econ.breakEvenCvr)}。跟踪实际贡献、退货与现金后再决定补货。`, '订单、广告与库存周报', ['calc', 'user']);
  else if (decision.stage === 'sample') add('用样品验证产品差异', b.reviewRecords.some(r => r.review_samples?.length) ? '围绕已取得的评论正文与可比规格测试产品和包装，再决定首单。' : '先验证规格、材质、包装与履约，不从缺失评论推断买家痛点。', '样品与买家反馈', refs(b.reviewRecords));
  return { schemaVersion: 1, decision, metrics, coverage: f.available, actions, asOf: session.updatedAt };
}

// Used if model synthesis is unavailable, and to fill a missing evidence-backed
// section. Unknown sections still have a concrete explanation and next action.
export function reportDimensions(session) {
  const f = reportFacts(session), { b, econ, funding } = f;
  const demandBasis = [];
  if (f.keywords.length) demandBasis.push(basis(`相关关键词 ${f.keywords.slice(0, 3).map(r => `${r.keyword ?? '关键词'}：${r.monthly_searches}`).join('；')}，均为搜索量估算，不等于订单。`, refs(f.keywords.slice(0, 3))));
  if (f.history.length) { const r = f.history[0], points = r.history.filter(p => Number.isFinite(p.purchases)); demandBasis.push(basis(`销量历史估算覆盖 ${points[0].date} 至 ${points.at(-1).date}，首末观察值 ${points[0].purchases} / ${points.at(-1).purchases}；保留原商品层级与周期。`, [r.id])); }
  else if (f.direct.length) demandBasis.push(basis(`目标商品可用销量记录 ${f.direct.length} 条；例如 ${f.direct[0].estimated_monthly_sales} 件（${f.direct[0].sales_scope}，${f.direct[0].period_start} 至 ${f.direct[0].period_end}）。`, refs(f.direct.slice(0, 4))));
  if (!demandBasis.length && f.trends.length) demandBasis.push(basis('已取得多期搜索关注度，仅代表对应词的相对关注，不是 Amazon 订单。', refs(f.trends)));
  if (!demandBasis.length && b.sellerSales.length) demandBasis.push(basis('已取得该 ASIN 的卖家下单记录，保持原日期与订单口径。', refs(b.sellerSales.slice(-3)), 'fact'));
  const compBasis = f.candidates.length ? [basis(`独立可比商品 ${f.comparable.length} 个，待核规格候选 ${f.candidates.length - f.comparable.length} 个；同父体和用途不同的样本另列。`, refs(f.candidates.slice(0, 6)), 'fact')] : [];
  if (f.median != null) compBasis.push(basis(`独立可比商品观察价中位数 ${money(f.median)}，只代表当前样本。`, refs(f.comparable.slice(0, 6))));
  const profitBasis = econ.status === 'complete' ? [basis(`广告前贡献 ${money(econ.preAdContribution)}，CAC ${money(econ.acquisitionCost)}，广告后贡献 ${money(econ.postAdContribution)}；保本转化率 ${percent(econ.breakEvenCvr)}。`, ['calc', 'user'])] : f.supplier.length ? [basis(`候选货源 MOQ ${f.supplier[0].minimum_order_quantity} 件，货值 ${money(f.supplier[0].minimum_purchase_cash)}；仅扣货源和平台费的贡献 ${money(f.supplier[0].pre_ads_per_unit)}，未扣物流、税费与广告。`, f.supplier[0].evidence_ids)] : [];
  const fitBasis = funding.totalRequired != null ? [basis(`完整启动现金 ${money(funding.totalRequired)}，${funding.budgetGap > 0 ? '超出预算' : '预算余量'} ${money(Math.abs(funding.budgetGap))}；周期假设 ${funding.cashCycleDays ?? '未知'} 天。`, ['calc', 'user'])] : f.supplier.length ? [basis(`货源起订量与采购现金可参考 ${f.supplier[0].minimum_order_quantity} 件 / ${money(f.supplier[0].minimum_purchase_cash)}，不能代替个人完整启动预算。`, f.supplier[0].evidence_ids)] : [];
  const row = (key, signal, judgment, items, gap) => ({ key, signal, judgment, basis: items.length ? items : [basis('当前没有该维度可引用的有效证据，未补造数字。', [], 'unknown')], annotations: [], ...(gap ? { gap } : {}) });
  return [
    row('demand', f.zero ? 'negative' : f.demand ? 'neutral' : 'insufficient', f.zero ? '多类需求估算均为零，当前证据不支持投入；仍需核对来源覆盖与窗口。' : f.demand ? '已有需求记录，可判断当前信号；持续性与目标规格订单按来源范围解释。' : '当前没有有效的目标需求记录，暂不支持备货。', demandBasis, !f.sustainedDemand ? '连续同口径历史尚未齐备，补采后再判断持续性。' : null),
    row('competition', f.candidates.length ? 'neutral' : 'insufficient', f.comparable.length ? `已筛出 ${f.comparable.length} 个独立可比样本，可比较规格与观察价；样本不代表新卖家起点。` : f.candidates.length ? '已有独立候选，规格可比性需要继续核对。' : '缺少独立同用途竞品，暂时不能比较竞争位置。', compBasis, f.comparable.length ? null : '核对用途、尺寸、材质、包装数量和独立父体。'),
    row('profit', econ.status === 'complete' ? econ.postAdContribution > 0 ? 'positive' : 'negative' : 'insufficient', econ.status === 'complete' ? `按已填经营假设，广告后单件贡献为 ${money(econ.postAdContribution)}；结论随售价、成本和转化率变化。` : f.supplier.length ? '货源与平台费用已能做初筛，但尚不能计算个人广告后贡献。' : '单件经营输入不足，暂时不能计算广告后贡献。', profitBasis, econ.status === 'complete' ? null : econ.message ?? econ.error ?? `需补齐${missingLabels(econ).join('、')}。`),
    row('risk', 'insufficient', f.matchedRecall ? '存在标识符匹配召回记录，采购前必须核对型号与批次。' : b.official.length ? '已取得官方检索记录，目标商品的授权、认证和政策适用性仍需逐项核验。' : '本轮未取得官方风险记录，不能认定风险已排除。', b.official.length ? [basis(`已保留 ${b.official.length} 条官方来源记录及日期，未将检索结果当作全面合规证明。`, refs(b.official.slice(0, 6)), 'fact')] : [], '目标型号、材料、标签、品牌权利与准入要求需在正式下单前核验。'),
    row('fit', funding.status === 'within_budget' ? 'positive' : funding.status === 'over_budget' ? 'negative' : 'insufficient', funding.totalRequired != null ? `完整启动现金为 ${money(funding.totalRequired)}，${funding.status === 'within_budget' ? '在当前预算以内' : '超出当前预算'}。` : '货源条件与个人预算分别核对，当前不能把 MOQ 货值当作全部启动现金。', fitBasis, funding.totalRequired != null ? null : `需补齐${(funding.missing ?? []).map(k => cashLabels[k] ?? k).join('、') || '启动预算与资金支出'}。`)
  ];
}

export function completeReport(session, result, figures) {
  const report = buildReportPlan(session), defaults = reportDimensions(session);
  const interpretations = dimensionInterpretations(session, reportFacts(session));
  const dimensions = defaults.map(fallback => {
    const proposed = result.dimensions?.find(d => d.key === fallback.key);
    return proposed?.basis?.length ? { ...proposed, annotations: [...(proposed.annotations ?? [])] } : { ...fallback, ...(proposed ? { annotations: [...(proposed.annotations ?? [])] } : {}) };
  });
  for (const figure of figures.filter(f => f.nature !== 'unknown')) {
    if (dimensions.some(d => d.annotations.some(a => a.figure_id === figure.id))) continue;
    const key = /sales/.test(figure.id) ? 'demand' : /purchase|launch|gap/.test(figure.id) ? 'fit' : 'profit';
    dimensions.find(d => d.key === key).annotations.push({ figure_id: figure.id, how_to_read: `${figure.label} ${figure.display}；${figure.meta ?? '按本次输入计算，保留原统计范围与假设。'}`, verify: key === 'demand' ? '核对该商品的原始统计窗口、层级与估算方式。' : '用正式报价、平台费用预览与实际经营报表复核。' });
  }
  for (const d of dimensions) {
    d.interpretation = d.interpretation?.length >= 2 ? d.interpretation : interpretations[d.key];
    d.source_records = dimensionSourceRecords(session, d);
    if (['profit', 'fit'].includes(d.key)) d.calculation_inputs = publicSourceRecord({ values: effectiveConstraints(session).values, launch: effectiveConstraints(session).launch, budget: session.constraints.budget, moq: session.constraints.moq, inputSources: session.constraints.inputSources ?? {}, economics: computeEconomics(session), funding: computeFunding(session) });
  }
  report.detailVersion = 1;
  return { ...result, dimensions, report, verdict: { ...result.verdict, title: report.decision.title, reason: report.decision.reason }, next_steps: report.actions };
}
