import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { SlaClock } from '@/components/SlaClock';
import { CONFIG } from '@/lib/config';
import { readyMade } from '@/lib/orders/machine';
import { orderStore } from '@/lib/orders/store';
import { legacyQueue } from '@/lib/release/service';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Releases', robots: { index: false } };
export const dynamic = 'force-dynamic';

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const note = (label: string, required = true) => ({ name: 'note', label, kind: 'textarea' as const, required });

/*
 * Delivery (or Super, F-12). Every purchase needs this explicit release approval after the payment is verified (D-A). The target is 12 hours,
 * 24/7/365, from the later of payment and files ready. Missing it never releases anything; it only shows here and alerts.
 */
export default async function Releases() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/orders/releases', roles: ['admin'], scope: 'delivery' });
  const store = await orderStore();
  const waiting = (await store.byState(['release_pending'])).sort((a, b) => (a.releaseDueAt ?? 0) - (b.releaseDueAt ?? 0));
  const toStart = (await store.byState(['funded'])).filter((o) => !!o.quotationId && !readyMade(o));
  const legacy = await legacyQueue();
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-releases" title={tx('Releases')}>
      <div className="glass card sob-sec" data-release-queue>
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Waiting for release ({length})'} v={{ length: waiting.length }} />
            </h2>
            <p className="tag">
              <T s={'Payment is verified and the files are ready. Check them, then approve the release. Nothing reaches the buyer before you do.'} />
            </p>
          </div>
        </div>
        {waiting.length === 0 && (
          <p className="muted">
            <T s={'Nothing waiting.'} />
          </p>
        )}
        <ul className="sob-list">
          {waiting.map((o) => (
            <li key={o.id} data-release={o.id}>
              <div className="sob-grow">
                <b>
                  <Link href={`/admin/orders/${o.id}`}>{o.title}</Link> · {usd(o.priceCents)} · {readyMade(o) ? 'ready-made files' : 'work order'}
                </b>
                {o.releaseDueAt ? <SlaClock dueAt={o.releaseDueAt} slaHours={CONFIG.release.slaHours} /> : null}
                <div className="sob-acts">
                  <AdminForm
                    endpoint={`/api/admin/releases/${o.id}`}
                    fixed={{ action: 'approve' }}
                    openLabel="Approve release"
                    submit="Release to the buyer"
                    tone="blue"
                    fields={[note('What you checked (audit log)', false)]}
                  />
                  {!readyMade(o) && (
                    <AdminForm
                      endpoint={`/api/admin/releases/${o.id}`}
                      fixed={{ action: 'return' }}
                      openLabel="Return to seller"
                      submit="Return"
                      tone="line"
                      fields={[note('What the seller must fix')]}
                    />
                  )}
                </div>
                <small className="muted">
                  <T s={'To refuse the sale instead, Finance refunds the order (Payments to check).'} />
                </small>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="glass card sob-sec" data-work-to-start>
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Paid work orders waiting to start ({length})'} v={{ length: toStart.length }} />
            </h2>
            <p className="tag">
              <T s={'Let the seller start. Their delivery time starts now; their delivery comes back here for release.'} />
            </p>
          </div>
        </div>
        {toStart.length === 0 && (
          <p className="muted">
            <T s={'None.'} />
          </p>
        )}
        <ul className="sob-list">
          {toStart.map((o) => (
            <li key={o.id}>
              <div className="sob-grow">
                <b>
                  <Link href={`/admin/orders/${o.id}`}>{o.title}</Link> · {usd(o.priceCents)} · {o.pkg}
                </b>
                <AdminForm endpoint={`/api/admin/releases/${o.id}`} fixed={{ action: 'authorise' }} fields={[]} openLabel="Authorise work" submit="Let the seller start" tone="blue" />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="glass card sob-sec" data-legacy-orders>
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Orders from the old checkout'} />
            </h2>
            <p className="tag">
              <T s={'Each needs an individual decision (F-13, F-14). Delivered old orders keep the access they had.'} />
            </p>
          </div>
        </div>
        <h3>
          <T s={'Paid but not delivered ({length})'} v={{ length: legacy.paid.length }} />
        </h3>
        <ul className="sob-list">
          {legacy.paid.map((o) => (
            <li key={o.id}>
              <div className="sob-grow">
                <b>
                  <Link href={`/admin/orders/${o.id}`}>{o.title}</Link> · {usd(o.priceCents)} · {o.state.replace('_', ' ')}
                </b>
                <AdminForm
                  endpoint={`/api/admin/releases/${o.id}`}
                  fixed={{ action: 'legacy_approve' }}
                  openLabel="Reviewed: allow release"
                  submit="Allow release"
                  tone="line"
                  fields={[note('What you checked (seller, files, payment)')]}
                />
              </div>
            </li>
          ))}
        </ul>
        <h3>
          <T s={'Never paid ({length})'} v={{ length: legacy.unpaid.length }} />
        </h3>
        <ul className="sob-list">
          {legacy.unpaid.map((o) => (
            <li key={o.id}>
              <div className="sob-grow">
                <b>
                  {o.title} · {usd(o.priceCents)} · {o.state.replace('_', ' ')}
                </b>
                {o.state === 'awaiting_payment' && (
                  <AdminForm
                    endpoint={`/api/admin/releases/${o.id}`}
                    fixed={{ action: 'legacy_cancel' }}
                    openLabel="Close"
                    submit="Close the order"
                    tone="line"
                    fields={[note('Why (the buyer is told nothing was charged)')]}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={"Change a buyer's access"} />
            </h2>
            <p className="tag">
              <T s={'Suspend while you look into something, resume, or revoke for good (refund, lost chargeback, licence breach).'} />
            </p>
          </div>
        </div>
        <AdminForm
          endpoint="/api/admin/releases/by-order"
          openLabel="Change access"
          submit="Save"
          tone="line"
          fields={[
            { name: 'orderId', label: 'Order id', kind: 'text', required: true },
            {
              name: 'action',
              label: 'Change',
              kind: 'select',
              options: [
                ['suspend', 'Suspend'],
                ['resume', 'Resume'],
                ['revoke', 'Revoke for good'],
              ],
            },
            note('Why (goes in the audit log)'),
          ]}
        />
      </div>
    </DashShell>
  );
}
