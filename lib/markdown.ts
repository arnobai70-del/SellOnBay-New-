/*
 * A small, safe Markdown reader for posts written in the admin panel. It never produces HTML text: it returns plain data that
 * components/PostBody.tsx turns into React elements, so nothing in a post can inject markup or scripts.
 *
 * Supported: ## and ### headings (a single # is read as ##, because the post title is the page's only h1), paragraphs, - and 1. lists,
 * > quotes, ![alt](https://...) images on their own line, @[video](https://...) videos on their own line (a YouTube or Vimeo address, or
 * an https .mp4 or .webm file; a YouTube or Vimeo address alone on a line works too), --- for a dividing line, and inline **bold**,
 * *italic*, `code` and [links](https://... or /path). Pictures may also be our own uploads (/blog/media/<name>).
 */
export type Inline = { t: 'text'; v: string } | { t: 'b'; c: Inline[] } | { t: 'i'; c: Inline[] } | { t: 'code'; v: string } | { t: 'a'; href: string; external: boolean; c: Inline[] };
export type Block =
  | { t: 'h2' | 'h3'; c: Inline[]; id: string }
  | { t: 'p' | 'quote'; c: Inline[] }
  | { t: 'ul' | 'ol'; items: Inline[][] }
  | { t: 'img'; src: string; alt: string }
  | { t: 'video'; kind: 'embed' | 'file'; src: string; title: string }
  | { t: 'hr' };

/* Only web addresses and our own paths. No javascript:, data: or other schemes. */
export function safeHref(raw: string): { href: string; external: boolean } | null {
  const u = raw.trim();
  if (/^\/(?!\/)[^\s]*$/.test(u) || /^#[\w-]+$/.test(u)) return { href: u, external: false };
  try {
    const p = new URL(u);
    if (p.protocol !== 'https:' && p.protocol !== 'http:') return null;
    return { href: p.toString(), external: true };
  } catch {
    return null;
  }
}

/*
 * A video address we can show: YouTube and Vimeo become their privacy-friendly player addresses (built from the id only, so nothing
 * else from the address reaches the page), an https .mp4 or .webm file plays in the browser's own player. Anything else is null.
 */
export function videoOf(raw: string): { kind: 'embed' | 'file'; src: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  const id = (v: string | null | undefined) => (v && /^[\w-]{6,20}$/.test(v) ? v : null);
  let yt: string | null = null;
  if (host === 'youtu.be') yt = id(u.pathname.slice(1));
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/);
    yt = id(m ? m[1] : u.pathname === '/watch' ? u.searchParams.get('v') : null);
  }
  if (yt) return { kind: 'embed', src: `https://www.youtube-nocookie.com/embed/${yt}` };
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = u.pathname.match(/(?:^|\/)(\d{5,12})(?:\/|$)/);
    if (m) return { kind: 'embed', src: `https://player.vimeo.com/video/${m[1]}?dnt=1` };
  }
  if (/\.(mp4|webm)$/i.test(u.pathname)) return { kind: 'file', src: u.toString() };
  return null;
}

export const headingId = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

const plain = (c: Inline[]): string => c.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : plain(n.c))).join('');

export function parseInline(s: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ t: 'text', v: text });
    text = '';
  };
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    let m: RegExpMatchArray | null;
    if (depth < 3 && (m = rest.match(/^\*\*(.+?)\*\*/))) {
      flush();
      out.push({ t: 'b', c: parseInline(m[1], depth + 1) });
      i += m[0].length;
    } else if (depth < 3 && (m = rest.match(/^(\*|_)(?!\s)(.+?)(?<!\s)\1(?![\w*])/))) {
      flush();
      out.push({ t: 'i', c: parseInline(m[2], depth + 1) });
      i += m[0].length;
    } else if ((m = rest.match(/^`([^`]+)`/))) {
      flush();
      out.push({ t: 'code', v: m[1] });
      i += m[0].length;
    } else if (depth < 3 && (m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/))) {
      flush();
      const h = safeHref(m[2]);
      if (h) out.push({ t: 'a', href: h.href, external: h.external, c: parseInline(m[1], depth + 1) });
      else out.push({ t: 'text', v: m[1] });
      i += m[0].length;
    } else {
      text += s[i];
      i++;
    }
  }
  flush();
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const used = new Map<string, number>();
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: { t: 'ul' | 'ol'; items: string[] } | null = null;
  let quote: string[] = [];
  const endPara = () => {
    if (para.length) blocks.push({ t: 'p', c: parseInline(para.join(' ')) });
    para = [];
  };
  const endList = () => {
    if (list) blocks.push({ t: list.t, items: list.items.map((x) => parseInline(x)) });
    list = null;
  };
  const endQuote = () => {
    if (quote.length) blocks.push({ t: 'quote', c: parseInline(quote.join(' ')) });
    quote = [];
  };
  const endAll = () => {
    endPara();
    endList();
    endQuote();
  };
  for (const raw of lines) {
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if (!line) {
      endAll();
    } else if ((m = line.match(/^(#{1,4})\s+(.+)$/))) {
      endAll();
      const c = parseInline(m[2]);
      let id = headingId(plain(c)) || 'section';
      const n = used.get(id) ?? 0;
      used.set(id, n + 1);
      if (n) id = `${id}-${n + 1}`;
      blocks.push({ t: m[1].length <= 2 ? 'h2' : 'h3', c, id });
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      endAll();
      blocks.push({ t: 'hr' });
    } else if ((m = line.match(/^@\[([^\]]*)\]\(([^)\s]+)\)$/)) || (/^https:\/\/\S+$/.test(line) && videoOf(line)?.kind === 'embed')) {
      endAll();
      const label = m ? m[1].trim() : '';
      const v = videoOf(m ? m[2] : line);
      if (v) blocks.push({ t: 'video', kind: v.kind, src: v.src, title: label && label.toLowerCase() !== 'video' ? label : 'Video' });
    } else if ((m = line.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) {
      endAll();
      const h = safeHref(m[2]);
      if (h && (h.external ? h.href.startsWith('https:') : true)) blocks.push({ t: 'img', src: h.href, alt: m[1].trim() });
    } else if ((m = line.match(/^[-*]\s+(.+)$/)) || (m = line.match(/^\d+[.)]\s+(.+)$/))) {
      endPara();
      endQuote();
      const kind = /^\d/.test(line) ? 'ol' : 'ul';
      if (list && list.t !== kind) endList();
      list ??= { t: kind, items: [] };
      list.items.push(m[1]);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      endPara();
      endList();
      quote.push(m[1]);
    } else {
      endList();
      endQuote();
      para.push(line);
    }
  }
  endAll();
  return blocks;
}

/* The words of a post without any marks, for a description or a word count. */
export const markdownText = (src: string) =>
  parseMarkdown(src)
    .map((b) => (b.t === 'img' || b.t === 'video' || b.t === 'hr' ? '' : 'items' in b ? b.items.map(plain).join(' ') : plain(b.c)))
    .filter(Boolean)
    .join(' ');
