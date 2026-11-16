import { esc } from './common.js';

// 极简 Markdown 渲染：只覆盖成果导出用到的标题、列表、加粗和段落。先转义再加标记，不执行任何 HTML。
export function renderMarkdown(text) {
  const out = [];
  let inList = false;
  const inline = (line) => esc(line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const item = /^(\s*)- (.*)$/.exec(line);
    if (item) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li${item[1].length ? ' class="sub"' : ''}>${inline(item[2])}</li>`);
      continue;
    }
    if (inList) { out.push('</ul>'); inList = false; }
    const heading = /^(#{1,3}) (.*)$/.exec(line);
    if (heading) out.push(`<h${heading[1].length + 1}>${inline(heading[2])}</h${heading[1].length + 1}>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push('</ul>');
  return out.join('');
}
