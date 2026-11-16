import { money, percent } from '../src/format.js';
import { missingLabels } from './calc.js';

// These are the normalized source records used by this report version, including
// full returned arrays. Private cache keys and credentials never reach the page.
export function publicSourceRecord(value) {
  if (Array.isArray(value)) return value.map(publicSourceRecord);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !key.startsWith('_') && !/^(ownerHash|authorization|api[_-]?key|token|password|secret|cookie)$/i.test(key))
    .map(([key, item]) => [key, publicSourceRecord(item)]));
  return value;
}

export function dimensionSourceRecords(session, dimension) {
  const kinds = {
    demand: ['keyword', 'search_interest', 'market_sales_estimate', 'sales_estimate', 'seller_sales', 'keepa_history'],
    competition: ['reviews', 'market_offers', 'category_rankings'],
    profit: ['supplier_quote', 'amazon_fee_estimate', 'package_dimensions'],
    risk: ['official_policy', 'official_check', 'recall'],
    fit: ['supplier_quote', 'package_dimensions', 'amazon_fee_estimate']
  };
  const referenced = new Set((dimension.basis ?? []).flatMap(b => b.evidence_ids ?? []));
  const wanted = new Set(kinds[dimension.key] ?? []);
  return session.evidence.filter(r => referenced.has(r.id) || (r.asin === session.targetAsin && wanted.has(r.evidence_kind))
    || (!r.evidence_kind && (dimension.key === 'competition' || (dimension.key === 'demand' && r.asin === session.targetAsin && r.estimated_monthly_sales != null))))
    .map(publicSourceRecord);
}

export function dimensionInterpretations(session, f) {
  const { b, econ, funding, inputs } = f;
  const firstHistory = f.history[0];
  const points = (firstHistory?.history ?? []).filter(p => Number.isFinite(p.purchases)).sort((a, z) => a.date.localeCompare(z.date));
  const search = f.keywords.slice(0, 3).map(r => `${r.keyword ?? r.title}（${r.monthly_searches} 次/月估算）`).join('、');
  const reviewCount = b.reviewRecords.reduce((sum, r) => sum + (r.review_samples?.length ?? 0), 0);
  const targetOffers = b.marketOffers[0];
  return {
    demand: [
      points.length ? `本次保留了 ${points.length} 个来源周期的购买量估算，从 ${points[0].date} 的 ${points[0].purchases} 件到 ${points.at(-1).date} 的 ${points.at(-1).purchases} 件。应按这段历史的实际波动读需求，不能把一次采集到的多期历史误读成只有单期，也不能换算成卖家订单。` : f.direct.length ? `目前有 ${f.direct.length} 条目标销量记录，均保留商品层级与起止窗口。只有同商品、同层级的不同窗口才能用于比较持续性；同父体重复值不应相加，展开后可逐行核对。` : '本次还没有可用的同口径购买量历史。当前判断需要依赖已取得的搜索或页面信号，尚不足以说明实际下单量及其持续性。',
      `${search ? `搜索侧取得 ${search}。这些词可能覆盖重叠人群，不能加成独立购买需求。` : '相关关键词月搜索量尚未取得，不能用自动补全词或评论总数代替。'}${f.trends.length ? '关注度序列可用于交叉观察方向，但它衡量对应词的相对关注。' : '搜索关注度历史仍缺，季节性与跨渠道一致性没有得到验证。'}这会影响投入规模，行动计划应先对应证据强弱，再决定打样或备货。`
    ],
    competition: [
      `候选池中有 ${f.candidates.length} 个可继续核对的独立商品，其中 ${f.comparable.length} 个已通过现有用途与共同规格筛选。${f.median != null ? `可比样本的观察价中位数为 ${money(f.median)}。` : '尚未确认共同规格，因此这里只能比较候选快照，不能据此认定直接竞争强度。'}同父体变体、配件与用途不符的商品需要单独排除，不能靠搜索排名或榜单位置直接确定可比性。`,
      `${targetOffers ? `目标报价样本返回 ${targetOffers.returned_offer_count ?? targetOffers.offers?.length ?? 0} 条报价；${targetOffers.buy_box?.seller_name ? `当前 Buy Box 为 ${targetOffers.buy_box.seller_name}，` : ''}还要分别核对新品/二手、运费与 FBA/FBM。` : '目标 Buy Box 与有效报价尚未齐备，不能把最低标价等同于最终到手价。'}${reviewCount ? `本次有 ${reviewCount} 条评论正文可帮助识别使用痛点与包装问题；样本不用于推算整体退货率。` : '评论正文尚缺，差异化方向应先由真实反馈验证。'}进入方式要落到规格、服务或包装的具体改进，头部销量和评价不能视为新卖家的起点。`
    ],
    profit: econ.status === 'complete' ? [
      `测算使用你的目标售价 ${money(inputs.values.price)}，采购 ${money(inputs.values.goodsCost)}、运输与履约 ${money(inputs.values.logisticsCost)}、平台费 ${money(inputs.values.platformCost)}、退货预留 ${money(inputs.values.returnsCost)} 和其他变动成本 ${money(inputs.values.otherCost)}。扣除这些输入后，广告前每件保留 ${money(econ.preAdContribution)}；公开观察价与个人定价仍是两项不同的数据。`,
      `在 CPC ${money(inputs.values.cpc)}、CVR ${percent(inputs.values.cvr)} 的假设下，获客成本为 ${money(econ.acquisitionCost)}，广告后贡献 ${money(econ.postAdContribution)}，保本转化率 ${percent(econ.breakEvenCvr)}。这解释了当前利润信号的来源：投放表现或费用一变，贡献会随之变化；下单前还要确认头程、税费、贴标与履约已按正确分工计入，并用压力情景评估余量。`
    ] : [
      f.supplier.length ? `公开货源与平台费已经能建立采购初筛。当前候选的 MOQ 货值为 ${money(f.supplier[0].minimum_purchase_cash)}，仅扣货盘与平台费用的贡献为 ${money(f.supplier[0].pre_ads_per_unit)}；这两个数字说明的是报价情景，未扣物流、税费、广告等，不是你的净利润或可直接采购的报价。` : '目前没有足够的采购、平台费用与物流条件支撑完整单位经济性。页面售价只能说明观察时点的市场标价，不能自动成为你的销售价格，也不能据此补出毛利。',
      `当前尚不能得到广告后贡献，${econ.message ?? econ.error ?? `还缺${missingLabels(econ).join('、') || '经营输入'}`}。建议先取得同规格正式报价、货代与平台费用，再填写自己的定价和广告参数；这些数字补齐后，系统才能计算 CAC、保本转化率和压力情景。空白保留为未知，不会沿用演示案例参数。`
    ],
    risk: [
      b.official.length ? `本轮保存了 ${b.official.length} 条官方检索或政策记录，展开可查看检索条件、观察日期及来源原文。${f.matchedRecall ? '其中存在标识符匹配召回记录，应先比对目标型号与批次，采购建议已暂停。' : '现有记录仅在其检索词、型号和政策适用范围内有效；候选或未命中都不能直接判断目标商品的召回状态。'}` : '本轮没有取得可用于当前商品的官方风险资料。此时无法据商品标题、卖家说明或“未查到”判断认证、品牌权利与准入条件，风险维度仍需保留待核实状态。',
      '执行上应先把目标型号、材质、包装标签与品牌经营方式固定，再逐项对应平台类目政策、权利人授权、商标/设计检索和必要检测材料。通用政策页说明的是规则，不能证明某一件实物已经符合；打样、报价或市场需求为正也不会自动消除这些下单前条件。'
    ],
    fit: funding.totalRequired != null ? [
      `首批数量按 ${inputs.moq} 件，采购现金 ${money(funding.purchaseAmount)}，加上运输、税费、包装、广告、仓储、检测、固定支出与预留后，完整启动资金为 ${money(funding.totalRequired)}。与预算 ${money(inputs.budget)} 对比，${funding.budgetGap > 0 ? `尚缺 ${money(funding.budgetGap)}` : `剩余 ${money(Math.abs(funding.budgetGap))}`}。这比只看采购价更接近真正需要占用的现金。`,
      `生产运输、库存与回款等待合计的周期假设为 ${funding.cashCycleDays ?? '未知'} 天。${funding.status === 'over_budget' ? '当前预算无法覆盖首批方案，应先降低 MOQ 或缩减独立支出，再考虑执行。' : '预算覆盖只说明这份首批方案在资金上可安排；补货、实际动销和退货仍会改变现金压力。'}单件利润与整批资金是不同视角，同一笔头程在两个视角中分别体现，但每个视角内不能重复扣除。`
    ] : [
      `${f.supplier.length ? `候选 MOQ 为 ${f.supplier[0].minimum_order_quantity} 件，货值 ${money(f.supplier[0].minimum_purchase_cash)}，可作为供应条件的线索。` : '当前供应条件尚未确定，MOQ、交期与正式报价仍需核实。'}它还没有回答你能否负担启动：首批运输税费、广告、仓储和现金缓冲都可能改变所需资金。`,
      `目前个人完整启动资金缺 ${funding.error ?? (funding.missing ?? []).map(k => ({ budget:'预算', moq:'首批数量', goodsCost:'采购价', freight:'头程', duty:'关税', prep:'包装贴标', advertising:'广告预留', storage:'仓储', compliance:'检测', fixed:'固定费用', reserve:'缓冲' })[k] ?? k).join('、')}。因此当前建议只能落在打样、核价或补资料阶段；有明确预算与周转安排后，再让首批规模服从资金条件，不能把供应商起订量当作推荐采购量。`
    ]
  };
}
