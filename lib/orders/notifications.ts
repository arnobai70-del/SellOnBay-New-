import 'server-only';
import { CONFIG, HOUR_MS } from '../config';
import { heldReason } from '../holdStore';
import { inviteReminders } from '../repoAccess';
import { notify, notifyAdmins } from '../notify';
import type { Order, OrderEvent } from './machine';

/* Who is told what, when an order changes. Called after every change of state and by the scheduled job for the timed reminders. */
export async function notifyOrderEvent(o: Order, e: OrderEvent): Promise<void> {
  const base = { title: o.title, orderId: o.id };
  switch (e.event) {
    case 'funded':
      await notify(o.buyerId, 'order_funded', { ...base, days: o.days });
      await notify(o.sellerId, (await heldReason(o.id)) ? 'order_held' : 'order_funded', { ...base, days: o.days });
      break;
    case 'delivered':
    case 'auto_delivered':
    case 'demo_seller_delivered':
    case 'access_confirmed':
    case 'access_auto_confirmed':
      await notify(o.buyerId, 'order_delivered', base);
      break;
    case 'accepted':
    case 'auto_accepted':
      await notify(o.sellerId, 'order_accepted', base);
      break;
    case 'overdue':
      await notify(o.buyerId, 'order_overdue', base);
      await notify(o.sellerId, 'order_overdue', base);
      break;
    case 'cancelled':
    case 'refunded':
      // Only a paid order: an unpaid one cancelled by its buyer concerns nobody else.
      if (o.fundedAt === undefined) break;
      await notify(o.buyerId, 'order_cancelled', base);
      await notify(o.sellerId, 'order_cancelled', base);
      break;
    case 'dispute_opened':
      await notify(o.sellerId, 'dispute_opened', { ...base, reason: String(e.meta.reason ?? '') });
      await notifyAdmins('dispute_opened', { ...base, reason: String(e.meta.reason ?? '') }, `dispute:${String(e.meta.disputeId ?? o.id)}`);
      break;
    case 'dispute_decided':
      await notify(o.buyerId, 'dispute_decided', { ...base, decision: String(e.meta.decision ?? '').replace(/_/g, ' '), note: String(e.meta.note ?? '') });
      await notify(o.sellerId, 'dispute_decided', { ...base, decision: String(e.meta.decision ?? '').replace(/_/g, ' '), note: String(e.meta.note ?? '') });
      break;
  }
}

/* Reminders that depend on time, not on a change: due soon (seller) and review ending (buyer). Each goes out once per order. */
export async function notifyReminders(o: Order, now = Date.now()): Promise<void> {
  const { dueSoonHours, reviewEndingHours } = CONFIG.notify;
  if (await heldReason(o.id)) return; // the delivery timer is stopped while an order waits for a safety check
  await inviteReminders(o, now);
  if ((o.state === 'funded' || o.state === 'in_delivery') && o.dueAt !== undefined && o.dueAt > now && o.dueAt - now <= dueSoonHours * HOUR_MS)
    await notify(o.sellerId, 'order_due_soon', { title: o.title, orderId: o.id, hours: dueSoonHours }, { dedupe: `due_soon:${o.id}:${o.dueAt}` });
  if (o.state === 'delivered' && o.reviewEndsAt !== undefined && o.reviewEndsAt > now && o.reviewEndsAt - now <= reviewEndingHours * HOUR_MS)
    await notify(o.buyerId, 'review_ending', { title: o.title, orderId: o.id, hours: reviewEndingHours }, { dedupe: `review_ending:${o.id}:${o.reviewEndsAt}` });
}
