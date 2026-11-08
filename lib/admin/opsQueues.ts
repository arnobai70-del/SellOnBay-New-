import 'server-only';
import { listFiles } from '../files/store';
import { listTickets } from '../messaging/store';
import { orderStore } from '../orders/store';
import { listAttempts } from '../payments/store';
import { listSubscriptions } from '../plans/store';
import { revisionsFor } from '../revisions/store';
import { listQuotes, listRequests } from '../requests/store';
import type { AdminScope } from './scopes';

/*
 * The SellOnBay 2.0 work queues on the admin overview (Blueprint 10.1): how many items wait and how long the oldest has waited. Each queue
 * names the permission that works on it, so an admin sees the queues they can act on. Releases and revisions show how many are past the
 * 12-hour target; a missed target only raises alerts, it never releases anything.
 */
export type OpsQueue = { key: string; label: string; n: number; oldestAt: number | null; overdue?: number; href: string; scope: AdminScope };

export const ageText = (since: number | null, now = Date.now()) => {
  if (since === null) return '';
  const h = Math.floor((now - since) / 3_600_000);
  return h < 1 ? 'under an hour' : h < 48 ? `${h} h` : `${Math.floor(h / 24)} days`;
};
const oldest = (xs: number[]) => (xs.length ? Math.min(...xs) : null);

export async function opsQueues(now = Date.now()): Promise<OpsQueue[]> {
  const [requests, superQuotes, payments, releases, revSubmitted, revPending, files, tickets, renewals] = await Promise.all([
    listRequests({ statuses: ['submitted', 'under_review', 'requirements_verified'] }),
    listQuotes(['pending_super']),
    listAttempts(['submitted']),
    (await orderStore()).byState(['release_pending']),
    revisionsFor({ statuses: ['submitted'] }),
    revisionsFor({ statuses: ['release_pending'] }),
    listFiles({ states: ['awaiting_review'] }),
    listTickets({ statuses: ['open'] }),
    listSubscriptions({ status: ['requested', 'pending_payment', 'renewal_due', 'renewal_failed'] }),
  ]);
  const custom = requests.filter((r) => r.kind === 'custom_dev');
  const product = requests.filter((r) => r.kind !== 'custom_dev');
  return [
    { key: 'requests', label: 'Purchase requests', n: product.length, oldestAt: oldest(product.map((r) => r.createdAt)), href: '/admin/orders/requests', scope: 'support' },
    { key: 'custom', label: 'Custom development', n: custom.length, oldestAt: oldest(custom.map((r) => r.createdAt)), href: '/admin/orders/requests', scope: 'support' },
    { key: 'super', label: 'Price changes for Super', n: superQuotes.length, oldestAt: oldest(superQuotes.map((q) => q.updatedAt)), href: '/admin/orders/requests', scope: 'super' },
    { key: 'payments', label: 'Payments to reconcile', n: payments.length, oldestAt: oldest(payments.map((a) => a.createdAt)), href: '/admin/orders/payments', scope: 'finance' },
    {
      key: 'releases',
      label: 'Releases due',
      n: releases.length,
      oldestAt: oldest(releases.map((o) => o.fundedAt ?? o.createdAt)),
      overdue: releases.filter((o) => o.releaseDueAt && now > o.releaseDueAt).length,
      href: '/admin/orders/releases',
      scope: 'delivery',
    },
    {
      key: 'revisions',
      label: 'Revisions',
      n: revSubmitted.length + revPending.length,
      oldestAt: oldest([...revSubmitted, ...revPending].map((r) => r.updatedAt)),
      overdue: revPending.filter((r) => r.releaseDueAt && now > r.releaseDueAt).length,
      href: '/admin/orders/revisions',
      scope: 'delivery',
    },
    { key: 'files', label: 'Files to review', n: files.length, oldestAt: oldest(files.map((f) => f.updatedAt)), href: '/admin/listings/files', scope: 'catalog' },
    { key: 'tickets', label: 'Support tickets', n: tickets.length, oldestAt: oldest(tickets.map((t) => t.updatedAt)), href: '/admin/support/tickets', scope: 'support' },
    { key: 'plans', label: 'Plan requests and renewals', n: renewals.length, oldestAt: oldest(renewals.map((s) => s.updatedAt)), href: '/admin/users/sellers', scope: 'finance' },
  ];
}
