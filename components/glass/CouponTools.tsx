'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
async function post(body: Record<string, unknown>) {
  const r = await fetch('/api/admin/coupons', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  return r?.ok ? null : (j.error ?? 'Could not reach SellOnBay. Try again.');
}

/* The design's "On" switch of a coupon row: turns it on or off (/api/admin/coupons, toggle), and a quiet Remove beside it. */
export function CouponSwitch({ code, on }: { code: string; on: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: 'toggle' | 'remove') => {
    setBusy(true);
    setError((await post({ action, code })) ?? '');
    setBusy(false);
    router.refresh();
  };
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <button type="button" className={on ? 'sw on' : 'sw'} role="switch" aria-checked={on} aria-label={`Coupon ${code} active`} disabled={busy} onClick={() => run('toggle')} />
      <button type="button" className="btn sm ghost" disabled={busy} onClick={() => run('remove')}>
        <T s={'Remove'} />
      </button>
      {error && (
        <span className="tag" style={{ margin: 0, color: '#7A2E24' }} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

/* "New coupon" of design-reference/admin-marketing.html. Coupons are a percent off every website, paid by SellOnBay (lib/marketing/coupons.ts). */
export function CouponForm() {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [v, setV] = useState({ code: '', percentOff: '', endsOn: '', maxUses: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <section className="glass card" style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2>
        <T s={'New coupon'} />
      </h2>
      <div className="field">
        <label htmlFor="cc">
          <T s={'Code'} />
        </label>
        <input id="cc" className="input" placeholder={tx('e.g. LAUNCH20')} maxLength={24} value={v.code} onChange={set('code')} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
        <div className="field">
          <label htmlFor="ct">
            <T s={'Type'} />
          </label>
          <select id="ct" className="input" defaultValue="percent">
            <option value="percent">
              <T s={'Percent'} />
            </option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="cv">
            <T s={'Value'} />
          </label>
          <input id="cv" className="input" placeholder="20" inputMode="numeric" value={v.percentOff} onChange={set('percentOff')} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="ca">
          <T s={'Applies to'} />
        </label>
        <select id="ca" className="input" defaultValue="all">
          <option value="all">
            <T s={'All websites'} />
          </option>
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
        <div className="field">
          <label htmlFor="ce">
            <T s={'Last day (optional)'} />
          </label>
          <input id="ce" className="input" type="date" value={v.endsOn} onChange={set('endsOn')} />
        </div>
        <div className="field">
          <label htmlFor="cm">
            <T s={'Most uses (optional)'} />
          </label>
          <input id="cm" className="input" inputMode="numeric" value={v.maxUses} onChange={set('maxUses')} />
        </div>
      </div>
      <div className="tag" style={{ margin: 0 }}>
        <T s={'SellOnBay pays the discount; the seller always gets their share of the list price.'} />
      </div>
      <button
        className="btn"
        type="button"
        disabled={busy || !v.code || !v.percentOff}
        onClick={async () => {
          setBusy(true);
          const error = await post({ action: 'add', ...v });
          setBusy(false);
          setMsg(error ? { ok: false, text: error } : { ok: true, text: 'Coupon created.' });
          if (!error) {
            setV({ code: '', percentOff: '', endsOn: '', maxUses: '' });
            router.refresh();
          }
        }}
      >
        {busy ? tx('One moment...') : tx('Create coupon')}
      </button>
      {msg && (
        <p className="tag" style={{ margin: 0, color: msg.ok ? '#1A5444' : '#7A2E24' }} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}
    </section>
  );
}
