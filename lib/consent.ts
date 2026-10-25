import 'server-only';
import { ACCEPT_TEXT_VERSION } from './consentText';
import { DEVICE_COOKIE, hashKey } from './guard';
import { orderStore } from './orders/store';
import { createAdminClient } from './supabase/server';
import { clientAddress } from './clientIp';

/*
 * The log of a buyer's "I accept" click: when, from which address, with which browser and device, and which version of the words they saw. It is evidence
 * for a dispute or a chargeback, so the address and the browser are kept as they were (not hashed) and the row is append-only. The buyer's own
 * export includes it. A person who is signed out is recorded without a user id. The privacy page says so.
 */
export type Consent = { orderId: string; userId: string | null; kind: 'accept'; version: string; ip: string; userAgent: string; deviceHash: string | null; at: number };

const mem: Consent[] = ((globalThis as { __consentMem?: Consent[] }).__consentMem ??= []);

let ready: { ok: boolean; at: number } | undefined;
async function pg() {
  if ((await orderStore()).kind !== 'postgres') return false;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('order_consents').select('id').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok;
}

/* The connection and device of the request, as they should be written down. */
export function whoIs(req: Request): { ip: string; userAgent: string; deviceHash: string | null } {
  const ip = clientAddress(req.headers);
  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 300);
  const cookie = /(?:^|;\s*)lb_dev=([A-Za-z0-9-]{8,64})/.exec(req.headers.get('cookie') ?? '')?.[1];
  return { ip, userAgent, deviceHash: cookie ? hashKey('device', cookie) : null };
}
export { DEVICE_COOKIE };

export async function recordConsent(c: Omit<Consent, 'version' | 'kind' | 'at'> & { at?: number }): Promise<void> {
  const row: Consent = { kind: 'accept', version: ACCEPT_TEXT_VERSION, at: c.at ?? Date.now(), orderId: c.orderId, userId: c.userId, ip: c.ip, userAgent: c.userAgent, deviceHash: c.deviceHash };
  if (await pg()) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const { error } = await createAdminClient()
      .from('order_consents')
      .insert({
        order_id: row.orderId,
        user_id: row.userId && uuid.test(row.userId) ? row.userId : null,
        kind: row.kind,
        text_version: row.version,
        ip: row.ip,
        user_agent: row.userAgent,
        device_hash: row.deviceHash,
        created_at: new Date(row.at).toISOString(),
      });
    if (error) throw new Error('Could not record the acceptance: ' + error.message);
  } else mem.push(row);
}

export async function consentsOf(orderId: string): Promise<Consent[]> {
  if (await pg()) {
    const { data } = await createAdminClient().from('order_consents').select('user_id, kind, text_version, ip, user_agent, device_hash, created_at').eq('order_id', orderId).order('created_at');
    return (data ?? []).map((r) => ({
      orderId,
      userId: r.user_id,
      kind: r.kind,
      version: r.text_version,
      ip: r.ip ?? '',
      userAgent: r.user_agent ?? '',
      deviceHash: r.device_hash,
      at: Date.parse(r.created_at),
    }));
  }
  return mem.filter((c) => c.orderId === orderId);
}
