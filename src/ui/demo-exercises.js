// Local teaching fixtures for unattended exhibition use. Scoring is deterministic;
// answers explain this simulated case and never certify the visitor's ability.
export const DEMO_EXERCISES = {
  N2: { question:'同一 listing 六个月的月销量估算从 340 增至 438 件，可以怎样读？', options:[
    {id:'a',text:'能观察这段同口径历史的方向，但不能保证未来销量。',why:'商品、层级与窗口一致的历史可以比较；数据商估算不是订单，也不保证未来。'},
    {id:'b',text:'可以保证新卖家下个月也卖出 438 件。',why:'这是已有 listing 的模拟历史，新卖家的曝光、定价与转化条件并未由它确定。'},
    {id:'c',text:'把六个月数字相加，就是接下来首批要备的货。',why:'历史累计量不等于未来备货需求，首批数量还要服从预算、MOQ 和周转条件。'}
  ],correct:'a',hint:'先区分“读过去的方向”和“保证未来”，再看是不是同一个商品、同一种口径。',difficulty:'default' },
  N3: { question:'案例广告前贡献为 $8.70，CPC 为 $0.48。如果 CVR 从 12% 降到 6%，广告后每件还剩多少？', options:[
    {id:'a',text:'$4.70，与基准相同。',why:'转化率降低会提高获客成本，不能继续使用基准 CAC。'},
    {id:'b',text:'$0.70，获客成本升为 $8。',why:'CAC = 0.48 ÷ 0.06 = 8；广告后贡献 = 8.70 − 8 = 0.70。'},
    {id:'c',text:'$8.70，只看售价减非广告成本。',why:'$8.70 是广告前贡献，仍需要扣掉获客成本。'}
  ],correct:'b',hint:'先算一次获客成本 CPC ÷ CVR，再从广告前贡献里扣掉它。',difficulty:'default' }
};

export function demoPractice(current, node, action, body = {}) {
  const question=DEMO_EXERCISES[node];
  if(!question) throw new Error('演示只提供当前案例的两道预制小题。');
  if(action==='start') { current.practice[node]={status:'ready',question:structuredClone(question),hints:0,hintShown:false,stale:node==='N3'&&current.analysis.stale}; return; }
  if(action==='skip') { current.practice[node]={status:'skipped'}; return; }
  const record=current.practice[node];
  if(!record?.question || record.status!=='ready') throw new Error('先打开这道小题，再作答。');
  if(action==='hint') { record.hints=1;record.hintShown=true;return; }
  if(action!=='answer') throw new Error('这项演示练习操作暂不可用。');
  const choice=question.options.find(o=>o.id===body.choice);
  if(!choice) throw new Error('请选择一个答案。');
  record.status='done'; record.answer={choice:choice.id,correct:choice.id===question.correct};
  record.feedback={feedback:choice.why,method_reminder:node==='N3'?'广告获客成本 = CPC ÷ CVR；广告后贡献 = 广告前贡献 − 获客成本。':'同商品、同口径的连续历史可观察过去；估算不是订单，过去不保证未来。'};
}

export function demoLearningText(current) {
  return '# 本次演示的学习回顾\n\n本次为本地模拟练习，只记录你的选择，不构成学习能力认证。\n\n'+['N2','N3'].map(node=>{
    const r=current.practice[node];
    return '## '+(node==='N2'?'需求历史怎么读':'广告怎样影响利润')+'\n\n'+(!r?'尚未尝试。':r.status==='skipped'?'已跳过，理解未验证。':r.status==='done'?(r.answer.correct?'本题回答正确。':'本题需要回看方法。')+'\n\n'+r.feedback.feedback+'\n\n可迁移规则：'+r.feedback.method_reminder:'小题已打开，尚未作答。');
  }).join('\n\n')+'\n\n下一次选品：先对齐来源口径，再列全成本，最后保留风险与资金边界。\n';
}
