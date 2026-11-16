# Pickwise

[在线体验](https://pickwise.icu/) · [完整演示](https://pickwise.icu/?demo=1&page=report) · [公开材料](https://pickwise.icu/materials/)

Pickwise 是为电商 OPC 主理人打造的选品 Agent，承担选品数字员工的工作，并将教学嵌入真实选品的分析过程和结果，形成 AI 选品教练的差异化体验。它一方面完成调研、数据分析、成本计算与报告交付，另一方面解释应该看哪些数据、为什么看、怎样形成判断，帮助新手主理人在一次次选品中积累判断商品价值的方法。当前首版聚焦 Amazon 美国站候选商品分析，提供中文工作台。

入口只有一个输入框；提交后，Agent 自主完成六步拆解（商品识别、需求证据、竞品比较、利润与资金、风险核验、教学总结），每步边做边讲：为什么查、查到了什么、这个数怎么读、常见误读。分析结束后给出五维结论、初判对照、可调整的成本情景、两个教学节点练习、一道迁移练习，以及三项可下载的交付成果。

Expo 与路演统一口径见 [项目定位与表达口径](docs/2026-11-16-project-positioning.md)。

详见 `docs/Pickwise_PRD.md`。

## 架构

- 前端是纯 ES 模块（`src/ui/`），不依赖构建工具，直接由内置静态服务器提供。
- 后端（`server/`）是一个 Node 原生 HTTP 服务：会话按文件持久化在 `data/sessions/`（JSON，一个会话一个文件），拆解步骤、教学节点选择、五维结论、练习反馈都由真实模型调用生成。
- `src/domain.js`、`src/diagnosis.js`、`server/calc.js` 是确定性代码：单件贡献利润、预算比较、销量口径诊断（父体重复、层级混用、窗口不一致）全部由程序计算，模型只负责解释，不决定数字。
- `server/guard.js` 做数字溯源校验：模型输出文字里的每个数字都必须能在工具返回的事实材料里找到，查不到就会被拒绝重新生成；同时拦截“稳赚”“蓝海”一类没有依据的断言。
- 教学节点的第二个选项（N1 数据口径 / N2 需求证据）由模型依据当前商品数据里实际出现的问题选择，范围由 `src/diagnosis.js` 的诊断结果限定，不是固定模板也不是凭用户的回答推断。

## 本机运行

依赖：Node.js 20 及以上。

```sh
cp .env.example .env   # 填写 LLM_PROVIDER / LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
npm test
npm run dev
```

要启用 Amazon 实时数据，推荐在 `.env` 中填写 Apify 的 `APIFY_API_TOKEN`。ASIN 输入会拉取目标商品完整详情、按最具体 BSR 子类目搜索最多 20 个候选，按可比性排序后为最多三个候选补抓完整详情；若目标 ASIN 未出现在类目搜索结果中，再用最多 5 条的标题搜索尝试补它的页面购买信号。字段按 Actor 实际响应采集，包括价格、折扣、评分/星级分布、评论摘要/问答数、BSR、自然与广告搜索位、近月购买页面信号、库存、最多 3 条卖家报价、最低报价、配送/履约、商品规格、变体、商品图片链接及 A+ / 品牌内容标记。近月购买信号不是订单销量历史；搜索结果位和总结果数也不是关键词搜索量。相同查询最近 6 小时的证据跨会话复用；每个 Apify Actor 调用设 `$0.05` 上限，单个 ASIN 商品采集通常至多四个逻辑调用（不含网络重试和专项 Actor）。Actor 按商品、报价等事件计费，卖家档案抓取保持关闭；价格、免费额度和实际用量以 [Actor 当前费用表](https://apify.com/api_creators/amazon-product-scraper) 与 Apify 账单为准。历史快照除查询采集外可按有次数上限的监控计划日更，服务停止时不执行，不能回填历史；采购、物流、广告成本仍由用户输入或导入。

打开 `http://127.0.0.1:4173`。密钥只保存在服务端环境变量里，不会进入浏览器或导出文件。未配置模型时仍可打开 `?demo=1&page=report` 体验完整预制报告及本地演示对话；实时分析需要配置模型和数据源。

## 证据导入

支持 UTF-8 CSV 或 JSON（最大 5 MB、最多 2,000 条记录）。JSON 可以是数组，或包含 `products` 数组的对象。必需字段：`marketplace`（仅支持美国站）、`asin`、`title`、`source_name`、`observed_at`。

月销估算只有在同时具备 `sales_scope`（`parent` / `child` / `listing`）和 `period_start` / `period_end` 时才会计入可用样本。同一父体同一窗口的重复估算会被保留以供查看，但只计入一次。这项结构检查只核对字段完整性，不验证来源、授权或数值真实性。

## 测试

```sh
npm test
```

`test/domain.test.js` 覆盖确定性计算；`test/server.test.js` 用一个脚本化的假模型（`test-support/fake-llm.js`）跑通整条流水线，覆盖数字溯源护栏、教学节点范围约束、初判对照的时序边界、成本调整的重算排队、评分的确定性核验等场景。假模型只用于测试，不代表真实模型输出的质量。

## 真实业务证据补充（2026-11-15）

- 市场现价与目标售价分开。没有目标售价不自动用现价算利润，模型不能自行补成本生成情景。
- 复用 APIFY_API_TOKEN 接入 plainrows/amazon-keyword-research，反查最多 20 个词，必要时补相关词；按标题和类目过滤不相关词，明确标为供应商估算，保留排名日期。
- plainrows/google-trends-explorer 取得美国过去五年的完整周期相对关注度；程序比较完整年份重复峰值和近期均值。指数不是 Amazon 搜索量或销量，不跨独立查询混用指数。
- k-data-lab/amazon-reviews-scraper 最多取得 20 条近期评论，读取真实运行摘要。amazon.com 需要在 Apify 该 Actor 的 Login 模式登录一次买家账号；不在 Pickwise 输入账号密码。未登录明确显示 NEEDS_LOGIN，近期样本不能推算差评率与退货率。
- 新建真实 ASIN 默认每 24 小时采样一次、最多 7 次，含失败尝试；仅服务运行时执行，不补造过去记录。结果页可暂停或立即采样；每次只采目标详情，单次上限 $0.05。
- 官方来源为 CPSC 召回 API、CPSC 产品安全教育和 USPTO 商标检索说明正文。品牌候选不等于目标被召回；通用政策不是目标认证；登录壳与错误页不视为已核验政策。
- 竞品按父体、用途、价格币种、品牌和共同规格筛选后优先补详情；缺规格保持 uncertain。
- 启动现金包含采购、头程、关税、包装、广告、仓储、检测、固定支出和现金缓冲；另列生产运输、库存与回款天数。单件成本与整批现金支出分别建模，需核对物流分工避免重复。
- 页面、智能体和 Markdown 使用相同证据与失败状态，结构化模型调用保持 maxTokens=10000。
- 自动取得的额外数据还包括：ASIN 周级购买量/访问量/BSR/报价历史、Amazon 包装尺寸和 FBA 费档、单 ASIN 销量估算、Amazon 自动补全词、Alibaba 公共货盘价格阶梯与 MOQ、1688 货源候选、供应商 Verified/Trade Assurance 标记。它们进入 Agent 工具、结果页和 Markdown，并保留 estimate 性质和来源失败状态。
- 本机实际验证过 Easyparser 周历史接口返回 13 周记录、包装尺寸返回 1 条、Vant 对该鞋类返回免费 NOTE（无已校准估算）、Alibaba 返回 5 条公开货源。1688 免费预览本次暂时不可用；接口失败会显示，不回退到虚构数据。Amazon Price History 需要至少 `$0.25` run cap，当前不默认调用。

### 经营数据导入

调整条件支持 USD 报价 JSON，必需 type=quotes、source=实际报价单来源、date=YYYY-MM-DD、currency=USD，以及至少一个实际成本字段。values 支持 price、goodsCost、logisticsCost、platformCost、returnsCost、otherCost、cpc、cvr。launch 支持 freight、duty、prep、advertising、storage、compliance、fixed、reserve、leadDays、inventoryDays、payoutDays，可另带 moq。报价保留用户来源和日期，未独立核实，不是未来实际成本保证。

广告 CSV 列：Date,Advertised ASIN,Spend,Clicks,Purchases,Currency。按目标 ASIN 合计花费/点击与订单/点击；零转化保留 CPC，CVR 不用于正转化模型。

销量 CSV 列：Date,Child ASIN,Units Ordered,Ordered Product Sales,Currency。保留逐日子体件数，不转写月销估算。两类报表均需 USD 和 YYYY-MM-DD 日期，不混合不同粒度合计或归因窗口。

### 真实验证与费用

用户本次选择跳过 Amazon 评论登录，服务端已设置 APIFY_REVIEWS_ENABLED=false；不再为评论空结果反复付费。需要时完成 Actor 登录后改 true 并重启。模型上下文只传必要证据摘要与程序统计，完整原始证据仍保存在会话和导出。结构化输出预算 10000 tokens，单次请求超时 120 秒；JSON 参数损坏会明确记录并精简重试一次，失败仍如实显示，不当作成功。

npm test 运行离线回归。node scripts/verify-live.mjs [ASIN] 使用真实商品源、专项 Actor、官方来源和模型，报告保存在忽略提交的 data/verification/。真实验证产生数据源与模型费用。专项 Actor 每次上限 $0.10；任务最多两次关键词、一条趋势、一条评论。商品 Actor 每次 $0.05，网络重试可能另起运行，实际费用依账单。Actor 免费与每日额度限制会显示，不当作市场无需求。

## 当前限制

- Amazon 实时商品数据由可选的 Apify 接入提供，DataForSEO 作为回退；Amazon 页面展示的近月购买信号不等于月销量历史。支持服务运行期间有次数上限的日采样，不回填历史。搜索需求可以做有限判断；未提供销量时不声称订单需求已证实。
- 历史列表与匿名浏览器凭据保存在当前浏览器 localStorage；不跨设备同步，清除网站数据后无法恢复访问。后台任务、原始证据和完整报告继续由服务端持久化，并按浏览器凭据隔离读写、导出与缓存。没有账号体系或跨设备恢复能力。
- 风险核验包含真实 CPSC 召回检索与官方指引，仍不构成全面合规、认证、授权或法律结论。
- 模型费用未核算；DataForSEO 返回的实际 API 费用会显示在会话数据来源区。
- 不预测未来销量、利润或成功概率。

## 前端工作区与预览
运行 npm run preview 会在 4188 启动与 npm run dev 相同的真实后端，读取本机 .env 与 data/sessions；不是空的静态预览服务。可通过 PORT 覆盖端口。不要同时启动多个进程读写同一个会话目录。
预制演示使用 ?demo=1，页面持续标注预制数据，不调用模型或采集服务。退出演示回到当前服务的真实接口；模型和数据源是否配置，以当前服务的 /api/config 为准。
外部服务的额度、付费和登录失败会保留为证据缺口。configured 只代表配置存在，不代表每次调用都成功。

## 四类专项数据源

真实分析已增加 Pravus 关键词备用、Junglee 美国站评论（Jdtp 备用）、CleanPull Buy Box/报价、TopAPI 细分类目榜单。来源同时进入 Agent、证据页和 Markdown。已保存的旧报告不自动产生采集费用；证据页可点击“用新数据源重新分析”。

免登录评论由 APIFY_NO_LOGIN_REVIEWS_ENABLED 控制，默认开启；旧登录型 Actor 仅 APIFY_REVIEWS_ENABLED=true 时启用。Junglee 要求单次最大预算至少 $0.50，本实现最多取 10 条，实测费用 $0.06；价格以 Actor 当前规则为准。每次调用仍有单独上限，所有采集共享两个运行槽。

Movers 空榜如实显示；首次没有历史快照时不推算排名涨跌。评论保留站点、地区、日期、变体及验证购买标记，不用样本推总体差评率或退货率。实现与验收细节见 docs/research/2026-11-16-four-direction-source-implementation.md。

## 报告与 AI 教练

演示与实时分析使用相同的报告结构：当前建议、成本与资金摘要、五维判断、执行计划和下载报告。每维包含具体解读，展开后可核对该版来源记录、完整历史表格、政策原文与成本输入；未知项不补造，旧版资料不会混入新参数。

右下角纸箱教练支持选文引用、预设问题、普通提问和连续追问。实时模式使用当前报告与同一任务的对话上下文；演示模式使用明确标注的本地预制回答。报告更新后，旧回答会保留对应版本提示。

公开仓库只发布当前代码快照；本机密钥、会话、浏览器缓存、生成材料和包含这些产物的早期本地历史不随仓库发布。Node.js 22 下运行 `npm test`；推送和 Pull Request 会自动运行相同测试。
