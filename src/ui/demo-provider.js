import { DEMO_CASE } from './demo-data.js';
import { calculatePurchaseExposure, calculateUnitEconomics } from '../domain.js';
function newCase() { return structuredClone(DEMO_CASE.view); }
let current = newCase();
let texts = structuredClone(DEMO_CASE.texts);
const snapshot = () => structuredClone(current);
export function resetDemo() { current = newCase(); texts = structuredClone(DEMO_CASE.texts); return snapshot(); }
export const demoProvider = {
  config: async () => ({ llm: { configured: false }, apify: { configured: false }, dataForSeo: { configured: false }, preloadedDemo: true }),
  list: async () => ({ sessions: [{ id: current.id, name: current.product.name, asin: current.targetAsin, demo: true, research: current.research.status, createdAt: current.createdAt, evidenceCount: current.evidence.length }] }),
  create: async () => { throw new Error('预制演示仅使用案例商品；请切换到实时分析输入其他商品。'); },
  demo: async () => resetDemo(),
  get: async () => snapshot(),
  exportText: async (id,kind) => '# Pickwise 产品演示 · 完整虚构案例\n\n场景日期：2026-11-14。商品、销量、评论、报价及核验材料均为模拟数据，仅用于演示。\n\n' + (current.analysis?.stale ? '> 经营条件已在本次演示调整；下方为原始案例报告，最新试算请查看“证据与测算”。\n\n' : '') + (texts[kind] ?? '该成果尚未生成。'),
  async post(id, action, body={}) {
    if (action === 'coach') {
      const question = String(body.question ?? '').trim(), selectedText = String(body.selectedText ?? '').trim();
      if (!question || question.length > 500 || selectedText.length > 1200) throw new Error('问题最多 500 字，引用最多 1200 字。');
      const topic = /数量|起订|首批|MOQ|120/i.test(question) ? 'quantity' : /风险|认证|授权|合规|召回/.test(question) ? 'risk' : /为什么|为何/.test(question) ? 'verdict' : /利润|费用|成本|转化|CPC|CVR/i.test(question) ? 'cost' : /先做|下一步|首单|补货/.test(question) ? 'next' : /原始|数据|证据|来源/.test(question) ? 'evidence' : 'verdict';
      const answer = (selectedText ? '你引用的内容已保留。结合这份模拟案例，\n\n' : '') + DEMO_CASE.coachAnswers[topic] + (current.analysis.stale ? `\n\n你已调整本地输入：当前试算的广告后贡献为 ${current.econ.postAdContribution ?? '未知'} USD；上面的文字解释保留原案例参数。` : '');
      current.coach = [...(current.coach ?? []), {question,selectedText,answer,simulated:true,analysisVersion:current.analysis.version,at:new Date().toISOString()}].slice(-12);
      return snapshot();
    }
    if (action === 'viewed-result') return snapshot();
    if (action === 'judgment') { current.judgment = { ...body, eligible: false }; return snapshot(); }
    if (action === 'constraints') {
      const constraints = structuredClone(current.constraints);
      const values = { ...constraints.values };
      for (const key of Object.keys(values)) if (key in (body.values ?? {})) values[key] = body.values[key];
      Object.assign(constraints, body, { values });
      const effective = { ...values };
      const fx = constraints.fx;
      const fxMissing = constraints.goodsCostCurrency !== 'USD' && (!fx || !Number.isFinite(Number(fx.rate)) || Number(fx.rate) <= 0 || !fx.source || !fx.date);
      if (constraints.goodsCostCurrency !== 'USD' && !fxMissing && effective.goodsCost != null) effective.goodsCost *= Number(fx.rate);
      const econ = fxMissing ? { status: 'fx_required', message: '需要带来源与日期的美元汇率。' } : calculateUnitEconomics(effective);
      const costLabels = {price:'预期售价',goodsCost:'单件采购成本',logisticsCost:'运输与履约',platformCost:'平台费',returnsCost:'退货预留',otherCost:'其他成本',cpc:'CPC',cvr:'CVR'};
      econ.missingLabels = (econ.missing ?? []).map(k => costLabels[k] ?? k);
      const cashKeys = ['freight','duty','prep','advertising','storage','compliance','fixed','reserve'];
      const timingKeys = ['leadDays','inventoryDays','payoutDays'];
      const launch = constraints.launch ?? {};
      for (const key of [...cashKeys, ...timingKeys]) if (launch[key] != null && (!Number.isFinite(launch[key]) || launch[key] < 0)) throw new Error('启动现金与周转天数须为非负数字。');
      const purchase = fxMissing ? {missing:['goodsCost']} : calculatePurchaseExposure({budget:constraints.budget,moq:constraints.moq,goodsCost:effective.goodsCost});
      const missing = [...(purchase.missing ?? []), ...cashKeys.filter(k => !Number.isFinite(launch[k]))];
      const cashCycleDays = timingKeys.every(k => Number.isFinite(launch[k])) ? timingKeys.reduce((sum,k) => sum + launch[k],0) : null;
      const funding = { status:'incomplete', missing, purchaseAmount:purchase.purchaseAmount ?? null, cashCycleDays };
      if (!missing.length) {
        funding.totalRequired = Math.round((purchase.purchaseAmount + cashKeys.reduce((sum,k) => sum + launch[k],0)) * 100) / 100;
        funding.budgetGap = Math.round((funding.totalRequired - constraints.budget) * 100) / 100;
        funding.status = funding.budgetGap > 0 ? 'over_budget' : 'within_budget';
      }
      const definitions = [['基准输入',{}],['目标售价降低一成',{price:effective.price*.9}],['CPC 增加两成',{cpc:effective.cpc*1.2}],['CVR 减半',{cvr:effective.cvr*.5}],['采购成本增加一成',{goodsCost:effective.goodsCost*1.1}]];
      current.constraints = { ...constraints, effective, fxMissing, fxNote: constraints.goodsCostCurrency !== 'USD' && !fxMissing ? '演示汇率来源：' + fx.source + ' · ' + fx.date : null };
      current.econ = econ; current.funding = funding;
      current.scenarios = { rows: econ.status === 'complete' ? definitions.map(([label,overrides]) => { const scenario = {...effective,...overrides}; return {label,values:scenario,result:calculateUnitEconomics(scenario)}; }) : [], note:'本地程序压力情景，不是预测；文字报告保留原案例。' };
      current.analysis = { ...current.analysis, stale:true }; current.cardsStale = true;
      const bars = [['售价',effective.price,'in'],['采购',effective.goodsCost,'out'],['运输与履约',effective.logisticsCost,'out'],['平台费',effective.platformCost,'out'],['退货预留',effective.returnsCost,'out'],['其他变动成本',effective.otherCost,'out'],['广告前贡献',econ.preAdContribution,'subtotal'],['广告获客 CAC',econ.acquisitionCost,'out'],['广告后贡献',econ.postAdContribution,'total']];
      current.viz = { ...current.viz, profit: { type:'waterfall', currency:'USD', nature:'estimate', complete:econ.status === 'complete', note:'本地模拟试算；文字报告保留原案例。', bars:econ.status === 'complete' ? bars.map(([label,value,kind]) => ({label,value,kind,unknown:false})) : [] } };
      return snapshot();
    }
    if (/^practice\/.+\/skip$/.test(action)) { const node=action.split('/')[1]; current.practice[node] = {status:'skipped'}; return snapshot(); }
    if (action === 'transfer/skip') { current.transfer = { result: { skipped: true }, case: { evidence: [] } }; return snapshot(); }
    throw new Error('预制演示不调用模型或数据源；请切换到实时分析使用此操作。');
  }
};
