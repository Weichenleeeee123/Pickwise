import { inspectEvidence, hasSalesTrendHistory } from './domain.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function windowKind(start, end) {
  const s = ISO_DATE.exec(start ?? '');
  const e = ISO_DATE.exec(end ?? '');
  if (!s || !e) return 'unknown';
  const lastDay = new Date(Date.UTC(Number(e[1]), Number(e[2]), 0)).getUTCDate();
  const sameMonth = s[1] === e[1] && s[2] === e[2];
  return sameMonth && s[3] === '01' && Number(e[3]) === lastDay ? 'calendar_month' : 'rolling';
}

export function diagnoseEvidence(records) {
  const checked = inspectEvidence(records);
  const included = checked.usableSales.filter((row) => row.includedForAggregation);
  const duplicates = checked.duplicateGroups.map((group) => {
    const row = checked.usableSales.find((item) => item.parent_asin === group.parent_asin && item.period_start === group.period_start && item.period_end === group.period_end);
    return { ...group, value: row?.estimated_monthly_sales ?? null };
  });

  const families = new Map();
  for (const row of checked.usableSales) {
    if (!row.parent_asin) continue;
    const key = `${row.parent_asin}|${row.period_start}|${row.period_end}`;
    const entry = families.get(key) ?? { parent_asin: row.parent_asin, period_start: row.period_start, period_end: row.period_end, scopes: new Set(), rows: [] };
    entry.scopes.add(row.sales_scope);
    entry.rows.push(row);
    families.set(key, entry);
  }
  const mixedScope = [...families.values()].filter((entry) => entry.scopes.has('parent') && entry.scopes.has('child'));

  const latestByAsin = new Map();
  for (const row of included) {
    const current = latestByAsin.get(row.asin);
    if (!current || row.period_end > current.period_end) latestByAsin.set(row.asin, row);
  }
  const windows = [...latestByAsin.values()].map((row) => ({ asin: row.asin, start: row.period_start, end: row.period_end, kind: windowKind(row.period_start, row.period_end) }));
  const distinct = new Set(windows.map((item) => `${item.start}|${item.end}`));
  const kinds = new Set(windows.map((item) => item.kind));
  const kindMix = kinds.has('calendar_month') && kinds.has('rolling');
  const windowMismatch = distinct.size > 1 || kindMix;

  return {
    checked,
    includedCount: included.length,
    noSales: included.length === 0,
    singlePeriodOnly: included.length > 0 && !hasSalesTrendHistory(records),
    duplicateParent: duplicates.length > 0,
    duplicates,
    mixedScope: mixedScope.length > 0,
    mixedScopeGroups: mixedScope.map((entry) => ({ parent_asin: entry.parent_asin, period_start: entry.period_start, period_end: entry.period_end, rows: entry.rows })),
    windowMismatch,
    windows,
    kindMix
  };
}

export function describeIssues(diagnosis) {
  const issues = [];
  if (diagnosis.duplicateParent) issues.push({ code: 'duplicate_parent', node: 'N1', text: `${diagnosis.duplicates.length} 组父体销量在同一窗口重复出现，直接相加会放大销量` });
  if (diagnosis.mixedScope) issues.push({ code: 'mixed_scope', node: 'N1', text: '同一父体的整款记录与子体记录同时出现，层级混用' });
  if (diagnosis.windowMismatch) issues.push({ code: 'window_mismatch', node: 'N1', text: diagnosis.kindMix ? '自然月窗口与滚动窗口同时出现' : '不同商品的统计窗口不一致' });
  if (diagnosis.noSales) issues.push({ code: 'no_sales', node: 'N2', text: '没有任何带完整窗口与层级的销量证据，也没有连续历史' });
  else if (diagnosis.singlePeriodOnly) issues.push({ code: 'single_period', node: 'N2', text: '只有单个统计窗口的销量，缺少连续历史' });
  return issues;
}

// PRD 4.3 的约束：第二个节点必须落在数据里实际出现的问题上。这里只给出“允许范围”，选择由 Agent 完成。
export function allowedSecondNodes(all, target) {
  const scope = all.duplicateParent || all.mixedScope || all.windowMismatch;
  const history = target.noSales || target.singlePeriodOnly;
  if (scope && history) return ['N1', 'N2'];
  if (scope) return ['N1'];
  if (history) return ['N2'];
  return ['N1', 'N2'];
}
