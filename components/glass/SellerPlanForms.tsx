'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
/* Admin › Subscription Management › Seller (owner, 2026-11-12): POST /api/admin/seller-plans, on the existing seller plan system. */
type Display = { description: string; badge: string; benefits: { text: string; on: boolean }[]; sort: number; visible: boolean };
type Version = { code: 'free' | 'pro' | 'business'; name: string; monthlyCents: number; yearlyCents: number; commissionBps: number; listingLimit: number; featured: boolean };

async function post(body: Record<string, unknown>) {
  const r = await fetch('/api/admin/seller-plans', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
  return { ok: !!r?.ok, error: j?.error ?? (r ? '' : 'No connection.') };
}
const Status = ({ msg }: { msg: string }) =>
  msg ? (
    <span role="status" className="tag" style={{ margin: 0 }}>
      {msg}
    </span>
  ) : null;

/* The seller on/off switch, and the words, badge, benefits, order and visibility of each plan as sellers see them. */
export function SellerSettingsForm({ enabled, display, names }: { enabled: boolean; display: Record<string, Display>; names: Record<string, string> }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [d, setD] = useState(display);
  const [msg, setMsg] = useState('');
  const set = (code: string, patch: Partial<Display>) => setD({ ...d, [code]: { ...d[code], ...patch } });
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!on && enabled && !window.confirm('Switch seller subscriptions off? Sellers can no longer ask for a plan; running seller subscriptions keep their benefits.')) return;
        const r = await post({ action: 'settings', enabled: on, display: d });
        setMsg(r.ok ? 'Saved.' : r.error || 'Could not save.');
        if (r.ok) router.refresh();
      }}
    >
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}>
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> <T s={'Seller subscriptions are open (sellers can ask for a paid plan)'} />
      </label>
      {Object.keys(d).map((code) => (
        <fieldset key={code} style={{ border: '1px solid #DCE7EC', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend className="tag">{names[code] ?? code}</legend>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" checked={d[code].visible} onChange={(e) => set(code, { visible: e.target.checked })} /> <T s={'Shown to sellers'} />
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
              <T s={'Order'} />
              <input aria-label={`${code} order`} className="input" type="number" value={d[code].sort} onChange={(e) => set(code, { sort: Number(e.target.value) })} style={{ width: 80 }} />
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
              <T s={'Badge'} />
              <input aria-label={`${code} badge`} className="input" value={d[code].badge} maxLength={30} onChange={(e) => set(code, { badge: e.target.value })} style={{ width: 140 }} />
            </label>
          </div>
          <textarea
            aria-label={`${code} description`}
            className="input"
            rows={2}
            maxLength={400}
            placeholder={tx('Description')}
            value={d[code].description}
            onChange={(e) => set(code, { description: e.target.value })}
          />
          {d[code].benefits.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                aria-label={tx('Shown')}
                type="checkbox"
                checked={b.on}
                onChange={(e) => set(code, { benefits: d[code].benefits.map((x, n) => (n === i ? { ...x, on: e.target.checked } : x)) })}
              />
              <input
                aria-label={`${code} benefit ${i + 1}`}
                className="input"
                value={b.text}
                maxLength={120}
                onChange={(e) => set(code, { benefits: d[code].benefits.map((x, n) => (n === i ? { ...x, text: e.target.value } : x)) })}
              />
              <button type="button" className="btn sm ghost" onClick={() => set(code, { benefits: d[code].benefits.filter((_, n) => n !== i) })}>
                <T s={'Remove'} />
              </button>
            </div>
          ))}
          <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => set(code, { benefits: [...d[code].benefits, { text: '', on: true }] })}>
            <T s={'+ Add benefit'} />
          </button>
        </fieldset>
      ))}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn sm" type="submit">
          <T s={'Save seller settings'} />
        </button>
        <Status msg={msg} />
      </div>
    </form>
  );
}

/* One seller plan: saving makes its next version (running subscriptions and recorded fees keep theirs). */
export function SellerPlanVersionForm({ plan, offered }: { plan: Version; offered: boolean }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [f, setF] = useState({
    name: plan.name,
    monthly: String(plan.monthlyCents / 100),
    yearly: String(plan.yearlyCents / 100),
    commission: String(plan.commissionBps / 100),
    limit: String(plan.listingLimit),
    featured: plan.featured,
  });
  const [msg, setMsg] = useState('');
  const field = (k: 'name' | 'monthly' | 'yearly' | 'commission' | 'limit', label: string) => (
    <div className="field">
      <label htmlFor={`${plan.code}-${k}`}>{label}</label>
      <input id={`${plan.code}-${k}`} className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} inputMode={k === 'name' ? undefined : 'decimal'} />
    </div>
  );
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!window.confirm(`Save ${f.name} as a new version? New sellers and new requests get it; running seller subscriptions keep theirs.`)) return;
        const r = await post({
          action: 'saveVersion',
          code: plan.code,
          name: f.name,
          monthlyCents: Math.round(Number(f.monthly) * 100),
          yearlyCents: Math.round(Number(f.yearly) * 100),
          commissionBps: Math.round(Number(f.commission) * 100),
          listingLimit: Number(f.limit),
          featured: f.featured,
        });
        setMsg(r.ok ? 'Saved as a new version.' : r.error || 'Could not save.');
        if (r.ok) router.refresh();
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: 10 }}>
        {field('name', 'Name')}
        {field('monthly', 'Monthly (USD)')}
        {field('yearly', 'Yearly (USD)')}
        {field('commission', 'Commission (%)')}
        {field('limit', 'Published listings')}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
          <input type="checkbox" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} /> <T s={'Featured listings'} />
        </label>
        <button className="btn sm" type="submit">
          <T s={'Save as new version'} />
        </button>
        {plan.code !== 'free' && (
          <button
            type="button"
            className="btn sm ghost"
            onClick={async () => {
              if (offered && !window.confirm(`Withdraw ${plan.name}? No new seller can ask for it; running subscriptions keep it.`)) return;
              const r = await post({ action: 'offer', code: plan.code, offered: !offered });
              setMsg(r.ok ? (offered ? 'Withdrawn.' : 'Offered again.') : r.error || 'Could not change it.');
              if (r.ok) router.refresh();
            }}
          >
            {offered ? tx('Withdraw') : tx('Offer again')}
          </button>
        )}
        <Status msg={msg} />
      </div>
    </form>
  );
}
