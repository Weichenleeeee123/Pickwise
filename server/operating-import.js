import { parseCsv } from './importer.js';
import { appendUniqueEvidence } from './monitoring.js';
const COSTS = ['price', 'goodsCost', 'logisticsCost', 'platformCost', 'returnsCost', 'otherCost', 'cpc', 'cvr'];
export const LAUNCH_FIELDS = { freight: '首批头程与运输现金', duty: '首批关税与清关', prep: '首批包装与贴标', advertising: '启动广告预留', storage: '仓储现金预留', compliance: '检测认证费用', fixed: '其他固定启动支出', reserve: '额外现金缓冲', leadDays: '生产运输天数', inventoryDays: '库存周转假设天数', payoutDays: '回款等待天数' };
const dateOk = v => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(v)) && Number.isFinite(Date.parse(v));
const amount = (v, key) => { const n = Number(v); if (v === null || v === undefined || v === '' || !Number.isFinite(n) || n < 0) throw new Error(`${key} 必须是非负数字，未知值不能填零替代`); return n; };
export function parseOperatingFile(name, content, targetAsin) {
  if (Buffer.byteLength(content, 'utf8') > 5 * 1024 * 1024) throw new Error('文件不能超过 5 MB');
  if (name.toLowerCase().endsWith('.json')) {
    const raw = JSON.parse(content);
    if (raw.type !== 'quotes' || !String(raw.source ?? '').trim() || !dateOk(raw.date)) throw new Error('报价 JSON 需要 type=quotes、来源 source 和有效日期 date');
    if (raw.currency !== 'USD') throw new Error('经营报价导入需要 USD；其他币种请先按有来源日期的汇率换算并记录来源');
    const values = {}, launch = {};
    for (const [k, v] of Object.entries(raw.values ?? {})) if (COSTS.includes(k)) values[k] = amount(v, k);
    for (const [k, v] of Object.entries(raw.launch ?? {})) if (k in LAUNCH_FIELDS) launch[k] = amount(v, k);
    if (values.cvr != null && (values.cvr <= 0 || values.cvr > 1)) throw new Error('CVR 必须大于零且不超过一');
    if (!Object.keys(values).length && !Object.keys(launch).length) throw new Error('报价没有可用成本项');
    const moq = raw.moq === undefined ? undefined : amount(raw.moq, 'MOQ');
    if (moq !== undefined && !Number.isInteger(moq)) throw new Error('MOQ 必须是整数');
    return { values, launch, ...(moq === undefined ? {} : { moq }), provenance: { source: String(raw.source).slice(0, 200), date: raw.date, currency: 'USD', nature: 'assumption', note: '用户提供的来源报价，未独立核实；不代表未来实际成本。' } };
  }
  const all = parseCsv(content);
  if (all.length > 50000) throw new Error('报表最多 50,000 行');
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const field = (r, names) => Object.entries(r).find(([k]) => names.map(norm).includes(norm(k)))?.[1];
  if (all.some(r => field(r, ['Units Ordered']) !== undefined)) {
    if (!targetAsin) throw new Error('销量报表需要先确定目标 ASIN');
    const rows = all.filter(r => String(field(r, ['Child ASIN', '(Child) ASIN', 'ASIN'])).toUpperCase() === targetAsin);
    if (!rows.length) throw new Error('销量报表没有目标子 ASIN，不能混用父体或全店合计');
    const source = `用户导入卖家销量报表 ${String(name).slice(0, 100)}`;
    const sales = rows.map(r => {
      const date = field(r, ['Date']);
      if (!dateOk(date) || field(r, ['Currency']) !== 'USD') throw new Error('销量报表每行需要 YYYY-MM-DD 日期与 Currency=USD');
      const units = amount(field(r, ['Units Ordered']), 'Units Ordered');
      if (!Number.isInteger(units)) throw new Error('销量报表件数必须是整数');
      return { evidence_kind: 'seller_sales', asin: targetAsin, title: '卖家订单商品件数', nature: 'fact', period_start: date, period_end: date, units_ordered: units, ordered_product_sales: amount(field(r, ['Ordered Product Sales']), 'Ordered Product Sales'), currency: 'USD', sales_scope: 'child', source_name: source, source_url: '', source_mode: 'user_import', observed_at: new Date().toISOString(), source_note: '用户导入卖家报表；为该日期下单商品件数，不是全市场销量，不是月销估算。' };
    });
    if (new Set(sales.map(r => r.period_start)).size !== sales.length) throw new Error('销量报表有重复日期与ASIN，请使用单一报表粒度');
    return { values: {}, launch: {}, sales, provenance: { source, date: sales.map(r => r.period_end).sort().at(-1), currency: 'USD', nature: 'fact', note: '用户导入卖家订单报表，保留日期、子体和件数口径。' } };
  }
  if (!all.some(r => field(r, ['Advertised ASIN', 'ASIN']) !== undefined) || !targetAsin) throw new Error('广告报表需要 Advertised ASIN 列及已确定的目标 ASIN，避免混用全账户数据');
  const rows = all.filter(r => String(field(r, ['Advertised ASIN', 'ASIN'])).toUpperCase() === targetAsin);
  if (!rows.length) throw new Error('报表中没有目标 ASIN 的记录');
  let spend = 0, clicks = 0, orders = 0; const dates = [];
  for (const r of rows) {
    if (field(r, ['Currency']) !== 'USD') throw new Error('广告报表每行必须有 Currency=USD');
    const date = field(r, ['Date', 'Start Date']);
    if (!dateOk(date)) throw new Error('广告报表需要 YYYY-MM-DD 日期');
    dates.push(date); spend += amount(field(r, ['Spend', 'Cost']), 'Spend'); clicks += amount(field(r, ['Clicks']), 'Clicks'); orders += amount(field(r, ['Purchases', 'Orders', '7 Day Total Orders (#)', '14 Day Total Orders (#)']), 'Purchases');
  }
  if (clicks <= 0 || orders > clicks) throw new Error('没有足够点击与订单计算有效 CPC/CVR，或归因订单口径不适合点击转化模型');
  dates.sort();
  return { values: { cpc: spend / clicks, cvr: orders > 0 ? orders / clicks : null }, launch: {}, totals: { spend, clicks, orders, rows: rows.length }, provenance: { source: `用户导入广告报表 ${String(name).slice(0, 100)}`, date: dates.at(-1), period_start: dates[0], period_end: dates.at(-1), currency: 'USD', nature: 'fact', note: 'CPC=报表花费/点击，CVR=归因订单/点击；须使用同一维度和归因窗口，历史表现不保证未来。' } };
}
export function applyOperatingImport(session, parsed) {
  session.constraints.values = { ...session.constraints.values, ...parsed.values };
  session.constraints.launch = { ...(session.constraints.launch ?? {}), ...parsed.launch };
  if (parsed.moq !== undefined) session.constraints.moq = parsed.moq;
  if ('goodsCost' in parsed.values) session.constraints.goodsCostCurrency = 'USD';
  session.constraints.inputSources = { ...(session.constraints.inputSources ?? {}), ...Object.fromEntries([...Object.keys(parsed.values), ...Object.keys(parsed.launch)].map(k => [k, parsed.provenance])) };
  session.constraints.updatedAt = new Date().toISOString();
  if (parsed.sales?.length) appendUniqueEvidence(session, parsed.sales);
  session.operatingImports ??= [];
  session.operatingImports.push({ ...parsed.provenance, at: session.constraints.updatedAt, totals: parsed.totals ?? null, fields: [...Object.keys(parsed.values), ...Object.keys(parsed.launch)] });
}
