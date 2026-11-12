'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
type Kind = 'product' | 'package' | 'express' | 'extra' | 'revision' | 'custom' | 'domain' | 'hosting';
type Row = { label: string; dollars: string; kind: Kind; passThroughVerified: boolean };
const KINDS: [Kind, string][] = [
  ['product', 'Product'],
  ['package', 'Setup or customisation'],
  ['express', 'Express delivery'],
  ['extra', 'Extra work'],
  ['revision', 'Paid revision'],
  ['custom', 'Custom development'],
  ['domain', 'Domain (pass-through)'],
  ['hosting', 'Hosting (pass-through)'],
];

/*
 * An admin writes a quotation: priced lines, the terms the buyer accepts, and (when the price differs from the listed one) the reason a Super
 * Admin will read. The server works out the fee from the seller's plan and refuses anything outside the rules; this only collects the words.
 */
export function QuoteEditor({
  requestId,
  start,
  listedCents,
  defaults,
  exclusive,
}: {
  requestId: string;
  start: { label: string; cents: number; kind: Kind }[];
  listedCents: number | null;
  defaults: { deliveryDays: number; deliveryHours: number | null; supportDays: number; updateDays: number };
  exclusive: boolean;
}) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(start.map((l) => ({ label: l.label, dollars: (l.cents / 100).toFixed(2), kind: l.kind, passThroughVerified: false })));
  const [days, setDays] = useState(String(defaults.deliveryDays));
  const [hours, setHours] = useState(defaults.deliveryHours ? String(defaults.deliveryHours) : '');
  const [support, setSupport] = useState(String(defaults.supportDays));
  const [updates, setUpdates] = useState(String(defaults.updateDays));
  const [included, setIncluded] = useState('0');
  const [windowDays, setWindowDays] = useState('0');
  const [scope, setScope] = useState('');
  const [extra, setExtra] = useState('');
  const [note, setNote] = useState('');
  const [legal, setLegal] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const cents = (d: string) => Math.round(Number(d) * 100);
  const sellerCents = rows.filter((r) => r.kind !== 'domain' && r.kind !== 'hosting').reduce((s, r) => s + (cents(r.dollars) || 0), 0);
  const total = rows.reduce((s, r) => s + (cents(r.dollars) || 0), 0);
  const differs = listedCents === null || sellerCents !== listedCents;
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/admin/requests/${requestId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'draft_quote',
        lines: rows.map((r) => ({ label: r.label, cents: cents(r.dollars), kind: r.kind, ...(r.kind === 'domain' || r.kind === 'hosting' ? { passThroughVerified: r.passThroughVerified } : {}) })),
        terms: {
          deliveryDays: Number(days),
          deliveryHours: hours ? Number(hours) : null,
          supportDays: Number(support),
          updateDays: Number(updates),
          revisions: { included: Number(included), windowDays: Number(windowDays), scope, extraPriceCents: extra ? cents(extra) : null },
          note,
          ...(exclusive ? { legalReview: legal } : {}),
        },
        overrideReason: reason,
      }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? 'Could not save the draft.' });
    setMsg({ ok: true, text: 'Draft saved. Check it below, then issue it.' });
    router.refresh();
  }

  return (
    <div className="sob-q-edit" data-quote-editor>
      <table className="sob-q-lines">
        <thead>
          <tr>
            <th>
              <T s={'Line'} />
            </th>
            <th>
              <T s={'Kind'} />
            </th>
            <th>
              <T s={'Amount (USD)'} />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <input aria-label={tx('Line name')} value={r.label} maxLength={120} onChange={(e) => set(i, { label: e.target.value })} />
              </td>
              <td>
                <select aria-label={tx('Line kind')} value={r.kind} onChange={(e) => set(i, { kind: e.target.value as Kind })}>
                  {KINDS.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
                {(r.kind === 'domain' || r.kind === 'hosting') && (
                  <label className="opt">
                    <input type="checkbox" checked={r.passThroughVerified} onChange={(e) => set(i, { passThroughVerified: e.target.checked })} />
                    <small>
                      <T s={'I checked this is a genuine pass-through cost (no commission)'} />
                    </small>
                  </label>
                )}
              </td>
              <td>
                <input aria-label={tx('Amount')} inputMode="decimal" value={r.dollars} onChange={(e) => set(i, { dollars: e.target.value })} />
                <button type="button" className="btn ghost sm" onClick={() => setRows(rows.filter((_, n) => n !== i))} disabled={rows.length < 2}>
                  <T s={'Remove'} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>
              <T s={'Total'} />
            </td>
            <td>${(total / 100).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
      <button type="button" className="btn ghost sm" onClick={() => setRows([...rows, { label: '', dollars: '0.00', kind: 'extra', passThroughVerified: false }])} disabled={rows.length >= 20}>
        <T s={'Add a line'} />
      </button>
      <p className="muted">
        <T
          s={'Listed seller price: {v0} · quoted seller price: ${v1}{v2}'}
          v={{
            v0: listedCents === null ? 'none (licence tier, custom work or exclusive request)' : `$${(listedCents / 100).toFixed(2)}`,
            v1: (sellerCents / 100).toFixed(2),
            v2: differs ? ' · differs, so a Super Admin must approve it before the buyer sees it' : '',
          }}
        />
      </p>
      <div className="sob-req-grid">
        <div>
          <label htmlFor="qe-days">
            <T s={'Delivery days'} />
          </label>
          <input id="qe-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
        <div>
          <label htmlFor="qe-hours">
            <T s={'or hours (optional)'} />
          </label>
          <input id="qe-hours" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
        <div>
          <label htmlFor="qe-support">
            <T s={'Support days'} />
          </label>
          <input id="qe-support" inputMode="numeric" value={support} onChange={(e) => setSupport(e.target.value)} />
        </div>
        <div>
          <label htmlFor="qe-updates">
            <T s={'Update days'} />
          </label>
          <input id="qe-updates" inputMode="numeric" value={updates} onChange={(e) => setUpdates(e.target.value)} />
        </div>
        <div>
          <label htmlFor="qe-inc">
            <T s={'Included revisions'} />
          </label>
          <input id="qe-inc" inputMode="numeric" value={included} onChange={(e) => setIncluded(e.target.value)} />
        </div>
        <div>
          <label htmlFor="qe-win">
            <T s={'Revision window (days)'} />
          </label>
          <input id="qe-win" inputMode="numeric" value={windowDays} onChange={(e) => setWindowDays(e.target.value)} />
        </div>
        <div>
          <label htmlFor="qe-extra">
            <T s={'Extra revision price (USD, optional)'} />
          </label>
          <input id="qe-extra" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </div>
      </div>
      <label htmlFor="qe-scope">
        <T s={'What counts as a revision'} />
      </label>
      <textarea id="qe-scope" rows={2} maxLength={1000} value={scope} onChange={(e) => setScope(e.target.value)} />
      <label htmlFor="qe-note">
        <T s={'Note to the buyer (optional)'} />
      </label>
      <textarea id="qe-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      {exclusive && (
        <>
          <label htmlFor="qe-legal">
            <T s={"Legal/IP review (who checked, and what happens to earlier buyers' licences)"} />
          </label>
          <textarea id="qe-legal" rows={3} maxLength={500} value={legal} onChange={(e) => setLegal(e.target.value)} />
        </>
      )}
      {differs && (
        <>
          <label htmlFor="qe-reason">
            <T s={'Why this price (read by the Super Admin)'} />
          </label>
          <textarea id="qe-reason" rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </>
      )}
      <button type="button" className="btn sm" onClick={save} disabled={busy}>
        {busy ? 'Saving...' : 'Save draft quotation'}
      </button>
      {msg && (
        <p className={msg.ok ? 'sob-note-box' : 'sob-note-box warn'} role={msg.ok ? 'status' : 'alert'}>
          <span>{msg.text}</span>
        </p>
      )}
    </div>
  );
}
