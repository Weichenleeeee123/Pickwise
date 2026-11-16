const moneyFields = ['price', 'goodsCost', 'logisticsCost', 'platformCost', 'returnsCost', 'otherCost', 'cpc'];

export function parseProductReference(value) {
  const input = String(value ?? '').trim();
  if (!input) throw new Error('请输入商品名称、ASIN 或 Amazon.com 商品链接');
  if (/^[A-Z0-9]{10}$/i.test(input)) {
    const asin = input.toUpperCase();
    return { asin, productName: asin, query: '' };
  }
  const looksLikeUrl = /^(?:https?:\/\/|www\.|[\w-]+\.amazon\.com\b)/i.test(input);
  if (looksLikeUrl) {
    let url;
    try { url = new URL(input.startsWith('www.') ? `https://${input}` : input); }
    catch { throw new Error('商品链接格式无效'); }
    if (!/^https?:$/.test(url.protocol) || !/(^|\.)amazon\.com$/i.test(url.hostname)) {
      throw new Error('当前首版只支持 Amazon.com 商品链接');
    }
    const asin = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1]?.toUpperCase();
    if (!asin) throw new Error('Amazon.com 链接中没有识别到 ASIN');
    return { asin, productName: asin, query: '' };
  }
  if (input.length > 120) throw new Error('商品名称最多输入 120 个字符');
  return { asin: '待识别', productName: input, query: input };
}

export function calculateUnitEconomics(input) {
  const fields = [...moneyFields, 'cvr'];
  const missing = fields.filter((key) => input[key] === null || input[key] === undefined || input[key] === '');
  if (missing.length) return { status: 'incomplete', missing };

  const values = Object.fromEntries(fields.map((key) => [key, Number(input[key])]));
  if (Object.values(values).some((value) => !Number.isFinite(value))) throw new Error('Values must be valid numbers');
  if (moneyFields.some((key) => values[key] < 0)) throw new Error('Costs and price must be non-negative');
  if (values.cvr <= 0 || values.cvr > 1) throw new Error('CVR must be greater than 0 and at most 1');

  const preAdContribution = values.price - values.goodsCost - values.logisticsCost - values.platformCost - values.returnsCost - values.otherCost;
  const acquisitionCost = values.cpc / values.cvr;
  const postAdContribution = preAdContribution - acquisitionCost;
  const breakEvenCvr = preAdContribution > 0 ? values.cpc / preAdContribution : null;
  return {
    status: 'complete',
    preAdContribution: round(preAdContribution),
    acquisitionCost: round(acquisitionCost),
    postAdContribution: round(postAdContribution),
    breakEvenCvr: breakEvenCvr === null ? null : Math.round(breakEvenCvr * 10000) / 10000,
    breakEvenUnreachable: breakEvenCvr !== null && breakEvenCvr > 1,
    preAdNotPositive: preAdContribution <= 0
  };
}

export function calculatePurchaseExposure({ budget, moq, goodsCost }) {
  const missing = [['budget', budget], ['moq', moq], ['goodsCost', goodsCost]]
    .filter(([, value]) => value === null || value === undefined || value === '')
    .map(([key]) => key);
  if (missing.length) return { status: 'incomplete', missing };
  const values = { budget: Number(budget), moq: Number(moq), goodsCost: Number(goodsCost) };
  if (Object.values(values).some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Budget, MOQ, and goods cost must be non-negative numbers');
  }
  const purchaseAmount = round(values.moq * values.goodsCost);
  const budgetGap = round(purchaseAmount - values.budget);
  return { status: budgetGap > 0 ? 'over_budget' : 'within_budget', purchaseAmount, budgetGap };
}

export function inspectEvidence(records) {
  const excluded = [];
  const salesRows = [];
  for (const record of records) {
    if (record.estimated_monthly_sales === null || record.estimated_monthly_sales === undefined || record.estimated_monthly_sales === '') continue;
    const row = { ...record, includedForAggregation: true };
    const hasWindow = Boolean(record.period_start && record.period_end);
    const salesValue = Number(record.estimated_monthly_sales);
    if (!Number.isFinite(salesValue) || salesValue < 0 || !hasWindow || !['parent', 'child', 'listing'].includes(record.sales_scope)) {
      row.includedForAggregation = false;
      row.excludedReason = !Number.isFinite(salesValue) || salesValue < 0 ? 'invalid_sales_value' : !hasWindow ? 'missing_sales_window' : 'missing_sales_scope';
      excluded.push(row);
      continue;
    }
    salesRows.push(row);
  }

  const duplicateGroups = new Map();
  for (const row of salesRows) {
    if (!row.includedForAggregation || row.sales_scope !== 'parent' || !row.parent_asin) continue;
    const key = [row.parent_asin, row.period_start, row.period_end].join('|');
    const rows = duplicateGroups.get(key) ?? [];
    rows.push(row);
    duplicateGroups.set(key, rows);
  }
  for (const rows of duplicateGroups.values()) {
    if (rows.length < 2) continue;
    for (const duplicate of rows.slice(1)) {
      duplicate.includedForAggregation = false;
      duplicate.excludedReason = 'duplicate_parent_sales';
    }
  }

  return {
    usableSales: salesRows,
    excluded,
    duplicateGroups: [...duplicateGroups.values()].filter((group) => group.length > 1).map((group) => ({
      parent_asin: group[0].parent_asin,
      period_start: group[0].period_start,
      period_end: group[0].period_end,
      count: group.length
    }))
  };
}

export function hasSalesTrendHistory(records) {
  const periods = new Map();
  for (const record of records) {
    if (!record.asin || !record.period_start || !record.period_end || !['parent', 'child', 'listing'].includes(record.sales_scope)) continue;
    if (record.estimated_monthly_sales === null || record.estimated_monthly_sales === undefined || record.estimated_monthly_sales === '') continue;
    const sales = Number(record.estimated_monthly_sales);
    if (!Number.isFinite(sales) || sales < 0) continue;
    const key = `${record.asin}|${record.sales_scope}`;
    const recordPeriods = periods.get(key) ?? new Set();
    recordPeriods.add(`${record.period_start}|${record.period_end}`);
    periods.set(key, recordPeriods);
  }
  return [...periods.values()].some((recordPeriods) => recordPeriods.size > 1);
}

export function summarizeTransfer({ scores, hints = 0, skipped = false }) {
  if (skipped) return { scores: [null, null, null, null], total: null, outcome: 'unverified' };
  if (!Array.isArray(scores) || scores.length !== 4 || scores.some((score) => !Number.isInteger(score) || score < 0 || score > 2)) {
    return { scores: scores ?? [null, null, null, null], total: null, outcome: 'unverified', incomplete: true };
  }
  const total = scores.reduce((sum, score) => sum + score, 0);
  const passes = total >= 6 && scores.every((score) => score > 0);
  return { scores, total, outcome: passes ? (Number(hints) > 0 ? 'assisted_completion' : 'independent_application') : 'needs_practice' };
}

export function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
