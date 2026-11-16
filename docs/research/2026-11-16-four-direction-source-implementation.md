# Pickwise 四类专项数据源扩展
日期：2026-11-16（Asia/Taipei）

## 完成范围
用户已明确要求实现全部四个方向。保持现有工作区与真实/预制演示边界，新增来源进入采集、持久化、Agent 工具、五维报告、证据页面和 Markdown 导出。原有需要用户登录的评论 Actor 仍仅在 APIFY_REVIEWS_ENABLED=true 时启用。

| 方向 | 采用 Actor | 选择依据与实测 |
|---|---|---|
| 关键词备用 | pravus/amazon-keywords | 原 PlainRows 日限额触发后回退；支持反查与小批关键词量；本轮规范化 25 个词，相关性过滤保留 4 个品类词，其他品牌词不能进入需求结论 |
| 美国站评论正文 | junglee/amazon-reviews-scraper；jdtpnjtp/amazon-reviews 备用 | 前五个轻量候选对该 ASIN 没有公开正文；Junglee 实际成功返回 8 条，再次整合验收返回 10 条，均有美国地区、日期、星级与验证购买信息 |
| Buy Box / 卖家报价 | cleanpull/amazon-product-scraper | 单次读取目标商品及最多 10 条报价，实得 8 条报价、6 个可识别卖家；保留新品/二手、FBA/FBM、运费未知和 Buy Box 状态 |
| 细分类目榜单 | topapi/amazon-bestsellers-scraper | 使用目标 BSR 中实际细分类目链接，返回 10 个畅销榜与 10 个新品榜商品；请求 Movers 但该类目本轮未返回，不补造 |

## 候选比较
候选元数据与输入 schema 已保存到 data/verification/actor-expansion-2026-11-16/candidates.json；额外评论候选 schema 另存。
- Pravus 在当前 Free 套餐真实返回了关键词数据；DoesAIKnow 的批次固定费用更高，Memo23 反查也有更高的单次费用，因此没有设为默认。
- Jdtp 常规/精选回退都返回空；Memo23 只返回商品概要而无美国正文；CleanPull 显示 reviewsNeedSignIn；Epctex 与 API Vault 也为空。未把这些结果包装成评论正文。
- Junglee 是本轮验证成功的评论主源。严格请求 amazon.com，保留 reviewDescription、ratingScore、date、isVerified、variant 等真实字段；不保留作者账户 ID 或个人资料链接。
- Keepa offers 也有数据，但当前 CleanPull 直接页面报价与卖家名称更便于展示；既有 Keepa 历史数据继续保留，用于另一种来源与时间口径。
- TopAPI 小样本成功、按榜单行计费且支持多个榜单类型；Junglee Bestsellers 与 Jaybird 也完成 schema/价格比较，但未盲目全部接入造成重复收费。

## 调用与预算
- 仍共享两条 Apify 运行槽，避免 Free 账号五并发限制。
- 关键词反查 cap $0.07，提示词量批次 cap $0.05；Jdtp 备用评论 cap $0.03，CleanPull cap $0.02，TopAPI cap $0.02。
- Junglee 要求最大单次运行预算至少 $0.50，否则 API 返回 max-total-charge-usd-below-minimum。生产请求最多 10 条评论；实际 8 条费用 $0.048、10 条费用 $0.06。$0.50 是运行预算门槛，不是每次固定收费。
- 没有升级 Apify 套餐、充值或更改付款方式。最近核对累计 Apify 用量约 $1.2784，月使用上限字段为 $10；模型费用是另一个服务的费用，未混为该数。
- 无结果会短暂缓存十分钟，正常结果沿用原有日缓存；手动重试也不会无限循环追加费用。

## 接入位置
- server/market-expansion.js：Actor 注册与纯规范化；关键词位置、评论站点、报价条件、榜单对照。
- server/research-sources.js：主关键词失败/限额回退；公开评论主备；报价与榜单采集，缓存与逐源失败状态。
- server/business-evidence.js：最新批次聚合与覆盖；相同关键词规范化去重，不把多 Actor 估算相加。
- server/agent/tools.js：inspect_market、研究覆盖工具及单条证据提供新材料。
- server/agent/prompts.js：评论样本、不同条件报价、榜单和估算的解释边界。
- server/agent/pipeline.js、runner.js：最终总结只传代表性材料；完整数字仍进入溯源校验。JSON 截断时使用精简材料重试一次，仍为 10000 tokens，不提高输出上限。失败尝试的 usage 也会计入。
- src/ui/market-evidence.js：评论、报价、三类榜单面板；新增“用新数据源重新分析”入口，复用真实 research/fresh 操作。
- server/market-export.js：完整评论样本、报价与榜单进入 Markdown。

## 验收结果
- 完整适配器真实调用：25 个关键词估算、10 条美国站评论、8 条报价、两类榜单各 10 个商品；HTTP failed 来源为零。
- 评论样本日期为 2026-11-11 至 2026-11-13；用户账号没有提供 Amazon 登录凭证。所有来源都保留取得时间与来源。
- Agent 真机验收明确包含实际评论原文、market_offers、category_rankings、Pravus 关键词来源。压缩材料后一次模型调用完成新版报告，fallback=false，仍使用 10000 token 上限。
- 初次大材料验收确实遇到 finishReason=length，已修复为代表性总结材料与精简重试；未用兜底报告冒充真机成功。
- 全量测试 144/144 通过。覆盖站点过滤、评论字段与去重、隐私字段舍弃、广告/自然位分离、新旧商品条件、未知运费/履约、Buy Box 受抑制、首次榜单无涨跌、同类目后续变化、缓存、工具/UI/导出链路、输出截断恢复。
- 桌面与 390px 手机浏览器验证；显示前八条评论、完整十条可导出，三个新面板齐全，控制台无错误，页面无横向溢出。

## 使用与边界
- 新建真实分析自动使用新来源；旧报告不后台批量重采。证据页提供“用新数据源重新分析”，触发真实接口与模型。
- APIFY_NO_LOGIN_REVIEWS_ENABLED 默认为 true，可设 false 关闭新评论采集；APIFY_REVIEWS_ENABLED 仅显式 true 才启用旧登录型 Actor。
- 评论是商品/变体样本，不能推总体差评率与退货率；站点与评论地区、变体均保留。其他站点不冒充美国站。
- 源声明总报价数与已观察卖家数分开；二手价格不放入新品价差。未知运费不补零，受抑制的 Buy Box 不套普通商品价。
- Movers 本轮无数据；首次没有旧快照时不显示涨跌。后续只比较真实采样的同细分类目与榜单，不把上次样本没有的商品称为新品。
- 新数据丰富证据，不等于已证明订单需求、利润、品牌授权或合规。仍可能因来源额度、网站变化而返回明确缺口。

## 本机验收证据
- data/verification/actor-expansion-2026-11-16/integrated-final.json
- data/verification/actor-expansion-2026-11-16/agent-final.json
- data/verification/actor-expansion-2026-11-16/report-final.md
- data/verification/actor-expansion-2026-11-16/usage-and-review-runs.json

## Actor 官方资料
- https://apify.com/pravus/amazon-keywords
- https://apify.com/junglee/amazon-reviews-scraper
- https://apify.com/jdtpnjtp/amazon-reviews
- https://apify.com/cleanpull/amazon-product-scraper
- https://apify.com/topapi/amazon-bestsellers-scraper
