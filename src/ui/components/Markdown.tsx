/**
 * Small, safe Markdown renderer for Ray's answers (no HTML injection: builds React elements).
 * Supports paragraphs, **bold**, *italic*, `code`, bullet and numbered lists, #/## headings,
 * a bold-only line as a section label, and simple pipe tables.
 */
import type { ReactNode } from 'react';

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\s][^*\n]*\*)/g;

function inline(text: string, key: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const k = `${key}-${i}`;
    if (/^\*\*.+\*\*$/.test(part) || /^__.+__$/.test(part)) return <strong key={k}>{part.slice(2, -2)}</strong>;
    if (/^`.+`$/.test(part)) return <code key={k}>{part.slice(1, -1)}</code>;
    if (/^\*[^*].*\*$/.test(part)) return <em key={k}>{part.slice(1, -1)}</em>;
    return part;
  });
}

type Block =
  | { t: 'p'; lines: string[] }
  | { t: 'h'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'table'; rows: string[][] };

function parse(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    const last = blocks[blocks.length - 1];
    if (!t) { blocks.push({ t: 'p', lines: [] }); continue; }
    const h = t.match(/^#{1,6}\s+(.*)$/);
    if (h) { blocks.push({ t: 'h', text: h[1] }); continue; }
    if (/^\*\*[^*]+\*\*:?$/.test(t) || /^__[^_]+__:?$/.test(t)) { blocks.push({ t: 'h', text: t.replace(/^(\*\*|__)|(\*\*|__):?$/g, '') }); continue; }
    const ul = t.match(/^[-*•]\s+(.*)$/);
    if (ul) { if (last?.t === 'ul') last.items.push(ul[1]); else blocks.push({ t: 'ul', items: [ul[1]] }); continue; }
    const ol = t.match(/^\d+[.)]\s+(.*)$/);
    if (ol) { if (last?.t === 'ol') last.items.push(ol[1]); else blocks.push({ t: 'ol', items: [ol[1]] }); continue; }
    if (t.startsWith('|') && t.endsWith('|')) {
      if (/^\|[\s:|-]+\|$/.test(t)) continue; // separator row
      const cells = t.slice(1, -1).split('|').map((c) => c.trim());
      if (last?.t === 'table') last.rows.push(cells); else blocks.push({ t: 'table', rows: [cells] });
      continue;
    }
    if (last?.t === 'p') last.lines.push(t); else blocks.push({ t: 'p', lines: [t] });
  }
  return blocks.filter((b) => b.t !== 'p' || b.lines.length > 0);
}

export function Markdown({ text }: { text: string }) {
  const blocks = parse(text);
  return (
    <div className="md">
      {blocks.map((b, i) => {
        const k = `b${i}`;
        if (b.t === 'h') return <h4 key={k}>{inline(b.text, k)}</h4>;
        if (b.t === 'ul' || b.t === 'ol') {
          const items = b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>);
          return b.t === 'ul' ? <ul key={k}>{items}</ul> : <ol key={k}>{items}</ol>;
        }
        if (b.t === 'table') {
          const [head, ...body] = b.rows;
          return (
            <div key={k} className="md-table"><table>
              <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `${k}-h${j}`)}</th>)}</tr></thead>
              <tbody>{body.map((r, j) => <tr key={j}>{r.map((c, x) => <td key={x}>{inline(c, `${k}-${j}-${x}`)}</td>)}</tr>)}</tbody>
            </table></div>
          );
        }
        return <p key={k}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l, `${k}-${j}`)}</span>)}</p>;
      })}
    </div>
  );
}
