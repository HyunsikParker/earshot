// A small, safe renderer for the report: headings, bullet lists, bold, paragraphs.
import { esc } from './dom.js';

const inline = (text) => esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

export function renderMarkdown(markdown) {
  const out = [];
  let list = false;
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) out.push(`<p>${paragraph.join(' ')}</p>`);
    paragraph = [];
    if (list) out.push('</ul>');
    list = false;
  };
  for (const raw of String(markdown ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (!line) {
      flush();
    } else if (heading) {
      flush();
      out.push(`<h3>${inline(heading[1])}</h3>`);
    } else if (bullet) {
      if (paragraph.length) flush();
      if (!list) out.push('<ul>');
      list = true;
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else {
      if (list) flush();
      paragraph.push(inline(line));
    }
  }
  flush();
  return out.join('');
}
