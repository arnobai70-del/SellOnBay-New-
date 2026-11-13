import type { Metadata } from 'next';
import Link from 'next/link';
import { ReplyForm } from '@/components/ReplyForm';
import { LineChart } from '@/components/glass/Charts';
import { SellerShell } from '@/components/glass/SellerShell';
import { DAY_MS, PAYOUT_TEXT, PLAN_KEEP_TEXT } from '@/lib/config';
import { usd } from '@/lib/glass/orderStatus';
import { sellerOverview, sellerStats, storeProfile } from '@/lib/glass/seller';
import { plainWords } from '@/lib/glass/words';
import { orderStore } from '@/lib/orders/store';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = async (): Promise<Metadata> => ({ title: (await getI18n()).tx('Seller overview'), robots: { index: false } });
export const dynamic = 'force-dynamic';

const PERIODS = { '7d': ['7 days', 7], '30d': ['30 days', 30], '1y': ['1 year', 365] } as const;
type Period = keyof typeof PERIODS;
const shortDay = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const BOX: React.CSSProperties = { padding: 16, borderRadius: 14, background: 'rgba(255,255,255,.7)', border: '1px solid #DCE7EC' };

/*
 * design-reference/seller-dashboard.html: the period's sales and earnings, money in escrow and the next payout, store views, what to do next,
 * the earnings trend and where the money is, plus account health, drafts and buyers' questions (answered with ReplyForm).
 */
export default async function SellerOverview({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/dashboard/seller', roles: ['seller', 'admin'] });
  const raw = (await searchParams).period;
  const period: Period = raw && Object.hasOwn(PERIODS, raw) ? (raw as Period) : '30d';
  const now = Date.now();
  const from = now - PERIODS[period][1] * DAY_MS;
  const [data, store, orders] = viewer
    ? await Promise.all([sellerOverview(viewer.id), storeProfile(viewer.id, viewer.name), (async () => (await (await orderStore()).forUser(viewer.id)).filter((o) => o.sellerId === viewer.id))()])
    : [null, null, []];
  const v = data?.v;
  const stats = v
    ? await sellerStats(
        v.listings.map((l) => l.slug),
        now,
      ).catch(() => new Map())
    : new Map();
  const views = [...stats.values()].reduce((s, x) => s + x.views, 0);
  const buys = [...stats.values()].reduce((s, x) => s + x.buys, 0);
  const sold = orders.filter((o) => o.fundedAt && o.fundedAt >= from);
  const net = sold.reduce((s, o) => s + Math.max(0, o.priceCents - o.refundedCents - o.feeCents), 0);
  const first = viewer?.name?.split(' ')[0];
  const yearFrom = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
  const paidYear = v ? v.payouts.filter((p) => p.status === 'paid' && (p.paidAt ?? 0) >= yearFrom).reduce((s, p) => s + p.amountCents, 0) : 0;
  const steps = v
    ? [
        { done: !!store?.username, label: tx('Store'), text: 'Choose your store name', href: '/dashboard/seller/store', act: 'Set' },
        { done: !!v.health.payoutLabel, label: tx('Payout'), text: 'Add where we send your earnings', href: '/dashboard/seller/payouts', act: 'Add' },
        {
          done: data!.verification.status === 'approved' || data!.verification.status === 'pending',
          label: tx('Identity'),
          text: 'Verify your identity',
          href: '/dashboard/seller/payouts#verify',
          act: 'Verify',
        },
        { done: v.listings.length > 0, label: tx('Listing'), text: 'Upload your first website', href: '/dashboard/seller/websites/new', act: 'Upload' },
      ]
    : [];
  const todo = v
    ? [
        ...steps.filter((s) => !s.done).map((s) => ({ key: s.label, tone: 'st-ok', label: s.label, text: s.text, href: s.href, act: s.act })),
        ...v.listings
          .filter((l) => l.status === 'rejected')
          .map((l) => ({
            key: l.slug,
            tone: 'st-wait',
            label: tx('Listing'),
            text: `${plainWords(l.name)}: ${l.reviewNote ?? 'sent back for changes'}`,
            href: `/dashboard/seller/websites/new?edit=${encodeURIComponent(l.slug)}`,
            act: 'Fix',
          })),
        ...v.toDeliver.map(({ order: o }) => ({
          key: o.id,
          tone: 'st-info',
          label: tx('Deliver'),
          text: `${plainWords(o.title)}${o.dueAt ? ` · due ${new Date(o.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`,
          href: `/orders/${o.id}`,
          act: 'Deliver',
        })),
        ...data!.questions.filter((q) => !q.reply).map((q) => ({ key: q.id, tone: 'st-info', label: tx('Question'), text: `A buyer asked about ${q.product_key}`, href: '#questions', act: 'Reply' })),
        ...v.extras.map(({ order: o, request: r }) => ({
          key: r.id,
          tone: 'st-wait',
          label: tx('Extra'),
          text: `Extra work on ${plainWords(o.title)} waits for the buyer`,
          href: `/orders/${o.id}`,
          act: 'Open',
        })),
      ]
    : [];
  return (
    <SellerShell viewer={viewer} active="overview" file="seller-dashboard" title={tx('Seller overview')} head={false} handle={store?.username ? store.handle : undefined}>
      <div className="row">
        <div>
          <h1>{first ? `Hi ${first}, here's your shop` : tx('Your shop')}</h1>
          <div className="tag">
            <T s={'You keep {PLAN_KEEP_TEXT} of every sale · {PAYOUT_TEXT}'} v={{ PLAN_KEEP_TEXT, PAYOUT_TEXT }} />
          </div>
        </div>
        <div className="seg" role="tablist" aria-label={tx('Period')}>
          {(Object.keys(PERIODS) as Period[]).map((k) => (
            <Link key={k} role="tab" className={k === period ? 'on' : ''} aria-selected={k === period} href={k === '30d' ? '/dashboard/seller' : `/dashboard/seller?period=${k}`} prefetch={false}>
              {PERIODS[k][0]}
            </Link>
          ))}
        </div>
      </div>
      {v && data && (
        <>
          <div className="kpis">
            <div className="glass kpi">
              <div className="l">
                <T s={'Sales'} />
              </div>
              <div className="v">{sold.length}</div>
              <div className="s">{PERIODS[period][0]}</div>
            </div>
            <div className="glass kpi">
              <div className="l">
                <T s={'Net earnings ({PLAN_KEEP_TEXT})'} v={{ PLAN_KEEP_TEXT }} />
              </div>
              <div className="v">{usd(net)}</div>
              <div className="s">
                <T s={'After the platform fee'} />
              </div>
            </div>
            <div className="glass kpi">
              <div className="l">
                <T s={'In escrow'} />
              </div>
              <div className="v">{usd(v.escrowCents)}</div>
              <div className="s">
                <T s={'{length} orders to deliver'} v={{ length: v.toDeliver.length }} />
              </div>
            </div>
            <div className="glass kpi">
              <div className="l">
                <T s={'Next payout'} />
              </div>
              <div className="v">{usd(v.availableCents)}</div>
              <div className="s">
                {shortDay(v.nextPayout)}
                {v.health.payoutLabel ? ` · ${v.health.payoutLabel}` : ''}
              </div>
            </div>
            <div className="glass kpi">
              <div className="l">
                <T s={'Store views'} />
              </div>
              <div className="v">{views.toLocaleString('en-US')}</div>
              <div className="s">{views ? `${((buys / views) * 100).toFixed(1)}% buy · 30 days` : tx('Last 30 days')}</div>
            </div>
          </div>
          {(v.reserveCents > 0 || v.debtCents > 0) && (
            <section className="glass card" role="status">
              {v.reserveCents > 0 && (
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                  <T s={'A reserve of {v0} is kept back for a few days and then becomes available.'} v={{ v0: usd(v.reserveCents) }} />
                </p>
              )}
              {v.debtCents > 0 && (
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                  <T s={'You owe {v0} after a refund or dispute fee. It is taken from your next earnings.'} v={{ v0: usd(v.debtCents) }} />
                </p>
              )}
            </section>
          )}
          <div className="grid2">
            <section className="glass card">
              <div className="row" style={{ marginBottom: 6 }}>
                <h2>
                  <T s={'To do'} />
                </h2>
                <span className={todo.length ? 'status st-wait' : 'status st-ok'}>
                  <T s={'{length} items'} v={{ length: todo.length }} />
                </span>
              </div>
              {todo.length ? (
                todo.slice(0, 6).map((t) => (
                  <div key={t.key} className="li">
                    <span className={`status ${t.tone}`}>{t.label}</span>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{t.text}</div>
                    <Link className="btn sm ghost" href={t.href} prefetch={false}>
                      {t.act}
                    </Link>
                  </div>
                ))
              ) : (
                <div className="li">
                  <div className="muted" style={{ flex: 1, fontSize: 14 }}>
                    <T s={'You are set up. Nothing waits for you right now.'} />
                  </div>
                </div>
              )}
            </section>
            <section className="glass card">
              <div className="row">
                <h2>
                  <T s={'Sales trend'} />
                </h2>
                <span className="tag" style={{ margin: 0 }}>
                  <T s={'Earnings per week'} />
                </span>
              </div>
              <LineChart values={v.weekly.map((w) => w.cents)} label={`Weekly earnings: ${v.weekly.map((w) => `${shortDay(w.week)} ${usd(w.cents)}`).join(', ')}`} />
              {!v.weekly.some((w) => w.cents > 0) && (
                <div className="tag" style={{ marginTop: 6 }}>
                  <T s={'Nothing earned yet. Your first accepted order shows up here.'} />
                </div>
              )}
            </section>
          </div>
          <section className="glass card">
            <div className="row" style={{ marginBottom: 14 }}>
              <h2>
                <T s={'Money pipeline'} />
              </h2>
              <Link className="tag" style={{ margin: 0 }} href="/dashboard/seller/payouts" prefetch={false}>
                <T s={'Earnings & payouts'} />
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(180px, 100%),1fr))', gap: 12 }}>
              {(
                [
                  ['1 · Buyer paid', v.escrowCents, 'Held in escrow', BOX],
                  ['2 · On the 7-day hold', v.pendingCents, `Your ${PLAN_KEEP_TEXT} share`, BOX],
                  ['3 · Ready to pay', v.availableCents, `Paid on ${shortDay(v.nextPayout)}`, { ...BOX, background: '#E6F5EF', border: '1px solid #CFE9DF' }],
                  ['4 · Paid out', paidYear, 'This year', BOX],
                ] as const
              ).map(([l, c, s, style]) => (
                <div key={l} style={style}>
                  <div className="tag" style={{ margin: 0 }}>
                    {l}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 300, marginTop: 6 }}>{usd(c)}</div>
                  <div className="tag">{s}</div>
                </div>
              ))}
            </div>
          </section>
          <div className="grid2">
            <section className="glass card">
              <h2>
                <T s={'Account health'} />
              </h2>
              <div className="li" style={{ fontSize: 14 }}>
                <span style={{ flex: 1 }}>
                  <T s={'On-time delivery'} />
                </span>
                <b style={{ fontWeight: 500 }}>{v.health.onTime === null ? tx('No deliveries yet') : `${Math.round(v.health.onTime * 100)}%`}</b>
              </div>
              <div className="li" style={{ fontSize: 14 }}>
                <span style={{ flex: 1 }}>
                  <T s={'Average rating'} />
                </span>
                <b style={{ fontWeight: 500 }}>{v.health.rating ? `${v.health.rating} (${v.health.ratingCount})` : tx('No reviews yet')}</b>
              </div>
              <div className="li" style={{ fontSize: 14 }}>
                <span style={{ flex: 1 }}>
                  <T s={'Orders with a dispute'} />
                </span>
                <b style={{ fontWeight: 500 }}>{v.health.disputeRate === null ? tx('No orders yet') : `${Math.round(v.health.disputeRate * 1000) / 10}%`}</b>
              </div>
              <div className="li" style={{ fontSize: 14 }}>
                <span style={{ flex: 1 }}>
                  <T s={'Lifetime earned'} />
                </span>
                <b style={{ fontWeight: 500 }}>
                  <T s={'{v0} · {acceptedCount} accepted'} v={{ v0: usd(v.lifetimeCents), acceptedCount: v.acceptedCount }} />
                </b>
              </div>
            </section>
            <section className="glass card" style={{ borderColor: '#E2C58F' }}>
              <div className="row">
                <div>
                  <div className="status st-wait">
                    <T s={'Notice from SellOnBay'} />
                  </div>
                  <h2 style={{ marginTop: 10 }}>
                    <T s={'Thursday payouts'} />
                  </h2>
                </div>
                <Link className="btn sm ghost" href="/dashboard/seller/notifications" prefetch={false}>
                  <T s={'All notices'} />
                </Link>
              </div>
              <p className="muted" style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.6 }}>
                <T s={'{PAYOUT_TEXT}. Keep your payout details and identity check up to date so nothing waits.'} v={{ PAYOUT_TEXT }} />
              </p>
            </section>
          </div>
          {data.drafts.length > 0 && (
            <section className="glass card" data-drafts>
              <div className="row" style={{ marginBottom: 6 }}>
                <h2>
                  <T s={'Your drafts'} />
                </h2>
                <span className="tag" style={{ margin: 0 }}>
                  <T s={'Saved but not sent for review. Buyers cannot see them.'} />
                </span>
              </div>
              {data.drafts.map((d) => (
                <div key={d.slug} className="li" style={{ fontSize: 14 }}>
                  <span style={{ flex: 1 }}>{d.name}</span>
                  <Link className="btn sm ghost" href={`/dashboard/seller/websites/new?draft=${encodeURIComponent(d.slug)}`} prefetch={false}>
                    <T s={'Continue'} />
                  </Link>
                </div>
              ))}
            </section>
          )}
          {data.questions.length > 0 && (
            <section className="glass card" id="questions" data-questions>
              <div className="row" style={{ marginBottom: 6 }}>
                <h2>
                  <T s={'Questions from buyers'} />
                </h2>
                <span className="tag" style={{ margin: 0 }}>
                  <T s={'Answer fast: buyers who get an answer are more likely to buy'} />
                </span>
              </div>
              {data.questions.map((q) => (
                <div key={q.id} className="li" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
                  <b style={{ fontWeight: 500 }}>{q.product_key}</b>
                  <span className="muted" style={{ fontSize: 14 }}>
                    {q.body}
                  </span>
                  {q.reply ? (
                    <span className="tag">
                      <T s={'You replied: {reply}'} v={{ reply: q.reply }} />
                    </span>
                  ) : (
                    <ReplyForm id={q.id} />
                  )}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </SellerShell>
  );
}
