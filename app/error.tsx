'use client';

import { GlassFrame as GlassPage } from '@/components/glass/GlassFrame';

import { T } from '@/components/i18n/T';
/* A server error, drawn as the error card of design-reference/404.html. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <GlassPage file="404">
      <main id="main" className="wrap" style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <section className="glass card" style={{ padding: 44, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16, maxWidth: 560 }}>
          <span className="tag" style={{ margin: 0, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            <T s={'Error'} />
          </span>
          <h1 style={{ fontSize: 32, fontWeight: 300 }}>
            <T s={'Something went wrong'} />
          </h1>
          <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
            <T s={'It is on our side. Try again, and if it keeps happening, tell us from the Help center.'} />
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" type="button" onClick={reset}>
              <T s={'Try again'} />
            </button>
            <a className="btn ghost" href="/help">
              <T s={'Help center'} />
            </a>
          </div>
        </section>
      </main>
    </GlassPage>
  );
}
