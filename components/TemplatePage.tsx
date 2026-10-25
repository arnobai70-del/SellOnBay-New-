import { THEMES, photoFor, type Product } from '@/lib/data';

/*
 * A full landing page for one listing, built from the listing's own name, colours, headline and feature list.
 * It is what the "Preview in browser" frame scrolls through. Sizes are for a 1280px page; container queries fold it
 * down for the phone view, so the same markup serves both.
 */
export function TemplatePage({ p, brand, domain }: { p: Product; brand?: string; domain?: string }) {
  const t = THEMES[p.theme];
  const photo = photoFor(p.theme);
  const name = brand || p.name;
  const style = { '--a': t.a, '--b': t.b, '--bg': t.bg, '--tx': t.tx, '--ac': t.ac || '#fff' } as React.CSSProperties;
  const tile = (shift: number): React.CSSProperties | undefined =>
    photo ? { backgroundImage: `url(${photo.src})`, backgroundSize: '250% auto', backgroundPosition: `100% ${Math.min(100, Math.max(0, photo.y + shift))}%` } : undefined;
  const [f1, f2, f3, ...rest] = p.inc;

  return (
    <div className={'tp' + (t.dark ? ' dark' : '')} style={style}>
      <header className="tp-nav">
        <b>{name}</b>
        <nav>
          {t.nav.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </nav>
        <u>{t.cta}</u>
      </header>

      <section className="tp-hero">
        <div className="tp-copy">
          <div className="tp-h1">{t.h}</div>
          <p>{t.p || p.desc}</p>
          <div className="tp-btns">
            <u>{t.cta}</u>
            <span>Learn more</span>
          </div>
          {p.reviews > 0 && (
            <div className="tp-meta">
              <span>★ {p.rating}</span>
              <span>{p.reviews} reviews</span>
            </div>
          )}
        </div>
        <div className={'tp-art' + (photo ? '' : ' plain')} style={tile(0)} />
      </section>

      <section className="tp-feat">
        <div className="tp-h2">Everything you need</div>
        <div className="tp-cards">
          {[f1, f2, f3].map(
            (f, i) =>
              f && (
                <div key={i} className="tp-card">
                  <i>{i + 1}</i>
                  <div className="tp-h3">{f}</div>
                  <p>Ready to use from the first day, and easy to change.</p>
                </div>
              ),
          )}
        </div>
      </section>

      <section className="tp-split">
        <div className={'tp-art tall' + (photo ? '' : ' plain')} style={tile(14)} />
        <div>
          <div className="tp-h2">Made for {p.cat.toLowerCase()}</div>
          <p>{p.desc}</p>
          <ul>
            {rest.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="tp-gallery">
        {[-10, 8, 22].map((s, i) => (
          <div key={i} className={'tp-art' + (photo ? '' : ' plain')} style={tile(s)} />
        ))}
      </section>

      <section className="tp-cta">
        <div className="tp-h2">{t.h}</div>
        <u>{t.cta}</u>
      </section>

      <footer className="tp-foot">
        <b>{name}</b>
        <div>
          {[...t.nav, 'Contact', 'Privacy'].map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
        <small>
          {domain ? domain + ' · ' : ''}© 2026 {name}
        </small>
      </footer>
    </div>
  );
}
