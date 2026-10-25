'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { money } from '@/lib/data';
import { WEB_CATS, webCatLabel } from '@/lib/webCategories';
import { NEEDS_DEMO, NEEDS_RELEASE, catsFor, toolsFor } from '@/lib/apps';
import { missingForReview, reviewMessage } from '@/lib/listingRules';
import { BRAND_NAME } from '@/lib/brand';
import { FEE_SALE_TEXT, feeCents, sellerNetCents } from '@/lib/config';
import { LICENCES, LICENCE_TYPES, THIRD_PARTY_LICENCES, isLicenceType } from '@/lib/licences';
import { CONFIG } from '@/lib/config';

const MAX_ZIP = 25 * 1024 * 1024;
const MAX_SHOT = 4 * 1024 * 1024;
type Kind = 'web' | 'android' | 'ios' | 'webapp' | 'desktop' | 'digital';
const DEFAULT_STACK: Record<Kind, string> = { web: 'Other', android: 'Kotlin', ios: 'SwiftUI', webapp: 'Next.js', desktop: 'Electron', digital: 'Figma' };

type Done = { slug: string; hosted: boolean; files: number; edited?: boolean; status?: string } | null;
/* What the seller sees on the check step: the listing in the same fixed order every buyer sees, built from the form. */
type Check = {
  name: string;
  category: string;
  stack: string;
  desc: string;
  includes: string[];
  days: string;
  setup: number;
  custom: number;
  express: number;
  licence: string;
  support: number;
  updates: number;
  requirements: string;
  demo: string;
  docs: string;
  files: string;
};

export function SellForm({
  live,
  trialEnabled = false,
  sampleEnabled = true,
  minPrice = 5,
  maxPrice = 70,
}: {
  live: boolean;
  trialEnabled?: boolean;
  sampleEnabled?: boolean;
  minPrice?: number;
  maxPrice?: number;
}) {
  const [price, setPrice] = useState(Math.min(maxPrice, Math.max(minPrice, 39)));
  // Setup help and customisation are added to the price, and the total stays under the highest price. The choices that no longer fit go away.
  const [setupP, setSetupP] = useState(String(CONFIG.packages.defaultSetupCents / 100));
  const [customP, setCustomP] = useState(String(CONFIG.packages.defaultCustomCents / 100));
  const room = (list: readonly number[]) => list.filter((c) => c === 0 || price * 100 + c <= maxPrice * 100);
  const keep = (v: string, list: readonly number[]) => (room(list).includes(Number(v) * 100) ? v : String(Math.max(...room(list)) / 100));
  const setupShown = keep(setupP, CONFIG.packages.setupCents);
  const customShown = keep(customP, CONFIG.packages.customCents);
  const [how, setHow] = useState<'zip' | 'link'>('zip');
  const [kind, setKind] = useState<Kind>('web');
  const [shots, setShots] = useState<File[]>([]);
  const previews = useMemo(() => shots.map((f) => URL.createObjectURL(f)), [shots]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const app = kind !== 'web';
  const dig = kind === 'digital';
  const [cat, setCat] = useState('');
  const [demoN, setDemoN] = useState('');
  const [descN, setDescN] = useState(0);
  const [incN, setIncN] = useState(0);
  const needDemo = dig && NEEDS_DEMO.includes(cat || 'Figma kits');
  // A friendly checklist, not a gate: it shows what makes buyers say yes.
  const checks: [string, boolean][] = dig
    ? [
        ['3 or more pictures', shots.length >= 3],
        ['A demo or view-only link', /^https:\/\//.test(demoN)],
        ['A clear description', descN >= 80],
        ['4 or more things listed as included', incN >= 4],
      ]
    : [];
  const strength = checks.filter(([, v]) => v).length;
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [draftSlug, setDraftSlug] = useState('');
  // Editing a listing that was already sent (?edit=): its saved files are kept unless new ones are chosen.
  const [editSlug, setEditSlug] = useState('');
  const [kept, setKept] = useState({ zip: false, shots: 0 });
  const [check, setCheck] = useState<Check | null>(null);
  const prefill = useRef<Record<string, string | number> | null>(null);
  const [done, setDone] = useState<Done>(null);
  const form = useRef<HTMLFormElement>(null);
  const fee = feeCents(price * 100, 'sale') / 100;
  const you = sellerNetCents(price * 100, 'sale') / 100;

  // The picture picker, shared by apps and digital products (needed) and websites (optional).
  const shotsBox = (hint: string, choose: React.ReactNode) => (
    <>
      <div className="drop">
        <input
          id="s-shots"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={(e) => {
            const list = [...(e.target.files ?? [])];
            const bad = list.find((f) => !/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > MAX_SHOT);
            if (bad) {
              setError(`${bad.name}: use a PNG, JPG or WebP picture under 4 MB.`);
              return;
            }
            setError('');
            setShots(list.slice(0, 6));
          }}
        />
        <label htmlFor="s-shots">
          {shots.length ? (
            <>
              <b>
                {shots.length} picture{shots.length === 1 ? '' : 's'}
              </b>{' '}
              chosen. Click to change.
            </>
          ) : (
            choose
          )}
        </label>
        <small>PNG, JPG or WebP, up to 4 MB each. {hint}</small>
      </div>
      {shots.length > 0 && (
        <div className="shot-prev">
          {shots.map((f, i) => (
            <span key={f.name + f.size} style={{ backgroundImage: `url(${previews[i]})` }} />
          ))}
        </div>
      )}
    </>
  );

  const pick = (f: File | null) => {
    setError('');
    if (f && !/\.zip$/i.test(f.name)) {
      setFile(null);
      return setError('Choose a .zip file of your site.');
    }
    if (f && f.size > MAX_ZIP) {
      setFile(null);
      return setError('That zip is larger than 25 MB.');
    }
    setFile(f);
  };

  // Opening /sell/new?draft=... fills the form from that draft; /sell/new?edit=... from a listing already sent.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const isEdit = q.has('edit');
    const slug = q.get(isEdit ? 'edit' : 'draft');
    if (!slug || !live) return;
    fetch(`/api/listings?${isEdit ? 'edit' : 'draft'}=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return setError(isEdit ? 'That listing could not be opened.' : '');
        prefill.current = d;
        if (isEdit) {
          setEditSlug(slug);
          setKept({ zip: !!d.keptZip, shots: Number(d.keptShots) || 0 });
          if (d.keptZip) setHow('zip');
          else if (d.platform === 'web') setHow('link');
          setNote(
            'Editing your listing. Changes to the text, prices and options are saved at once. If you change a link or a file, it goes back to review and buyers cannot buy it until it is approved again. Leave the files empty to keep the ones you sent.',
          );
        } else {
          setDraftSlug(slug);
          setNote('Draft opened. Add your files again before you submit.');
        }
        setKind(d.platform as Kind);
        setPrice(Math.min(maxPrice, Math.max(minPrice, Number(d.price) || 39)));
      })
      .catch(() => {});
  }, [live]);
  useEffect(() => {
    const d = prefill.current;
    const f = form.current;
    if (!d || !f) return;
    const set = (name: string, v: unknown) => {
      const el = f.elements.namedItem(name) as HTMLInputElement | null;
      if (el && v !== undefined && v !== null && v !== '') el.value = String(v);
    };
    // the category and tool lists belong to the kind, so they are filled after it renders
    const t = setTimeout(() => {
      set('name', d.name);
      set('category', d.platform === 'web' ? webCatLabel(String(d.category)) : d.category);
      set('desc', d.desc);
      set('inc', d.includes);
      set('stack', d.stack);
      set('code', d.code);
      set('demo', d.demo);
      set('sample', d.sample);
      set('licenceType', d.licenceType);
      set('third', d.third);
      set('delivery', d.delivery);
      set('express', d.express);
      set('docsUrl', d.docsUrl);
      set('requirements', d.requirements);
      set('supportDays', d.supportDays);
      set('updateDays', d.updateDays);
      set('license', d.license);
      set('days', d.days);
      if (d.demo) setDemoN(String(d.demo));
      if (d.category) setCat(String(d.category));
      if (d.setupPrice !== undefined && d.setupPrice !== '') setSetupP(String(d.setupPrice));
      if (d.customPrice !== undefined && d.customPrice !== '') setCustomP(String(d.customPrice));
      prefill.current = null;
    }, 60);
    return () => clearTimeout(t);
  }, [kind]);

  // What is still missing, worked out from the form as it is now.
  const checkMissing = () => {
    const fd = new FormData(form.current!);
    const str = (k: string) => String(fd.get(k) ?? '');
    return missingForReview({
      kind,
      name: str('name'),
      category: str('category'),
      desc: str('desc'),
      includes: str('inc').split('\n'),
      demoLink: str('demo'),
      hasZip: !app && how === 'zip' && (!!file || kept.zip),
      shots: app ? shots.length || kept.shots : 0,
      codeUrl: str('code'),
      clean: str('clean') === 'on',
      release: str('release') === 'on',
      requirements: str('requirements'),
      docsUrl: str('docsUrl'),
    });
  };

  // The check step: the listing laid out the way buyers will see it, before anything is sent.
  const openCheck = () => {
    setError('');
    setMissing([]);
    const m = checkMissing();
    if (m.length) return setMissing(m);
    const fd = new FormData(form.current!);
    const str = (k: string) => String(fd.get(k) ?? '').trim();
    const lt = str('licenceType');
    setCheck({
      name: str('name'),
      category: str('category'),
      stack: app ? str('stack') : '',
      desc: str('desc'),
      includes: str('inc')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      days: str('days'),
      setup: Number(setupShown) || 0,
      custom: Number(customShown) || 0,
      express: Number(str('express')) || 0,
      licence: isLicenceType(lt) ? LICENCES[lt].label : lt,
      support: Number(str('supportDays')) || 0,
      updates: Number(str('updateDays')) || 0,
      requirements: str('requirements'),
      demo: app ? (dig ? str('demo') : '') : how === 'link' ? str('demo') : '',
      docs: str('docsUrl'),
      files: [
        app ? '' : how === 'zip' ? (file ? `${file.name} (hosted by us)` : 'The site files you sent before') : 'Your live demo link',
        shots.length ? `${shots.length} new picture${shots.length === 1 ? '' : 's'}` : kept.shots ? `${kept.shots} picture${kept.shots === 1 ? '' : 's'} you sent before` : '',
      ]
        .filter(Boolean)
        .join(', '),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const go = (intent: 'review' | 'draft') => {
    setError('');
    setNote('');
    setMissing([]);
    if (intent === 'review') {
      const m = checkMissing();
      if (m.length) {
        setCheck(null);
        setMissing(m);
        return;
      }
    } else if (String(new FormData(form.current!).get('name') ?? '').trim().length < 3) return setError('Give your draft a name of 3 to 60 characters so you can find it later.');
    if (!live) {
      if (intent === 'draft') return setNote('Draft saved (demo mode keeps nothing).');
      setDone({ slug: '', hosted: !app && how === 'zip', files: 0, edited: !!editSlug });
      return;
    } // demo mode: no backend

    const data = new FormData(form.current!);
    data.set('price', String(Math.min(price, maxPrice)));
    data.set('platform', kind);
    data.set('intent', intent);
    if (draftSlug) data.set('draft', draftSlug);
    if (editSlug) data.set('edit', editSlug);
    data.delete('zip');
    data.delete('shots');
    if (intent === 'review') {
      shots.forEach((f) => data.append('shots', f));
      if (app) {
        if (!dig) data.delete('demo');
      } else {
        if (how === 'zip' && file) data.set('zip', file);
        if (how === 'zip') data.delete('demo');
      }
    }

    setBusy(true);
    setPct(0);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/listings');
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setPct(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      setBusy(false);
      let body: { ok?: boolean; error?: string; slug?: string; hosted?: boolean; files?: number; draft?: boolean; missing?: string[]; edited?: boolean; status?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not json */
      }
      if (xhr.status === 200 && body.ok && body.draft) {
        setDraftSlug(body.slug!);
        setNote('Draft saved. Files are not kept in drafts, so add your screenshots or zip again when you submit.');
      } else if (xhr.status === 200 && body.ok) setDone({ slug: body.slug!, hosted: !!body.hosted, files: body.files ?? 0, edited: body.edited, status: body.status });
      else if (xhr.status === 422 && body.missing) {
        setCheck(null);
        setMissing(body.missing);
      } else if (xhr.status !== 200) setCheck(null);
      if (xhr.status !== 200 && xhr.status !== 422) {
        if (xhr.status === 401) setError('Please sign in as a seller first.');
        else setError(body.error ?? 'Something went wrong. Please try again.');
      }
    };
    xhr.onerror = () => {
      setBusy(false);
      setCheck(null);
      setError('The upload was interrupted. Check your connection and try again.');
    };
    xhr.send(data);
  };

  return (
    <div className="wrap" data-sell>
      <div className="page-head">
        <h1>{editSlug ? 'Edit your listing' : 'List a site'}</h1>
        <p>Every listing uses the same form, so buyers can compare like with like. We review every listing within 24 hours, and you see it laid out before you send it.</p>
      </div>
      <div className="checkout" style={{ paddingTop: 16 }}>
        {done ? (
          <div className="panel">
            <div className="done">
              {done.edited && done.status && done.status !== 'in_review' ? (
                <>
                  <span className="chip mint">
                    <i />
                    {done.status === 'live' ? 'Live' : 'Paused'}
                  </span>
                  <h2 style={{ marginTop: 14 }}>Changes saved.</h2>
                  <p className="muted" style={{ marginTop: 10 }}>
                    {done.status === 'live' ? 'Buyers see the new version now.' : 'The listing is still paused while we look at the reports about it.'} No link or file changed, so it did not need a
                    new review.
                  </p>
                </>
              ) : (
                <>
                  <span className="chip amber">
                    <i />
                    In review
                  </span>
                  <h2 style={{ marginTop: 14 }}>{done.edited ? 'Changes sent. We\u2019ll review them within 24 hours.' : 'Submitted. We\u2019ll reply within 24 hours.'}</h2>
                  <p className="muted" style={{ marginTop: 10 }}>
                    {done.hosted ? `We opened your zip (${done.files || 'all'} files) and it is ready to preview. ` : ''}
                    We look at your files and the demo. You&apos;ll get an email when the listing is live.
                  </p>
                </>
              )}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 22 }}>
                {done.slug && (
                  <Link className="btn btn-blue" href={`/preview/${done.slug}`} target="_blank">
                    Preview your site
                  </Link>
                )}
                <Link className="btn btn-dark" href="/dashboard/seller">
                  Open seller dashboard
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            {check && (
              <div className="panel sell-check" data-check aria-labelledby="chk-h">
                <h2 id="chk-h">Check your listing</h2>
                <p className="muted">This is what buyers will see, in the same order as every other listing. Change anything with Edit.</p>
                <dl className="chk-list">
                  <div>
                    <dt>Name</dt>
                    <dd>{check.name}</dd>
                  </div>
                  <div>
                    <dt>Category</dt>
                    <dd>
                      {check.category}
                      {check.stack ? ` · ${dig ? 'made for' : 'built with'} ${check.stack}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Price</dt>
                    <dd>{money(price)}</dd>
                  </div>
                  <div>
                    <dt>Delivery</dt>
                    <dd>
                      {Number(check.days) === 1 ? '1 day' : `Up to ${check.days} days`}
                      {check.express ? `, or in ${CONFIG.delivery.expressHours} hours for ${money(check.express)} more` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>What it does</dt>
                    <dd>{check.desc}</dd>
                  </div>
                  <div>
                    <dt>What is included</dt>
                    <dd>
                      <ul>
                        {check.includes.map((i) => (
                          <li key={i}>{i}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                  <div>
                    <dt>With setup help</dt>
                    <dd>{check.setup ? `${money(price + check.setup)} (${money(check.setup)} more)` : 'Not offered'}</dd>
                  </div>
                  <div>
                    <dt>With customisation</dt>
                    <dd>{check.custom ? `${money(price + check.custom)} (${money(check.custom)} more)` : 'Not offered'}</dd>
                  </div>
                  <div>
                    <dt>Licence</dt>
                    <dd>{check.licence}</dd>
                  </div>
                  {dig && (
                    <>
                      <div>
                        <dt>Support</dt>
                        <dd>{check.support ? `${check.support} days` : 'None'}</dd>
                      </div>
                      <div>
                        <dt>Updates</dt>
                        <dd>{check.updates ? `${check.updates} days` : 'None'}</dd>
                      </div>
                      <div>
                        <dt>What it needs</dt>
                        <dd>{check.requirements || 'Not stated'}</dd>
                      </div>
                    </>
                  )}
                  {check.demo && (
                    <div>
                      <dt>Demo</dt>
                      <dd>{check.demo}</dd>
                    </div>
                  )}
                  {check.docs && (
                    <div>
                      <dt>Documentation</dt>
                      <dd>{check.docs}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Pictures and files</dt>
                    <dd>{check.files}</dd>
                  </div>
                  <div>
                    <dt>You earn per sale</dt>
                    <dd>{money(you)}</dd>
                  </div>
                </dl>
                {error && (
                  <p role="alert" style={{ color: 'var(--rose)', marginTop: 14 }}>
                    {error}
                  </p>
                )}
                {busy && (
                  <div className="upbar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <i style={{ width: pct + '%' }} />
                    <span>{pct < 100 ? `Uploading ${pct}%` : 'Opening and checking your files'}</span>
                  </div>
                )}
                <div className="sell-actions">
                  <button className="btn btn-blue btn-lg" type="button" disabled={busy} onClick={() => go('review')}>
                    {busy ? 'Please wait' : editSlug ? 'Send changes for review' : 'Submit for review'}
                  </button>
                  <button className="btn btn-line btn-lg" type="button" disabled={busy} onClick={() => setCheck(null)}>
                    Edit
                  </button>
                </div>
              </div>
            )}
            <form
              className="panel"
              ref={form}
              noValidate
              hidden={!!check}
              onSubmit={(e) => {
                e.preventDefault();
                openCheck();
              }}
            >
              <div className="field" style={{ marginTop: 0 }}>
                <label>What are you selling?</label>
                <div className="seg seg3" role="group" aria-label="What are you selling">
                  {(
                    [
                      ['web', 'A website'],
                      ['android', 'An Android app'],
                      ['ios', 'An iPhone & iPad app'],
                      ['webapp', 'A web app'],
                      ['desktop', 'A desktop app'],
                      ['digital', 'A digital product'],
                    ] as [Kind, string][]
                  )
                    // New listings are websites only; an older app or digital listing being edited keeps its own button.
                    .filter(([k]) => k === 'web' || k === kind)
                    .map(([k, l]) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={kind === k}
                        disabled={!!editSlug && kind !== k}
                        onClick={() => {
                          setKind(k);
                          setError('');
                        }}
                      >
                        {l}
                      </button>
                    ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="s-name">{dig ? 'Product name' : app ? 'App name' : 'Site name'}</label>
                <input id="s-name" name="name" required minLength={3} maxLength={60} placeholder={dig ? 'Lead Capture workflow' : app ? 'HabitLoop' : 'Saffron Table'} />
              </div>
              <div className="row2">
                <div className="field">
                  <label htmlFor="s-cat">Category</label>
                  <select id="s-cat" key={kind} name="category" onChange={(e) => setCat(e.target.value)}>
                    {(app ? catsFor(kind) : WEB_CATS).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="s-days">Delivery time</label>
                  <select id="s-days" name="days" defaultValue="3">
                    {Array.from({ length: CONFIG.delivery.maxDays - CONFIG.delivery.minDays + 1 }, (_, k) => CONFIG.delivery.minDays + k).map((d) => (
                      <option key={d} value={d}>
                        {d === 1 ? '1 day' : `Up to ${d} days`}
                      </option>
                    ))}
                  </select>
                  <small>Promise only what you can keep. For a faster job, offer 24-hour express below, or agree it with the buyer in the order chat.</small>
                </div>
              </div>
              {app && (
                <div className="field">
                  <label htmlFor="s-stack">{dig ? 'Made for' : 'Built with'}</label>
                  <select id="s-stack" name="stack" defaultValue={DEFAULT_STACK[kind]} key={'st' + kind}>
                    {toolsFor(kind).map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label htmlFor="s-desc">What does it do?</label>
                <textarea
                  id="s-desc"
                  name="desc"
                  onChange={(e) => setDescN(e.target.value.trim().length)}
                  rows={3}
                  required
                  minLength={20}
                  maxLength={600}
                  placeholder={app ? 'Describe the app in two sentences.' : 'Describe the site in two sentences.'}
                />
              </div>
              <div className="field">
                <label htmlFor="s-inc">What is included (one per line, optional)</label>
                <textarea
                  id="s-inc"
                  name="inc"
                  onChange={(e) => setIncN(e.target.value.split('\n').filter((l) => l.trim()).length)}
                  rows={3}
                  placeholder={'Home, menu and contact pages\nBooking form with email alerts'}
                />
              </div>

              {app ? (
                <div className="field">
                  <label>{dig ? 'Pictures of your product' : 'Screenshots of your app'}</label>
                  {shotsBox(
                    dig
                      ? 'Show what is inside: the files, the main screens, a sample result. Buyers decide from these before they pay.'
                      : 'Show the main screens, portrait. After payment you also send the buyer a real test build.',
                    <>
                      Choose <b>3 to 6</b> screenshots
                    </>,
                  )}
                </div>
              ) : (
                <div className="field">
                  <label>Show buyers your site</label>
                  <div className="seg" role="group" aria-label="How to show your site">
                    <button type="button" aria-pressed={how === 'zip'} onClick={() => setHow('zip')}>
                      Upload a zip
                    </button>
                    <button type="button" aria-pressed={how === 'link'} onClick={() => setHow('link')}>
                      Link to a live demo
                    </button>
                  </div>
                  {how === 'zip' ? (
                    <div className="drop">
                      <input id="s-zip" type="file" accept=".zip,application/zip" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
                      <label htmlFor="s-zip">
                        {file ? (
                          <>
                            <b>{file.name}</b> · {(file.size / 1024 / 1024).toFixed(1)} MB
                          </>
                        ) : (
                          <>
                            Choose your site as a <b>.zip</b>
                          </>
                        )}
                      </label>
                      <small>
                        Put <b>index.html</b> at the top. Up to 25 MB. We host it for you, so buyers can scroll through the real site. Scripts run in a sandbox.
                      </small>
                    </div>
                  ) : (
                    <div className="drop plain">
                      <input id="s-demo" name="demo" type="url" required placeholder="https://demo.example.com" />
                      <small>Your own hosted demo. Some sites refuse to be shown inside other pages. If yours does, buyers get an Open in a new tab link.</small>
                    </div>
                  )}
                </div>
              )}
              {!app && (
                <div className="field">
                  <label>Pictures of your site (optional)</label>
                  {shotsBox(
                    kept.shots ? `You sent ${kept.shots} before. Choose new ones to replace them.` : 'The first one is the cover buyers see on the list. Up to 6.',
                    <>
                      Choose up to <b>6</b> pictures
                    </>,
                  )}
                </div>
              )}

              <div className="field">
                <label htmlFor="s-code">{dig ? 'Link to your files' : 'Code link'}</label>
                <input id="s-code" name="code" type="url" required placeholder="Private GitHub or Drive link" />
                <small>
                  {dig ? (
                    'A private link. The buyer gets it only after their payment is held in escrow, through a link that expires in 24 hours, with a licence key. Every download is logged, and you are paid 7 days after they accept.'
                  ) : (
                    <>Only shared with buyers after they accept the {app ? 'app' : 'site'}.</>
                  )}{' '}
                  The file behind the link can be up to {CONFIG.download.maxFileMb} MB. We read it once when you submit, and a bigger file cannot be approved.
                </small>
              </div>
              {dig && (
                <div className="field">
                  <label htmlFor="s-demo2">Demo or view-only link{needDemo ? '' : ' (optional)'}</label>
                  <input
                    id="s-demo2"
                    name="demo"
                    type="url"
                    required={needDemo}
                    value={demoN}
                    onChange={(e) => setDemoN(e.target.value)}
                    placeholder="A video walkthrough, a view-only Figma link or a sample result"
                  />
                  <small>
                    {needDemo ? 'Buyers cannot try this before they accept, so show it working. A 2-minute video is perfect. ' : 'Buyers can look before they pay. '}Do not put the real files here.
                  </small>
                </div>
              )}
              {dig && sampleEnabled && (
                <div className="field">
                  <label htmlFor="s-sample">Free sample link (optional)</label>
                  <input id="s-sample" name="sample" type="url" placeholder="A small free piece buyers can open, for example one screen or one workflow" />
                  <small>Public: anyone can open it before buying. Show a taste, not the whole product.</small>
                </div>
              )}
              {dig && trialEnabled && needDemo && (
                <div className="field">
                  <label htmlFor="s-trial">Limited trial copy (optional file)</label>
                  <input id="s-trial" name="trialFile" type="file" accept=".zip,.pdf,.txt,.md,.json,.csv" />
                  <small>
                    Upload a separate cut-down version (fewer features, a time limit or a watermark). We never trim your real file. Private: a signed-in buyer can ask for it once a week, through a
                    link that works for one hour. Every download is logged.
                  </small>
                </div>
              )}
              {dig && (
                <div className="strength" aria-live="polite">
                  <div className="strength-h">
                    <b>Listing strength</b>
                    <span>{strength} of 4</span>
                  </div>
                  <div className="meter">
                    <i style={{ width: strength * 25 + '%' }} />
                  </div>
                  <ul>
                    {checks.map(([t, v]) => (
                      <li key={t} className={v ? 'on' : ''}>
                        {t}
                      </li>
                    ))}
                  </ul>
                  <small>
                    Listings that show it working sell more. You stay protected: escrow, a licence key per order, a log of every download, a 7-day hold before payout, and disputes that need evidence.
                  </small>
                </div>
              )}
              {dig && (
                <label className="clean-check">
                  <input type="checkbox" name="clean" required />
                  <span>I confirm these files contain no malware or hidden code, and I have the right to sell them. We review every product before it goes live.</span>
                </label>
              )}
              {dig && NEEDS_RELEASE.includes(cat) && (
                <label className="clean-check">
                  <input type="checkbox" name="release" required />
                  <span>
                    Everything in these files is mine or licensed to me for resale (music, footage, fonts, samples). Anyone who can be recognised, and any private place or artwork shown, has signed a
                    release, and I can show it if asked.
                  </span>
                </label>
              )}
              <div className="field">
                <label htmlFor="s-price">
                  Price <b>{money(price)}</b>
                </label>
                <input
                  id="s-price-n"
                  type="number"
                  inputMode="numeric"
                  min={minPrice}
                  max={maxPrice}
                  step={1}
                  value={price}
                  aria-label="Your price in dollars"
                  onChange={(e) => setPrice(Math.round(Number(e.target.value)) || 0)}
                  onBlur={() => setPrice((p) => Math.min(maxPrice, Math.max(minPrice, p)))}
                />
                <input id="s-price" type="range" min={minPrice} max={maxPrice} value={Math.min(price, maxPrice)} onChange={(e) => setPrice(+e.target.value)} style={{ accentColor: '#2B3DFF' }} />
                <small>
                  Type your own price, from {money(minPrice)} to {money(maxPrice)}. You can change it later and an admin can adjust it too.
                </small>
              </div>
              <div className="field">
                <label htmlFor="s-lic">License</label>
                <select id="s-lic" name="license">
                  <option>I wrote all of it (or generated it with AI)</option>
                  <option>Uses MIT or Apache 2.0 parts</option>
                  <option>Uses other licensed parts</option>
                </select>
                <small>Sites with GPL parts need a note so buyers know their obligations.</small>
              </div>
              <div className="field">
                <label htmlFor="s-ltype">What the buyer may do with it</label>
                <select id="s-ltype" name="licenceType" defaultValue="single_project">
                  {LICENCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {LICENCES[t].label}
                    </option>
                  ))}
                </select>
                <small>Single project: one site, no resale. Multi project: any number of their own projects, no resale. Full transfer: they own it and you stop selling it.</small>
              </div>
              <div className="field">
                <label htmlFor="s-setup">Price of &quot;with setup help&quot;</label>
                <select id="s-setup" name="setupPrice" value={setupShown} onChange={(e) => setSetupP(e.target.value)}>
                  {room(CONFIG.packages.setupCents).map((c) => (
                    <option key={c} value={c / 100}>
                      {c === 0 ? 'Not offered' : `$${c / 100} on top of the price`}
                    </option>
                  ))}
                </select>
                <small>Your own price for doing the setup for the buyer (their name, logo and colours, or installing and connecting it). Choose &quot;Not offered&quot; if you do not do this.</small>
              </div>
              <div className="field">
                <label htmlFor="s-custom">Price of &quot;with customisation&quot;</label>
                <select id="s-custom" name="customPrice" value={customShown} onChange={(e) => setCustomP(e.target.value)}>
                  {room(CONFIG.packages.customCents).map((c) => (
                    <option key={c} value={c / 100}>
                      {c === 0 ? 'Not offered' : `$${c / 100} on top of the price`}
                    </option>
                  ))}
                </select>
                <small>What you charge to change it to fit the buyer. It is paid into escrow before you start. Choose &quot;Not offered&quot; if you only sell it as it is.</small>
              </div>
              <div className="field">
                <label htmlFor="s-express">24-hour express delivery (optional)</label>
                <select id="s-express" name="express" defaultValue="">
                  <option value="">Not offered</option>
                  {Array.from({ length: (CONFIG.delivery.expressMaxCents - CONFIG.delivery.expressMinCents) / 500 + 1 }, (_, k) => CONFIG.delivery.expressMinCents / 100 + k * 5).map((d) => (
                    <option key={d} value={d}>
                      Offer it for ${d}
                    </option>
                  ))}
                </select>
                <small>Buyers can pay this extra to get it within {CONFIG.delivery.expressHours} hours. You keep it, minus the usual fee. Only choose it if you can really deliver that fast.</small>
              </div>
              <div className="field">
                <label htmlFor="s-third">Third-party code inside (optional)</label>
                <textarea id="s-third" name="third" rows={3} placeholder={'One per line, for example:\nDate picker - MIT\nChart helper - GPL-3.0'} />
                <small>Licences we know: {THIRD_PARTY_LICENCES.join(', ')}. Buyers see a note when a licence comes with conditions.</small>
              </div>
              {dig && (
                <>
                  <div className="field">
                    <label htmlFor="s-reqs">What it needs to run{needDemo ? '' : ' (optional)'}</label>
                    <textarea
                      id="s-reqs"
                      name="requirements"
                      rows={3}
                      maxLength={CONFIG.listing.requirementsMax}
                      placeholder={'For example:\nWordPress 6.4 or newer, PHP 8.1\nNode 20 and an OpenAI key'}
                    />
                    <small>Shown to buyers before they pay: versions, accounts or keys they need.</small>
                  </div>
                  <div className="field">
                    <label htmlFor="s-docs">Documentation link (optional)</label>
                    <input id="s-docs" name="docsUrl" type="url" placeholder="https://docs.example.com/my-product" />
                    <small>A public page with the install steps or the guide. Must start with https.</small>
                  </div>
                  <div className="field">
                    <label htmlFor="s-support">Support after purchase</label>
                    <select id="s-support" name="supportDays" defaultValue="0">
                      {CONFIG.listing.periodDays.map((d) => (
                        <option key={d} value={d}>
                          {d === 0 ? 'None' : `${d} days`}
                        </option>
                      ))}
                    </select>
                    <small>How long you answer questions in the order chat. Counted from the purchase. Only promise what you will do.</small>
                  </div>
                  <div className="field">
                    <label htmlFor="s-updates">Updates after purchase</label>
                    <select id="s-updates" name="updateDays" defaultValue="0">
                      {CONFIG.listing.periodDays.map((d) => (
                        <option key={d} value={d}>
                          {d === 0 ? 'None' : `${d} days`}
                        </option>
                      ))}
                    </select>
                    <small>How long buyers get the new versions you publish. Counted from the purchase.</small>
                  </div>
                </>
              )}
              {dig && (
                <div className="field">
                  <label htmlFor="s-deliv">How the buyer gets it</label>
                  <select id="s-deliv" name="delivery" defaultValue="download">
                    <option value="download">Download link to your files</option>
                    <option value="repo_access">Invite to a private GitHub repository</option>
                  </select>
                  <small>With a repository you invite the buyer&apos;s GitHub account after they pay, and they confirm they can open it.</small>
                </div>
              )}
              <label style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'start' }}>
                <input type="checkbox" required style={{ accentColor: '#2B3DFF', marginTop: 5 }} />
                <span className="muted">I own the rights to sell this, and it has no copied or harmful code.</span>
              </label>
              {error && (
                <p role="alert" style={{ color: 'var(--rose)', marginTop: 14 }}>
                  {error}
                </p>
              )}
              {busy && (
                <div className="upbar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <i style={{ width: pct + '%' }} />
                  <span>{pct < 100 ? `Uploading ${pct}%` : 'Opening and checking your site'}</span>
                </div>
              )}
              {missing.length > 0 && (
                <div className="missing" role="alert">
                  <b>{reviewMessage([]).replace(': .', ':')}</b>
                  <ul>
                    {missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  <small>You can still save a draft and finish later.</small>
                </div>
              )}
              {note && (
                <p className="ask-ok" role="status">
                  {note}
                </p>
              )}
              <div className="sell-actions">
                <button className="btn btn-blue btn-lg" type="submit" disabled={busy}>
                  Check my listing
                </button>
                {!editSlug && (
                  <button className="btn btn-line btn-lg" type="button" disabled={busy} onClick={() => go('draft')}>
                    Save draft
                  </button>
                )}
              </div>
            </form>
          </>
        )}
        <aside className="sum">
          <h2 style={{ fontSize: '1.5rem' }}>What you earn</h2>
          <div className="line" style={{ marginTop: 12 }}>
            <span>Buyer pays</span>
            <b>{money(price)}</b>
          </div>
          <div className="line">
            <span>
              {BRAND_NAME} fee, {FEE_SALE_TEXT}
            </span>
            <b>{money(fee)}</b>
          </div>
          <div className="tot">
            <span>You earn</span>
            <span>{money(you)}</span>
          </div>
          <div className="note warn" style={{ marginTop: 20 }}>
            <span>Paid weekly, 7 days after the buyer accepts. Verify your email, phone and payout account before your first listing goes live.</span>
          </div>
          <ul className="checks" style={{ gridTemplateColumns: '1fr', marginTop: 22 }}>
            <li>Checked for copied content before it goes live</li>
            <li>Sell the same site again and again</li>
            <li>Get extra income from customisation jobs</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
