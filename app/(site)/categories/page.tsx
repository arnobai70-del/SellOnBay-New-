import Link from 'next/link';
import { DIGITAL_CATS, DIGITAL_TOPICS, catsFor, platformOf, shelfHref, shelfLabel, type Platform } from '@/lib/apps';
import { CATS } from '@/lib/data';
import { getLiveDbProducts } from '@/lib/catalog';
import { starterProducts } from '@/lib/examples';
import { MARKET_MENU, topicHref } from '@/lib/marketMenu';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { PageExtras } from '@/components/PageExtras';

export const generateMetadata = () => pageMetadata('/categories', { alternates: { canonical: '/categories' } });
export const dynamic = 'force-dynamic';

const SHELF_ORDER: Platform[] = ['web', 'android', 'ios', 'webapp', 'desktop', 'digital'];
const enc = encodeURIComponent;
/* Digital kinds that belong to no topic (no-code templates, plugins, scripts) get a box of their own. */
const WEB_TOOLS = DIGITAL_CATS.filter((c) => !DIGITAL_TOPICS.some((t) => t.cats.includes(c)));
type Box = { key: string; title: string; href: string; pl: Platform; cats: [label: string, href: string][] };
const BOXES: Box[] = [
  ...SHELF_ORDER.filter((pl) => pl !== 'digital').map((pl) => ({
    key: pl,
    title: shelfLabel(pl),
    href: shelfHref(pl),
    pl,
    cats: (pl === 'web' ? CATS.filter((c) => c !== 'All') : catsFor(pl)).map((c) => [c, `${shelfHref(pl)}?cat=${enc(c)}`] as [string, string]),
  })),
  ...DIGITAL_TOPICS.map((t) => ({
    key: t.key,
    title: t.label,
    href: topicHref(t.key),
    pl: 'digital' as Platform,
    cats: t.cats.map((c) => [c, `${topicHref(t.key)}&cat=${enc(c)}`] as [string, string]),
  })),
  {
    key: 'web-tools',
    title: 'Templates, plugins and scripts',
    href: shelfHref('digital'),
    pl: 'digital',
    cats: WEB_TOOLS.map((c) => [c, `${shelfHref('digital')}?cat=${enc(c)}`] as [string, string]),
  },
];

/* Every shelf with its categories and how many products each has; the phone tab bar's Categories button lands here. */
export default async function Categories() {
  const live = (await Promise.all(SHELF_ORDER.map((pl) => getLiveDbProducts(pl)))).flat();
  const ids = new Set(live.map((p) => p.id));
  const all = [...live, ...(await starterProducts()).filter((p) => !ids.has(p.id))];
  const on = (pl: Platform) => all.filter((p) => platformOf(p) === pl);
  const extra = MARKET_MENU.filter((e) => e.key === 'dev' || e.key === 'help');
  return (
    <div className="wrap mk-allcats">
      <h1>All categories</h1>
      <p className="mk-sub">Every shelf in the store, with how many products are on it today.</p>
      <div className="mk-allcats-grid">
        {BOXES.map((b) => {
          const items = on(b.pl).filter((p) => b.pl !== 'digital' || b.cats.some(([c]) => c === p.cat));
          return (
            <section key={b.key} className="mk-allcat" aria-labelledby={`c-${b.key}`}>
              <h2 id={`c-${b.key}`}>
                <Link href={b.href}>{b.title}</Link>
              </h2>
              <p className="muted">
                {items.length} {items.length === 1 ? 'product' : 'products'}
              </p>
              <ul>
                {b.cats.map(([label, href]) => {
                  const n = items.filter((p) => p.cat === label).length;
                  return (
                    <li key={href}>
                      {n > 0 ? (
                        <Link href={href}>
                          {label} <span>{n}</span>
                        </Link>
                      ) : (
                        <span className="mk-allcat-none">
                          {label} <span>0</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {extra.map((e) => (
          <section key={e.key} className="mk-allcat" aria-labelledby={`c-${e.key}`}>
            <h2 id={`c-${e.key}`}>
              <Link href={e.href}>{e.label}</Link>
            </h2>
            <ul>
              {e.groups
                .flatMap((g) => g.links)
                .map(([label, href]) => (
                  <li key={href}>
                    <Link href={href}>{label}</Link>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
      <PageExtras path="/categories" />
    </div>
  );
}
