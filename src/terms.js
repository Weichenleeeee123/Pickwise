export const TEACHING_TERMS = [
  { key: 'asin', label: 'ASIN', definition: 'Amazon 目录中识别商品或具体规格的编号。', matches: ['asin'] },
  { key: 'bsr', label: 'BSR', definition: 'Best Sellers Rank，表示商品在所选类目中的相对排名，不是销量单位。', matches: ['bsr', 'bestseller_rank', 'best seller rank'] },
  { key: 'fba', label: 'FBA', definition: 'Fulfillment by Amazon，由 Amazon 仓储、拣货、配送并处理部分售后。', matches: ['fba', 'fulfillment by amazon', 'amazon_fee'] },
  { key: 'fbm', label: 'FBM', definition: 'Fulfilled by Merchant，由卖家自行或委托第三方履约。', matches: ['fbm', 'fulfilled by merchant'] },
  { key: 'buy_box', label: 'Buy Box', definition: '商品详情页的主要购买入口及其当前报价，不代表全部卖家都能获得该位置。', matches: ['buy box', 'buybox'] },
  { key: 'moq', label: 'MOQ', definition: 'Minimum Order Quantity，供应商要求的最低采购数量。', matches: ['moq', 'minimumorder', 'minimum order', '起订量'] },
  { key: 'cpc', label: 'CPC', definition: 'Cost Per Click，广告每次点击的平均费用。', matches: ['cpc', 'cost per click'] },
  { key: 'cvr', label: 'CVR', definition: 'Conversion Rate，点击或访问后完成目标动作的比例；具体分母取决于报表口径。', matches: ['cvr', 'conversion rate', '转化率'] },
  { key: 'cac', label: 'CAC', definition: 'Customer Acquisition Cost，取得一位客户或一笔订单的获客成本；本报告会注明计算口径。', matches: ['cac', 'acquisitioncost', '获客成本'] },
  { key: 'acos', label: 'ACOS', definition: '广告花费占广告销售额的比例，不等于广告后净利润率。', matches: ['acos', 'break_even_acos'] },
  { key: 'gtin', label: 'GTIN', definition: '全球贸易项目代码，可用于识别商品；不同市场和商品类型的编码规则不同。', matches: ['gtin', 'upc', 'ean'] },
  { key: 'parent_child', label: '父体/子体', definition: 'Amazon 变体关系中的父商品与具体可购买变体；同父体数据可能重复描述整款表现。', matches: ['parentasin', 'parent_asin', '父体', '子体'] },
  { key: 'sales_estimate', label: '销量估算', definition: '数据商根据可见信号推算的销售量，不是卖家后台订单记录。', matches: ['sales_estimate', 'monthly_sales_estimate', 'estimated_monthly_sales', '销量估算'] },
  { key: 'search_volume', label: '搜索量', definition: '某个词在指定来源和周期内的搜索次数估计，不等于购买量或该商品的销量。', matches: ['monthly_searches', 'search volume', '搜索量'] },
  { key: 'google_trends', label: 'Google Trends', definition: 'Google 搜索关注度的相对指数，不能直接解释为 Amazon 搜索量或销量。', matches: ['google trends', 'search_interest', 'trends'] },
  { key: 'bsr_drops', label: 'BSR drops', definition: '排名变化次数的第三方信号，可表示销售活跃度线索，但不等于订单件数。', matches: ['salesrankdrops', 'bsr drops', 'rank drops'] },
  { key: 'unit_contribution', label: '单件贡献', definition: '按已列成本计算的每件余额；不自动包含未提供的费用，也不等于企业净利润。', matches: ['postadcontribution', 'preadcontribution', '单件贡献'] },
  { key: 'break_even_cvr', label: '保本转化率', definition: '在当前价格、成本和点击成本假设下，使广告后单件贡献为零的转化率门槛。', matches: ['breakevencvr', '保本转化率'] },
  { key: 'landed_cost', label: '到岸成本', definition: '商品到达指定地点前的采购、运输、关税等成本；是否包含其他费用取决于明确口径。', matches: ['landed cost', '到岸成本', 'logisticscost'] },
  { key: 'referral_fee', label: 'Referral Fee', definition: 'Amazon 按类目与销售额收取的销售佣金，费率需以当前账户和商品条件核实。', matches: ['referral fee', 'referral_fee', 'commission'] },
  { key: 'organic_rank', label: '自然搜索排名', definition: '未标记为广告的搜索结果位置，是特定关键词和采集时点的快照。', matches: ['organicposition', 'search_rank', '自然搜索排名'] }
];

export const TEACHING_TERM_BY_KEY = Object.fromEntries(TEACHING_TERMS.map((term) => [term.key, term]));

export function termsForContext(values) {
  const corpus = (Array.isArray(values) ? values : [values]).map((value) => String(value ?? '')).join('\n').toLowerCase();
  return TEACHING_TERMS.filter((term) => term.matches.some((pattern) => corpus.includes(pattern.toLowerCase())));
}
