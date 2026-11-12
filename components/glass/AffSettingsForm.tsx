'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { COMMISSION_KINDS, KIND_LABEL, type Settings } from '@/lib/affiliates/rules';

export type Section = 'program' | 'registration' | 'commission' | 'tracking' | 'badges' | 'notifications' | 'fraud' | 'products';

/*
 * Admin › Affiliate Management settings (owner, 2026-11-12). Each section edits its part of one setting ('affiliates:settings') and saves the
 * whole of it through POST /api/admin/affiliates (Super Admin, audited). Changes apply at once, without a redeploy; commissions already made
 * keep the rate they recorded.
 */
export function AffSettingsForm({ initial, section }: { initial: Settings; section: Section }) {
  const router = useRouter();
  const [s, setS] = useState<Settings>(initial);
  const [msg, setMsg] = useState('');
  const set = (patch: Partial<Settings>) => setS({ ...s, ...patch });
  const dollars = (c: number) => String(c / 100);
  const toCents = (v: string) => Math.round(Number(v || 0) * 100);
  const num = (label: string, value: number, onChange: (n: number) => void, suffix = '') => (
    <div className="field">
      <label>
        {label}
        {suffix && <span className="tag"> ({suffix})</span>}
        <input className="input" inputMode="decimal" value={String(value)} onChange={(e) => onChange(Number(e.target.value.replace(/[^\d.]/g, '') || 0))} />
      </label>
    </div>
  );
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 10 } as const;
  const check = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          section === 'program' &&
          initial.enabled &&
          !s.enabled &&
          !window.confirm('Turn the affiliate program off? New registrations and referral tracking stop; earned commissions and withdrawals stay.')
        )
          return;
        const r = await fetch('/api/admin/affiliates', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'settings', settings: s }) }).catch(
          () => null,
        );
        const j = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
        setMsg(r?.ok ? 'Saved. It applies now.' : j?.error || 'Could not save.');
        if (r?.ok) router.refresh();
      }}
    >
      {section === 'program' && (
        <>
          {check('The affiliate program is on (public page, registration, link tracking)', s.enabled, (v) => set({ enabled: v }))}
          {check('Show the public monthly leaderboard (top 5)', s.leaderboardPublic, (v) => set({ leaderboardPublic: v }))}
          <div className="field">
            <label htmlFor="aff-intro">Words under the public page heading</label>
            <textarea id="aff-intro" className="input" rows={2} maxLength={600} value={s.intro} onChange={(e) => set({ intro: e.target.value })} />
          </div>
          <fieldset style={{ border: '1px solid #DCE7EC', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <legend className="tag">Benefits shown on the public page</legend>
            {s.benefits.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input aria-label="Shown" type="checkbox" checked={b.on} onChange={(e) => set({ benefits: s.benefits.map((x, n) => (n === i ? { ...x, on: e.target.checked } : x)) })} />
                <input
                  aria-label={`Benefit ${i + 1}`}
                  className="input"
                  value={b.text}
                  maxLength={120}
                  onChange={(e) => set({ benefits: s.benefits.map((x, n) => (n === i ? { ...x, text: e.target.value } : x)) })}
                />
                <button type="button" className="btn sm ghost" onClick={() => set({ benefits: s.benefits.filter((_, n) => n !== i) })}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => set({ benefits: [...s.benefits, { text: '', on: true }] })}>
              + Add benefit
            </button>
          </fieldset>
          <div style={grid}>
            <div className="field">
              <label htmlFor="aff-tv">Terms version</label>
              <input id="aff-tv" className="input" maxLength={40} value={s.termsVersion} onChange={(e) => set({ termsVersion: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="aff-terms">Affiliate terms (new affiliates accept the version above)</label>
            <textarea id="aff-terms" className="input" rows={6} maxLength={6000} value={s.terms} onChange={(e) => set({ terms: e.target.value })} />
          </div>
          <fieldset style={{ border: '1px solid #DCE7EC', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <legend className="tag">Questions on the public page (empty: the standard ones)</legend>
            {s.faq.map((x, i) => (
              <div key={i} style={{ display: 'grid', gap: 6 }}>
                <input
                  aria-label={`Question ${i + 1}`}
                  className="input"
                  value={x.q}
                  maxLength={200}
                  onChange={(e) => set({ faq: s.faq.map((y, n) => (n === i ? { ...y, q: e.target.value } : y)) })}
                />
                <textarea
                  aria-label={`Answer ${i + 1}`}
                  className="input"
                  rows={2}
                  value={x.a}
                  maxLength={1200}
                  onChange={(e) => set({ faq: s.faq.map((y, n) => (n === i ? { ...y, a: e.target.value } : y)) })}
                />
                <button type="button" className="btn sm ghost" style={{ justifySelf: 'start' }} onClick={() => set({ faq: s.faq.filter((_, n) => n !== i) })}>
                  Remove question
                </button>
              </div>
            ))}
            <button type="button" className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => set({ faq: [...s.faq, { q: '', a: '' }] })}>
              + Add question
            </button>
          </fieldset>
        </>
      )}

      {section === 'registration' && (
        <div style={grid}>
          {num('Standard registration fee (USD)', Number(dollars(s.feeCents)), (n) => set({ feeCents: toCents(String(n)) }))}
          {num('Promotion fee (USD, 0 = waived)', Number(dollars(s.promoFeeCents)), (n) => set({ promoFeeCents: toCents(String(n)) }))}
          {num('Qualification period', s.qualificationDays, (n) => set({ qualificationDays: n }), 'days')}
          {num('Qualification target', s.targetSales, (n) => set({ targetSales: n }), 'verified sales')}
          {check('The promotion is running (new affiliates pay the promotion fee)', s.promoActive, (v) => set({ promoActive: v }))}
          {check('Waive the fee for good when an affiliate qualifies', s.waiveFeeOnQualify, (v) => set({ waiveFeeOnQualify: v }))}
        </div>
      )}

      {section === 'commission' && (
        <>
          <div className="tbl" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Sale type</th>
                  <th>Earns</th>
                  <th>Rate (%)</th>
                </tr>
              </thead>
              <tbody>
                {COMMISSION_KINDS.map((k) => (
                  <tr key={k}>
                    <td>{KIND_LABEL[k]}</td>
                    <td>
                      <input aria-label={`${KIND_LABEL[k]} earns`} type="checkbox" checked={s.kindsEnabled[k]} onChange={(e) => set({ kindsEnabled: { ...s.kindsEnabled, [k]: e.target.checked } })} />
                    </td>
                    <td>
                      <input
                        aria-label={`${KIND_LABEL[k]} rate`}
                        className="input"
                        inputMode="decimal"
                        value={String(s.rates[k] / 100)}
                        onChange={(e) => set({ rates: { ...s.rates, [k]: Math.round(Number(e.target.value.replace(/[^\d.]/g, '') || 0) * 100) } })}
                        style={{ width: 90 }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={grid}>
            {num('Approve commissions after', s.holdDays, (n) => set({ holdDays: n }), 'days after acceptance')}
            {num('Minimum withdrawal (USD)', Number(dollars(s.minWithdrawalCents)), (n) => set({ minWithdrawalCents: toCents(String(n)) }))}
          </div>
          <div className="tag" style={{ margin: 0 }}>
            A new rate applies to commissions made from now on; every commission keeps the rate it was made with. Nothing is ever paid for recruiting affiliates.
          </div>
        </>
      )}

      {section === 'products' && (
        <>
          <div className="field">
            <label htmlFor="aff-mode">Which websites earn commission</label>
            <select id="aff-mode" className="input" value={s.eligible.mode} onChange={(e) => set({ eligible: { ...s.eligible, mode: e.target.value === 'list' ? 'list' : 'all' } })}>
              <option value="all">Every website, except the ones below</option>
              <option value="list">Only the websites listed below</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="aff-inc">Included websites (addresses, comma separated)</label>
            <textarea
              id="aff-inc"
              className="input"
              rows={2}
              value={s.eligible.include.join(', ')}
              onChange={(e) =>
                set({
                  eligible: {
                    ...s.eligible,
                    include: e.target.value
                      .split(/[\s,]+/)
                      .map((x) => x.trim().toLowerCase())
                      .filter(Boolean),
                  },
                })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="aff-exc">Excluded websites</label>
            <textarea
              id="aff-exc"
              className="input"
              rows={2}
              value={s.eligible.exclude.join(', ')}
              onChange={(e) =>
                set({
                  eligible: {
                    ...s.eligible,
                    exclude: e.target.value
                      .split(/[\s,]+/)
                      .map((x) => x.trim().toLowerCase())
                      .filter(Boolean),
                  },
                })
              }
            />
          </div>
        </>
      )}

      {section === 'tracking' && <div style={grid}>{num('Referral cookie', s.cookieDays, (n) => set({ cookieDays: n }), 'days')}</div>}

      {section === 'badges' && (
        <>
          {s.badges.map((b, i) => {
            const up = (patch: Partial<Settings['badges'][number]>) => set({ badges: s.badges.map((x, n) => (n === i ? { ...x, ...patch } : x)) });
            return (
              <fieldset key={i} style={{ border: '1px solid #DCE7EC', borderRadius: 14, padding: 12, display: 'grid', gap: 8 }}>
                <legend className="tag">
                  <span className="status" style={{ background: b.color, color: '#fff' }}>
                    {b.icon} {b.name}
                  </span>
                </legend>
                <div style={grid}>
                  <div className="field">
                    <label>
                      Name
                      <input className="input" value={b.name} maxLength={60} onChange={(e) => up({ name: e.target.value })} />
                    </label>
                  </div>
                  <div className="field">
                    <label>
                      Icon
                      <input className="input" value={b.icon} maxLength={4} onChange={(e) => up({ icon: e.target.value })} />
                    </label>
                  </div>
                  <div className="field">
                    <label>
                      Colour
                      <input className="input" type="color" value={b.color} onChange={(e) => up({ color: e.target.value })} />
                    </label>
                  </div>
                  <div className="field">
                    <label>
                      Kind
                      <select className="input" value={b.kind} onChange={(e) => up({ kind: e.target.value as Settings['badges'][number]['kind'] })}>
                        <option value="verified">Verified affiliate</option>
                        <option value="sales">Verified sales milestone</option>
                        <option value="champion">Monthly champion</option>
                      </select>
                    </label>
                  </div>
                  {b.kind === 'sales' && num('Verified sales needed', b.threshold, (n) => up({ threshold: n }))}
                  <div className="field">
                    <label>
                      Reward (optional)
                      <input className="input" value={b.reward} maxLength={120} onChange={(e) => up({ reward: e.target.value })} />
                    </label>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {check('On', b.enabled, (v) => up({ enabled: v }))}
                  <button type="button" className="btn sm ghost" onClick={() => set({ badges: s.badges.filter((_, n) => n !== i) })}>
                    Remove
                  </button>
                </div>
              </fieldset>
            );
          })}
          <button
            type="button"
            className="btn sm ghost"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => set({ badges: [...s.badges, { key: `badge-${Date.now()}`, name: 'New milestone', icon: '★', color: '#5FA88F', kind: 'sales', threshold: 200, reward: '', enabled: true }] })}
          >
            + Add badge
          </button>
        </>
      )}

      {section === 'notifications' && (
        <>
          {check('Tell an affiliate when they qualify', s.notify.qualified, (v) => set({ notify: { ...s.notify, qualified: v } }))}
          {check('Tell an affiliate when a commission is approved', s.notify.commissionApproved, (v) => set({ notify: { ...s.notify, commissionApproved: v } }))}
          {check('Tell an affiliate when a withdrawal is decided or paid', s.notify.withdrawalDecided, (v) => set({ notify: { ...s.notify, withdrawalDecided: v } }))}
        </>
      )}

      {section === 'fraud' && (
        <div style={grid}>
          {check('Block self-referrals (an affiliate buying through their own link)', s.fraud.blockSelfReferral, (v) => set({ fraud: { ...s.fraud, blockSelfReferral: v } }))}
          {num('Most clicks counted per visitor per day', s.fraud.maxClicksPerVisitorPerDay, (n) => set({ fraud: { ...s.fraud, maxClicksPerVisitorPerDay: n } }))}
          {num('Extra hold for new affiliates', s.fraud.holdNewAffiliateDays, (n) => set({ fraud: { ...s.fraud, holdNewAffiliateDays: n } }), 'days')}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn sm" type="submit">
          Save
        </button>
        {msg && (
          <span role="status" className="tag" style={{ margin: 0 }}>
            {msg}
          </span>
        )}
      </div>
    </form>
  );
}
