// 轻量 JSON Schema 校验（只支持本项目用到的子集），用于约束 LLM 的结构化输出。
export function validate(schema, value, path = '$') {
  const errors = [];
  walk(schema, value, path, errors);
  return errors;
}

function walk(schema, value, path, errors) {
  if (schema.enum && !schema.enum.includes(value)) { errors.push(`${path} 必须是 ${schema.enum.join(' / ')} 之一`); return; }
  switch (schema.type) {
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${path} 应为对象`); return; }
      for (const key of schema.required ?? []) if (value[key] === undefined || value[key] === null) errors.push(`${path}.${key} 缺失`);
      for (const [key, sub] of Object.entries(schema.properties ?? {})) {
        if (value[key] !== undefined && value[key] !== null) walk(sub, value[key], `${path}.${key}`, errors);
      }
      return;
    }
    case 'array': {
      if (!Array.isArray(value)) { errors.push(`${path} 应为数组`); return; }
      if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} 至少 ${schema.minItems} 项`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} 最多 ${schema.maxItems} 项`);
      value.forEach((item, index) => walk(schema.items ?? {}, item, `${path}[${index}]`, errors));
      return;
    }
    case 'string': {
      if (typeof value !== 'string' || (schema.minLength && value.trim().length < schema.minLength)) errors.push(`${path} 应为非空字符串`);
      else if (schema.maxLength && value.length > schema.maxLength) errors.push(`${path} 超过 ${schema.maxLength} 字`);
      return;
    }
    case 'integer':
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))) errors.push(`${path} 应为${schema.type === 'integer' ? '整数' : '数字'}`);
      else if ((schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum)) errors.push(`${path} 超出范围 ${schema.minimum ?? ''}~${schema.maximum ?? ''}`);
      return;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') errors.push(`${path} 应为布尔值`);
      return;
    }
    default:
  }
}

export function extractJson(text) {
  const source = String(text ?? '');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(source)?.[1];
  const candidates = [fenced, source].filter(Boolean);
  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch { /* 尝试下一个候选 */ }
  }
  return null;
}
