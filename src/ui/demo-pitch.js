import { esc } from './common.js';

export const PITCH_QUESTIONS = [
  {key:'product',label:'一句话介绍 Pickwise',question:'请介绍一下 Pickwise 为谁解决什么问题，以及它的产品价值。'},
  {key:'difference',label:'和普通聊天有什么不同？',question:'Pickwise 的工作闭环和内嵌教学有什么不同，具体体现在哪里？'},
  {key:'pricing',label:'计划怎么收费？',question:'Pickwise 计划如何收费，现在验证到什么阶段？'}
];

export const PITCH_ANSWERS = {
  product:'Pickwise 是给新手电商一人公司主理人的选品数字员工，对外叫 AI 选品教练。你给一个候选商品，它会围绕 Amazon 美国站完成识别、需求研究、竞品比较、利润与资金测算、风险核验和报告交付。\n\n它同时把教学嵌在这次工作里：解释为什么查、数字怎么读，让你调整经营参数、引用证据追问并练习方法。当前这次得到研究成果，下一次更知道该怎么判断，这是产品希望持续提供的双重价值。',
  difference:'差异主要体现在可以核对的工作闭环。Pickwise 将一个候选商品拆成研究任务，连接数据来源，保留商品、评论、报价和历史的原始字段；费用、获客成本、启动资金由程序计算，最后交付五维判断与行动计划。\n\n教学也围绕同一个商品展开：在报告里解释口径，在测算中检验参数，再通过选文对话和小题理解为什么结论会改变。实时模式还提供换商品的迁移练习。办公室是这条工作流程的可视化，真正需要检查的是其后的证据和计算。',
  pricing:'计划按候选商品研究项目收费：单项目 ¥49、三项目包 ¥129，包含项目内关联竞品分析和嵌入式教学。这是待验证的测试方案，当前网页没有收款；补资料、重算和追问的权益范围应在付费前说明。\n\n目前已实现研究、证据、测算、报告和教学流程，并做过实际数据源与真实模型链路验证。付费意愿、持续复购和真实学习迁移效果还需要目标卖家试用验证。后续再根据使用频率探索含额度订阅。'
};

export function renderDemoPitch() {
  return `<section class="demo-pitch" aria-labelledby="demo-pitch-title">
    <header class="pitch-hero"><div class="pitch-hero-copy"><span class="eyebrow">PICKWISE / 给新手电商一人公司（OPC）主理人的数字员工</span><h2 id="demo-pitch-title">把选品研究交给 AI，<br>把判断方法留给主理人。</h2><p class="pitch-lead">一个人经营电商，选品往往既缺研究人手，也缺判断经验。Pickwise 帮你查数据、比竞品、算经营账，交付有依据的建议；也在同一次研究中，让你看懂为什么。</p><div class="pitch-hero-actions"><button class="btn primary" data-action="demo-tour-start">开始 3 分钟自助体验 →</button><button class="btn" data-action="demo-pitch-story">先看 60 秒产品介绍 ↓</button></div><p class="pitch-entry-note">约 3 分钟自助体验 · 无需讲解员。往下看介绍，或让右下角的纸箱教练陪你体验。</p></div><aside class="pitch-hero-aside"><img src="/assets/brand/pickwise-icon.svg" alt="Pickwise 纸箱选品教练" width="142" height="142"><span class="pitch-brand-line">选得聪明，不是选得快。</span><div class="pitch-two-values"><div><small>这一次</small><b>交付商品研究</b><span>证据、计算、判断与行动</span></div><div><small>下一次</small><b>带走判断方法</b><span>知道看什么，也知道为什么</span></div></div></aside></header>
    <section class="pitch-section" id="pitch-story" aria-labelledby="pitch-problem-title"><div class="pitch-section-heading"><span class="eyebrow">01 / 为什么做</span><h3 id="pitch-problem-title">缺的不是又一份数据，<br>而是把数据变成决策的工作。</h3></div><div class="pitch-problem-grid">${[
      ['研究没人做','商品页、榜单、评论与货源分散，一个人要收集、对齐，再整理成能用的判断。'],
      ['数字看不懂','搜索量、销量估算、父子变体和真实订单口径不同；看见热度，不等于找到自己的机会。'],
      ['利润算不全','采购价之外，还有物流、平台费、退货、广告和启动现金；漏一项，结论就可能改变。']
    ].map(([title,text],i)=>`<article><span>0${i+1}</span><h4>${title}</h4><p>${text}</p></article>`).join('')}</div></section>
    <section class="pitch-section pitch-work" aria-labelledby="pitch-work-title"><div class="pitch-section-heading"><span class="eyebrow">02 / 数字员工怎样工作</span><h3 id="pitch-work-title">给一个候选商品，<br>让研究形成可用交付。</h3></div><div class="pitch-work-flow"><div><small>你给输入</small><b>商品名称 / ASIN / 链接</b><p>首版支持 Amazon 美国站。经营成本和预算由主理人按实际情况补充。</p></div><span aria-hidden="true">→</span><div><small>Agent 执行</small><b>识别 · 需求 · 竞品 · 利润 · 风险</b><p>按任务分工连接实际来源，核对可比性，由程序计算经营条件。</p></div><span aria-hidden="true">→</span><div><small>你拿到交付</small><b>五维报告 + 下一步计划</b><p>结论带依据，展开能核对原始记录；数据不足时写清缺什么、去哪里查。</p></div></div><button class="pitch-text-action" data-action="demo-tour-start">去办公室，看一次完整协作 ↗</button></section>
    <section class="pitch-section" aria-labelledby="pitch-difference-title"><div class="pitch-section-heading"><span class="eyebrow">03 / 为什么叫教练</span><h3 id="pitch-difference-title">先替你把工作做完，<br>再把“为什么”讲明白。</h3><p>教学在商品研究的过程与结果中发生。练习可选，跳过也能得到报告。</p></div><div class="pitch-difference-grid">${[
      ['可追溯的研究','判断旁保留证据编号、来源、统计窗口和原始字段，能沿着结论回头核对。','证据不是一句“根据分析”。'],
      ['可复算的经营账','利润、CAC、保本转化率与启动资金由程序计算；你改条件，结果随之变化。','知道这个结论在什么条件下成立。'],
      ['在现场的解释','报告里的段落可以直接引用问箱子教练；解释围绕当前商品与当前版本展开。','疑问不必离开这次研究。'],
      ['可继续练的方法','当前商品做小题，实时流程还可换商品练习，记录选择、提示和反馈。','目标是逐步独立判断，效果仍需验证。']
    ].map(([title,text,note])=>`<article><h4>${title}</h4><p>${text}</p><small>${note}</small></article>`).join('')}</div></section>
    <section class="pitch-section pitch-case" aria-labelledby="pitch-case-title"><div><span class="eyebrow">04 / 亲手体验一个判断</span><h3 id="pitch-case-title">有 5,000 USD，<br>要不要做这款厨房置物架？</h3><p>完整虚构案例把同一个商品贯穿到底：先看为什么建议首批 120 件，再把转化率从 12% 改成 6%，亲眼看单件贡献从 $4.70 降到 $0.70。</p><p class="pitch-case-question">如果结论会随经营条件改变，你希望工具只给一个答案，还是也让你理解条件？</p><button class="btn primary" data-action="demo-tour-start">带着这个问题，开始体验 →</button></div><div class="pitch-case-proof"><div><span>基准 CVR 12%</span><strong>$4.70<small>/ 件</small></strong></div><span aria-hidden="true">↓</span><div><span>情景 CVR 6%</span><strong>$0.70<small>/ 件</small></strong></div><p>模拟广告后贡献 · 程序计算<br>不是销量预测或企业净利润</p></div></section>
    <section class="pitch-section pitch-progress" aria-labelledby="pitch-progress-title"><div class="pitch-section-heading"><span class="eyebrow">05 / 已经做到哪一步</span><h3 id="pitch-progress-title">工作闭环已实现，<br>接下来交给目标用户验证。</h3></div><div class="pitch-status-grid"><div><span class="tag green">已经实现</span><p>商品研究、来源记录、成本测算、报告、教练对话与练习，已完成实际数据源和真实模型链路验证。</p><p>现场体验采用本地预制案例，无需等待外部服务；模拟数据与实时研究明确区分。</p></div><div><span class="tag gray">下一步验证</span><p>邀请有实际候选商品的新手电商主理人试用，验证报告是否可用、是否愿意付费，以及换商品后能否独立运用方法。</p><p>当前不以演示小题答对来证明学习能力提升，也不以试用计划代替已有商业成绩。</p></div></div></section>
    <section class="pitch-section pitch-business" aria-labelledby="pitch-business-title"><div><span class="eyebrow">06 / 如何成为一门生意</span><h3 id="pitch-business-title">按候选商品研究项目收费，<br>教学包含在交付中。</h3><p>每次付费对应一项具体工作：研究一个候选商品，形成关联竞品分析、测算与报告。主理人熟悉方法后，重复调研和新商品研究仍可继续委托给数字员工。</p></div><div class="pitch-prices"><div><span>单项目</span><b>¥49</b></div><div><span>三项目包</span><b>¥129</b></div><p>待验证测试价 · 当前未开通收款<br>重算、补资料与追问的权益范围付费前明示；后续根据使用频率探索含额度订阅。</p></div></section>
    <section class="pitch-section pitch-faq" aria-labelledby="pitch-faq-title"><div class="pitch-section-heading"><span class="eyebrow">评委可能还想知道</span><h3 id="pitch-faq-title">创作者不在，<br>这里也能继续问。</h3></div>${[
      ['这和“解释一份报告”有什么不同？','产品把实际研究、来源核对、程序测算和成果交付串成工作闭环；再用同商品的条件重算、选文追问及练习，把方法嵌在任务中。教学机制已经实现，真实迁移效果仍需用户验证。'],
      ['主理人学会了，还会继续用吗？','学习解决判断经验，Agent 承担持续需要执行的调研、整理与计算。商品和市场会变化，重复工作仍在；是否形成持续付费和复购，是下一步需要验证的商业假设。'],
      ['AI 做到哪里，人负责哪里？','AI 研究公开可得证据、整理比较、按输入计算并提出建议；主理人提供私有成本，复核授权、合规与供货条件，最终决定采购和投入。'],
      ['现场演示是不是实时生成？','现场自助体验是完整虚构案例和本地预制对话，协作动画为回放；实时模式连接实际来源与已配置模型。这样评委可以稳定体验流程，同时清楚每一项数据的性质。']
    ].map(([q,a],i)=>`<details data-disclosure-key="pitch-faq-${i}"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}<button class="pitch-text-action" data-action="demo-pitch-coach">让箱子教练介绍产品、差异和收费 ↗</button></section>
    <footer class="pitch-close"><img src="/assets/brand/pickwise-icon.svg" alt="" width="66" height="66"><h3>这一次，完成有依据的选品。<br>下一次，更知道该怎样判断。</h3><p>Pickwise · 选得聪明，不是选得快。</p><div class="pitch-hero-actions"><button class="btn primary" data-action="demo-tour-start">现在开始自助体验 →</button><button class="btn" data-action="demo-tour-free">我想自由探索</button><a class="btn" href="https://pickwise.icu/materials/pitch-preview.pdf" target="_blank" rel="noopener noreferrer">查看路演材料 ↗</a></div><div class="pitch-materials"><a href="https://pickwise.icu/materials/business-model-and-role.pdf" target="_blank" rel="noopener noreferrer">商业模式与岗位说明</a><a href="https://pickwise.icu/materials/unit-economics.pdf" target="_blank" rel="noopener noreferrer">单位经济账单与测算</a></div></footer>
  </section>`;
}
