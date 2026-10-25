import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { ReplyForm } from '@/components/ReplyForm';
import { StateChip } from '@/components/StateChip';
import { Bars } from '@/components/charts';
import { Timer } from '@/components/dash';
import { FEE_SALE_TEXT } from '@/lib/config';
import { sellerDashboard } from '@/lib/dashboard';
import { draftsFor } from '@/lib/drafts';
import { PAYOUT_METHODS } from '@/lib/payoutDetails';
import { questionsForSeller } from '@/lib/presale/service';
import { supabaseConfigured } from '@/lib/supabase/env';
import { getViewerId, requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Seller dashboard', robots: { index: false } };
export const dynamic = 'force-dynamic';

const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });
const shortDay = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const LISTING_CHIP: Record<string, [string, string]> = { live: ['Live', 'chip mint'], in_review: ['In review', 'chip amber'], rejected: ['Rejected', 'chip rose'], paused: ['Paused', 'chip rose'] };

export default async function SellerDashboard() {
  const viewer = await requireViewer({ path: '/dashboard/seller', roles: ['seller', 'admin'] });
  const sellerId = await getViewerId();
  const questions = sellerId ? await questionsForSeller(sellerId) : [];
  const drafts = sellerId ? await draftsFor(sellerId) : [];
  const v = sellerId ? await sellerDashboard(sellerId) : null;
  const now = Date.now();
  const h = v?.health;
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="seller" active="seller" title="Seller dashboard">
      {!supabaseConfigured && <p className="muted">In demo mode there are no seller accounts, so nothing is listed here. Sign in with a seller account to see your own orders, money and listings.</p>}
      <div className="strip">
        <div>
          <small>Available for payout</small>
          <b>{money(v?.availableCents ?? 0)}</b>
          <span className="d">Next payout {v ? shortDay(v.nextPayout) : 'on Sunday'}</span>
        </div>
        <div>
          <small>Pending (7-day hold)</small>
          <b>{money(v?.pendingCents ?? 0)}</b>
          <span className="muted" style={{ fontSize: '13.5px' }}>
            After acceptance
          </span>
        </div>
        <div>
          <small>In escrow</small>
          <b>{money(v?.escrowCents ?? 0)}</b>
          <span className="muted" style={{ fontSize: '13.5px' }}>
            {v?.toDeliver.length ?? 0} to deliver
          </span>
        </div>
        <div>
          <small>Lifetime earned</small>
          <b>{money(v?.lifetimeCents ?? 0)}</b>
          <span className="muted" style={{ fontSize: '13.5px' }}>
            {v?.acceptedCount ?? 0} accepted orders
          </span>
        </div>
      </div>

      {v && (v.reserveCents > 0 || v.debtCents > 0) && (
        <p className="panel" role="status">
          {v.reserveCents > 0 && <>A reserve of {money(v.reserveCents)} is kept back for a few days and then becomes available. </>}
          {v.debtCents > 0 && <>You owe {money(v.debtCents)} after a refund or dispute fee. It is taken from your next earnings.</>}
        </p>
      )}

      <div className="cols2">
        <div className="dp">
          <div className="hd">
            <div>
              <h2>Earnings per week</h2>
              <p className="sub">Accepted orders, after the {FEE_SALE_TEXT} fee</p>
            </div>
            <span className="chip mint">
              <i />
              Payout on Sundays
            </span>
          </div>
          {v && v.weekly.some((w) => w.cents > 0) ? (
            <Bars label="Weekly earnings" prefix="$" data={v.weekly.map((w) => [shortDay(w.week), Math.round(w.cents / 100)] as [string, number])} />
          ) : (
            <p className="muted">Nothing earned yet. Your first accepted order shows up here.</p>
          )}
        </div>
        <div className="dp">
          <div className="hd">
            <div>
              <h2>Account health</h2>
              <p className="sub">Worked out from your real orders</p>
            </div>
          </div>
          <ul className="lst">
            <li>
              <div className="grow">
                <b>On-time delivery</b>
                <div className="meter">
                  <i style={{ width: `${Math.round((h?.onTime ?? 0) * 100)}%` }} />
                </div>
              </div>
              <b>{h?.onTime === null || h?.onTime === undefined ? 'No deliveries yet' : `${Math.round(h.onTime * 100)}%`}</b>
            </li>
            <li>
              <div className="grow">
                <b>Average rating</b>
                <div className="meter">
                  <i style={{ width: `${((h?.rating ?? 0) / 5) * 100}%` }} />
                </div>
              </div>
              <b>{h?.rating ? `${h.rating} (${h.ratingCount})` : 'No reviews yet'}</b>
            </li>
            <li>
              <div className="grow">
                <b>Orders with a dispute</b>
                <div className="meter">
                  <i style={{ width: `${Math.min(100, Math.round((h?.disputeRate ?? 0) * 100))}%`, background: 'var(--gold)' }} />
                </div>
              </div>
              <b>{h?.disputeRate === null || h?.disputeRate === undefined ? 'No orders yet' : `${Math.round(h.disputeRate * 1000) / 10}%`}</b>
            </li>
            <li>
              <div className="grow">
                <b>Identity and payout account</b>
                <small>
                  {h?.verified
                    ? `Email ${h.verified.email ? 'verified' : 'not verified'}, phone ${h.verified.phone ? 'verified' : 'not verified'}, ID ${h.verified.id ? 'verified' : 'not verified'}, payout account ${h.verified.payout ? 'set' : 'not set'}`
                    : 'Not set up yet'}
                </small>
              </div>
              {h?.verified && h.verified.email && h.verified.phone && h.verified.id && h.verified.payout ? (
                <span className="chip mint">
                  <i />
                  Verified
                </span>
              ) : (
                <span className="chip amber">
                  <i />
                  To do
                </span>
              )}
            </li>
            {supabaseConfigured && (
              <li>
                <div className="grow">
                  <b>Where we send your earnings</b>
                  <small>{h?.payoutLabel ?? 'Not set yet. Add it so your weekly payouts can be sent.'}</small>
                </div>
                <AdminForm
                  endpoint="/api/seller/payout"
                  submit="Save payout details"
                  openLabel={h?.payoutLabel ? 'Change' : 'Add payout details'}
                  tone="line"
                  fields={[
                    { name: 'method', label: 'How you want to be paid', kind: 'select', options: PAYOUT_METHODS.map(([v, l]) => [v, l]) },
                    {
                      name: 'account',
                      label: 'Account',
                      kind: 'text',
                      required: true,
                      hint: 'For a bank: IBAN or account number, bank name and account holder. For Payoneer or Wise: the email of that account. We email you when this changes.',
                    },
                  ]}
                />
              </li>
            )}
          </ul>
        </div>
      </div>

      {drafts.length > 0 && (
        <div className="dp" data-drafts>
          <div className="hd">
            <div>
              <h2>Your drafts</h2>
              <p className="sub">Saved but not sent for review. Buyers cannot see them.</p>
            </div>
          </div>
          <ul className="lst">
            {drafts.map((d) => (
              <li key={d.slug}>
                <div className="grow">
                  <b>{d.name}</b>
                  <small>{d.platform === 'web' ? 'Website' : d.platform}</small>
                </div>
                <Link className="btn btn-line btn-sm" href={`/sell/new?draft=${encodeURIComponent(d.slug)}`}>
                  Continue
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {questions.length > 0 && (
        <div className="dp" data-questions>
          <div className="hd">
            <div>
              <h2>Questions from buyers</h2>
              <p className="sub">Answer fast: buyers who get an answer are more likely to buy.</p>
            </div>
          </div>
          <ul className="lst">
            {questions.map((q) => (
              <li key={q.id}>
                <div className="grow">
                  <b>{q.product_key}</b>
                  <small>{q.body}</small>
                  {q.reply ? <small>You replied: {q.reply}</small> : <ReplyForm id={q.id} />}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Orders to deliver</h2>
            <p className="sub">The money is in escrow. Deliver before the timer ends.</p>
          </div>
        </div>
        {v && v.toDeliver.length === 0 && <p className="muted">Nothing to deliver right now.</p>}
        {v && v.toDeliver.length > 0 && (
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Buyer&apos;s domain</th>
                  <th>Status</th>
                  <th>Time left</th>
                  <th className="num">You earn</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {v.toDeliver.map(({ order: o, earnCents, held }) => (
                  <tr key={o.id}>
                    <td>
                      <b>{o.title}</b>
                      {o.express && <span className="chip blue"> Express</span>}
                    </td>
                    <td>{o.domain?.name ?? (o.githubUsername ? `GitHub: ${o.githubUsername}` : '-')}</td>
                    <td>
                      <StateChip state={o.state} />
                    </td>
                    {held ? <td className="muted">Paused, waiting for a safety check</td> : <Timer seconds={Math.max(0, Math.floor(((o.dueAt ?? now) - now) / 1000))} />}
                    <td className="num">{money(earnCents)}</td>
                    <td>
                      <Link className="btn btn-dark btn-sm" href={`/messages/${o.id}`}>
                        Open chat
                      </Link>
                      {/* After a dispute the fix is delivered the same way for every kind of order, repository and instant downloads included. */}
                      {(o.state === 'fix_requested' || (o.deliveryType !== 'repo_access' && !o.instant && (o.state === 'funded' || o.state === 'in_delivery' || o.state === 'overdue'))) && (
                        <AdminForm endpoint={`/api/orders/${o.id}/deliver`} fields={[]} submit="Yes, it is live and ready" openLabel="I delivered it" tone="dark" />
                      )}
                      {o.deliveryType === 'repo_access' && (o.state === 'funded' || o.state === 'in_delivery') && (
                        <AdminForm
                          endpoint={o.state === 'funded' ? `/api/orders/${o.id}/handover` : `/api/orders/${o.id}/resend-invite`}
                          fields={[]}
                          submit={o.state === 'funded' ? 'I sent the invite' : 'Send the invite again'}
                          openLabel={o.state === 'funded' ? 'I sent the invite' : 'Send the invite again'}
                          tone="line"
                        />
                      )}{' '}
                      <a className="btn btn-line btn-sm" href={`/api/orders/${o.id}/evidence`} download>
                        Record (PDF)
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {v && v.revocations.length > 0 && (
        <div className="dp" data-revocations>
          <div className="hd">
            <div>
              <h2>Remove access to a repository</h2>
              <p className="sub">These orders were refunded or cancelled after you sent the GitHub invite. Remove the buyer from your private repository, then tell us.</p>
            </div>
          </div>
          <ul className="lst">
            {v.revocations.map((c) => (
              <li key={c.orderId}>
                <div className="grow">
                  <b>{c.title}</b>
                  <small>Remove GitHub user {c.github || 'the buyer'}</small>
                </div>
                <AdminForm endpoint={`/api/orders/${c.orderId}/revoke-done`} fields={[]} submit="I removed the access" openLabel="I removed the access" tone="dark" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Extra work you sent</h2>
            <p className="sub">Scope changes your buyers asked for. Start only after it shows Funded.</p>
          </div>
        </div>
        {v && v.extras.length === 0 && <p className="muted">No extra work requests yet.</p>}
        <ul className="lst">
          {v?.extras.map(({ order, request }) => (
            <li key={request.id}>
              <div className="grow">
                <b>
                  {request.title} · {order.title}
                </b>
                <small>
                  {money(request.priceCents)} · +{request.addDays} {request.addDays === 1 ? 'day' : 'days'}
                </small>
              </div>
              <span className={'chip ' + ({ pending: 'amber', funded: 'mint', declined: 'rose', cancelled: '' }[request.state] ?? '')}>
                <i />
                {{ pending: 'Waiting for buyer', funded: 'Funded', declined: 'Declined', cancelled: 'Taken back' }[request.state]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="cols2">
        <div className="dp" id="listings">
          <div className="hd">
            <div>
              <h2>Your listings</h2>
            </div>
            <Link className="btn btn-blue btn-sm" href="/sell/new">
              List a new site
            </Link>
          </div>
          {v && v.listings.length === 0 && <p className="muted">No listings yet.</p>}
          <ul className="lst">
            {v?.listings.map((l) => {
              const [label, cls] = LISTING_CHIP[l.status] ?? [l.status, 'chip'];
              return (
                <li key={l.slug}>
                  <div className="grow">
                    <b>{l.name}</b>
                    <small>
                      {money(l.priceCents)}
                      {l.ratingCount ? ` · ${l.ratingAvg} stars (${l.ratingCount})` : ''}
                    </small>
                    {l.reviewNote && <small>Admin note: {l.reviewNote}</small>}
                    {l.digital && l.versions.length > 0 && (
                      <small>Versions: {l.versions.map((x) => `${x.version} (${x.status === 'live' ? 'live' : x.status === 'in_review' ? 'in review' : 'rejected'})`).join(', ')}</small>
                    )}
                    {l.digital && l.status === 'live' && (
                      <AdminForm
                        endpoint={`/api/listings/${l.slug}/versions`}
                        openLabel="Publish a new version"
                        submit="Send for review"
                        tone="line"
                        fields={[
                          { name: 'version', label: 'Version number, for example 1.1', kind: 'text', required: true },
                          { name: 'changelog', label: 'What changed (buyers see this)', kind: 'textarea', required: true },
                          { name: 'fileUrl', label: 'Private link to the new files (https)', kind: 'text', required: true },
                        ]}
                      />
                    )}
                  </div>
                  {['in_review', 'live', 'rejected', 'paused'].includes(l.status) && (
                    <Link className="btn btn-line btn-sm" href={`/sell/new?edit=${encodeURIComponent(l.slug)}`} aria-label={`Edit ${l.name}`}>
                      Edit
                    </Link>
                  )}
                  <span className={cls}>
                    <i />
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="dp">
          <div className="hd">
            <div>
              <h2>Payouts</h2>
            </div>
          </div>
          {v && v.payouts.length === 0 && <p className="muted">No payouts yet. Earnings are paid every Sunday, 7 days after the buyer accepts.</p>}
          <ul className="lst">
            {v?.payouts.map((p) => (
              <li key={p.id}>
                <div className="grow">
                  <b>Week of {shortDay(p.weekStart)}</b>
                  <small>{p.method}</small>
                </div>
                <b>{money(p.amountCents)}</b>
                <span className={'chip ' + (p.status === 'paid' ? 'mint' : p.status === 'failed' ? 'rose' : 'blue')}>
                  <i />
                  {p.status === 'paid' ? 'Paid' : p.status === 'failed' ? 'Failed' : p.status === 'exported' ? 'Being sent' : 'Scheduled'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </DashShell>
  );
}
