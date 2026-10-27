'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type PlanCard = { code: string; name: string; monthlyCents: number; yearlyCents: number; commissionBps: number; listingLimit: number; featured: boolean };

const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });

/*
 * The seller's plan: what they are on, how many listings they use, and a way to ask for Pro or Business. Asking charges nothing; SellOnBay
 * sends payment instructions and starts the plan once the payment is reconciled. The server checks every rule again.
 */
export function SellerPlanPanel({
  current,
  used,
  plans,
  pending,
}: {
  current: PlanCard;
  used: number;
  plans: PlanCard[];
  pending: { plan: string; billing: string; status: string; periodEnd?: string } | null;
}) {
  const router = useRouter();
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function ask(code: string) {
    setBusy(code);
    setMsg(null);
    const r = await fetch('/api/seller/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plan: code, billing }) });
    const j = await r.json().catch(() => ({}));
    setBusy('');
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? 'Something went wrong.' });
    setMsg({ ok: true, text: 'Request sent. SellOnBay will send you payment instructions.' });
    router.refresh();
  }

  const over = used > current.listingLimit;
  return (
    <div className="dp" id="plan" data-plan={current.code}>
      <div className="hd">
        <div>
          <h2>Your plan: {current.name}</h2>
          <p className="sub">
            {current.commissionBps / 100}% commission · {used} of {current.listingLimit} published listings
            {current.featured ? ' · featured placement' : ''}
          </p>
        </div>
      </div>
      {over && (
        <p className="note warn" role="note">
          <span>You have more published listings than your plan allows. They stay published, but you cannot publish another until you are under the limit.</span>
        </p>
      )}
      {pending && (
        <p className="note" role="status" data-plan-pending>
          <span>
            {pending.plan} ({pending.billing}): {pending.status}
            {pending.periodEnd ? `, paid until ${pending.periodEnd}` : ''}.
          </span>
        </p>
      )}
      {!pending && (
        <>
          <div className="seg" role="radiogroup" aria-label="Billing">
            {(['monthly', 'yearly'] as const).map((b) => (
              <label key={b}>
                <input type="radio" name="plan-billing" value={b} checked={billing === b} onChange={() => setBilling(b)} />
                {b === 'monthly' ? 'Monthly' : 'Yearly (15% less)'}
              </label>
            ))}
          </div>
          <div className="plan-cards">
            {plans.map((p) => (
              <div className={'plan-card' + (p.code === current.code ? ' on' : '')} key={p.code}>
                <b>{p.name}</b>
                <span className="plan-price">{p.monthlyCents === 0 ? 'Free' : billing === 'yearly' ? `${money(p.yearlyCents)} a year` : `${money(p.monthlyCents)} a month`}</span>
                <ul>
                  <li>{p.commissionBps / 100}% commission</li>
                  <li>{p.listingLimit} published listings</li>
                  {p.featured && <li>Featured placement</li>}
                </ul>
                {p.code !== 'free' && p.code !== current.code && (
                  <button className="btn btn-blue btn-sm" type="button" disabled={!!busy} onClick={() => ask(p.code)}>
                    {busy === p.code ? 'Sending...' : `Ask for ${p.name}`}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {msg && (
        <p className={msg.ok ? 'note' : 'note warn'} role={msg.ok ? 'status' : 'alert'}>
          <span>{msg.text}</span>
        </p>
      )}
    </div>
  );
}
