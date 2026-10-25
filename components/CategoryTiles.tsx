import Link from 'next/link';
import { Tilt } from './Tilt';
import { CATS, PRODUCTS, THEMES, imageFor, money } from '@/lib/data';
import { Frame } from './MiniSite';

/* One tile per category, tinted with the colours of its top-rated site, with that site peeking in. */
export function CategoryTiles() {
  const cats = CATS.filter((c) => c !== 'All').map((cat) => {
    const list = PRODUCTS.filter((p) => p.cat === cat);
    const top = [...list].sort((a, b) => b.rating - a.rating)[0];
    return { cat, top, count: list.length, from: Math.min(...list.map((p) => p.price)) };
  });

  return (
    <div className="cats">
      {cats.map(({ cat, top, count, from }, i) => {
        const t = THEMES[top.theme];
        const style = { '--bg': t.bg, '--tx': t.tx } as React.CSSProperties;
        return (
          <Tilt key={cat} className={'tilt-cat' + (i === 0 || i === cats.length - 1 ? ' wide' : '')} max={6}>
            <Link href={`/browse?cat=${encodeURIComponent(cat)}`} className={'cat' + (i === 0 || i === cats.length - 1 ? ' wide' : '')} style={style}>
              <div>
                <h3>{cat}</h3>
                <small>
                  {count} {count === 1 ? 'site' : 'sites'} from {money(from)}
                </small>
              </div>
              <div className="peek" aria-hidden="true">
                <Frame theme={top.theme} image={imageFor(top.id)} sizes="240px" />
              </div>
            </Link>
          </Tilt>
        );
      })}
    </div>
  );
}
