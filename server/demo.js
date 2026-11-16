// 预制内容只有两类，且都在界面上明确标注为“教学模拟”：
// 1. 体验教学案例的证据与成本（DEMO）；2. 迁移练习的案例包（TRANSFER_CASES，含人工审定的评分要点）。
// Agent 的拆解、讲解、选节点、结论和反馈仍然由真实模型针对这些数据生成。

const sim = (fields) => ({ marketplace: 'US', source_name: 'Pickwise 教学模拟数据', observed_at: '2026-11-14', source_mode: 'teaching_simulation', currency: 'USD', source_url: '', ...fields });

export const DEMO = {
  input: '不锈钢厨房置物架',
  asin: 'SIM-A1',
  name: '不锈钢厨房置物架（教学模拟）',
  evidence: [
    sim({ asin: 'SIM-A1', parent_asin: 'SIM-P1', title: '教学模拟：不锈钢厨房置物架 2 层', variant: '2 层 / 银色', price: 20, rating: 4.4, review_count: 380, estimated_monthly_sales: 420, sales_scope: 'parent', period_start: '2026-10-01', period_end: '2026-10-31' }),
    sim({ asin: 'SIM-A2', parent_asin: 'SIM-P1', title: '教学模拟：不锈钢厨房置物架 3 层', variant: '3 层 / 银色', price: 26, rating: 4.4, review_count: 380, estimated_monthly_sales: 420, sales_scope: 'parent', period_start: '2026-10-01', period_end: '2026-10-31' }),
    sim({ asin: 'SIM-B1', parent_asin: 'SIM-P2', title: '教学模拟：厨房台面收纳架 双层', price: 22, rating: 4.2, review_count: 1650, estimated_monthly_sales: 900, sales_scope: 'parent', period_start: '2026-10-01', period_end: '2026-10-31' }),
    sim({ asin: 'SIM-C1', title: '教学模拟：可伸缩水槽置物架', price: 31, rating: 4.6, review_count: 120, estimated_monthly_sales: 160, sales_scope: 'listing', period_start: '2026-10-05', period_end: '2026-11-03' }),
    sim({ asin: 'SIM-D1', title: '教学模拟：多功能厨房转角架', price: 17, rating: 3.9, review_count: 2410 })
  ],
  constraints: { price: 20, goodsCost: 8, logisticsCost: 2, platformCost: 1, returnsCost: 0.5, otherCost: 0.5, cpc: 0.6, cvr: 0.1, budget: 2400, moq: 120 }
};

// 迁移案例包。rubric 是人工审定的评分要点，模型只能依据它和用户的原话评分。
export const TRANSFER_CASES = [
  {
    id: 'T1',
    title: '折叠式桌面收纳盒',
    price: 24, goodsCost: 9, logisticsCost: 2.5, platformCost: 2, returnsCost: 1, otherCost: 0.5, cpc: 0.72, cvr: 0.06,
    evidence: [
      sim({ id: 'T1-E1', asin: 'T1-A', parent_asin: 'T1-P', title: '教学模拟：折叠桌面收纳盒 小号', price: 24, estimated_monthly_sales: 140, sales_scope: 'parent', period_start: '2026-10-01', period_end: '2026-10-31' }),
      sim({ id: 'T1-E2', asin: 'T1-B', parent_asin: 'T1-P', title: '教学模拟：折叠桌面收纳盒 大号', price: 28, estimated_monthly_sales: 140, sales_scope: 'parent', period_start: '2026-10-01', period_end: '2026-10-31' }),
      sim({ id: 'T1-E3', asin: 'T1-C', title: '教学模拟：同类竞品', price: 22, estimated_monthly_sales: 95, sales_scope: 'listing', period_start: '2026-10-12', period_end: '2026-11-10' })
    ],
    hintTexts: ['先看两行销量的父体编号、统计窗口和销量层级，再决定能不能相加。', '广告后贡献 = 售价 − 非广告成本 − CPC ÷ CVR。'],
    rubric: {
      evidence: '较好的选择：连续多个窗口、同口径的销量历史，加上完整成本明细；只看单个商品页当前价格或凭感觉为差。',
      scope: '案例里 T1-E1 与 T1-E2 是同一父体 T1-P 在同一窗口的整款销量（都是 140），不能相加成 280；T1-E3 是滚动 30 天的单商品销量，窗口与自然月不一致；全部只有单期，不能证明需求持续。',
      uncertainty: '较好的回答指出具体未计入或未核实的项目（例如仓储费、税费、退货率、广告假设来源），并说出到哪里核实（如卖家后台费用预览、Amazon 官方费率页、广告报告）。笼统说“还要更多数据”只能得 1 分。'
    },
    truth: { preAd: 9, cac: 12, postAd: -3 }
  },
  {
    id: 'T2',
    title: '桌面理线收纳架',
    price: 32, goodsCost: 14, logisticsCost: 4, platformCost: 4.8, returnsCost: 1.2, otherCost: 1, cpc: 0.9, cvr: 0.08,
    evidence: [
      sim({ id: 'T2-E1', asin: 'T2-A', parent_asin: 'T2-P', title: '教学模拟：桌面理线收纳架 标准款', price: 32, estimated_monthly_sales: 210, sales_scope: 'parent', period_start: '2026-10-01', period_end: '2026-10-31' }),
      sim({ id: 'T2-E2', asin: 'T2-A', parent_asin: 'T2-P', title: '教学模拟：桌面理线收纳架 标准款', price: 32, estimated_monthly_sales: 180, sales_scope: 'parent', period_start: '2026-09-01', period_end: '2026-09-30' }),
      sim({ id: 'T2-E3', asin: 'T2-B', title: '教学模拟：同类竞品', price: 29, estimated_monthly_sales: 75, sales_scope: 'child', period_start: '2026-10-01', period_end: '2026-10-31' })
    ],
    hintTexts: ['T2-E1 和 T2-E2 是同一商品不同月份，能看到什么，不能看到什么？', '广告后贡献 = 售价 − 非广告成本 − CPC ÷ CVR。'],
    rubric: {
      evidence: '较好的选择：同一商品连续多个窗口的销量，加上完整成本明细；只看单个商品页当前价格或凭感觉为差。',
      scope: '案例里有同一商品 9 月和 10 月两期整款销量，可以看方向，但只有两期，波动和季节因素仍未知；T2-E3 是子体层级销量，与整款层级不能直接比较。',
      uncertainty: '较好的回答指出具体未计入或未核实的项目（例如仓储费、税费、退货率、广告假设来源），并说出到哪里核实。笼统说“还要更多数据”只能得 1 分。'
    },
    truth: { preAd: 7, cac: 11.25, postAd: -4.25 }
  }
];

export function pickTransferCase(sessionPrice) {
  return TRANSFER_CASES.find((item) => item.price !== sessionPrice) ?? TRANSFER_CASES[0];
}
