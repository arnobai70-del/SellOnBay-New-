'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type ProductEditValues = {
  slug: string;
  platform: string;
  name: string;
  category: string;
  desc: string;
  includes: string;
  price: number;
  days: number;
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
}: {
  v: ProductEditValues;
  categories: string[];
  setupOptions: number[];
  customOptions: number[];
  periods: number[];
  licences: [value: string, label: string][];
  shots: string[];
  maxShots: number;
}) {
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
    if (!r.ok) return setMsg({ ok: false, text: j.error ?? 'Something went wrong.' });
    setMsg({ ok: true, text: ok });
    router.refresh();
  }
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const { platform: _platform, ...rest } = f;
    void _platform;
    return post(JSON.stringify(rest), true, 'Saved. The listing shows the change within a minute.');
  };
  const upload = (file: File | undefined) => {
    if (!file) return;
    const body = new FormData();
    body.append('slug', v.slug);
    body.append('file', file);
    return post(body, false, 'Picture added.');
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
      <form className="adm-form" onSubmit={save}>
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
        {field('pe-includes', 'What comes with it', <textarea id="pe-includes" rows={5} value={f.includes} onChange={(e) => set('includes', e.target.value)} />, 'One per line, up to 8.')}
        {dollars('price', 'Price in dollars', 'A whole number within the shop price range (Settings).')}
        {dollars('days', 'Delivery in days', '1 to 7.')}
        {text('express', 'Express delivery price in dollars', 'Empty = not offered. 10 to 20.', 4)}
        {field(
          'pe-setup',
          'Setup help price',
          <select id="pe-setup" value={f.setupPrice} onChange={(e) => set('setupPrice', Number(e.target.value))}>
            {setupOptions.map((c) => (
              <option key={c} value={c}>
                {c === 0 ? 'Not offered' : `$${c}`}
              </option>
            ))}
          </select>,
        )}
        {field(
          'pe-custom',
          'Customisation price',
          <select id="pe-custom" value={f.customPrice} onChange={(e) => set('customPrice', Number(e.target.value))}>
            {customOptions.map((c) => (
              <option key={c} value={c}>
                {c === 0 ? 'Not offered' : `$${c}`}
              </option>
            ))}
          </select>,
        )}
        {text('codeUrl', 'Files link (https, private)', "The seller's private link to the code or files. Buyers get it only after paying. It cannot change once a buyer has paid.", 1000)}
        {field(
          'pe-licence',
          'What the buyer may do with it',
          <select id="pe-licence" value={f.licenceType} onChange={(e) => set('licenceType', e.target.value)}>
            {licences.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>,
        )}
        {text('demo', 'Demo link (https)', isApp && !dig ? 'Not used for apps.' : 'The live demo buyers look at.', 500)}
        {dig && (
          <>
            {text('sample', 'Free sample link (https)', undefined, 1000)}
            {text('docsUrl', 'Documentation link (https)', undefined, 500)}
            {field('pe-req', 'What it needs', <textarea id="pe-req" rows={3} value={f.requirements} maxLength={600} onChange={(e) => set('requirements', e.target.value)} />)}
            {field(
              'pe-support',
              'Support lasts (days)',
              <select id="pe-support" value={f.supportDays} onChange={(e) => set('supportDays', Number(e.target.value))}>
                {periods.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>,
            )}
            {field(
              'pe-update',
              'Updates last (days)',
              <select id="pe-update" value={f.updateDays} onChange={(e) => set('updateDays', Number(e.target.value))}>
                {periods.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>,
            )}
          </>
        )}
        <div className="adm-btns">
          <button className="btn btn-dark btn-sm" type="submit" disabled={busy}>
            {busy ? 'One moment...' : 'Save the listing'}
          </button>
        </div>
      </form>

      <h3>Pictures</h3>
      {
        <div className="adm-form">
          <small>
            {isApp ? 'App screenshots' : 'Site pictures'} ({shots.length} of {maxShots}). PNG, JPEG or WebP up to 4 MB.{!isApp && ' The first one is the cover on the list.'}
          </small>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {shots.map((n) => (
              <div key={n} style={{ width: 120 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/demo/${v.slug}/${n}`} alt="" style={{ width: '100%', borderRadius: 8 }} loading="lazy" />
                <button className="btn btn-line btn-sm" type="button" disabled={busy} onClick={() => post(JSON.stringify({ slug: v.slug, removeShot: n }), true, 'Picture removed.')}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          {shots.length < maxShots && (
            <div className="field">
              <label htmlFor="pe-shot">Add a screenshot</label>
              <input id="pe-shot" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
            </div>
          )}
        </div>
      }
      {msg && (
        <p className={msg.ok ? 'ok' : 'err'} role="status">
          {msg.text}
        </p>
      )}
    </>
  );
}
