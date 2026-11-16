import { renderDemoPitch } from './demo-pitch.js';
import { esc } from './common.js';

export const DEMO_TOUR_STEPS = [
  { id:'office', page:'room', label:'团队协作', title:'先看一位数字员工，怎样分工做研究', description:'六位角色分别识别商品、查需求、比竞品、算利润、核风险，再汇总判断。办公室是过程的可视化；每一步下方都能查看具体发现。', action:'demo-tour-replay', actionLabel:'播放 42 秒协作过程', next:'去看分析结论 →', takeaway:'你只给一个候选商品，系统负责拆任务、找依据，再把判断交还给你。' },
  { id:'report', page:'report', label:'结论与证据', title:'建议做，但不是只给你一个“做”字', description:'这份案例建议首批 120 件试销。往下看五维判断，再展开需求数据，核对“为什么这样判断”：六个月历史、统计窗口和来源都保留在里面。', action:'demo-tour-evidence', actionLabel:'带我展开一条原始证据', next:'我来改一个经营条件 →', takeaway:'报告把结论、依据和下一步连在一起；你可以沿着原始记录复核，而不是只接受一个分数。' },
  { id:'economics', page:'evidence', label:'动手测算', title:'如果广告转化率减半，这门生意还成立吗？', description:'点击下方情景，把转化率从 12% 调到 6%。售价、费用不变，让程序重新计算获客成本与单件贡献；也可以展开输入，自己改数字。', action:'demo-tour-scenario', actionLabel:'试一下：转化率减半', next:'回到基准，问问教练 →', takeaway:'这一步把“看起来有利润”变成可检验的经营条件。数字由程序算，费用假设和未知项都可见。' },
  { id:'coach', page:'report', label:'追问教练', title:'不理解的地方，直接带着证据问', description:'点“请教箱子教练”，它会引用这份案例的利润判断回答。也可以在页面上选中任意一段文字，再点右下角的“引用选文问教练”。', action:'demo-tour-coach', actionLabel:'请教箱子教练', next:'用一道题检验理解 →', takeaway:'解释发生在你的研究现场：围绕这份商品、这条证据连续追问，不必切去另一个聊天窗口。' },
  { id:'learning', page:'learning', label:'带走方法', title:'最后试一题：你学到的是结论，还是方法？', description:'用这个商品做一道利润题。选一个答案就能得到反馈和可迁移规则；答错也没关系，教学正是嵌在刚才的研究里。', action:'demo-tour-practice', actionLabel:'打开 30 秒利润小题', next:'完成体验，看看收获 →', takeaway:'Pickwise 不仅交付商品研究，也帮助主理人学会读数据、算成本，把方法带到下一次选品。' }
];

export function createDemoTour() { return { mode:'welcome', index:0, compact:false, evidence:false, scenario:false, coach:false, practice:false }; }
export function demoAssistanceEnabled(ui) { return Boolean(ui.demo && ui.demoAssistanceEnabled !== false); }
export function demoTourStep(state) { return DEMO_TOUR_STEPS[Math.min(DEMO_TOUR_STEPS.length-1,Math.max(0,Number(state?.index)||0))]; }
const mascot = '<img src="/assets/brand/pickwise-icon.svg" alt="" width="56" height="56">';
const button = (action,label,primary=false) => `<button class="btn ${primary?'primary':''}" data-action="${action}">${label}</button>`;

export function renderDemoGuide(ui) {
  if (!demoAssistanceEnabled(ui) || !ui.view?.preloadedDemo) return '';
  const state=ui.demoTour ?? createDemoTour(), step=demoTourStep(state);
  if(state.mode==='free') return `<aside class="demo-guide-minimal demo-guide-floating demo-guide-paused" aria-label="自助导览浮层"><span>自由探索中 · 导览进度已保留</span><div>${button('demo-tour-resume','继续自助导览 ↗')}${button('demo-assistance-toggle','关闭自助讲解')}</div></aside>`;
  if(state.mode==='complete') return `<section class="demo-guide demo-tour-finish" aria-labelledby="demo-guide-title"><div class="demo-guide-voice">${mascot}<div><span class="eyebrow">体验回顾 / TAKE THE METHOD WITH YOU</span><h2 id="demo-guide-title">从一个商品，到有依据的经营判断。</h2><p>你刚才看到的，是选品数字员工与嵌入式教学的一条完整路径。研究过程、原始证据、经营测算和随时可问的教练，围绕同一个商品工作。</p></div></div><div class="demo-tour-recap">${[['evidence','核对原始数据','可追溯的商品研究'],['scenario','尝试参数变化','理解利润成立的条件'],['coach','与箱子教练对话','围绕现场证据继续追问'],['practice','亲自做一道题','把方法带到下一次选品']].map(([key,title,note])=>`<div><span class="${state[key]?'is-done':''}">${state[key]?'✓':'○'}</span><b>${title}</b><small>${state[key]?'已体验':'还可以试试'} · ${note}</small></div>`).join('')}</div><p class="demo-guide-boundary">本次为完整虚构案例；实时模式使用实际来源和模型分析，数据不足时保留缺口，费用与预算需要按实际经营条件填写。</p><div class="demo-guide-actions">${button('demo-pitch-open','再看产品介绍',true)}${button('demo-tour-restart','下一位体验 / 从头开始')}${button('demo-tour-free','继续自由探索')}${button('demo-tour-download','下载这份案例报告')}</div></section>`;
  if(state.mode==='welcome') return renderDemoPitch({lowCvr:Boolean(ui.pitchLowCvr)});
  const onPage=ui.page===step.page;
  let result='';
  if(step.id==='economics' && onPage) {
    const econ=ui.view.econ, cvr=ui.view.constraints?.effective?.cvr;
    result=`<div class="demo-scenario-result" role="status"><div><span>基准案例 · CVR 12%</span><b>$4.70 <small>/ 件</small></b></div><span class="scenario-arrow" aria-hidden="true">→</span><div><span>当前试算 · CVR ${Number.isFinite(cvr)?+(cvr*100).toFixed(2)+'%':'未知'}</span><b>${econ.status==='complete'?'$'+econ.postAdContribution.toFixed(2):'未算出'} <small>/ 件</small></b></div><p>${econ.status==='complete'?`按当前输入，获客成本 $${econ.acquisitionCost.toFixed(2)}，广告后贡献 $${econ.postAdContribution.toFixed(2)}。销量再热，也要问：我的售价、费用和转化条件能否成立？`:'当前成本或汇率缺项，尚不能计算广告后贡献。恢复基准，或补齐输入后再比较。'}</p>${button('demo-tour-baseline','恢复基准案例')}</div>`;
  }
  const compact=Boolean(state.compact || ui.coachState?.open);
  return `<section class="demo-guide demo-tour-active demo-guide-floating ${compact?'is-compact':''}" aria-label="自助导览浮层" aria-labelledby="demo-guide-title"><header class="demo-floating-header"><div><span class="eyebrow">自助体验 · ${state.index+1} / ${DEMO_TOUR_STEPS.length}</span><h2 id="demo-guide-title">${esc(compact?step.label:step.title)}</h2></div><div><button class="demo-guide-quiet" data-action="demo-tour-fold" aria-expanded="${!compact}" aria-controls="demo-floating-content">${compact?'展开讲解':'收起讲解'}</button><button class="demo-guide-quiet" data-action="demo-assistance-toggle" aria-label="关闭自助讲解">关闭</button></div></header><div class="demo-floating-content" id="demo-floating-content" ${compact?'hidden':''}><nav class="demo-tour-stops" aria-label="自助体验路线">${DEMO_TOUR_STEPS.map((s,i)=>`<button data-action="demo-tour-step" data-tour-index="${i}" class="${i===state.index?'active':''}" aria-current="${i===state.index?'step':'false'}"><span>${i+1}</span>${s.label}</button>`).join('')}</nav><p>${esc(onPage?step.description:'你正在自由查看其他页面。导览进度已保留，点击“回到这一步”即可继续。')}</p><p class="demo-guide-lesson"><span>这一站看什么</span>${esc(step.takeaway)}</p>${result}<button class="demo-guide-quiet" data-action="demo-tour-free">暂停导览，自由探索</button></div><footer class="demo-floating-actions"><div class="demo-guide-actions">${state.index>0?button('demo-tour-back','← 上一步'):''}${!compact?(onPage?button(step.action,step.actionLabel):button('demo-tour-resume','回到这一步')):''}${button('demo-tour-next',step.next,true)}</div></footer></section>`;
}

export function renderDemoLearning(view) {
  return `<section class="panel demo-learning-note"><div class="panel-body"><span class="eyebrow">把研究变成你的方法</span><h2>不用背答案，记住判断怎样成立。</h2><p>刚才从需求、竞争、利润、风险和预算看了同一个商品。下面两道可选题，分别练习“历史能说明什么”和“广告怎样改变利润”。反馈按你的选择在本地生成，不调用模型；本次作答不代表能力认证。</p><div class="demo-learning-rules"><div><b>先看口径</b><span>谁的销量、哪个窗口、估算还是订单。</span></div><div><b>再算经营账</b><span>售价减成本，再扣 CPC ÷ CVR。</span></div><div><b>保留边界</b><span>正贡献不等于已获授权或可以放量。</span></div></div></div></section>`;
}

export function renderDemoGuideFooter(ui) {
  // The fixed guide owns navigation; do not duplicate it at the document bottom.
  return '';
}
