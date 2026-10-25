import Link from 'next/link';
import { type Platform } from '@/lib/apps';
import { SHELF_GUIDE, lowerShelf, relatedSearches } from '@/lib/shelfGuide';

/* Under each shelf: three short answers about what is on it, then searches on the other shelves. */
export function ShelfGuide({ kind }: { kind: Platform }) {
  const g = SHELF_GUIDE[kind];
  const name = lowerShelf(kind);
  return (
    <section className="mk-guide" aria-labelledby="mk-guide-h">
      <div className="wrap">
        <h2 id="mk-guide-h">About {name}</h2>
        <div className="mk-guide-cols">
          <div>
            <h3>What are they?</h3>
            <p>{g.what}</p>
          </div>
          <div>
            <h3>Who buys them?</h3>
            <p>{g.who}</p>
          </div>
          <div>
            <h3>What comes with an order?</h3>
            <ul>
              {g.included.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
        <h3 className="mk-related-h">Searches on other shelves</h3>
        <nav className="mk-related" aria-label="Searches on other shelves">
          {relatedSearches(kind).map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
