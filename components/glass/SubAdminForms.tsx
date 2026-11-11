'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Benefit, Plan } from '@/lib/buyerSubs/rules';

/* Admin › Buyer subscriptions (owner, 2026-11-12): the plan editor and the feature settings. Everything goes to POST /api/admin/subscriptions. */
async function post(body: Record<string, unknown>) {
  const r = await fetch('/api/admin/buyer-subscriptions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const j = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
  return { ok: !!r?.ok, error: j?.error ?? (r ? '' : 'No connection.') };
}
const FEATURES: [string, string][] = [
  ['source_code', 'Full source code'],
  ['support', 'Technical support'],
  ['bug_fixes', 'Free bug fixes'],
  ['updates', 'Updates'],
  ['priority_support', 'Priority support'],
  ['setup_help', 'Setup help'],
];
const csv = (v: string) =>
  v
    .split(/[\s,]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

export function PlanEditor({ plan, categories, onDone }: { plan: Plan | null; categories: { slug: string; name: string }[]; onDone?: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({
    key: plan?.key ?? '',
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    badge: plan?.badge ?? '',
    color: plan?.color ?? '#5FA88F',
    sort: String(plan?.sort ?? 0),
    price: plan ? String(plan.priceCents / 100) : '',
    renewal: plan ? String(plan.renewalCents / 100) : '',
    period: plan?.period ?? 'year',
    periodDays: String(plan?.periodDays ?? 365),
    limit: String(plan?.websiteLimit ?? 3),
    support: String(plan?.supportDays ?? 365),
    licence: plan?.licenceVersion ?? 'sub-2026-11',
    refund: plan?.refundPolicy ?? '',
    active: plan?.active ?? true,
    visible: plan?.visible ?? true,
    mode: plan?.eligibility.mode ?? 'all',
    cats: plan?.eligibility.categories ?? [],
    include: (plan?.eligibility.include ?? []).join(', '),
    exclude: (plan?.eligibility.exclude ?? []).join(', '),
  });
  const [benefits, setBenefits] = useState<Benefit[]>(plan?.benefits ?? [{ text: 'Full source code', on: true }]);
  const [features, setFeatures] = useState<Record<string, boolean>>(plan?.features ?? { source_code: true, support: true, bug_fixes: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });
  const id = plan?.id ?? 'new';
  const field = (k: keyof typeof f, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label htmlFor={`${id}-${k}`}>{label}</label>
      <input id={`${id}-${k}`} className="input" value={String(f[k])} onChange={set(k)} {...props} />
    </div>
  );
  return (
    <form
      className="sob-form"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg('');
        const r = await post({
          action: 'savePlan',
          id: plan?.id ?? null,
          plan: {
            key: f.key,
            name: f.name,
            description: f.description,
            badge: f.badge,
            color: f.color,
            sort: Number(f.sort),
            priceCents: Math.round(Number(f.price) * 100),
            renewalCents: Math.round(Number(f.renewal) * 100),
            period: f.period,
            periodDays: Number(f.periodDays),
            websiteLimit: Number(f.limit),
            supportDays: Number(f.support),
            licenceVersion: f.licence,
            refundPolicy: f.refund,
            active: f.active,
            visible: f.visible,
            benefits,
            features,
            eligibility: { mode: f.mode, categories: f.cats, include: csv(f.include), exclude: csv(f.exclude) },
          },
        });
        setBusy(false);
        if (!r.ok) return setMsg(r.error || 'Could not save.');
        setMsg('Saved.');
        onDone?.();
        router.refresh();
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 10 }}>
        {field('name', 'Name', { required: true, maxLength: 60 })}
        {field('key', 'Key (address-safe)', { required: true, maxLength: 40, pattern: '[a-z0-9-]{2,40}' })}
        {field('badge', 'Badge (optional)', { maxLength: 30 })}
        {field('color', 'Colour', { type: 'color' })}
        {field('price', 'Price (USD)', { inputMode: 'decimal', required: true })}
        {field('renewal', 'Renewal price (USD)', { inputMode: 'decimal', required: true })}
        <div className="field">
          <label htmlFor={`${id}-period`}>Term</label>
          <select id={`${id}-period`} className="input" value={f.period} onChange={set('period')}>
            <option value="year">Yearly</option>
            <option value="month">Monthly</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        {f.period === 'custom' && field('periodDays', 'Days in the term', { type: 'number', min: 1, max: 3650 })}
        {field('limit', 'Websites included', { type: 'number', min: 0, max: 1000 })}
        {field('support', 'Support days', { type: 'number', min: 0, max: 3650 })}
        {field('sort', 'Display order', { type: 'number' })}
        {field('licence', 'Licence version', { maxLength: 40 })}
      </div>
      <div className="field">
        <label htmlFor={`${id}-description`}>Description</label>
        <textarea id={`${id}-description`} className="input" rows={2} maxLength={600} value={f.description} onChange={set('description')} />
      </div>
      <fieldset style={{ border: '1px solid #DCE7EC', borderRadius: 14, padding: 12 }}>
        <legend className="tag">Benefits shown on the card</legend>
        {benefits.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <input aria-label="Shown" type="checkbox" checked={b.on} onChange={(e) => setBenefits(benefits.map((x, n) => (n === i ? { ...x, on: e.target.checked } : x)))} />
            <input
              aria-label={`Benefit ${i + 1}`}
              className="input"
              value={b.text}
              maxLength={120}
              onChange={(e) => setBenefits(benefits.map((x, n) => (n === i ? { ...x, text: e.target.value } : x)))}
            />
            <button type="button" className="btn sm ghost" onClick={() => setBenefits(benefits.filter((_, n) => n !== i))} aria-label={`Remove benefit ${i + 1}`}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="btn sm ghost" onClick={() => setBenefits([...benefits, { text: '', on: true }])} disabled={benefits.length >= 20}>
          + Add benefit
        </button>
      </fieldset>
      <fieldset style={{ border: '1px solid #DCE7EC', borderRadius: 14, padding: 12, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        <legend className="tag">Features (comparison table)</legend>
        {FEATURES.map(([k, l]) => (
          <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
            <input type="checkbox" checked={!!features[k]} onChange={(e) => setFeatures({ ...features, [k]: e.target.checked })} /> {l}
          </label>
        ))}
      </fieldset>
      <fieldset style={{ border: '1px solid #DCE7EC', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <legend className="tag">Which websites can be chosen</legend>
        <select aria-label="Category rule" className="input" value={f.mode} onChange={set('mode')}>
          <option value="all">Every category except the ticked ones</option>
          <option value="list">Only the ticked categories</option>
        </select>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {categories.map((c) => (
            <label key={c.slug} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" checked={f.cats.includes(c.slug)} onChange={(e) => setF({ ...f, cats: e.target.checked ? [...f.cats, c.slug] : f.cats.filter((x) => x !== c.slug) })} /> {c.name}
            </label>
          ))}
        </div>
        <div className="field">
          <label htmlFor={`${id}-include`}>Always include these websites (addresses, comma separated)</label>
          <input id={`${id}-include`} className="input" value={f.include} onChange={set('include')} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-exclude`}>Never include these websites</label>
          <input id={`${id}-exclude`} className="input" value={f.exclude} onChange={set('exclude')} />
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor={`${id}-refund`}>Refund rules for this plan (shown to buyers)</label>
        <textarea id={`${id}-refund`} className="input" rows={2} maxLength={2000} value={f.refund} onChange={set('refund')} />
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={f.active} onChange={set('active')} /> Active (can be bought)
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={f.visible} onChange={set('visible')} /> Shown on the pricing page
        </label>
        <button className="btn sm" type="submit" disabled={busy}>
          {busy ? 'Saving…' : plan ? 'Save plan' : 'Create plan'}
        </button>
        {msg && (
          <span role="status" className="tag" style={{ margin: 0 }}>
            {msg}
          </span>
        )}
      </div>
      <div className="tag" style={{ margin: 0 }}>
        Changes apply to new subscriptions. A running subscription keeps the price, number of websites and terms it was bought with.
      </div>
    </form>
  );
}

export function SubSettingsForm({
  enabled,
  intro,
  faq,
  allowedMethods = [],
  methods = [],
}: {
  enabled: boolean;
  intro: string;
  faq: { q: string; a: string }[];
  allowedMethods?: string[];
  methods?: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [text, setText] = useState(intro);
  const [items, setItems] = useState(faq);
  const [allowed, setAllowed] = useState<string[]>(allowedMethods);
  const [msg, setMsg] = useState('');
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await post({ action: 'settings', enabled: on, intro: text, faq: items.filter((x) => x.q.trim() && x.a.trim()), allowedMethods: allowed });
        setMsg(r.ok ? 'Saved.' : r.error || 'Could not save.');
        if (r.ok) router.refresh();
      }}
    >
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}>
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Buyer subscriptions are open (the pricing page and checkout)
      </label>
      <div className="field">
        <label htmlFor="sub-intro">Words under the pricing page heading</label>
        <textarea id="sub-intro" className="input" rows={2} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {methods.length > 0 && (
        <fieldset style={{ border: '1px solid #DCE7EC', borderRadius: 14, padding: 12, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <legend className="tag">Payment methods subscriptions accept (none ticked: every active method)</legend>
          {methods.map((m) => (
            <label key={m.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" checked={allowed.includes(m.id)} onChange={(e) => setAllowed(e.target.checked ? [...allowed, m.id] : allowed.filter((x) => x !== m.id))} /> {m.label}
            </label>
          ))}
        </fieldset>
      )}
      <div className="tag" style={{ margin: 0 }}>
        Questions on the pricing page (empty: the standard ones)
      </div>
      {items.map((x, i) => (
        <div key={i} style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0,1fr)' }}>
          <input
            aria-label={`Question ${i + 1}`}
            className="input"
            value={x.q}
            maxLength={200}
            placeholder="Question"
            onChange={(e) => setItems(items.map((y, n) => (n === i ? { ...y, q: e.target.value } : y)))}
          />
          <textarea
            aria-label={`Answer ${i + 1}`}
            className="input"
            rows={2}
            value={x.a}
            maxLength={1200}
            placeholder="Answer"
            onChange={(e) => setItems(items.map((y, n) => (n === i ? { ...y, a: e.target.value } : y)))}
          />
          <button type="button" className="btn sm ghost" style={{ justifySelf: 'start' }} onClick={() => setItems(items.filter((_, n) => n !== i))}>
            Remove question
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn sm ghost" onClick={() => setItems([...items, { q: '', a: '' }])} disabled={items.length >= 20}>
          + Add question
        </button>
        <button className="btn sm" type="submit">
          Save settings
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
