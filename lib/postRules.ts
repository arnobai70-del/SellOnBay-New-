import { markdownText } from './markdown';

/* The rules for posts, without any database code, so the admin editor in the browser can show the same checks and hints. See lib/posts.ts. */
export type Post = {
  id: string;
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  body: string;
  coverUrl: string;
  coverAlt: string;
  status: 'draft' | 'published';
  noindex: boolean;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
};
export type PostInput = Omit<Post, 'id' | 'publishedAt' | 'createdAt' | 'updatedAt'>;
/* What search engines show. Google cuts titles at about 60 characters and descriptions at about 160. */
export const LIMITS = { title: 120, metaTitle: 70, metaDescription: 170, excerpt: 300, body: 50_000, slug: 80, coverAlt: 150 } as const;
export const GOOD = { metaTitle: 60, metaDescription: 160, minDescription: 70, minWords: 300 } as const;

export const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITS.slug)
    .replace(/-+$/, '');

/* Checks a post before it is saved. Returns the first problem in plain words, or null. */
export function postProblem(p: PostInput): string | null {
  if (p.title.trim().length < 3 || p.title.length > LIMITS.title) return `The title needs 3 to ${LIMITS.title} characters.`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug) || p.slug.length > LIMITS.slug) return 'The address can use only small letters, numbers and dashes.';
  if (p.metaTitle.length > LIMITS.metaTitle) return `Keep the meta title under ${LIMITS.metaTitle} characters (about ${GOOD.metaTitle} show in Google).`;
  if (p.metaDescription.length > LIMITS.metaDescription) return `Keep the meta description under ${LIMITS.metaDescription} characters (about ${GOOD.metaDescription} show in Google).`;
  if (p.excerpt.length > LIMITS.excerpt) return `Keep the short summary under ${LIMITS.excerpt} characters.`;
  if (p.body.length > LIMITS.body) return 'The post is too long.';
  if (p.coverUrl && (!/^https:\/\/\S+$/.test(p.coverUrl) || p.coverUrl.length > 500)) return 'The cover picture must be an https:// address.';
  if (p.coverUrl && !p.coverAlt.trim()) return 'Describe the cover picture in a few words (alt text), for search engines and screen readers.';
  if (p.coverAlt.length > LIMITS.coverAlt) return `Keep the picture description under ${LIMITS.coverAlt} characters.`;
  if (p.status === 'published' && !p.body.trim()) return 'Write the post before publishing it.';
  return null;
}

/* SEO hints for the editor and the admin list: things that are allowed but hurt ranking. */
export function seoHints(p: Pick<Post, 'title' | 'metaTitle' | 'metaDescription' | 'excerpt' | 'body' | 'coverUrl'>): string[] {
  const out: string[] = [];
  const title = p.metaTitle || p.title;
  const desc = p.metaDescription || p.excerpt;
  if (!p.metaTitle) out.push('No meta title: the post title is used.');
  if (title.length > GOOD.metaTitle) out.push(`The title in Google is ${title.length} characters; about ${GOOD.metaTitle} are shown.`);
  if (!desc) out.push('No meta description: Google picks some text from the page.');
  else if (desc.length < GOOD.minDescription) out.push(`The description is short (${desc.length} characters); aim for ${GOOD.minDescription} to ${GOOD.metaDescription}.`);
  else if (desc.length > GOOD.metaDescription) out.push(`The description is ${desc.length} characters; about ${GOOD.metaDescription} are shown.`);
  const words = markdownText(p.body).split(/\s+/).filter(Boolean).length;
  if (words < GOOD.minWords) out.push(`The post has ${words} words; posts under ${GOOD.minWords} words rarely rank.`);
  if (!/^#{1,3}\s/m.test(p.body)) out.push('Add a few ## headings so readers and search engines can see the parts.');
  if (!p.coverUrl) out.push('No cover picture: shares on social media will use the site picture.');
  return out;
}

/* The description used in search and shares: the meta description, else the summary, else the start of the post. */
export const descriptionOf = (p: Pick<Post, 'metaDescription' | 'excerpt' | 'body'>) => {
  const d = p.metaDescription || p.excerpt || markdownText(p.body);
  return d.length > GOOD.metaDescription ? d.slice(0, GOOD.metaDescription - 1).replace(/\s+\S*$/, '') + '…' : d;
};
