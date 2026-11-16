import { esc, termText } from './common.js';

// 极简 Markdown 渲染：只覆盖成果导出用到的标题、列表、加粗和段落。先转义再加标记，不执行任何 HTML。
export function renderMarkdown(text, { glossary = [] } = {}) {
  const out = [];
  let inList = false;
  const words = line => line.split(/(https?:\/\/[^\s]+|`[^`]+`)/g).map(part => /^https?:\/\//.test(part) ? esc(part) : part.startsWith('`') && part.endsWith('`') ? `<code>${esc(part.slice(1,-1))}</code>` : termText(part,glossary)).join('');
  const inline = line => line.split(/(\*\*.+?\*\*)/g).map(part => part.startsWith('**') && part.endsWith('**') ? `<strong>${words(part.slice(2,-2))}</strong>` : words(part)).join('');
  let skipGlossaryLevel = null;
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const section = /^(#{1,6})\s+(.*)$/.exec(line);
    if (section && /^(?:本次报告术语|更多常见术语|术语表|名词解读|名词解释)$/.test(section[2].trim())) { skipGlossaryLevel=section[1].length; if(inList){out.push('</ul>');inList=false;} continue; }
    if (skipGlossaryLevel !== null) { if(!section || section[1].length>skipGlossaryLevel) continue; skipGlossaryLevel=null; }
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
