import 'server-only';
import { getViewerId } from '../supabase/viewer';
import type { Order } from '../orders/machine';
import { getOrder } from '../orders/service';

/* An order made while signed in belongs to that person. An order made signed out is reachable by its unguessable id. */
export async function orderFor(id: string): Promise<Order | null> {
  const o = await getOrder(id);
  if (!o) return null;
  if (o.buyerId && o.buyerId !== (await getViewerId())) return null;
  return o;
}
