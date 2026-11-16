import { completeReport } from './report.js';
import { constraintsHash } from './agent/pipeline.js';
import { TRANSFER_CASES } from './demo.js';
import { BUCKETS, DIMENSIONS } from './agent/templates.js';
import { NATURE_LABEL, dateTime, sourceModeLabel, windowLabel } from '../src/format.js';
import { computeEconomics, computeFunding, effectiveConstraints, missingLabels } from './calc.js';
import { latestAnalysis, learningOutcome, learningState } from './session.js';
import { businessMarkdown } from './business-export.js';
import { TEACHING_TERM_BY_KEY, termsForContext } from '../src/terms.js';

export const OUTCOME_TEXT = { independent_application: '本次已初步运用', assisted_completion: '提示后完成', needs_practice: '建议再练一次', unverified: '未验证' };
const SIGNAL = { positive: '偏正面', neutral: '中性', negative: '偏负面', insufficient: '证据不足' };

function dataMode(session) {
  const modes = new Set(session.evidence.map((record) => record.source_mode));
  if (!modes.size) return 'none';
  return modes.size > 1 ? 'mixed' : [...modes][0];
}

function nature(value) { return NATURE_LABEL[value] ?? value; }
function bullets(items) { return items.length ? items.map((item) => `- ${item}`).join('\n') : '- 无'; }

function hasProductSignals(record) {
  return typeof record.is_sponsored === 'boolean'
    || [record.amazon_choice, record.bestseller_badge, record.answered_questions, record.lowest_offer_price, record.stock_left,
      record.max_order_quantity, record.dimensions, record.weight, record.date_first_available, record.image_count,
      record.videos_count, record.important_information, record.price_range, record.product_overview?.length,
      record.search_rank, record.search_position, record.search_total_results, record.has_a_plus_content,
      record.has_brand_story, record.model_number, record.manufacturer, record.gtin, record.support,
      record.image_urls?.length, record.sustainability_features?.length]
      .some((value) => value !== null && value !== undefined && value !== false && value !== '');
}

function productSignal(record) {
  const facts = [];
  if (record.amazon_choice) facts.push("Amazon's Choice");
  if (record.bestseller_badge) facts.push(record.bestseller_badge);
  if (record.answered_questions !== null && record.answered_questions !== undefined) facts.push(`Answered questions ${record.answered_questions}`);
  if (record.lowest_offer_price !== null && record.lowest_offer_price !== undefined) facts.push(`最低报价 ${record.lowest_offer_currency ?? record.currency ?? 'USD'} ${record.lowest_offer_price}${record.lowest_offer_seller ? `（${record.lowest_offer_seller}）` : ''}`);
  if (record.price_range) facts.push(`变体售价范围 ${record.price_range.currency ?? record.currency ?? 'USD'} ${record.price_range.min ?? '未提供'} 至 ${record.price_range.max ?? '未提供'}`);
  if (record.stock_left) facts.push(`库存提示 ${record.stock_left}`);
  if (record.max_order_quantity !== null && record.max_order_quantity !== undefined) facts.push(`限购 ${record.max_order_quantity}`);
  if (record.search_rank !== null && record.search_rank !== undefined) facts.push(`自然搜索位 ${record.search_rank}`);
  if (record.search_position !== null && record.search_position !== undefined) facts.push(`搜索结果位 ${record.search_position}`);
  if (record.is_sponsored !== null && record.is_sponsored !== undefined) facts.push(`广告结果 ${record.is_sponsored ? '是' : '否'}`);
  if (record.search_total_results) facts.push(`结果总数 ${record.search_total_results}`);
  if (record.product_overview?.length) facts.push(`规格概览 ${record.product_overview.map((item) => `${item.key} ${item.value}`).join('；')}`);
  if (record.dimensions) facts.push(`尺寸 ${record.dimensions}`);
  if (record.weight) facts.push(`重量 ${record.weight}`);
  if (record.model_number) facts.push(`型号 ${record.model_number}`);
  if (record.manufacturer) facts.push(`制造商 ${record.manufacturer}`);
  if (record.gtin) facts.push(`GTIN ${record.gtin}`);
  if (record.date_first_available) facts.push(`首次上架 ${record.date_first_available}`);
  if (record.image_count !== null && record.image_count !== undefined) facts.push(`图片 ${record.image_count} 张`);
  if (record.image_urls?.length) facts.push(`图片链接 ${record.image_urls.slice(0, 4).join('；')}`);
  if (record.videos_count !== null && record.videos_count !== undefined) facts.push(`视频 ${record.videos_count} 个`);
  if (record.has_a_plus_content) facts.push('有 A+ 内容');
  if (record.has_brand_story) facts.push('有品牌故事');
  if (record.important_information) facts.push(`商品重要信息 ${record.important_information}`);
  if (record.support) facts.push(`商品支持 ${record.support}`);
  if (record.sustainability_features?.length) facts.push(`可持续属性 ${JSON.stringify(record.sustainability_features)}`);
  return `${record.title}（${record.asin}）｜${facts.join('｜')}`;
}

function constraintsSection(session) {
  const eff = effectiveConstraints(session);
  const lines = Object.entries(eff.values).map(([key, value]) => {
    const labels = { price: '预期售价', goodsCost: '单件采购成本', logisticsCost: '运输与履约成本', platformCost: '平台费用', returnsCost: '退货预留', otherCost: '其他变动成本', cpc: 'CPC', cvr: 'CVR' };
    const shown = value === null ? '未提供' : key === 'cvr' ? `${(value * 100).toFixed(2)}%` : `${value} USD`;
    const source = value === null ? '' : String(eff.sources[key]).startsWith('evidence:') ? `（来自证据 ${String(eff.sources[key]).slice(9)}，事实）` : '（用户提供或假设）';
    return `${labels[key]}：${shown}${source}`;
  });
  lines.push(`可用预算：${eff.budget === null ? '未提供' : `${eff.budget} USD`}`);
  lines.push(`起订量：${eff.moq === null ? '未提供' : `${eff.moq} 件`}`);
  if (eff.fxNote) lines.push(eff.fxNote);
  if (eff.fxMissing) lines.push('采购价币种不是 USD 且缺少带来源与日期的汇率，未参与计算');
  return bullets(lines);
}

export function analysisMarkdown(session) {
  const analysis = latestAnalysis(session);
  const title = `# ${session.product.name} · 选品分析报告`;
  const head = [
    `- 商品：${session.product.name}（ASIN：${session.targetAsin ?? '待识别'}）`,
    `- 市场：Amazon 美国站`,
    `- 数据模式：${sourceModeLabel(dataMode(session))}${session.demo ? '（教学模拟，不是真实商品数据）' : ''}`,
    `- 研究状态：${session.research.status}`,
    `- 分析版本：${analysis?.version ?? '无'}（生成于 ${dateTime(analysis?.createdAt)}，时区 Asia/Taipei）`
  ].join('\n');
  if (!analysis) return `${title}\n\n${head}\n\n分析尚未完成，没有可导出的结论。${session.research.error ? `\n\n原因：${session.research.error.message}` : ''}\n`;
  const stale = analysis.constraintsHash !== constraintsHash(session);
  const result = analysis.result.report?.detailVersion || stale ? analysis.result : completeReport(session, analysis.result, analysis.figures);
  const dims = DIMENSIONS.map((def) => {
    const d = result.dimensions.find((item) => item.key === def.key);
    const annotations = (d.annotations ?? []).map((note) => {
      const figure = analysis.figures.find((item) => item.id === note.figure_id);
      return `  - ${figure?.label ?? note.figure_id} ${figure?.display ?? ''}（${nature(figure?.nature)}）：${note.how_to_read} 核实：${note.verify}`;
    });
    return [`### ${def.name} · ${SIGNAL[d.signal]}`, d.judgment, ...(d.interpretation ?? []), bullets((d.basis ?? []).map((b) => `${b.text}（${nature(b.nature)}${b.evidence_ids?.length ? `；${b.evidence_ids.join('、')}` : ''}）`)), d.gap ? `缺口：${d.gap}` : '', annotations.length ? `数字怎么读：\n${annotations.join('\n')}` : ''].filter(Boolean).join('\n\n');
  }).join('\n\n');
  const processTeaching = session.steps.filter(step => step.card).map(step => `- ${step.title}：本次能说明：${step.card.scope?.can_show ?? '当前来源记录的内容。'}；本次不能说明：${step.card.scope?.cannot_show ?? '超出当前来源和样本范围的结论。'}`).join('\n');
  const econ = computeEconomics(session);
  const funding = computeFunding(session);
  const calc = econ.status === 'complete'
    ? bullets([`广告前单件贡献：${econ.preAdContribution} USD`, `广告获客成本：${econ.acquisitionCost} USD（CPC ÷ CVR）`, `广告后单件贡献：${econ.postAdContribution} USD`, `保本转化率：${econ.breakEvenCvr === null ? '无正贡献，不生成' : `${(econ.breakEvenCvr * 100).toFixed(2)}%`}`, '适用限制：简化的单件广告获客情景，不含税费、仓储、优惠、复购等未建模费用。'])
    : `未计算：${econ.status === 'invalid' ? econ.error : econ.status === 'fx_required' ? econ.message : `缺少 ${missingLabels(econ).join('、')}`}。缺失成本保持未知，没有按零处理。`;
  const fund = ['within_budget', 'over_budget'].includes(funding.status)
    ? `起订采购 ${funding.purchaseAmount} USD；启动现金需求 ${funding.totalRequired} USD；${funding.budgetGap > 0 ? `超出预算 ${funding.budgetGap} USD` : `启动后剩余 ${Math.abs(funding.budgetGap)} USD`}；现金周期假设 ${funding.cashCycleDays ?? '未知'} 天。`
    : '预算、起订量或采购成本缺项，无法比较采购现金占用。';
  const history = session.analyses.length > 1 ? `\n## 版本记录\n\n${bullets(session.analyses.map((a) => `版本 ${a.version}｜${dateTime(a.createdAt)}｜${a.reason === 'initial' ? '首次分析' : '调整条件后重算'}${a.result.change_note ? `｜${a.result.change_note}` : ''}`))}\n` : '';
  const evidence = session.evidence.length
    ? bullets(session.evidence.map((r) => `${r.id}｜${r.title}（${r.asin}）｜来源：${r.source_name}｜取得：${r.observed_at}｜模式：${sourceModeLabel(r.source_mode)}｜品牌：${r.brand ?? '未提供'}｜类目：${r.category_path ?? '未提供'}｜价格：${r.price ?? '未提供'} ${r.currency ?? ''}｜原价：${r.original_price ?? '未提供'}｜折扣：${r.discount_percentage ?? '未提供'}｜配送费：${r.shipping_price ?? '未提供'}｜评分：${r.rating ?? '未提供'}｜评论数：${r.review_count ?? '未提供'}｜星级分布：${r.star_breakdown ? JSON.stringify(r.star_breakdown) : '未提供'}｜BSR：${r.bestseller_ranks?.length ? r.bestseller_ranks.map((rank) => `${rank.rank} ${rank.category}`).join('；') : '未提供'}｜搜索位：${r.search_rank ?? '未提供'}｜库存：${r.stock_text ?? r.in_stock ?? '未提供'}｜卖家：${r.seller_name ?? '未提供'}｜Offer数：${r.offers_count ?? '未提供'}｜变体：${r.variant_details?.length ? r.variant_details.map((variant) => `${variant.asin ?? ''} ${variant.title ?? ''}`).join('；') : '未提供'}｜商品要点：${r.features?.length ? r.features.slice(0, 5).join('；') : '未提供'}｜属性：${r.product_attributes && Object.keys(r.product_attributes).length ? JSON.stringify(r.product_attributes) : '未提供'}｜层级：${r.sales_scope ?? '未提供'}｜窗口：${windowLabel(r)}｜数据商月销估算：${r.estimated_monthly_sales ?? '未提供'}${r.monthly_purchase_signal !== undefined ? `｜Amazon 页面近月购买信号：${r.monthly_purchase_signal}（不是销量历史估算）` : ''}${r.review_summary ? `｜AI 评论摘要：${r.review_summary}` : ''}${r.description ? `｜商品描述：${r.description.slice(0, 1000)}` : ''}${r.source_url ? `｜${r.source_url}` : ''}`))
    : '本任务没有导入研究证据。需求与竞争无法验证。';
  const offerEvidence = session.evidence.filter((record) => record.offers?.length);
  const offers = offerEvidence.length
    ? bullets(offerEvidence.flatMap((record) => record.offers.map((offer) => `${record.title}（${record.asin}）｜${offer.seller_name ?? '未知卖家'}${offer.seller_rating !== null ? `（卖家评分 ${offer.seller_rating}）` : ''}｜${offer.condition ?? '条件未提供'}｜商品价 ${offer.price ?? '未知'} ${offer.currency ?? record.currency ?? ''}｜配送 ${offer.shipping_price ?? '未提供'}｜送达 ${offer.delivery ?? '未提供'}｜${offer.ships_from ?? '发货地未提供'}${offer.is_prime ? '｜Prime' : ''}｜采集于 ${record.observed_at}`)))
    : '';
  const productSignals = bullets(session.evidence.filter(hasProductSignals).map(productSignal));
  const usage = session.usage;
  return `${title}

${head}
${stale ? '\n> 成本或证据已变化：以下结论保留旧版本，当前输入与测算请另行核对，重新分析后再更新决策。\n' : ''}

## 初判对照

${comparisonText(session)}

## 结论分组

**${result.verdict.title ?? BUCKETS[result.verdict.bucket]}**：${result.verdict.reason}

## 成本与资金摘要

${bullets((result.report?.metrics ?? []).map(m => `${m.label}：${m.value}（${nature(m.nature)}；${m.note}）`))}

## 已取得证据与范围

${bullets((result.report?.coverage ?? []).map(c => `${c.label}：${c.available ? "已取得" : "待补充"}${c.evidence_ids.length ? `（${c.evidence_ids.join("、")}）` : ""}`))}

## 五维分析

${dims}

## 分析过程的证据边界

${processTeaching ? bullets(processTeaching.split('\n').map(line => line.replace(/^- /, ''))) : '- 无步骤讲解记录'}

## 关键假设

${bullets((result.assumptions ?? []).map((a) => `${a.text}（${nature(a.nature)}）｜核实：${a.verify}`))}

## 执行计划

${bullets(result.next_steps.map((s) => `${s.task}${s.gate === 'before_order' ? '（下单前）' : ''}｜原因：${s.why}｜去哪里查：${s.where}`))}

## 卖家约束与成本输入

${constraintsSection(session)}

## 计算与情景

${calc}

${fund}
${businessMarkdown(session)}
${history}
## 证据明细

${evidence}

${productSignals ? `## 商品与搜索信号\n\n${productSignals}` : ''}

${offers ? `## 卖家报价快照\n\n${offers}` : ''}

## 运行记录

- 模型调用 ${usage.llmCalls} 次，工具调用 ${usage.toolCalls} 次，失败 ${usage.failures} 次；输入 ${usage.inputTokens} / 输出 ${usage.outputTokens} tokens；模型累计耗时 ${(usage.llmMs / 1000).toFixed(1)} 秒。
- 模型与数据服务的费用未核算（价格未配置，不代表零成本）。

## 限制

估算销量不是真实订单；缺失值不是零；风险部分为待核实清单，不构成合规、认证或法律结论；不预测销量、收益或成功概率。
`;
}

function comparisonText(session) {
  if (!session.judgment) return '用户没有填写初判，本报告不含初判对照。';
  if (!session.judgment.eligible) return '初判是在完整结果展示后才保存的，不用于对照，只记录在学习记录里。';
  const label = { worth: '值得做', not_worth: '不值得做', unsure: '不确定' }[session.judgment.choice];
  const c = session.comparison;
  if (!c) return `用户初判：${label}。对照尚未生成。`;
  if (c.failed) return `用户初判：${label}。对照文字生成失败，请重新分析。`;
  return `用户初判：${label}${session.judgment.reason ? `（理由：${session.judgment.reason}）` : ''}\n\n证据显示：${latestAnalysis(session).result.verdict.title ?? BUCKETS[latestAnalysis(session).result.verdict.bucket]}\n\n差异：${c.difference}${c.analysisVersion !== latestAnalysis(session).version ? `\n\n（该对照基于分析版本 ${c.analysisVersion}）` : ''}`;
}

export function learningMarkdown(session) {
  const rec = session.learning.record;
  const analysis = latestAnalysis(session);
  const nodes = session.teaching.nodes.map((id) => {
    const p = session.practice[id];
    const lesson = session.teaching.lessons[id];
    const status = !p || p.status === 'pending' || p.status === 'ready' ? '未练习' : p.status === 'skipped' ? '已跳过，未验证' : `${p.answer.correct ? '答对' : '答错'}，提示 ${p.hints} 次`;
    return `${id}｜${lesson?.templateOnly ? '通用讲解｜' : ''}${status}${p?.feedback ? `｜${p.feedback.feedback}` : ''}`;
  });
  const transfer = session.transfer?.result;
  return `# 个人学习记录

- 商品：${session.product.name}
- 学习状态：${learningState(session)}；学习结果：${OUTCOME_TEXT[learningOutcome(session)]}
- 对应分析版本：${analysis?.version ?? '无'}

## 辅导前：用户原判断

${session.judgment ? `${{ worth: '值得做', not_worth: '不值得做', unsure: '不确定' }[session.judgment.choice]}${session.judgment.reason ? `｜${session.judgment.reason}` : '｜（未写理由）'}｜保存于 ${dateTime(session.judgment.savedAt)}` : '用户没有填写初判，本记录没有测到用户原有的理解。'}

## 本次教学节点

${bullets(nodes)}

${rec ? `## 已纠正的具体误解

${bullets(rec.corrected.map((c) => `${c.misunderstanding}（依据：${{ judgment_comparison: '初判对照', practice: '节点练习', transfer: '迁移练习' }[c.based_on]}）｜${c.detail}`))}

## 尚未验证的理解

${bullets(rec.unverified)}

## 本次用到的方法

${bullets(rec.methods)}

## 下次分析清单

${bullets(rec.checklist)}
` : '## 学习记录正文\n\n正文尚未生成或生成失败，可在交付页重新生成。\n'}
## 迁移练习

${transfer ? (transfer.skipped ? '已跳过，学习结果未验证。' : `${OUTCOME_TEXT[transfer.outcome]}${transfer.total === null ? '' : `（${transfer.total}/8，提示 ${session.transfer.hints} 次）`}`) : '尚未进行。'}

本记录不构成长期能力认证。
`;
}

export function transferMarkdown(session) {
  const transfer = session.transfer;
  if (!transfer) return `# 迁移练习反馈\n\n尚未进行迁移练习，学习结果：未验证。\n`;
  const data = TRANSFER_CASES.find((item) => item.id === transfer.caseId);
  const result = transfer.result;
  const answer = transfer.answer;
  const rows = result?.items?.length ? bullets(result.items.map((item) => `${item.label}：${item.score}/2｜依据：${item.quote ? `“${item.quote}”` : '无'}｜${item.reason}`)) : '- 无评分';
  return `# 迁移练习反馈

- 案例：${data.title}（**教学模拟**，不属于真实商品研究数据；数据日期 2026-11-14）
- 条件：售价 ${data.price}、非广告成本 ${(data.goodsCost + data.logisticsCost + data.platformCost + data.returnsCost + data.otherCost).toFixed(2)}、CPC ${data.cpc}、CVR ${data.cvr * 100}%（USD）
- 提示次数：${transfer.hints}${transfer.hintLog.length ? `（${transfer.hintLog.map((h) => h.text).join(' / ')}）` : ''}
- 结果：${result ? OUTCOME_TEXT[result.outcome] : '作答中'}${result?.total === null || !result ? '' : `（${result.total}/8）`}

## 用户回答

${answer ? bullets([`证据：${answer.evidence}`, `口径：${answer.scope}`, `广告后单件贡献：${answer.postAdContribution}`, `不确定项：${answer.uncertainty}`]) : '未提交回答。'}

## 分项评分

${result?.skipped ? '用户跳过练习，没有成绩。' : result?.incomplete ? `评分未完成：${result.error?.message ?? ''}。程序核验的计算项为 ${result.calc?.score}/2。` : rows}

## 参考方法

${result?.reference ? `广告前贡献 ${result.reference.preAd}；CAC ${result.reference.cac}；广告后贡献 ${result.reference.postAd}。仓储费、税费等未计入的费用需要另行核实。` : '提交后显示。'}

${result?.nextPractice ? `## 下一次练习建议\n\n${result.nextPractice}\n` : ''}
总分只用于本次练习反馈，不是标准化能力认证。
`;
}
