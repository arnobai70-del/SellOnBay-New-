import 'server-only';
import { Ledger, checkEntry, type EntrySet, type LedgerLine } from './ledger';
import { supabaseConfigured } from './supabase/env';
import { createAdminClient } from './supabase/server';

/* Where ledger entries are kept: the database (migration 0016) or memory. Both enforce the same rules and the same idempotent keys. */
export interface LedgerStore {
  readonly kind: 'postgres' | 'memory';
  post(e: EntrySet): Promise<boolean>; // false if the key was already posted
  balance(account: string): Promise<number>; // in the account's normal direction
  /* Every account that starts with a prefix, with what it holds (for example all seller_available:). */
  balances(prefix: string): Promise<{ account: string; holds: number }[]>;
  /* The lines of one posted entry, or [] when that key was never posted. */
  lines(key: string): Promise<LedgerLine[]>;
}

const mem: Ledger = ((globalThis as { __ledgerMem?: Ledger }).__ledgerMem ??= new Ledger());

export const memoryLedger: LedgerStore = {
  kind: 'memory',
  async post(e) {
    return mem.post(e);
  },
  async balance(account) {
    return mem.balance(account);
  },
  async lines(key) {
    return mem.entries.find((e) => e.key === key)?.lines ?? [];
  },
  async balances(prefix) {
    return [...new Set(mem.entries.flatMap((e) => e.lines.map((l) => l.account)))].filter((a) => a.startsWith(prefix)).map((account) => ({ account, holds: mem.balance(account) }));
  },
};

export const postgresLedger: LedgerStore = {
  kind: 'postgres',
  async post(e) {
    checkEntry(e); // the same check in code and in the database
    const { data, error } = await createAdminClient().rpc('ledger_post', { p_key: e.key, p_order: e.orderId, p_memo: e.memo, p_lines: e.lines });
    if (error) throw new Error('Ledger refused the entry: ' + error.message);
    return data === true;
  },
  async balances(prefix) {
    const { data } = await createAdminClient()
      .from('ledger_balances')
      .select('account, net_cents')
      .like('account', prefix.replace(/[\\%_]/g, (c) => '\\' + c) + '%'); // escape LIKE's wildcards: seller_available has an underscore
    return (data ?? [])
      .filter((r) => (r.account as string).startsWith(prefix))
      .map((r) => ({ account: r.account as string, holds: (r.account as string).startsWith('seller_debt:') ? -Number(r.net_cents) : Number(r.net_cents) }));
  },
  async lines(key) {
    const { data, error } = await createAdminClient().from('ledger_entries').select('account, amount_cents, side').eq('entry_key', key);
    if (error) throw new Error('Could not read the ledger: ' + error.message);
    return (data ?? []).map((r) => ({ account: r.account as string, amountCents: Number(r.amount_cents), side: r.side as LedgerLine['side'] }));
  },
  async balance(account) {
    const { data } = await createAdminClient().from('ledger_balances').select('net_cents').eq('account', account).maybeSingle();
    const net = Number(data?.net_cents ?? 0);
    return account === 'platform_cash' || account.startsWith('seller_debt:') ? -net : net;
  },
};

let ready: { ok: boolean; at: number } | undefined;
export async function ledgerStore(): Promise<LedgerStore> {
  if (!supabaseConfigured) return memoryLedger;
  if (!ready || (!ready.ok && Date.now() - ready.at > 30_000)) {
    const { error } = await createAdminClient().from('ledger_entries').select('id').limit(1);
    ready = { ok: !error, at: Date.now() };
  }
  return ready.ok ? postgresLedger : memoryLedger;
}
