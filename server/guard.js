// 数字溯源护栏：LLM 文字里出现的数字必须能在代码给它的事实材料中找到（PRD 9.1：LLM 只解释，不决定数字）。
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
const PLAIN = /\d+(?:\.\d+)?/g;

function canonical(raw) {
  const value = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}

export function numbersIn(text) {
  return [...String(text ?? '').matchAll(NUMBER)].map((match) => canonical(match[0])).filter((value) => value !== null);
}

// 紧跟计数量词的数字（“3 个”“2 项”）是对条目的计数，不是数据，不要求溯源。
const COUNT_UNIT = /^\s*(个|条|项|次|步|种|类|维|张|组|位)/;
const KNOWN_NUMERIC_SOURCE_NAMES = /(?:proposition|california proposition|prop\.?)\s*65\b/i;
function claimedNumbers(text) {
  const source = String(text ?? '');
  const out = [];
  for (const match of source.matchAll(NUMBER)) {
    if (COUNT_UNIT.test(source.slice(match.index + match[0].length))) continue;
    if (KNOWN_NUMERIC_SOURCE_NAMES.test(source.slice(Math.max(0, match.index - 24), match.index + match[0].length))) continue;
    const value = canonical(match[0]);
    if (value !== null) out.push(value);
  }
  return out;
}

export function urlsIn(text) {
  return [...String(text ?? '').matchAll(/https?:\/\/[^\s)）\]"'，。]+/gi)].map((match) => match[0]);
}

export function groundedNumbers(facts) {
  const set = new Set();
  const add = (value) => {
    set.add(Math.round(value * 10000) / 10000);
    set.add(Math.round(value * 100 * 10000) / 10000);
    set.add(Math.round(value / 100 * 10000) / 10000);
  };
  const text = typeof facts === 'string' ? facts : JSON.stringify(facts);
  for (const value of numbersIn(text)) add(value);
  for (const match of text.matchAll(PLAIN)) { const value = canonical(match[0]); if (value !== null) add(value); }
  return set;
}

// 0—10 的小整数（计数、序号）不要求溯源，其余数字必须在事实材料里出现过。
export function ungroundedNumbers(text, grounded) {
  const bad = [];
  for (const value of claimedNumbers(text)) {
    if (Number.isInteger(value) && value >= 0 && value <= 10) continue;
    if (!grounded.has(Math.round(value * 10000) / 10000)) bad.push(value);
  }
  return [...new Set(bad)];
}

export function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

// 禁止的断言：产品不预测、不保证，也不给没有标定依据的行业门槛（PRD 4.3、1.3）。
const FORBIDDEN = [/稳赚|必赚|包赚|保证(盈利|赚钱|成功|爆单)|一定(能|会)(赚|成功|爆)|肯定(能|会)(赚|成功)/, /蓝海/, /合规(无忧|没有问题|无风险)|不会侵权|绝对安全/];

export function forbiddenClaims(text) {
  return FORBIDDEN.filter((pattern) => pattern.test(String(text ?? ''))).map((pattern) => String(text).match(pattern)[0]);
}

export function checkGrounding(output, facts, fields) {
  const grounded = groundedNumbers(facts);
  const problems = [];
  for (const { label, text } of fields(output)) {
    const bad = ungroundedNumbers(text, grounded);
    if (bad.length) problems.push(`${label} 中的数字 ${bad.join('、')} 不在事实材料里`);
  }
  return problems;
}
