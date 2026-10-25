/*
 * Turns the text of a page (its rendered elements) back into the small Markdown lib/markdown.ts reads, so an admin can start rewriting
 * a policy page from its current words instead of a blank box. Only what the reader understands survives: headings, paragraphs, lists,
 * quotes, bold, italic, code and links. Works on any DOM-like node, so it can be tested without a browser.
 */
export type MdNode = { nodeType: number; nodeName: string; textContent: string | null; childNodes: ArrayLike<MdNode>; getAttribute?: (name: string) => string | null };

const TEXT = 3;
const ELEMENT = 1;
const kids = (n: MdNode) => Array.from(n.childNodes);
const squash = (s: string) => s.replace(/\s+/g, ' ');

export function inlineMarkdown(n: MdNode): string {
  if (n.nodeType === TEXT) return squash(n.textContent ?? '');
  if (n.nodeType !== ELEMENT) return '';
  const inner = () => kids(n).map(inlineMarkdown).join('');
  switch (n.nodeName.toUpperCase()) {
    case 'STRONG':
    case 'B': {
      const t = inner().trim();
      return t ? `**${t}**` : '';
    }
    case 'EM':
    case 'I': {
      const t = inner().trim();
      return t ? `*${t}*` : '';
    }
    case 'CODE':
      return `\`${squash(n.textContent ?? '').trim()}\``;
    case 'A': {
      const t = inner().trim();
      const href = n.getAttribute?.('href') ?? '';
      return href && t ? `[${t}](${href})` : t;
    }
    case 'BR':
      return ' ';
    case 'SCRIPT':
    case 'STYLE':
    case 'SVG':
      return '';
    default:
      return inner();
  }
}

export function htmlToMarkdown(root: MdNode): string {
  const out: string[] = [];
  const line = (s: string) => {
    const t = s.trim();
    if (t) out.push(t);
  };
  const walk = (n: MdNode) => {
    if (n.nodeType === TEXT) return line(squash(n.textContent ?? ''));
    if (n.nodeType !== ELEMENT) return;
    const tag = n.nodeName.toUpperCase();
    if (tag === 'H1' || tag === 'H2') return line(`## ${inlineMarkdown(n).trim()}`);
    if (tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6') return line(`### ${inlineMarkdown(n).trim()}`);
    if (tag === 'P') return line(inlineMarkdown(n));
    if (tag === 'BLOCKQUOTE') return line(`> ${inlineMarkdown(n).trim()}`);
    if (tag === 'UL' || tag === 'OL') {
      const items = kids(n)
        .filter((k) => k.nodeType === ELEMENT && k.nodeName.toUpperCase() === 'LI')
        .map((k, i) => `${tag === 'OL' ? `${i + 1}.` : '-'} ${inlineMarkdown(k).trim()}`);
      if (items.length) out.push(items.join('\n'));
      return;
    }
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SVG' || tag === 'FORM' || tag === 'BUTTON') return;
    if (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE' || tag === 'DL' || tag === 'DT' || tag === 'DD') {
      // a container: its block children become blocks, loose words become a paragraph
      let loose = '';
      for (const k of kids(n)) {
        const kt = k.nodeType === ELEMENT ? k.nodeName.toUpperCase() : '';
        if (k.nodeType === TEXT || ['STRONG', 'B', 'EM', 'I', 'CODE', 'A', 'BR', 'SPAN'].includes(kt)) loose += inlineMarkdown(k);
        else {
          line(loose);
          loose = '';
          walk(k);
        }
      }
      return line(loose);
    }
    line(inlineMarkdown(n));
  };
  kids(root).forEach(walk);
  return out.join('\n\n');
}
