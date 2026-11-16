import { TEACHING_TERMS, TEACHING_TERM_BY_KEY } from '../terms.js';

export const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function reportTerms(result, figures = []) {
  const contextual = new Map((result?.glossary ?? []).filter(item => TEACHING_TERM_BY_KEY[item.key] && item.explanation).map(item => [item.key,item.explanation]));
  return TEACHING_TERMS.map(term => ({key:term.key,explanation:contextual.get(term.key) ?? term.definition}));
}

export function termText(value, glossary = []) {
  const byLabel = new Map();
  for (const item of glossary) {
    const term = TEACHING_TERM_BY_KEY[item.key];
    if (!term || !item.explanation) continue;
    for (const alias of [term.label,...term.matches.filter(alias => !alias.includes('_'))]) byLabel.set(alias.toLowerCase(),item);
  }
  if (!byLabel.size) return esc(value);
  const escapePattern = text => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern = new RegExp(`(${[...byLabel.keys()].sort((a,b) => b.length-a.length).map(alias => `${/^[a-z0-9]/i.test(alias) ? '(?<![a-z0-9_])' : ''}${escapePattern(alias)}${/[a-z0-9]$/i.test(alias) ? '(?![a-z0-9_])' : ''}`).join('|')})`,'gi');
  return String(value ?? '').split(pattern).map(part => {
    const item = byLabel.get(part.toLowerCase());
    return item
      ? `<abbr class="term-help" tabindex="0" role="button" aria-expanded="false" title="${esc(item.explanation)}">${esc(part)}</abbr>`
      : esc(part);
  }).join('');
}

export const NATURE = { fact: ['事实', 'green'], estimate: ['估算', 'blue'], assumption: ['假设', 'orange'], unknown: ['未知', 'gray'] };
export const natureTag = (nature) => { const [label, tone] = NATURE[nature] ?? ['未标注', 'gray']; return `<span class="tag ${tone}">${label}</span>`; };

export const STATUS = {
  pending: ['待开始', 'gray', '○'], running: ['进行中', 'blue', '◐'], done: ['已完成', 'green', '✓'], insufficient: ['证据不足', 'orange', '!'],
  unverified: ['待核实', 'orange', '?'], failed: ['失败', 'red', '×'], blocked: ['等你确认', 'orange', '⏸']
};
export const statusTag = (status) => { const [label, tone, mark] = STATUS[status] ?? STATUS.pending; return `<span class="tag ${tone}"><span aria-hidden="true">${mark}</span>${label}</span>`; };

export const SIGNAL = { positive: ['偏正面', 'green', '↑'], neutral: ['中性', 'gray', '–'], negative: ['偏负面', 'red', '↓'], insufficient: ['证据不足', 'orange', '!'] };
export const signalTag = (signal) => { const [label, tone, mark] = SIGNAL[signal] ?? SIGNAL.neutral; return `<span class="tag ${tone}"><span aria-hidden="true">${mark}</span>${label}</span>`; };

export const MODE = { user_import: '授权导入', teaching_simulation: '教学模拟', live_api: '实时 API', cached_snapshot: '历史快照', mixed: '混合证据', none: '暂无研究数据' };
export const OUTCOME = { independent_application: '本次已初步运用', assisted_completion: '提示后完成', needs_practice: '建议再练一次', unverified: '未验证' };
export const LEARNING = { not_started: '未开始', coaching: '教学中', transfer_pending: '待迁移练习', completed: '练习完成', skipped: '已跳过' };
export const RESEARCH = { draft: '已创建', resolving: '等待确认商品', researching: '分析中', analysis_ready: '分析完成', partial: '部分完成', failed: '失败' };
export const CHOICE = { worth: '值得做', not_worth: '不值得做', unsure: '不确定' };

export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Taipei', hour12: false }) : '—');
export const modeOf = (view) => {
  const modes = new Set(view.evidence.map((record) => record.source_mode));
  return !modes.size ? 'none' : modes.size > 1 ? 'mixed' : [...modes][0];
};
export const windowText = (record) => (record.period_start && record.period_end ? `${record.period_start} 至 ${record.period_end}` : '未提供');
export const safeLink = (url, label = '打开来源') => {
  try { const parsed = new URL(url); if (['http:', 'https:'].includes(parsed.protocol)) return `<a class="evidence-link" href="${esc(parsed.href)}" target="_blank" rel="noopener noreferrer">${label}</a>`; } catch { /* 无效链接不显示 */ }
  return '';
};
export const ids = (list) => (list?.length ? `<span class="ids">${list.map(esc).join('、')}</span>` : '');
