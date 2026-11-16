import { esc } from './common.js';

export const COACH_QUESTIONS = [
  { key:'verdict', label:'为什么给出这个结论？', question:'结合本次具体证据，解释为什么给出当前结论，哪些条件会改变它？' },
  { key:'evidence', label:'哪些数据最关键？', question:'本次哪些原始数据最影响判断？请说明它们能证明什么、还不能证明什么。' },
  { key:'cost', label:'利润最怕什么变化？', question:'当前利润口径包含了什么，哪些费用或广告变化最可能改变结论？' },
  { key:'next', label:'现在先做哪一步？', question:'根据当前证据与缺口，下一步最值得先做什么，具体去哪里核实？' }
];

export function reportQuote(view) {
  return (view?.analysis?.result?.verdict?.reason ?? view?.product?.name ?? '').slice(0,1200);
}

export function renderCoach(view, state = {}) {
  const ready = Boolean(view?.analysis);
  const pending = Boolean(state.pending);
  const messages = view?.coach ?? [];
  const versionNote = m => m.analysisVersion ? `<small class="coach-version">基于报告 v${esc(m.analysisVersion)}${m.analysisVersion !== view?.analysis?.version || view?.analysis?.stale ? ' · 报告或经营条件已变化，请按更新版本重新提问。' : ''}</small>` : '';
  return `<div class="coach-panel"><header class="coach-header"><img src="/assets/brand/pickwise-icon.svg" alt="纸箱小教练" width="48" height="48"><div><span class="eyebrow">PICKWISE COACH</span><h2 id="coach-title">一起把判断想清楚</h2><p>${view?.preloadedDemo ? '演示对话 · 本地预制回答' : '围绕本次证据，继续聊聊'}</p></div><button class="coach-icon-btn" data-action="coach-close" aria-label="收起 AI 教练">×</button></header>
    <div class="coach-messages" role="log" aria-live="polite" aria-relevant="additions" tabindex="0" aria-label="与教练的对话"><div class="coach-welcome"><img src="/assets/brand/pickwise-icon.svg" alt="" width="76" height="76"><h3>选品的每一步，都可以问我。</h3><p>${ready ? '选中页面上的一句话，带着原文来聊。也可以直接提问，我会结合这份报告回答。' : '打开一个已完成的分析，或先体验演示案例，我们就能围绕具体证据聊聊。'}</p></div>
    ${messages.map(m => `<div class="coach-turn"><article class="coach-message coach-user"><span class="coach-speaker">你</span>${m.selectedText ? `<blockquote>${esc(m.selectedText)}</blockquote>` : ''}<p>${esc(m.question)}</p></article><article class="coach-message coach-reply"><div class="coach-reply-head"><img src="/assets/brand/pickwise-icon.svg" alt="" width="26" height="26"><span>纸箱小教练${m.simulated ? ' · 演示回答' : ''}</span></div>${versionNote(m)}<div>${String(m.answer ?? '').split(/\n\s*\n/).map(p => `<p>${esc(p)}</p>`).join('')}</div></article></div>`).join('')}
    ${pending ? `<div class="coach-turn"><article class="coach-message coach-user">${state.pendingQuote ? `<blockquote>${esc(state.pendingQuote)}</blockquote>` : ''}<p>${esc(state.pendingQuestion)}</p></article><article class="coach-message coach-reply coach-thinking" role="status"><img src="/assets/brand/pickwise-icon.svg" alt="" width="26" height="26"><span>正在对照证据整理回答<span aria-hidden="true"> ···</span></span></article></div>` : ''}
    ${state.error ? `<p class="coach-error" role="alert">${esc(state.error)}<br>问题已保留，可以重新发送。</p>` : ''}</div>
    <div class="coach-composer"><div class="coach-suggestions" aria-label="你可能想问">${COACH_QUESTIONS.map(q => `<button data-action="coach-suggest" data-question-key="${q.key}" ${!ready || pending ? 'disabled' : ''}>${q.label}</button>`).join('')}</div>
    <div class="coach-quote ${state.quote ? 'has-quote' : ''}">${state.quote ? `<div><span>引用页面内容</span><button class="coach-icon-btn" data-action="coach-clear-quote" aria-label="移除引用">×</button></div><blockquote>${esc(state.quote)}</blockquote>` : '<button class="coach-quote-action" data-action="coach-use-selection">＋ 引用页面选中的内容</button>'}</div>
    <form id="coach-form"><label class="sr-only" for="coach-question">向 AI 教练提问</label><textarea id="coach-question" maxlength="500" rows="3" placeholder="继续问问这份分析…" ${!ready || pending ? 'disabled' : ''}>${esc(state.question ?? '')}</textarea><div class="coach-compose-footer"><small>${view?.preloadedDemo ? '模拟案例 · 不调用外部服务' : 'Enter 发送 · Shift + Enter 换行'}</small><button class="coach-send" type="button" data-action="coach-ask" aria-label="发送问题" ${!ready || pending ? 'disabled' : ''}>发送 <span aria-hidden="true">↑</span></button></div></form>${!ready ? '<button class="btn" data-action="enter-demo">打开演示，开始聊聊</button>' : ''}</div></div>`;
}

export function renderCoachDrawer(ui) {
  const st = ui.coachState ?? {};
  return `<div class="coach-widget"><button id="coach-capture" class="coach-selection-action" data-action="coach-use-selection" ${st.selection ? '' : 'hidden'}>引用选文问教练 ↗</button><button id="coach-launcher" class="coach-launcher" data-action="coach-open" aria-controls="coach-sidebar" aria-expanded="${Boolean(st.open)}" aria-label="打开 AI 教练"><span class="coach-launcher-label">有疑问，问问我</span><img src="/assets/brand/pickwise-icon.svg" alt="纸箱小教练" width="66" height="66"><span class="coach-launcher-spark" aria-hidden="true">✦</span></button>${st.open ? `<aside id="coach-sidebar" class="coach-sidebar" role="dialog" aria-modal="false" aria-labelledby="coach-title">${renderCoach(ui.view,st)}</aside>` : ''}</div>`;
}

// Retained for small consumers; the main UI owns selection, state and requests.
export function performCoachAction(action, { getSelection, getField, toast, submit }) {
  if (action === 'coach-quote') {
    const selected = String(getSelection() ?? '').trim().slice(0,1200);
    if (!selected) { toast('先选中页面中的一段文字'); return true; }
    const field = getField('coach-selection');
    if (field) { field.value = selected; field.focus(); }
    return true;
  }
  if (action === 'coach-ask') {
    const selected = getField('coach-selection')?.value ?? '';
    const question = getField('coach-question')?.value ?? '';
    if (!question.trim()) { toast('请先填写问题'); return true; }
    submit(selected,question); return true;
  }
  return false;
}
