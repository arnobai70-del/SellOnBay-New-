import type { Metadata } from 'next';
import { AdminForm } from '@/components/AdminForm';
import { DashShell } from '@/components/DashShell';
import { money } from '@/lib/data';
import { PLANS_V1, PLAN_CODES, mayMove, type SubState } from '@/lib/plans/rules';
import { ADMIN_SUB_ACTIONS } from '@/lib/plans/service';
import { listSubscriptions, planById } from '@/lib/plans/store';
import { createAdminClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Seller plans', robots: { index: false } };
export const dynamic = 'force-dynamic';

const ACTION_LABEL: Record<(typeof ADMIN_SUB_ACTIONS)[number], string> = {
  await_payment: 'Payment instructions sent, waiting for payment',
  activate: 'Payment reconciled: start the plan',
  renewal_due: 'Renewal is due',
  renew: 'Renewal payment reconciled: extend',
  renewal_failed: 'Renewal was not paid',
  cancel: 'Seller cancels (runs to the end of the period)',
  end: 'End the subscription now',
  resume: 'Keep it running',
};
const TARGET: Record<(typeof ADMIN_SUB_ACTIONS)[number], SubState> = {
  await_payment: 'pending_payment',
  activate: 'active',
  renewal_due: 'renewal_due',
  renew: 'active',
  renewal_failed: 'renewal_failed',
  cancel: 'cancelling',
  end: 'ended',
  resume: 'active',
};
const day = (ms?: number) => (ms ? new Date(ms).toISOString().slice(0, 10) : '–');

/* Finance handles seller plans case by case (O-4): every step needs a reason, and starting or renewing needs the reconciled payment reference. */
export default async function Sellers() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/users/sellers', roles: ['admin'], scope: 'finance' });
  const subs = await listSubscriptions();
  const names = new Map<string, string>();
  if (supabaseConfigured && subs.length) {
    const { data } = await createAdminClient()
      .from('profiles')
      .select('id, full_name')
      .in('id', [...new Set(subs.map((s) => s.sellerId))]);
    for (const p of data ?? []) names.set(p.id, p.full_name || 'Seller');
  }
  const plans = new Map(await Promise.all(subs.map(async (s) => [s.planId, await planById(s.planId)] as const)));
  const open = subs.filter((s) => s.status !== 'ended');
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-sellers" title={tx('Seller plans')}>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Plans'} />
            </h2>
            <p className="tag">
              <T s={'Prices and commission are fixed per plan version. Existing orders keep the fee they were made with.'} />
            </p>
          </div>
        </div>
        <div className="tbl">
          <table className="sob-stack">
            <thead>
              <tr>
                <th>
                  <T s={'Plan'} />
                </th>
                <th>
                  <T s={'Monthly'} />
                </th>
                <th>
                  <T s={'Yearly'} />
                </th>
                <th>
                  <T s={'Commission'} />
                </th>
                <th>
                  <T s={'Published listings'} />
                </th>
                <th>
                  <T s={'Featured'} />
                </th>
              </tr>
            </thead>
            <tbody>
              {PLAN_CODES.map((c) => {
                const p = PLANS_V1[c];
                return (
                  <tr key={c}>
                    <td data-label="Plan">{p.name}</td>
                    <td data-label="Monthly">{money(p.monthlyCents / 100)}</td>
                    <td data-label="Yearly">{money(p.yearlyCents / 100)}</td>
                    <td data-label="Commission">{p.commissionBps / 100}%</td>
                    <td data-label="Published listings">{p.listingLimit}</td>
                    <td data-label="Featured">{p.featured ? 'Yes' : 'No'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="glass card sob-sec">
        <div className="row sob-hd">
          <div>
            <h2>
              <T s={'Requests and subscriptions'} />
            </h2>
            <p className="tag">
              <T s={'Nothing renews, refunds or ends by itself. Decide each step here; the seller is told and the step is logged.'} />
            </p>
          </div>
        </div>
        {open.length === 0 && (
          <p className="muted">
            <T s={'No plan requests or paid plans yet.'} />
          </p>
        )}
        <ul className="sob-list">
          {open.map((s) => {
            const plan = plans.get(s.planId);
            const actions = ADMIN_SUB_ACTIONS.filter((a) => mayMove(s.status, TARGET[a]));
            return (
              <li key={s.id} data-sub={s.id}>
                <div className="sob-grow">
                  <b>
                    {names.get(s.sellerId) ?? 'Seller'}: {plan?.name ?? 'Plan'} ({s.billing}, {money(s.priceCents / 100)})
                  </b>
                  <small>
                    <T s={'{v0} · period {v1} to {v2}'} v={{ v0: s.status.replace('_', ' '), v1: day(s.periodStart), v2: day(s.periodEnd) }} />
                  </small>
                  {actions.length > 0 && (
                    <AdminForm
                      endpoint={`/api/admin/subscriptions/${s.id}`}
                      openLabel="Decide"
                      submit="Save"
                      tone="line"
                      fields={[
                        { name: 'action', label: 'Step', kind: 'select', options: actions.map((a) => [a, ACTION_LABEL[a]] as [string, string]) },
                        { name: 'paymentRef', label: 'Reconciled payment reference (to start or renew)', kind: 'text' },
                        { name: 'periodDays', label: 'Paid period in days (to start or renew)', kind: 'text' },
                        { name: 'reason', label: 'Why (goes in the audit log)', kind: 'textarea', required: true },
                      ]}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </DashShell>
  );
}
