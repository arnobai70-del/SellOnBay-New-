import { descriptionOf, publishedPosts } from '@/lib/posts';
import { SITE_NAME, SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* RSS feed of the published posts that are not kept out of search. */
export async function GET() {
  const posts = (await publishedPosts(50)).filter((p) => !p.noindex);
  const items = posts
    .map((p) => {
      const url = `${SITE_URL}/blog/${p.slug}`;
      return `<item><title>${esc(p.title)}</title><link>${esc(url)}</link><guid isPermaLink="true">${esc(url)}</guid><pubDate>${new Date(p.publishedAt ?? p.createdAt).toUTCString()}</pubDate><description>${esc(descriptionOf(p))}</description></item>`;
    })
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(SITE_NAME)} blog</title><link>${esc(SITE_URL)}/blog</link><description>${esc(`Guides from ${SITE_NAME}`)}</description><language>en</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}
