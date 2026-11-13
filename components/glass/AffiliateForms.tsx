'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
/* The affiliate dashboard's actions (owner, 2026-11-12), all through POST /api/affiliates (lib/affiliates). */
async function post(body: Record<string, unknown>) {
  const r = await fetch('/api/affiliates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
  return { ok: !!r?.ok, error: j?.error ?? (r ? '' : 'No connection. Please try again.') };
}
const Msg = ({ text, bad }: { text: string; bad?: boolean }) =>
  text ? (
    <p role={bad ? 'alert' : 'status'} className="tag" style={{ margin: 0, color: bad ? '#7A2E24' : undefined }}>
      {text}
    </p>
  ) : null;

export function AffJoinForm({ termsVersion, feeText }: { termsVersion: string; feeText: string }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [name, setName] = useState('');
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await post({ action: 'join', displayName: name, acceptTerms: accept });
        setBusy(false);
        if (!r.ok) return setMsg(r.error || 'Could not join.');
        router.refresh();
      }}
    >
      <div className="field">
        <label htmlFor="aff-name">
          <T s={'Public name (shown on the leaderboard; you can hide it later)'} />
        </label>
        <input id="aff-name" className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={tx('e.g. Web Picks')} />
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14 }}>
        <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          <T s={'I accept the'} />{' '}
          <a href="/affiliates#terms">
            <T s={'affiliate terms'} />
          </a>{' '}
          <T s={'(version {termsVersion}) and will say that I earn a commission when I share links.'} v={{ termsVersion }} />
        </span>
      </label>
      <div className="tag" style={{ margin: 0 }}>
        {feeText}
      </div>
      <button className="btn" type="submit" disabled={busy || !accept} style={{ alignSelf: 'flex-start' }}>
        {busy ? tx('Joining…') : tx('Join the affiliate program')}
      </button>
      <Msg text={msg} bad />
    </form>
  );
}

/* One-click links: a general link, and a link for any eligible website. Copy works without a server call. */
export function AffLinkGenerator({ code, base, sites }: { code: string; base: string; sites: { key: string; name: string; path: string }[] }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const [key, setKey] = useState('');
  const [copied, setCopied] = useState('');
  const link = key ? `${base}${sites.find((s) => s.key === key)?.path ?? '/'}?ref=${code}` : `${base}/?ref=${code}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="field">
        <label htmlFor="aff-site">
          <T s={'Link to'} />
        </label>
        <select id="aff-site" className="input" value={key} onChange={(e) => setKey(e.target.value)}>
          <option value="">
            <T s={'SellOnBay home page (general link)'} />
          </option>
          {sites.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input aria-label={tx('Your referral link')} className="input" readOnly value={link} style={{ flex: '1 1 320px', minWidth: 0 }} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied('Copied.');
            } catch {
              setCopied('Select the link and copy it.');
            }
          }}
        >
          <T s={'Copy link'} />
        </button>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button type="button" className="btn ghost" onClick={() => void navigator.share({ url: link }).catch(() => {})}>
            <T s={'Share'} />
          </button>
        )}
      </div>
      <Msg text={copied} />
      <div className="tag" style={{ margin: 0 }}>
        <T s={'When you share a link, say that you earn a commission (for example “affiliate link”).'} />
      </div>
    </div>
  );
}

export function AffProfileForm({ displayName, publicLeaderboard, payoutMethod, payoutMasked }: { displayName: string; publicLeaderboard: boolean; payoutMethod: string; payoutMasked: string }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [f, setF] = useState({ displayName, publicLeaderboard, payoutMethod, payoutDetails: '' });
  const [msg, setMsg] = useState('');
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await post({
          action: 'profile',
          displayName: f.displayName,
          publicLeaderboard: f.publicLeaderboard,
          payoutMethod: f.payoutMethod,
          ...(f.payoutDetails ? { payoutDetails: f.payoutDetails } : {}),
        });
        setMsg(r.ok ? 'Saved.' : r.error || 'Could not save.');
        if (r.ok) router.refresh();
      }}
    >
      <div className="field">
        <label htmlFor="aff-pname">
          <T s={'Public name'} />
        </label>
        <input id="aff-pname" className="input" maxLength={60} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
        <input type="checkbox" checked={f.publicLeaderboard} onChange={(e) => setF({ ...f, publicLeaderboard: e.target.checked })} /> <T s={'Show me on the public leaderboard'} />
      </label>
      <div className="field">
        <label htmlFor="aff-pm">
          <T s={'Payout method'} />
        </label>
        <select id="aff-pm" className="input" value={f.payoutMethod} onChange={(e) => setF({ ...f, payoutMethod: e.target.value })}>
          <option value="">
            <T s={'Choose…'} />
          </option>
          {['PayPal', 'Payoneer', 'Wise', 'Bank transfer'].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="aff-pd">
          <T s={'Payout details (email or account){v0}'} v={{ v0: payoutMasked ? ` · saved: ${payoutMasked}` : '' }} />
        </label>
        <input
          id="aff-pd"
          className="input"
          maxLength={200}
          value={f.payoutDetails}
          onChange={(e) => setF({ ...f, payoutDetails: e.target.value })}
          placeholder={payoutMasked ? tx('Leave empty to keep the saved details') : tx('e.g. you@example.com')}
          autoComplete="off"
        />
      </div>
      <button className="btn sm" type="submit" style={{ alignSelf: 'flex-start' }}>
        <T s={'Save'} />
      </button>
      <Msg text={msg} />
    </form>
  );
}

export function AffWithdrawForm({ availableCents, minCents }: { availableCents: number; minCents: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState(availableCents >= minCents ? String(availableCents / 100) : '');
  const [msg, setMsg] = useState('');
  const [bad, setBad] = useState(false);
  return (
    <form
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!window.confirm(`Ask for a withdrawal of $${Number(amount).toFixed(2)}? An admin checks it and pays it by hand.`)) return;
        const r = await post({ action: 'withdraw', amountCents: Math.round(Number(amount) * 100) });
        setBad(!r.ok);
        setMsg(r.ok ? 'Requested. We will email you when it is decided.' : r.error || 'Could not request.');
        if (r.ok) router.refresh();
      }}
    >
      <div className="field">
        <label htmlFor="aff-wd">
          <T s={'Amount (USD)'} />
        </label>
        <input id="aff-wd" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} style={{ width: 140 }} />
      </div>
      <button className="btn" type="submit" disabled={availableCents < minCents}>
        <T s={'Request withdrawal'} />
      </button>
      <div style={{ flexBasis: '100%' }}>
        <Msg text={msg} bad={bad} />
      </div>
    </form>
  );
}
