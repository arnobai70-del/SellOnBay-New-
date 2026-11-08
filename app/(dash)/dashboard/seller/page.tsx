import type { Metadata } from 'next';
import Link from 'next/link';
import { ReplyForm } from '@/components/ReplyForm';
import { Bars } from '@/components/charts';
import { Button } from '@/components/glass/Button';
import { GlassCard } from '@/components/glass/GlassCard';
import { Kpi } from '@/components/glass/Kpi';
import { SellerShell } from '@/components/glass/SellerShell';
import { StatusPill } from '@/components/glass/StatusPill';
import { PAYOUT_TEXT, PLAN_KEEP_TEXT } from '@/lib/config';
import { usd } from '@/lib/glass/orderStatus';
import { sellerOverview, storeProfile } from '@/lib/glass/seller';
import { plainWords } from '@/lib/glass/words';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Seller overview', robots: { index: false } };
export const dynamic = 'force-dynamic';

const shortDay = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/* The seller's first screen: money, what to do next, and questions from buyers. Orders, listings and payouts each have their own page. */
export default async function SellerOverview() {
  const viewer = await requireViewer({ path: '/dashboard/seller', roles: ['seller', 'admin'] });
  const data = viewer ? await sellerOverview(viewer.id) : null;
  const store = viewer ? await storeProfile(viewer.id, viewer.name) : null;
  const v = data?.v;
  const first = viewer?.name?.split(' ')[0];
  const steps = v
    ? [
        { done: !!store?.username, label: 'Choose your store name', href: '/dashboard/seller/store' },
        { done: !!v.health.payoutLabel, label: 'Add where we send your earnings', href: '/dashboard/seller/payouts' },
        { done: data!.verification.status === 'approved' || data!.verification.status === 'pending', label: 'Verify your identity', href: '/dashboard/seller/payouts#verify' },
        { done: v.listings.length > 0, label: 'Upload your first website', href: '/dashboard/seller/websites/new' },
      ]
    : [];
  const todo = steps.filter((s) => !s.done);
  return (
    <SellerShell
      viewer={viewer}
      active="overview"
      title={first ? `Welcome back, ${first}` : 'Seller overview'}
      subtitle={`You keep ${PLAN_KEEP_TEXT} of every sale. ${PAYOUT_TEXT}`}
      handle={store?.username ? store.handle : undefined}
      actions={<Button href="/dashboard/seller/websites/new">Upload website</Button>}
    >
      {v && data && (
        <>
          <div className="kpis">
            <Kpi label="Available" value={usd(v.availableCents)} note={`Next payout ${shortDay(v.nextPayout)}`} />
            <Kpi label="On hold (7 days)" value={usd(v.pendingCents)} note="After the buyer accepts" />
            <Kpi label="In escrow" value={usd(v.escrowCents)} note={`${v.toDeliver.length} to deliver`} />
            <Kpi label="Lifetime earned" value={usd(v.lifetimeCents)} note={`${v.acceptedCount} accepted orders`} />
          </div>
          {(v.reserveCents > 0 || v.debtCents > 0) && (
            <GlassCard as="section" role="status">
              {v.reserveCents > 0 && <p>A reserve of {usd(v.reserveCents)} is kept back for a few days and then becomes available.</p>}
              {v.debtCents > 0 && <p>You owe {usd(v.debtCents)} after a refund or dispute fee. It is taken from your next earnings.</p>}
            </GlassCard>
          )}
          <div className="grid2">
            <GlassCard as="section">
              <h2>{todo.length ? 'Get ready to sell' : 'You are set up'}</h2>
              {steps.map((s) => (
                <div key={s.label} className="li">
                  <span style={{ flex: 1 }}>{s.done ? s.label : <Link href={s.href}>{s.label}</Link>}</span>
                  <StatusPill tone={s.done ? 'ok' : 'wait'}>{s.done ? 'Done' : 'To do'}</StatusPill>
                </div>
              ))}
            </GlassCard>
            <GlassCard as="section">
              <h2>Earnings per week</h2>
              <p className="tag">Accepted orders, after the platform fee</p>
              {v.weekly.some((w) => w.cents > 0) ? (
                <Bars label="Weekly earnings" prefix="$" data={v.weekly.map((w) => [shortDay(w.week), Math.round(w.cents / 100)] as [string, number])} />
              ) : (
                <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
                  Nothing earned yet. Your first accepted order shows up here.
                </p>
              )}
            </GlassCard>
          </div>
          <div className="grid2">
            <GlassCard as="section">
              <div className="row">
                <h2>Orders to deliver</h2>
                <Link href="/dashboard/seller/orders">All orders</Link>
              </div>
              {v.toDeliver.length ? (
                v.toDeliver.slice(0, 5).map(({ order: o, earnCents }) => (
                  <div key={o.id} className="li">
                    <span style={{ flex: 1 }}>{plainWords(o.title)}</span>
                    <span className="tag">{usd(earnCents)}</span>
                  </div>
                ))
              ) : (
                <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
                  Nothing to deliver right now.
                </p>
              )}
            </GlassCard>
            <GlassCard as="section">
              <h2>Account health</h2>
              <div className="li">
                <span style={{ flex: 1 }}>On-time delivery</span>
                <b>{v.health.onTime === null ? 'No deliveries yet' : `${Math.round(v.health.onTime * 100)}%`}</b>
              </div>
              <div className="li">
                <span style={{ flex: 1 }}>Average rating</span>
                <b>{v.health.rating ? `${v.health.rating} (${v.health.ratingCount})` : 'No reviews yet'}</b>
              </div>
              <div className="li">
                <span style={{ flex: 1 }}>Orders with a dispute</span>
                <b>{v.health.disputeRate === null ? 'No orders yet' : `${Math.round(v.health.disputeRate * 1000) / 10}%`}</b>
              </div>
            </GlassCard>
          </div>
          {data.drafts.length > 0 && (
            <GlassCard as="section" data-drafts>
              <h2>Your drafts</h2>
              <p className="tag">Saved but not sent for review. Buyers cannot see them.</p>
              {data.drafts.map((d) => (
                <div key={d.slug} className="li">
                  <span style={{ flex: 1 }}>{d.name}</span>
                  <Button variant="ghost" size="sm" href={`/dashboard/seller/websites/new?draft=${encodeURIComponent(d.slug)}`}>
                    Continue
                  </Button>
                </div>
              ))}
            </GlassCard>
          )}
          {data.questions.length > 0 && (
            <GlassCard as="section" data-questions>
              <h2>Questions from buyers</h2>
              <p className="tag">Answer fast: buyers who get an answer are more likely to buy.</p>
              {data.questions.map((q) => (
                <div key={q.id} className="li" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                  <b>{q.product_key}</b>
                  <span className="muted">{q.body}</span>
                  {q.reply ? <span className="tag">You replied: {q.reply}</span> : <ReplyForm id={q.id} />}
                </div>
              ))}
            </GlassCard>
          )}
        </>
      )}
    </SellerShell>
  );
}
