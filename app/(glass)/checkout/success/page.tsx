import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { REVIEW_HOURS } from '@/lib/config';
import { usd } from '@/lib/glass/orderStatus';
import { plainWords } from '@/lib/glass/words';
import { getOrder } from '@/lib/orders/service';
import { orderCode } from '@/lib/payments/rules';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Request received'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const NUM = { done: ['#CDEBDF', '#1A5444'], wait: ['#FBEFD9', '#6E4B12'], next: ['#E8EEF2', '#566C78'] } as const;

/*
 * design-reference/order-success.html (also at /order-success). In the free beta the request is received and reviewed by hand; nothing is paid.
 * The order shows only to the person who made it.
 */
export default async function CheckoutSuccess({ searchParams }: { searchParams: Promise<{ order?: string; n?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/checkout/success' });
  const { order, n } = await searchParams;
  const count = Math.max(1, Math.min(5, Number(n) || 1));
  const id = typeof order === 'string' && /^[0-9a-f-]{36}$/i.test(order) ? order : null;
  const o = id ? await getOrder(id).catch(() => null) : null;
  const mine = o && (!o.buyerId || o.buyerId === viewer?.id) ? o : null;
  const steps = [
    [tx('Request received'), tx('No payment was taken.'), 'Done', 'st-ok', 'done'],
    [tx('We review it'), tx('We email you with our answer.'), 'Waiting', 'st-wait', 'wait'],
    [tx('Files and domain steps'), tx('They unlock once it is approved. A domain is registered by hand, in your name.'), 'Next', 'st-draft', 'next'],
    [`${REVIEW_HOURS}-hour review`, tx('Approve, or report a problem before the time ends.'), 'Next', 'st-info', 'next'],
  ] as const;
  return (
    <PublicFrame file="order-success">
      <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14, padding: '76px 0 28px' }}>
        <span className="okc" style={{ background: '#CDEBDF' }} aria-hidden="true">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#1A5444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 7" />
          </svg>
        </span>
        <h1 style={{ fontSize: 'clamp(32px,4.4vw,46px)', fontWeight: 300 }}>
          <T s={'Thank you, your request is in.'} />
        </h1>
        <p className="muted" style={{ margin: 0, maxWidth: 560, lineHeight: 1.6 }}>
          <T s={'{v0} with our team. Websites are free for early users during the beta, and nothing was charged.'} v={{ v0: count > 1 ? `${count} requests are` : tx('Your request is') }} />
        </p>
        {id && (
          <div className="tag">
            <T s={'Order {v0} · we email you when it is reviewed'} v={{ v0: orderCode(id) }} />
          </div>
        )}
      </section>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center' }}>
        <section className="glass card" style={{ flex: '1 1 380px', maxWidth: 560 }}>
          <h2 style={{ fontSize: 20, marginBottom: 6 }}>
            <T s={'What happens next'} />
          </h2>
          {steps.map(([t, d, s, tone, look], i) => (
            <div key={t} className="stp">
              <b style={{ background: NUM[look][0], color: NUM[look][1] }}>{i + 1}</b>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{t}</div>
                <div className="muted" style={{ marginTop: 3 }}>
                  {d}
                </div>
              </div>
              <span className={`status ${tone}`}>{s}</span>
            </div>
          ))}
        </section>
        <aside className="glass card" style={{ flex: '1 1 280px', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ fontSize: 20 }}>
            <T s={'Order'} />
          </h2>
          {mine ? (
            <>
              <div className="li" style={{ fontSize: 14 }}>
                <span style={{ flex: 1 }}>{plainWords(mine.title)}</span>
                <s className="muted">{usd(mine.lines[0]?.[1] ?? mine.priceCents)}</s>
              </div>
              {mine.domain && (
                <div className="li" style={{ fontSize: 14 }}>
                  <span style={{ flex: 1 }}>{mine.domain.name}</span>
                  <span>
                    <T s={'Checked by hand'} />
                  </span>
                </div>
              )}
              <div className="li" style={{ fontSize: 16 }}>
                <span style={{ flex: 1 }}>
                  <T s={'Paid'} />
                </span>
                <b style={{ fontWeight: 500 }}>$0.00</b>
              </div>
            </>
          ) : (
            <div className="li" style={{ fontSize: 14 }}>
              <span className="muted">
                <T s={'Your requests are in your dashboard.'} />
              </span>
            </div>
          )}
          <Link className="btn" href={id ? `/orders/${id}` : '/dashboard/buyer'} style={{ width: '100%' }} prefetch={false}>
            {id ? tx('Open the order') : tx('Go to my dashboard')}
          </Link>{' '}
          <Link className="btn ghost" href="/dashboard/buyer/orders" style={{ width: '100%' }} prefetch={false}>
            <T s={'All my orders'} />
          </Link>
        </aside>
      </div>
    </PublicFrame>
  );
}
