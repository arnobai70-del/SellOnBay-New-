import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicFrame } from '@/components/glass/PublicFrame';
import { SubscribeButton } from '@/components/glass/SubForms';
import { FEATURE_KEYS, FEATURE_LABEL, PERIOD_LABEL, daysOf } from '@/lib/buyerSubs/rules';
import { publicPlans, subSettings } from '@/lib/buyerSubs/service';
import { getViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = {
  title: 'Buyer subscriptions',
  description: 'Yearly plans: choose several full-stack websites with full source code, a usage licence and a year of free bug fixes and support.',
  alternates: { canonical: '/subscriptions' },
};
export const dynamic = 'force-dynamic';

const usd = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 })}`;
const DEFAULT_FAQ = [
  ['What happens when my subscription ends?', 'The licence to keep using the code and the free support end. Your websites keep running and the files you downloaded stay yours.'],
  ['What does a renewal include?', 'It extends the licence and support of the websites you already chose. New websites need a new plan.'],
  ['How do I pay?', 'Choose a plan, pay by one of the listed methods and enter your payment reference. We check it and start your plan.'],
  ['Can I still buy single websites?', 'Yes. Every website can still be bought on its own, the usual way.'],
];

/*
 * Buyer subscriptions (owner, 2026-11-12): pricing cards, a feature comparison and questions, all from Admin › Buyer subscriptions. While the
 * feature is switched off the page is a 404, except for admins, who see it with a note so they can check it before opening.
 */
export default async function Subscriptions() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const [settings, plans, viewer] = await Promise.all([subSettings(), publicPlans(), getViewer().catch(() => null)]);
  const admin = viewer?.role === 'admin';
  if (!settings.enabled && !admin) notFound();
  const faq = settings.faq.length ? settings.faq.map((x) => [x.q, x.a] as const) : DEFAULT_FAQ;
  const featureRows = FEATURE_KEYS.filter((k) => plans.some((p) => p.features[k]));
  return (
    <PublicFrame file="sell">
      {!settings.enabled && (
        <p className="sob-note" role="note">
          <T s={'Preview for admins: subscriptions are switched off, so visitors do not see this page. Turn them on in Admin › Buyer subscriptions.'} />
        </p>
      )}
      <section style={{ padding: '72px 0 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <span className="badge">
          <T s={'Buyer subscriptions'} />
        </span>
        <h1 style={{ fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 300 }}>
          <T s={'More websites, one yearly plan'} />
        </h1>
        <p className="muted" style={{ margin: 0, maxWidth: 640, lineHeight: 1.6 }}>
          {settings.intro || tx('Choose several full-stack websites with full source code, a usage licence and a year of free bug fixes and support.')}
        </p>
      </section>

      {plans.length ? (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 18 }} aria-label={tx('Plans')}>
          {plans.map((p) => (
            <article key={p.id} className="glass card" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 14, borderTop: `4px solid ${p.color}` }}>
              <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 24 }}>{p.name}</h2>
                {p.badge && (
                  <span className="status st-ok" style={{ background: p.color, color: '#fff' }}>
                    {p.badge}
                  </span>
                )}
              </div>
              <div>
                <span style={{ fontSize: 40, fontWeight: 500 }}>{usd(p.priceCents)}</span>
                <span className="muted"> / {p.period === 'custom' ? `${daysOf(p)} days` : PERIOD_LABEL[p.period]}</span>
              </div>
              <div className="tag" style={{ margin: 0 }}>
                <T s={'Renewal {v0} · {websiteLimit} {v2} of your choice'} v={{ v0: usd(p.renewalCents), websiteLimit: p.websiteLimit, v2: p.websiteLimit === 1 ? 'website' : 'websites' }} />
              </div>
              {p.description && (
                <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                  {p.description}
                </p>
              )}
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
                {p.benefits
                  .filter((b) => b.on)
                  .map((b) => (
                    <li key={b.text} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, flex: 'none' }} />
                      {b.text}
                    </li>
                  ))}
              </ul>
              <div style={{ marginTop: 'auto' }}>
                <SubscribeButton planId={p.id} label={`Choose ${p.name}`} disabled={!settings.enabled} />
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="glass card" style={{ padding: 28, textAlign: 'center' }}>
          <p className="muted" style={{ margin: 0 }}>
            <T s={'New plans are on their way.'} />
          </p>
        </section>
      )}

      {plans.length > 0 && featureRows.length > 0 && (
        <section className="sec">
          <h2 style={{ fontSize: 28, marginBottom: 18 }}>
            <T s={'Compare plans'} />
          </h2>
          <div className="glass" style={{ padding: '8px 8px 4px' }}>
            <div className="tbl" style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>
                      <T s={'Included'} />
                    </th>
                    {plans.map((p) => (
                      <th key={p.id}>{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <T s={'Websites you choose'} />
                    </td>
                    {plans.map((p) => (
                      <td key={p.id}>{p.websiteLimit}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>
                      <T s={'Support'} />
                    </td>
                    {plans.map((p) => (
                      <td key={p.id}>{p.supportDays ? `${p.supportDays} days` : tx('No')}</td>
                    ))}
                  </tr>
                  {featureRows.map((k) => (
                    <tr key={k}>
                      <td>{FEATURE_LABEL[k]}</td>
                      {plans.map((p) => (
                        <td key={p.id}>{p.features[k] ? tx('Yes') : '–'}</td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <T s={'Renewal'} />
                    </td>
                    {plans.map((p) => (
                      <td key={p.id}>{usd(p.renewalCents)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section className="sec" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 28, marginBottom: 8 }}>
          <T s={'Questions'} />
        </h2>
        {faq.map(([q, a]) => (
          <details key={q} className="glass">
            <summary>{q}</summary>
            <p className="muted" style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.6 }}>
              {a}
            </p>
          </details>
        ))}
        <div className="tag">
          <T s={'New features and custom work are paid separately. Refunds follow the'} />{' '}
          <Link href="/legal/refunds">
            <T s={'refund policy'} />
          </Link>
          <T s={'; licence terms are on the'} />{' '}
          <Link href="/legal/licenses">
            <T s={'licences page'} />
          </Link>
          .
        </div>
      </section>
    </PublicFrame>
  );
}
