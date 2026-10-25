import 'server-only';
import { productRecord } from '../catalog';
import { disputeSummary } from '../disputes';
import { heldReason } from '../holdStore';
import type { Order } from '../orders/machine';
import { endsAt, infoOf, promisedDays } from '../productInfo';
import { inviteState, taskOf } from '../repoAccess';
import { reviewSummary } from '../reviews';
import { versionsForOrder } from '../versions';

/* Everything besides the order and its log that the order page shows: the dispute, the review, a safety hold and what the product promised (guide, needs, support, updates). */
async function repoView(o: Order) {
  const [s, t] = await Promise.all([inviteState(o), taskOf(o.id)]);
  return { invitedAt: s?.invitedAt ?? null, expiresAt: s?.expiresAt ?? null, expired: !!s?.expired, resends: s?.resends ?? 0, revoke: t?.revokeState ?? null };
}

export async function viewExtras(o: Order) {
  // The order proves the buyer may see what they bought, even after the listing leaves "live" (an edit in review, a pause).
  const prod = o.productKey ? (await productRecord(o.productKey))?.product : undefined;
  const i = prod ? infoOf(prod) : null;
  const supportDays = i ? promisedDays(o.supportDays, i.supportDays) : 0;
  const updateDays = i ? promisedDays(o.updateDays, i.updateDays) : 0;
  return {
    ...(await disputeSummary(o)),
    ...(await reviewSummary(o)),
    held: !!(await heldReason(o.id)),
    repo: o.deliveryType === 'repo_access' ? await repoView(o) : null,
    info: i
      ? {
          versions: await versionsForOrder(prod!.id, o.fundedAt ?? o.createdAt, updateDays),
          requirements: i.requirements ?? null,
          docsUrl: i.docsUrl ?? null,
          supportDays,
          updateDays,
          supportUntil: endsAt(o.fundedAt, supportDays),
          updateUntil: endsAt(o.fundedAt, updateDays),
        }
      : null,
  };
}
