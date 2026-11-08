import 'server-only';
import { publishedFaq } from '../cms/docStore';
import { faqToShow } from '../faq';
import { publishedPosts } from '../posts';
import { domainGuess, helpAnchor, MIN_QUERY, norm, rank, suggestions } from '../searchCore';
import { HUBS } from '../seo/hubs';
import { createAdminClient } from '../supabase/server';
import { supabaseConfigured } from '../supabase/env';
import { categoryPath, publicSellers, publicWebsites, websiteCategories, websitePath } from './catalog';
import { plainWords } from './words';

/*
 * Smart search (owner, 2026-11-08): websites, sellers, a domain check, guides and help articles, grouped by type. Websites and sellers are ranked
 * by Postgres (migration 0081: full-text plus pg_trgm) and only public ones are kept; without the database, or before 0081, the same weights run in
 * lib/searchCore.ts. Guides and help are few, so they are ranked here. Names are shown without the removed word.
 */
export type Result = { href: string; title: string; sub?: string };
export type Grouped = {
  q: string;
  websites: Result[];
  sellers: Result[];
  domain: Result | null;
  guides: Result[];
  help: Result[];
  total: number;
  didYouMean: string[];
  popular: Result[];
};

async function dbRank(fn: 'search_listings' | 'search_sellers', q: string, n: number): Promise<Map<string, number> | null> {
  if (!supabaseConfigured) return null;
  const { data, error } = await createAdminClient().rpc(fn, { p_q: q, p_limit: n });
  if (error) return null; // before migration 0081: the in-app ranking takes over
  return new Map((data as { slug?: string; user_id?: string; score: number }[]).map((r) => [String(r.slug ?? r.user_id), Number(r.score)]));
}

/* Website ids in rank order, for /websites and the dropdown. */
export async function rankWebsites(q: string, n = 100): Promise<Map<string, number>> {
  const sites = await publicWebsites();
  const { of } = await websiteCategories();
  const db = await dbRank('search_listings', q, n);
  if (db) return new Map(sites.filter((p) => db.has(p.id)).map((p) => [p.id, db.get(p.id)!] as const));
  return new Map(
    rank(q, sites, (p) => ({ title: p.name, category: `${of(p)?.name ?? p.cat} ${p.stack ?? ''}`, seller: p.seller, description: `${p.tag} ${p.desc}`, tags: p.inc.join(' ') }), n).map(
      (r) => [r.item.id, r.score] as const,
    ),
  );
}

export async function smartSearch(raw: string, per = 5): Promise<Grouped> {
  const q = raw.trim().slice(0, 80);
  const popular = HUBS.map((h) => ({ href: categoryPath(h.slug), title: plainWords(h.name) }));
  const empty: Grouped = { q, websites: [], sellers: [], domain: null, guides: [], help: [], total: 0, didYouMean: [], popular };
  if (norm(q).length < MIN_QUERY) return empty;
  const [sites, sellers, posts, faq, siteRank, sellerRank] = await Promise.all([
    publicWebsites(),
    publicSellers(),
    publishedPosts().catch(() => []),
    publishedFaq().catch(() => null),
    rankWebsites(q),
    dbRank('search_sellers', q, 20),
  ]);
  const websites = sites
    .filter((p) => siteRank.has(p.id))
    .sort((a, b) => siteRank.get(b.id)! - siteRank.get(a.id)!)
    .slice(0, per)
    .map((p) => ({ href: websitePath(p.id), title: plainWords(p.name), sub: `${plainWords(p.cat)} · $${p.price}` }));
  const sellerList = sellerRank
    ? sellers.filter((s) => sellerRank.has(s.key)).sort((a, b) => sellerRank.get(b.key)! - sellerRank.get(a.key)!)
    : rank(q, sellers, (s) => ({ title: `${s.name} ${s.handle}`, category: s.skills.join(' '), description: s.headline })).map((r) => r.item);
  const guides = rank(q, posts, (p) => ({ title: p.title, description: p.excerpt }), per).map((r) => ({ href: `/guides/${r.item.slug}`, title: plainWords(r.item.title), sub: 'Guide' }));
  const articles = faqToShow(faq?.groups ?? null).groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));
  const help = rank(q, articles, (a) => ({ title: a.q, description: a.a }), per).map((r) => ({ href: `/help#${helpAnchor(r.item.q)}`, title: r.item.q, sub: r.item.group }));
  const d = domainGuess(q);
  const out: Grouped = {
    ...empty,
    websites,
    sellers: sellerList.slice(0, per).map((s) => ({ href: `/sellers/${s.handle}`, title: s.name, sub: s.headline || `${s.websites.length} websites` })),
    domain: d ? { href: `/domains?q=${encodeURIComponent(d)}`, title: `Check if ${d} is available`, sub: 'Domains' } : null,
    guides,
    help,
  };
  out.total = out.websites.length + out.sellers.length + out.guides.length + out.help.length;
  if (!out.total) out.didYouMean = suggestions(q, [...sites.map((p) => plainWords(p.name)), ...HUBS.map((h) => plainWords(h.name))]);
  return out;
}
