import sanitizeHtml from 'sanitize-html';

/*
 * The guides editor's output (owner, 2026-11-08) is HTML, and HTML from a browser is never trusted: it is cleaned here when it is saved and again
 * when it is shown. Only the editor's own blocks survive: headings 1 to 4, text styles, colour and alignment, lists and check lists, quotes, code,
 * links, dividers, tables, callouts, buttons, pictures (ours or https, with alt text), galleries, YouTube or Vimeo players and website cards.
 * No script, no event handler, no style other than colour, highlight and alignment, no iframe from anywhere else.
 */
const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i];
const EMBED_HOSTS = ['www.youtube-nocookie.com', 'www.youtube.com', 'player.vimeo.com'];
const ownOrHttps = (src: string) => /^\/blog\/media\/[A-Za-z0-9._-]{1,120}$/.test(src) || /^https:\/\/[^\s"'<>]{4,500}$/.test(src);

export function cleanGuideHtml(html: string): string {
  return sanitizeHtml(html.slice(0, 400_000), {
    allowedTags: [
      'h1',
      'h2',
      'h3',
      'h4',
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'mark',
      'span',
      'a',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'colgroup',
      'col',
      'figure',
      'figcaption',
      'img',
      'iframe',
      'div',
      'label',
      'input',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'data-type', 'class'],
      img: ['src', 'alt', 'title', 'width', 'height', 'data-width', 'loading', 'decoding'],
      iframe: ['src', 'width', 'height', 'allowfullscreen', 'title', 'loading', 'referrerpolicy'],
      div: ['data-type', 'data-tone', 'data-slug', 'class', 'data-youtube-video'],
      ul: ['data-type'],
      li: ['data-type', 'data-checked'],
      input: ['type', 'checked', 'disabled'],
      th: ['colspan', 'rowspan', 'colwidth'],
      td: ['colspan', 'rowspan', 'colwidth'],
      code: ['class'],
      pre: ['class'],
      mark: ['data-color', 'style'],
      span: ['style'],
      p: ['style'],
      h1: ['style'],
      h2: ['style'],
      h3: ['style'],
      h4: ['style'],
    },
    allowedStyles: {
      '*': { color: COLOR, 'background-color': COLOR, 'text-align': [/^(left|right|center|justify)$/] },
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { img: ['https'], iframe: ['https'] },
    allowProtocolRelative: false,
    allowedIframeHostnames: EMBED_HOSTS,
    exclusiveFilter: (frame) =>
      (frame.tag === 'img' && (!ownOrHttps(frame.attribs.src ?? '') || !(frame.attribs.alt ?? '').trim())) || // a picture needs alt text
      (frame.tag === 'input' && frame.attribs.type !== 'checkbox'),
    transformTags: {
      a: (tag, attribs) => {
        const href = attribs.href ?? '';
        const external = /^https?:\/\//i.test(href) && !/^https:\/\/(www\.)?sellonbay\.com(\/|$)/i.test(href);
        return { tagName: 'a', attribs: { ...attribs, ...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : { rel: attribs.rel ?? '' }) } };
      },
      img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy', decoding: 'async' } }),
      iframe: (tag, attribs) => ({ tagName: 'iframe', attribs: { ...attribs, loading: 'lazy', referrerpolicy: 'strict-origin-when-cross-origin', allowfullscreen: 'true' } }),
      input: (tag, attribs) => ({ tagName: 'input', attribs: { type: 'checkbox', disabled: 'disabled', ...(attribs.checked !== undefined ? { checked: 'checked' } : {}) } }),
    },
  });
}

/* Plain words of a guide, for its word count, reading time and the search index. */
export const guideText = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export const wordCount = (html: string) => (guideText(html) ? guideText(html).split(' ').length : 0);
export const readingMinutes = (html: string) => Math.max(1, Math.round(wordCount(html) / 220));
