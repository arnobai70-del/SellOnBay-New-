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

export const metadata: Metadata = { title: 'Seller overview', robots: { index: false } };
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
        { done: !!store?.username, label: 'Store', text: 'Choose your store name', href: '/dashboard/seller/store', act: 'Set' },
        { done: !!v.health.payoutLabel, label: 'Payout', text: 'Add where we send your earnings', href: '/dashboard/seller/payouts', act: 'Add' },
        {
          done: data!.verification.status === 'approved' || data!.verification.status === 'pending',
          label: 'Identity',
          text: 'Verify your identity',
          href: '/dashboard/seller/payouts#verify',
          act: 'Verify',
        },
        { done: v.listings.length > 0, label: 'Listing', text: 'Upload your first website', href: '/dashboard/seller/websites/new', act: 'Upload' },
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
            label: 'Listing',
            text: `${plainWords(l.name)}: ${l.reviewNote ?? 'sent back for changes'}`,
            href: `/dashboard/seller/websites/new?edit=${encodeURIComponent(l.slug)}`,
            act: 'Fix',
          })),
        ...v.toDeliver.map(({ order: o }) => ({
          key: o.id,
          tone: 'st-info',
          label: 'Deliver',
          text: `${plainWords(o.title)}${o.dueAt ? ` · due ${new Date(o.dueAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`,
          href: `/orders/${o.id}`,
          act: 'Deliver',
        })),
        ...data!.questions.filter((q) => !q.reply).map((q) => ({ key: q.id, tone: 'st-info', label: 'Question', text: `A buyer asked about ${q.product_key}`, href: '#questions', act: 'Reply' })),
        ...v.extras.map(({ order: o, request: r }) => ({
          key: r.id,
          tone: 'st-wait',
          label: 'Extra',
          text: `Extra work on ${plainWords(o.title)} waits for the buyer`,
          href: `/orders/${o.id}`,
          act: 'Open',
        })),
      ]
    : [];
  return (
    <SellerShell viewer={viewer} active="overview" file="seller-dashboard" title="Seller overview" head={false} handle={store?.username ? store.handle : undefined}>
      <div className="row">
        <div>
          <h1>{first ? `Hi ${first}, here's your shop` : 'Your shop'}</h1>
          <div className="tag">
            You keep {PLAN_KEEP_TEXT} of every sale · {PAYOUT_TEXT}
          </div>
        </div>
        <div className="seg" role="tablist" aria-label="Period">
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
              <div className="l">Sales</div>
              <div className="v">{sold.length}</div>
              <div className="s">{PERIODS[period][0]}</div>
            </div>
            <div className="glass kpi">
              <div className="l">Net earnings ({PLAN_KEEP_TEXT})</div>
              <div className="v">{usd(net)}</div>
              <div className="s">After the platform fee</div>
            </div>
            <div className="glass kpi">
              <div className="l">In escrow</div>
              <div className="v">{usd(v.escrowCents)}</div>
              <div className="s">{v.toDeliver.length} orders to deliver</div>
            </div>
            <div className="glass kpi">
              <div className="l">Next payout</div>
              <div className="v">{usd(v.availableCents)}</div>
              <div className="s">
                {shortDay(v.nextPayout)}
                {v.health.payoutLabel ? ` · ${v.health.payoutLabel}` : ''}
              </div>
            </div>
            <div className="glass kpi">
              <div className="l">Store views</div>
              <div className="v">{views.toLocaleString('en-US')}</div>
              <div className="s">{views ? `${((buys / views) * 100).toFixed(1)}% buy · 30 days` : 'Last 30 days'}</div>
            </div>
          </div>
          {(v.reserveCents > 0 || v.debtCents > 0) && (
            <section className="glass card" role="status">
              {v.reserveCents > 0 && (
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                  A reserve of {usd(v.reserveCents)} is kept back for a few days and then becomes available.
                </p>
              )}
              {v.debtCents > 0 && (
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                  You owe {usd(v.debtCents)} after a refund or dispute fee. It is taken from your next earnings.
                </p>
              )}
            </section>
          )}
          <div className="grid2">
            <section className="glass card">
              <div className="row" style={{ marginBottom: 6 }}>
                <h2>To do</h2>
                <span className={todo.length ? 'status st-wait' : 'status st-ok'}>{todo.length} items</span>
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
                    You are set up. Nothing waits for you right now.
                  </div>
                </div>
              )}
            </section>
            <section className="glass card">
              <div className="row">
                <h2>Sales trend</h2>
                <span className="tag" style={{ margin: 0 }}>
                  Earnings per week
                </span>
              </div>
              <LineChart values={v.weekly.map((w) => w.cents)} label={`Weekly earnings: ${v.weekly.map((w) => `${shortDay(w.week)} ${usd(w.cents)}`).join(', ')}`} />
              {!v.weekly.some((w) => w.cents > 0) && (
                <div className="tag" style={{ marginTop: 6 }}>
                  Nothing earned yet. Your first accepted order shows up here.
                </div>
              )}
            </section>
          </div>
          <section className="glass card">
            <div className="row" style={{ marginBottom: 14 }}>
              <h2>Money pipeline</h2>
              <Link className="tag" style={{ margin: 0 }} href="/dashboard/seller/payouts" prefetch={false}>
                Earnings &amp; payouts
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
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
              <h2>Account health</h2>
              <div className="li" style={{ fontSize: 14 }}>
                <span style={{ flex: 1 }}>On-time delivery</span>
                <b style={{ fontWeight: 500 }}>{v.health.onTime === null ? 'No deliveries yet' : `${Math.round(v.health.onTime * 100)}%`}</b>
              </div>
              <div className="li" style={{ fontSize: 14 }}>
                <span style={{ flex: 1 }}>Average rating</span>
                <b style={{ fontWeight: 500 }}>{v.health.rating ? `${v.health.rating} (${v.health.ratingCount})` : 'No reviews yet'}</b>
              </div>
              <div className="li" style={{ fontSize: 14 }}>
                <span style={{ flex: 1 }}>Orders with a dispute</span>
                <b style={{ fontWeight: 500 }}>{v.health.disputeRate === null ? 'No orders yet' : `${Math.round(v.health.disputeRate * 1000) / 10}%`}</b>
              </div>
              <div className="li" style={{ fontSize: 14 }}>
                <span style={{ flex: 1 }}>Lifetime earned</span>
                <b style={{ fontWeight: 500 }}>
                  {usd(v.lifetimeCents)} · {v.acceptedCount} accepted
                </b>
              </div>
            </section>
            <section className="glass card" style={{ borderColor: '#E2C58F' }}>
              <div className="row">
                <div>
                  <div className="status st-wait">Notice from SellOnBay</div>
                  <h2 style={{ marginTop: 10 }}>Thursday payouts</h2>
                </div>
                <Link className="btn sm ghost" href="/dashboard/seller/notifications" prefetch={false}>
                  All notices
                </Link>
              </div>
              <p className="muted" style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.6 }}>
                {PAYOUT_TEXT}. Keep your payout details and identity check up to date so nothing waits.
              </p>
            </section>
          </div>
          {data.drafts.length > 0 && (
            <section className="glass card" data-drafts>
              <div className="row" style={{ marginBottom: 6 }}>
                <h2>Your drafts</h2>
                <span className="tag" style={{ margin: 0 }}>
                  Saved but not sent for review. Buyers cannot see them.
                </span>
              </div>
              {data.drafts.map((d) => (
                <div key={d.slug} className="li" style={{ fontSize: 14 }}>
                  <span style={{ flex: 1 }}>{d.name}</span>
                  <Link className="btn sm ghost" href={`/dashboard/seller/websites/new?draft=${encodeURIComponent(d.slug)}`} prefetch={false}>
                    Continue
                  </Link>
                </div>
              ))}
            </section>
          )}
          {data.questions.length > 0 && (
            <section className="glass card" id="questions" data-questions>
              <div className="row" style={{ marginBottom: 6 }}>
                <h2>Questions from buyers</h2>
                <span className="tag" style={{ margin: 0 }}>
                  Answer fast: buyers who get an answer are more likely to buy
                </span>
              </div>
              {data.questions.map((q) => (
                <div key={q.id} className="li" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 6 }}>
                  <b style={{ fontWeight: 500 }}>{q.product_key}</b>
                  <span className="muted" style={{ fontSize: 14 }}>
                    {q.body}
                  </span>
                  {q.reply ? <span className="tag">You replied: {q.reply}</span> : <ReplyForm id={q.id} />}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </SellerShell>
  );
}
