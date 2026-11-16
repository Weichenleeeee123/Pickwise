# Pickwise Apify 费用、限制与数据源建议
日期：2026-11-16（Asia/Taipei）

## 结论
账户总使用额度没有触顶。此前将 HTTP 402 与 Actor 返回的日限额统称为余额/额度不足，表述过于笼统。
只读账户查询：本轮开始时累计使用 $0.841170873；月使用上限字段为 $10，套餐标识为 FREE。API 的 maxMonthlyUsageUsd 是上限，不是余额或活动赠款明细；本轮没有修改套餐、充值或付款方式。
本轮小额复测后：{"checkedAt":"2026-11-15T17:24:39.472Z","plan":"FREE","monthlyUsageUsd":0.908605137999407,"monthlyUsageCapUsd":10,"maxConcurrentRuns":5,"activeRuns":0}

## 分开看待三类限制与一个接入缺陷
1. PlainRows 关键词 Actor 返回 found=false、notFoundReason=free-plan-daily-quota；历史运行费用为 0。其说明写明 Free 账号每日 5 次搜索，使用赠送余额并不会自动把账号变成付费套餐。
2. 账户最多并发 5 个 Actor，但现有专项采集使用 Promise.all 同时启动约 10 个 Actor，可能与主商品、其他会话争抢资源。Apify 官方客户端文档把 actor-memory-limit-exceeded 的 HTTP 402 列为瞬时资源错误。因此旧 402 不能直接解释为余额耗尽。旧错误正文被代码丢弃，无法逐条确定原来的 error.type。
3. 按原来的 $0.01/$0.02 调用上限串行复测，包装尺寸成功取回 1 条、Alibaba 成功取回 5 条。1688 本次 HTTP 201，但正文为 retry_later 与免费预览临时不可用，这属于该 Actor 的 Free 预览限制。
4. Keepa 的历史运行实际成功并计费 $0.011，返回 marketplace=us。代码只接受 US，导致已返回数据被误判无数据。

## 已做的最小修复
- server/apify-runtime.js：商品与专项采集共享两条运行槽，给账号其他操作留出空间。仅对明确的资源并发错误有界重试，不对余额、付费权限、普通 402 盲目重试。
- server/apify.js 与 server/research-sources.js：保留错误代码和错误正文摘要并脱敏；不再只剩 HTTP 状态码。
- Keepa 市场标识按大小写与美国站别名规范化，拒绝 UK 等其他站点；相应缓存版本升级。
- 未提高原有单次费用上限，未自动启用此前关闭的评论抓取。

## 修复后真实复测
在同一个 ASIN B0C2JXSHSK 上直接重跑现有专项采集，无模型调用。所有 HTTP 失败项为 0；这支持并发缺陷是原问题的重要因素，但不把已丢失正文的旧错误武断归因。
成功：官方来源、周级销量估算、Keepa、包装尺寸、Alibaba 货盘、自动补全；关键词日限额、Trends 无数据、1688 免费预览不可用继续原样展示。
恢复 Keepa Buy Box 价格点：92；评论数量历史点：11；费用与包装尺寸亦进入规范化结果。
测试：133/133 通过，新增并发上限、402 分类/脱敏、真实小写 marketplace 格式回归。

## 拓展建议
现有代码已经接入 1 个主商品 Actor 与 10 个专项 Actor。建议按证据缺口定向补充，保留每个来源的真实失败状态、站点、观察时间与估算性质。

| 优先级 | 数据能力 | 建议 |
|---|---|---|
| P0 | 价格、评论数量历史、费用、包装 | 优先用好本次恢复的 Keepa 与尺寸数据，无需再增加重复来源 |
| P1 | 关键词搜索量/反查 | 增加通过小样本验证的备用 Actor，确认其上游是否独立以及 Free 日限额；自动补全不能替代搜索量 |
| P1 | 无需登录的评论正文 | 评估 jdtpnjtp/amazon-reviews 或 memo23/amazon-reviews-scraper，以美国站、近期小样本为验收条件；部分免登录 Actor 会跨站回退，必须保留原始站点，不能混成美国评论 |
| P2 | Buy Box、卖家数量、FBA/FBM 与报价结构 | 先评估扩展已接入 Keepa 的 offers 能力或现有商品 Actor，避免为相同字段重复付费 |
| P2 | 类目榜单、新品榜与 Movers | 评估 junglee/amazon-bestsellers 等榜单 Actor，辅助竞争样本选择；榜单排名不是销量事实 |
| 后置 | 更多跨平台数据与货源图片检索 | 核心证据稳定后再评估，不把品牌商品的相似货盘视为同款、授权或采购依据 |

上述新 Actor 是候选而非已验证接入；本轮只修复现有接入，没有把候选能力描述为已经实现。

## 证据位置
- data/verification/apify-billing-2026-11-16/metadata.json：脱敏账户限制与 Actor 元数据。
- failed-request-details.json：按原上限逐个复测结果（此时两个来源已成功）。
- recent-runs.json 与 keepa-real-row.json：历史 Actor 运行与原始 Keepa 公开商品字段。
- limited-concurrency-live.json：修复后的真实专项采集与逐源状态。

## 官方参考
- https://apify.com/plainrows/amazon-keyword-research
- https://docs.apify.com/api/client/python/docs/concepts/retries
- https://docs.apify.com/platform/actors/running/actors-in-store
- https://apify.com/silentflow/keepa-scraper
- https://apify.com/memo23/amazon-reviews-scraper
- https://apify.com/jdtpnjtp/amazon-reviews
- https://apify.com/junglee/amazon-bestsellers
