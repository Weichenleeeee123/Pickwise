import { inspectEvidence } from '../src/domain.js';
import { numberOrNull } from '../src/format.js';

const REQUIRED = ['marketplace', 'asin', 'title', 'source_name', 'observed_at'];
const US_MARKET = /^(us|usa|amazon\.com|amazon us|amazon\.com \(us\)|united states)$/i;
export const IMPORT_LIMITS = { bytes: 5 * 1024 * 1024, records: 2000 };

export function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) throw new Error('CSV 至少需要表头和一条记录');
  const rows = lines.map(parseCsvLine);
  const headers = rows.shift().map((header) => header.trim());
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') { current += '"'; index++; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { result.push(current); current = ''; }
    else current += character;
  }
  result.push(current);
  return result;
}

export function parseEvidenceFile(name, content) {
  if (Buffer.byteLength(content, 'utf8') > IMPORT_LIMITS.bytes) throw new Error('文件不能超过 5 MB');
  let records;
  if (String(name).toLowerCase().endsWith('.json')) {
    let parsed;
    try { parsed = JSON.parse(content); } catch { throw new Error('JSON 文件无法解析'); }
    records = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.products) ? parsed.products : null;
    if (!records) throw new Error('JSON 须为数组，或包含 products 数组');
  } else {
    records = parseCsv(content);
  }
  if (records.length > IMPORT_LIMITS.records) throw new Error('单次最多导入 2,000 条商品记录');

  const rejected = [];
  const accepted = [];
  for (const raw of records) {
    const record = { ...raw };
    const missing = REQUIRED.filter((key) => !String(record[key] ?? '').trim());
    if (missing.length) { rejected.push({ asin: record.asin ?? '', reason: `缺少必需字段：${missing.join('、')}` }); continue; }
    if (!US_MARKET.test(String(record.marketplace).trim())) { rejected.push({ asin: record.asin, reason: `市场 ${record.marketplace} 不在首版支持范围（仅 Amazon 美国站）` }); continue; }
    record.asin = String(record.asin).trim().toUpperCase();
    record.source_mode = 'user_import';
    const issues = [];
    for (const key of ['estimated_monthly_sales', 'price', 'rating', 'review_count']) {
      if (record[key] === undefined || record[key] === '' || record[key] === null) { delete record[key]; continue; }
      const value = numberOrNull(record[key]);
      if (value === null || value < 0) { issues.push(`${key} 不是有效的非负数字`); delete record[key]; } else record[key] = value;
    }
    if (record.price !== undefined && !String(record.currency ?? '').trim()) { issues.push('价格缺少币种，已忽略价格'); delete record.price; }
    if (issues.length) record._qualityIssue = issues.join('；');
    accepted.push(record);
  }
  return { records: accepted, rejected, validation: inspectEvidence(accepted) };
}

export function appendEvidence(session, parsed, fileName) {
  let next = session.evidence.length;
  for (const record of parsed.records) record.id = `E${++next}`;
  session.evidence.push(...parsed.records);
  session.evidenceRejected.push(...parsed.rejected);
  session.importLog.push({ at: new Date().toISOString(), file: fileName, accepted: parsed.records.length, rejected: parsed.rejected.length, excluded: parsed.validation.excluded.length });
}
