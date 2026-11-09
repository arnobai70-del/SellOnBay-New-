import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/glass/AdminShell';
import { CouponForm, CouponSwitch } from '@/components/glass/CouponTools';
import { usd } from '@/lib/glass/orderStatus';
import { couponLive, couponSplit } from '@/lib/marketing/coupons';
import { getSettings } from '@/lib/settings';
import { savedCoupons } from '@/lib/site/contentStore';
import { supabaseConfigured } from '@/lib/supabase/env';
import { createAdminClient } from '@/lib/supabase/server';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Marketing', robots: { index: false } };
export const dynamic = 'force-dynamic';

const nice = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/* Emails the queue sent this month (lib/emailQueue.ts), for the design's "Emails sent" figure. */
async function emailsWaiting(): Promise<number | null> {
  if (!supabaseConfigured) return null;
  const { count, error } = await createAdminClient().from('email_outbox').select('id', { count: 'exact', head: true }).in('status', ['pending', 'sending']);
  return error ? null : (count ?? 0);
}
async function emailsSent(since: number): Promise<number | null> {
  if (!supabaseConfigured) return null;
  const { count, error } = await createAdminClient().from('email_outbox').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', new Date(since).toISOString());
  return error ? null : (count ?? 0);
}

/*
 * design-reference/admin-marketing.html. Coupons work (/api/admin/coupons: add, turn on or off, remove); SellOnBay pays the discount, so the seller
 * always gets their share of the list price. Bulletins and campaigns are not built yet: their cards stay, and say so.
 */
export default async function AdminMarketing() {
  const viewer = await requireViewer({ path: '/admin/marketing', roles: ['admin'], scope: 'content' });
  const now = Date.now();
  const monthFrom = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  const [coupons, settings, sent, waiting] = await Promise.all([savedCoupons(0), getSettings(), emailsSent(monthFrom), emailsWaiting()]);
  const today = new Date(now).toISOString().slice(0, 10);
  const example = couponSplit(4900, 10);
  const live = coupons.filter((c) => couponLive(c, today));
  return (
    <AdminShell viewer={viewer} active="marketing" file="admin-marketing" title="Marketing" head={false}>
      <div className="row">
        <div>
          <h1>Marketing</h1>
          <div className="tag">Coupons, seller bulletins and email campaigns</div>
        </div>
      </div>
      <div className="kpis">
        <div className="glass kpi">
          <div className="l">Active coupons</div>
          <div className="v">{live.length}</div>
          <div className="s">{coupons.length} in all</div>
        </div>
        <div className="glass kpi">
          <div className="l">Discount given</div>
          <div className="v">$0</div>
          <div className="s">{settings.paymentsMode === 'beta_free' ? 'Free beta: nothing is charged' : 'From coupons'}</div>
        </div>
        <div className="glass kpi">
          <div className="l">Emails sent</div>
          <div className="v">{sent === null ? '—' : sent.toLocaleString('en-US')}</div>
          <div className="s">This month, by the email queue</div>
        </div>
        <div className="glass kpi">
          <div className="l">Emails waiting</div>
          <div className="v">{waiting === null ? '—' : waiting}</div>
          <div className="s">In the queue, retried by the scheduled job</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <section className="glass" style={{ flex: '999 1 440px', minWidth: 0, padding: '8px 8px 4px' }}>
          <div className="row" style={{ padding: '14px 14px 4px' }}>
            <h2>Coupons &amp; offers</h2>
            <span className="tag" style={{ margin: 0 }}>
              $49 with 10% off: buyer pays {usd(example.buyerPays)}, seller gets {usd(example.seller)}
            </span>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Discount</th>
                  <th>Applies to</th>
                  <th>Most uses</th>
                  <th>Ends</th>
                  <th>On</th>
                </tr>
              </thead>
              <tbody>
                {coupons.length ? (
                  coupons.map((c) => (
                    <tr key={c.code}>
                      <td style={{ fontWeight: 500, letterSpacing: '.04em' }}>{c.code}</td>
                      <td>{c.percentOff}%</td>
                      <td>All websites</td>
                      <td>{c.maxUses ?? 'No limit'}</td>
                      <td>{c.endsOn ? (c.endsOn < today ? 'Ended' : nice(c.endsOn)) : 'No end'}</td>
                      <td>
                        <CouponSwitch code={c.code} on={c.active} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="muted">
                      No coupons yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <CouponForm />
      </div>
      <div className="grid2">
        <section className="glass card" id="bulletin" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2>Business bulletin</h2>
          <div>
            <div style={{ fontSize: 13, color: '#3D5563', marginBottom: 6 }}>Send to</div>
            <div className="seg">
              <button type="button" className="on" disabled>
                All sellers
              </button>
              <button type="button" disabled>
                All buyers
              </button>
              <button type="button" disabled>
                Everyone
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="bt">Title</label>
            <input id="bt" className="input" placeholder="e.g. Thursday payouts" disabled />
          </div>
          <div className="field">
            <label htmlFor="bm">Message</label>
            <textarea id="bm" className="input" placeholder="Write the notice…" disabled />
          </div>
          <div className="tag" style={{ margin: 0 }}>
            Bulletins to everyone are not built yet. Each person still gets their own notifications and emails.
          </div>
        </section>
        <section className="glass" style={{ padding: '8px 8px 4px' }}>
          <div className="row" style={{ padding: '14px 14px 4px' }}>
            <h2>Campaigns</h2>
            <Link className="btn sm ghost" href="/admin/marketing/promotions" prefetch={false}>
              Promotions
            </Link>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Channel</th>
                  <th>Sent</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 500 }}>Order updates and domain renewal reminders</td>
                  <td>Email</td>
                  <td>{sent === null ? '—' : sent}</td>
                  <td>Automatic</td>
                </tr>
                <tr>
                  <td colSpan={4} className="muted">
                    No marketing campaigns yet.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="glass card">
        <div className="row">
          <h2>More growth tools</h2>
        </div>
        {(
          [
            ['Promotions', 'Seller promotion plans and featured spots', '/admin/marketing/promotions'],
            ['SEO and guides', 'Titles, descriptions, Search Console', '/admin/seo'],
            ['Site builder', 'Menu, footer and page blocks', '/admin/content/site'],
            ['Visitors', 'Who opens what', '/admin/visitors'],
          ] as const
        ).map(([l, t, h]) => (
          <div key={h} className="li" style={{ fontSize: 14 }}>
            <span style={{ flex: 1 }}>
              {l} <span className="muted">· {t}</span>
            </span>
            <Link className="btn sm ghost" href={h} prefetch={false}>
              Open
            </Link>
          </div>
        ))}
      </section>
    </AdminShell>
  );
}
