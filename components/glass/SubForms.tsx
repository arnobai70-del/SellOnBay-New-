'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
/* Buyer subscriptions (owner, 2026-11-12): the buyer's three actions, all through POST /api/subscriptions (lib/buyerSubs). */
async function post(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; error?: string; value?: Record<string, unknown> }> {
  const r = await fetch('/api/subscriptions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  if (!r) return { ok: false, status: 0, error: 'No connection. Please try again.' };
  const j = (await r.json().catch(() => ({}))) as { error?: string; value?: Record<string, unknown> };
  return { ok: r.ok, status: r.status, error: j.error, value: j.value };
}
const Err = ({ msg }: { msg: string }) =>
  msg ? (
    <p role="alert" className="tag" style={{ color: '#7A2E24', margin: 0 }}>
      {msg}
    </p>
  ) : null;

/* "Choose this plan": starts the subscription (it waits for payment) and opens it in the dashboard. Visitors are sent to sign in first. */
export function SubscribeButton({ planId, label, disabled }: { planId: string; label: string; disabled?: boolean }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label className="hidden-label" htmlFor={`cp-${planId}`}>
        <T s={'Coupon code'} />
      </label>
      <input
        id={`cp-${planId}`}
        className="input"
        placeholder={tx('Coupon code (optional)')}
        value={coupon}
        onChange={(e) => setCoupon(e.target.value.toUpperCase())}
        maxLength={40}
        disabled={disabled}
      />
      <button
        className="btn"
        type="button"
        disabled={disabled || busy}
        style={{ width: '100%' }}
        onClick={async () => {
          setBusy(true);
          setMsg('');
          const r = await post({ action: 'subscribe', planId, coupon });
          setBusy(false);
          if (r.status === 401) return router.push('/signin?next=' + encodeURIComponent('/subscriptions'));
          if (!r.ok) return setMsg(r.error ?? 'Could not start the subscription.');
          router.push('/dashboard/buyer/subscription');
        }}
      >
        {busy ? tx('One moment…') : label}
      </button>
      <Err msg={msg} />
    </div>
  );
}

/* The manual payment report: how it was paid and its reference. An admin checks it, then the subscription starts (or is renewed). */
export function SubPayForm({ subscriptionId, kind, methods }: { subscriptionId: string; kind: 'new' | 'renewal'; methods: { label: string; instructions: string }[] }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [method, setMethod] = useState(methods[0]?.label ?? '');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const chosen = methods.find((m) => m.label === method);
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg('');
        const r = await post({ action: 'pay', subscriptionId, kind, method, reference, paidOn: paidOn || null });
        setBusy(false);
        if (!r.ok) return setMsg(r.error ?? 'Could not save the payment.');
        router.refresh();
      }}
    >
      {methods.length > 0 ? (
        <div className="field">
          <label htmlFor={`pm-${subscriptionId}`}>
            <T s={'How you paid'} />
          </label>
          <select id={`pm-${subscriptionId}`} className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {methods.map((m) => (
              <option key={m.label} value={m.label}>
                {m.label}
              </option>
            ))}
          </select>
          {chosen?.instructions && <div className="tag">{chosen.instructions}</div>}
        </div>
      ) : (
        <div className="tag" style={{ margin: 0 }}>
          <T s={'Payment details are sent by our team. Enter the reference you receive after paying.'} />
        </div>
      )}
      <div className="field">
        <label htmlFor={`ref-${subscriptionId}`}>
          <T s={'Payment reference'} />
        </label>
        <input
          id={`ref-${subscriptionId}`}
          className="input"
          required
          minLength={3}
          maxLength={80}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={tx('Transaction ID')}
        />
      </div>
      <div className="field">
        <label htmlFor={`on-${subscriptionId}`}>
          <T s={'Paid on'} />
        </label>
        <input id={`on-${subscriptionId}`} className="input" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? tx('Sending…') : kind === 'new' ? tx('Send payment for checking') : tx('Send renewal payment')}
      </button>
      <Err msg={msg} />
    </form>
  );
}

/* Choose a website with a credit. The files then open from the new order, like any order. */
export function PickForm({ subscriptionId, options }: { subscriptionId: string; options: { key: string; name: string }[] }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [key, setKey] = useState(options[0]?.key ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!options.length)
    return (
      <div className="tag" style={{ margin: 0 }}>
        <T s={'No more websites can be chosen with this plan right now.'} />
      </div>
    );
  return (
    <form
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!window.confirm('Use one of your website choices for this website? A choice cannot be changed later.')) return;
        setBusy(true);
        setMsg('');
        const r = await post({ action: 'pick', subscriptionId, productKey: key });
        setBusy(false);
        if (!r.ok) return setMsg(r.error ?? 'Could not add this website.');
        router.refresh();
      }}
    >
      <div className="field" style={{ flex: '1 1 240px', minWidth: 0 }}>
        <label htmlFor={`pick-${subscriptionId}`}>
          <T s={'Choose a website'} />
        </label>
        <select id={`pick-${subscriptionId}`} className="input" value={key} onChange={(e) => setKey(e.target.value)}>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      <button className="btn" type="submit" disabled={busy || !key}>
        {busy ? tx('Adding…') : tx('Add website')}
      </button>
      <div style={{ flexBasis: '100%' }}>
        <Err msg={msg} />
      </div>
    </form>
  );
}
