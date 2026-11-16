export const NATURE_LABEL = { fact: '事实', estimate: '估算', assumption: '假设', unknown: '未知' };

export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function money(value, currency = 'USD') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '未提供';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function percent(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '未提供';
  return `${(value * 100).toLocaleString('zh-CN', { maximumFractionDigits: digits })}%`;
}

export function dateTime(iso) {
  if (!iso) return '未记录';
  return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Taipei', hour12: false });
}

export function windowLabel(record) {
  return record?.period_start && record?.period_end ? `${record.period_start} 至 ${record.period_end}` : '未提供';
}

export function sourceModeLabel(mode) {
  return ({ user_import: '授权导入', teaching_simulation: '教学模拟', live_api: '实时 API', cached_snapshot: '历史快照', mixed: '混合证据', none: '暂无研究数据' })[mode] ?? '暂无研究数据';
}

export const COST_LABELS = { price: '预期售价', goodsCost: '单件采购成本', logisticsCost: '运输与履约成本', platformCost: '平台费用', returnsCost: '退货预留', otherCost: '其他变动成本', cpc: 'CPC', cvr: 'CVR', budget: '可用预算', moq: '起订量' };
