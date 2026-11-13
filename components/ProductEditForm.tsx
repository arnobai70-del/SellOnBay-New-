'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
export type ProductEditValues = {
  slug: string;
  platform: string;
  name: string;
  category: string;
  desc: string;
  includes: string;
  price: number;
  days: number;
  hours?: string; // '' = in days; missing = the database has no hours yet (migration 0054)
  demo: string;
  sample: string;
  docsUrl: string;
  requirements: string;
  express: string;
  setupPrice: number;
  customPrice: number;
  supportDays: number;
  updateDays: number;
  codeUrl: string;
  licenceType: string;
};

/* An admin changes a seller's listing: words, category, price, delivery, links and extras, and an app's screenshots. The server checks every limit again. */
export function ProductEditForm({
  v,
  categories,
  setupOptions,
  customOptions,
  periods,
  licences,
  shots,
  maxShots,
  maxHours,
}: {
  v: ProductEditValues;
  categories: string[];
  setupOptions: number[];
  customOptions: number[];
  periods: number[];
  licences: [value: string, label: string][];
  shots: string[];
  maxShots: number;
  maxHours: number;
}) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [f, setF] = useState(v);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof ProductEditValues>(k: K, x: ProductEditValues[K]) => setF((p) => ({ ...p, [k]: x }));
  const dig = v.platform === 'digital';
  const isApp = v.platform !== 'web';

  async function post(body: BodyInit, json: boolean, ok: string) {
    setBusy(true);
    setMsg(null);
    const r = await fetch('/api/admin/seo/product', { method: 'POST', ...(json ? { headers: { 'content-type': 'application/json' } } : {}), body });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? tx('Something went wrong.') });
    setMsg({ ok: true, text: ok });
    router.refresh();
  }
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const { platform: _platform, ...rest } = f;
    void _platform;
    return post(JSON.stringify(rest), true, tx('Saved. The listing shows the change within a minute.'));
  };
  const upload = (file: File | undefined) => {
    if (!file) return;
    const body = new FormData();
    body.append('slug', v.slug);
    body.append('file', file);
    return post(body, false, tx('Picture added.'));
  };
  const field = (id: string, label: string, el: React.ReactNode, hint?: string) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {el}
      {hint && <small>{hint}</small>}
    </div>
  );
  const text = (k: keyof ProductEditValues, label: string, hint?: string, max = 300) =>
    field(`pe-${k}`, label, <input id={`pe-${k}`} value={String(f[k])} maxLength={max} onChange={(e) => set(k, e.target.value as never)} />, hint);
  const dollars = (k: 'price' | 'days' | 'supportDays' | 'updateDays', label: string, hint?: string) =>
    field(`pe-${k}`, label, <input id={`pe-${k}`} type="number" min={0} step={1} value={f[k]} onChange={(e) => set(k, Number(e.target.value))} />, hint);

  return (
    <>
      <form className="sob-form" onSubmit={save}>
        {text('name', 'Name', '3 to 60 characters.', 60)}
        {field(
          'pe-category',
          'Category',
          <select id="pe-category" value={f.category} onChange={(e) => set('category', e.target.value)}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>,
        )}
        {field(
          'pe-desc',
          'Description',
          <textarea id="pe-desc" rows={5} value={f.desc} maxLength={600} onChange={(e) => set('desc', e.target.value)} />,
          `20 to 600 characters. ${f.desc.length} / 600`,
        )}
        {field('pe-includes', tx('What comes with it'), <textarea id="pe-includes" rows={5} value={f.includes} onChange={(e) => set('includes', e.target.value)} />, tx('One per line, up to 8.'))}
        {dollars('price', tx('Price in dollars'), tx('A whole number within the shop price range (Settings).'))}
        {dollars('days', tx('Delivery in days'), f.hours ? tx('Not used while hours are set.') : '1 to 7.')}
        {f.hours !== undefined &&
          field(
            'pe-hours',
            tx('Delivery in hours'),
            <input id="pe-hours" type="number" min={1} max={maxHours} step={1} value={f.hours} placeholder={tx('In days')} onChange={(e) => set('hours', e.target.value)} />,
            tx('Empty = the days above. 1 to {maxHours}; any number, not only the choices sellers get.', { maxHours }),
          )}
        {text('express', tx('Express delivery price in dollars'), 'Empty = not offered. 10 to 20.', 4)}
        {field(
          'pe-setup',
          tx('Setup help price'),
          <select id="pe-setup" value={f.setupPrice} onChange={(e) => set('setupPrice', Number(e.target.value))}>
            {setupOptions.map((c) => (
              <option key={c} value={c}>
                {c === 0 ? tx('Not offered') : `$${c}`}
              </option>
            ))}
          </select>,
        )}
        {field(
          'pe-custom',
          tx('Customisation price'),
          <select id="pe-custom" value={f.customPrice} onChange={(e) => set('customPrice', Number(e.target.value))}>
            {customOptions.map((c) => (
              <option key={c} value={c}>
                {c === 0 ? tx('Not offered') : `$${c}`}
              </option>
            ))}
          </select>,
        )}
        {text('codeUrl', tx('Files link (https, private)'), tx("The seller's private link to the code or files. Buyers get it only after paying. It cannot change once a buyer has paid."), 1000)}
        {field(
          'pe-licence',
          tx('What the buyer may do with it'),
          <select id="pe-licence" value={f.licenceType} onChange={(e) => set('licenceType', e.target.value)}>
            {licences.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>,
        )}
        {text('demo', tx('Demo link (https)'), isApp && !dig ? tx('Not used for apps.') : tx('The live demo buyers look at.'), 500)}
        {dig && (
          <>
            {text('sample', tx('Free sample link (https)'), undefined, 1000)}
            {text('docsUrl', tx('Documentation link (https)'), undefined, 500)}
            {field('pe-req', tx('What it needs'), <textarea id="pe-req" rows={3} value={f.requirements} maxLength={600} onChange={(e) => set('requirements', e.target.value)} />)}
            {field(
              'pe-support',
              tx('Support lasts (days)'),
              <select id="pe-support" value={f.supportDays} onChange={(e) => set('supportDays', Number(e.target.value))}>
                {periods.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>,
            )}
            {field(
              'pe-update',
              tx('Updates last (days)'),
              <select id="pe-update" value={f.updateDays} onChange={(e) => set('updateDays', Number(e.target.value))}>
                {periods.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>,
            )}
          </>
        )}
        <div className="sob-acts">
          <button className="btn sm" type="submit" disabled={busy}>
            {busy ? tx('One moment...') : tx('Save the listing')}
          </button>
        </div>
      </form>

      <h3>
        <T s={'Pictures'} />
      </h3>
      {
        <div className="sob-form">
          <small>
            <T
              s={'{v0} ({length} of {maxShots}). PNG, JPEG or WebP up to 4 MB.{v3}'}
              v={{ v0: isApp ? tx('App screenshots') : tx('Site pictures'), length: shots.length, maxShots, v3: !isApp && ' The first one is the cover on the list.' }}
            />
          </small>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {shots.map((n) => (
              <div key={n} style={{ width: 120 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/demo/${v.slug}/${n}`} alt="" style={{ width: '100%', borderRadius: 8 }} loading="lazy" />
                <button className="btn ghost sm" type="button" disabled={busy} onClick={() => post(JSON.stringify({ slug: v.slug, removeShot: n }), true, tx('Picture removed.'))}>
                  <T s={'Remove'} />
                </button>
              </div>
            ))}
          </div>
          {shots.length < maxShots && (
            <div className="field">
              <label htmlFor="pe-shot">
                <T s={'Add a screenshot'} />
              </label>
              <input id="pe-shot" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
            </div>
          )}
        </div>
      }
      {msg && (
        <p className={msg.ok ? 'ok' : 'sob-err'} role="status">
          {msg.text}
        </p>
      )}
    </>
  );
}
