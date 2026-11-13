'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { money } from '@/lib/data';
import { WEB_CATS, webCatLabel } from '@/lib/webCategories';
import { NEEDS_DEMO, NEEDS_RELEASE, catsFor, toolsFor } from '@/lib/apps';
import { missingForReview, reviewMessage } from '@/lib/listingRules';
import { BRAND_NAME } from '@/lib/brand';
import { pct as percent, planNetCents } from '@/lib/config';
import { LICENCES, LICENCE_TYPES, THIRD_PARTY_LICENCES, isLicenceType } from '@/lib/licences';
import { CONFIG } from '@/lib/config';
import { deliveryChoices, expressHelps, readDelivery } from '@/lib/deliveryTime';
import { cleanTags } from '@/lib/listingTags';

import { T } from '@/components/i18n/T';
import { useTx, useWord } from '@/components/i18n/TxProvider';
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
  hourChoices = [],
  commissionBps = CONFIG.plans.free.commissionBps,
  planName = 'Free',
  tagsEnabled = false,
  embedded = false,
}: {
  /* Inside the seller dashboard, whose shell already has the page's h1 (one h1 per page). */
  embedded?: boolean;
  live: boolean;
  trialEnabled?: boolean;
  sampleEnabled?: boolean;
  minPrice?: number;
  maxPrice?: number;
  /* The delivery hours an admin allows (Admin → Settings); empty = whole days only. */
  hourChoices?: number[];
  /* The seller's current plan (lib/plans), for the earnings preview. */
  commissionBps?: number;
  planName?: string;
  /* Tags are kept once migration 0070 is applied (lib/listingTagsStore.ts); until then the field is hidden. */
  tagsEnabled?: boolean;
}) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const word = useWord(); // shared labels (lib/) in the page's language
  // Delivery: the admin's hour choices, then 1 to 7 days. A listing being edited keeps hours it already promises, even if no longer offered.
  const [keptHours, setKeptHours] = useState<number | null>(null);
  const [deliveryV, setDeliveryV] = useState('3');
  const choices = deliveryChoices(hourChoices, keptHours);
  const deliveryLabel = (v: string) => (v.endsWith('h') ? (choices.find(([c]) => c === v)?.[1] ?? v) : Number(v) === 1 ? '1 day' : tx('Up to {v} days', { v }));
  const chosen = readDelivery(deliveryV, hourChoices, keptHours);
  const fastAlready = chosen.ok && !expressHelps(chosen);
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
        [tx('A demo or view-only link'), /^https:\/\//.test(demoN)],
        [tx('A clear description'), descN >= 80],
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
  const [dirty, setDirty] = useState(false); // something was typed or picked since the form opened
  const form = useRef<HTMLFormElement>(null);
  // SellOnBay 2.0: the seller's plan commission (F-1); the quotation fixes the real figure when a buyer's request is quoted
  const you = planNetCents(price * 100, commissionBps) / 100;
  const fee = price - you;

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
                <T s={'{length} picture{v1}'} v={{ length: shots.length, v1: shots.length === 1 ? '' : 's' }} />
              </b>{' '}
              <T s={'chosen. Click to change.'} />
            </>
          ) : (
            choose
          )}
        </label>
        <small>
          <T s={'PNG, JPG or WebP, up to 4 MB each. {hint}'} v={{ hint }} />
        </small>
      </div>
      {shots.length > 0 && (
        <div className="sob-shots">
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
      return setError(tx('Choose a .zip file of your site.'));
    }
    if (f && f.size > MAX_ZIP) {
      setFile(null);
      return setError(tx('That zip is larger than 25 MB.'));
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
        if (!d) return setError(isEdit ? tx('That listing could not be opened.') : '');
        prefill.current = d;
        const h = /^(\d+)h$/.exec(String(d.days ?? ''));
        if (h) setKeptHours(Number(h[1]));
        if (isEdit) {
          setEditSlug(slug);
          setKept({ zip: !!d.keptZip, shots: Number(d.keptShots) || 0 });
          if (d.keptZip) setHow('zip');
          else if (d.platform === 'web') setHow('link');
          setNote(
            tx(
              'Editing your listing. Changes to the text, prices and options are saved at once. If you change a link or a file, it goes back to review and buyers cannot buy it until it is approved again. Leave the files empty to keep the ones you sent.',
            ),
          );
        } else {
          setDraftSlug(slug);
          setNote(tx('Draft opened. Add your files again before you submit.'));
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
      set('tags', d.tags);
      if (d.days) setDeliveryV(String(d.days));
      if (d.demo) setDemoN(String(d.demo));
      if (d.category) setCat(String(d.category));
      if (d.setupPrice !== undefined && d.setupPrice !== '') setSetupP(String(d.setupPrice));
      if (d.customPrice !== undefined && d.customPrice !== '') setCustomP(String(d.customPrice));
      prefill.current = null;
    }, 60);
    return () => clearTimeout(t);
  }, [kind]);

  // Unsaved changes: leaving the page (closing, reloading or following a link on the site) asks first, until the listing is sent.
  useEffect(() => {
    if (!dirty || done) return;
    const LEAVE = tx('You have changes that are not saved. Leave this page?');
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      if (new URL(a.href, location.href).origin !== location.origin || (a.hash && a.pathname === location.pathname)) return;
      if (!window.confirm(LEAVE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, [dirty, done]);

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
    const tagCheck = cleanTags(str('tags')); // the same rule the server applies
    if (!tagCheck.ok) return setError(tagCheck.error);
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
      licence: isLicenceType(lt) ? word(LICENCES[lt].label) : lt,
      support: Number(str('supportDays')) || 0,
      updates: Number(str('updateDays')) || 0,
      requirements: str('requirements'),
      demo: app ? (dig ? str('demo') : '') : how === 'link' ? str('demo') : '',
      docs: str('docsUrl'),
      files: [
        app ? '' : how === 'zip' ? (file ? `${file.name} (hosted by us)` : tx('The site files you sent before')) : tx('Your live demo link'),
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
    } else if (String(new FormData(form.current!).get('name') ?? '').trim().length < 3) return setError(tx('Give your draft a name of 3 to 60 characters so you can find it later.'));
    if (!live) {
      if (intent === 'draft') return setNote(tx('Draft saved (demo mode keeps nothing).'));
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
        setNote(tx('Draft saved. Files are not kept in drafts, so add your screenshots or zip again when you submit.'));
      } else if (xhr.status === 200 && body.ok) setDone({ slug: body.slug!, hosted: !!body.hosted, files: body.files ?? 0, edited: body.edited, status: body.status });
      else if (xhr.status === 422 && body.missing) {
        setCheck(null);
        setMissing(body.missing);
      } else if (xhr.status !== 200) setCheck(null);
      if (xhr.status !== 200 && xhr.status !== 422) {
        if (xhr.status === 401) setError(tx('Please sign in as a seller first.'));
        else setError(body.error ?? tx('Something went wrong. Please try again.'));
      }
    };
    xhr.onerror = () => {
      setBusy(false);
      setCheck(null);
      setError(tx('The upload was interrupted. Check your connection and try again.'));
    };
    xhr.send(data);
  };

  return (
    <div className="sob-sellform" data-sell>
      {!embedded && (
        <div className="row">
          <h1>{editSlug ? tx('Edit your listing') : tx('List a site')}</h1>
          <p>
            <T s={'Every listing uses the same form, so buyers can compare like with like. We review every listing within 24 hours, and you see it laid out before you send it.'} />
          </p>
        </div>
      )}
      <div className="sob-split" style={{ paddingTop: 16 }}>
        {done ? (
          <div className="sob-panel">
            <div className="sob-stack">
              {done.edited && done.status && done.status !== 'in_review' ? (
                <>
                  <span className="status st-ok">
                    <i />
                    {done.status === 'live' ? tx('Live') : tx('Paused')}
                  </span>
                  <h2 style={{ marginTop: 14 }}>
                    <T s={'Changes saved.'} />
                  </h2>
                  <p className="muted" style={{ marginTop: 10 }}>
                    <T
                      s={'{v0} No link or file changed, so it did not need a new review.'}
                      v={{ v0: done.status === 'live' ? tx('Buyers see the new version now.') : tx('The listing is still paused while we look at the reports about it.') }}
                    />
                  </p>
                </>
              ) : (
                <>
                  <span className="status st-wait">
                    <i />
                    <T s={'In review'} />
                  </span>
                  <h2 style={{ marginTop: 14 }}>{done.edited ? tx('Changes sent. We’ll review them within 24 hours.') : tx('Submitted. We’ll reply within 24 hours.')}</h2>
                  <p className="muted" style={{ marginTop: 10 }}>
                    <T
                      s={"{v0}We look at your files and the demo. You'll get an email when the listing is live."}
                      v={{ v0: done.hosted ? tx('We opened your zip ({v0} files) and it is ready to preview. ', { v0: done.files || 'all' }) : '' }}
                    />
                  </p>
                </>
              )}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 22 }}>
                {done.slug && (
                  <Link className="btn" href={`/preview/${done.slug}`} target="_blank">
                    <T s={'Preview your site'} />
                  </Link>
                )}
                <Link className="btn ghost" href="/dashboard/seller">
                  <T s={'Open seller dashboard'} />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            {check && (
              <div className="sob-panel sob-check" data-check aria-labelledby="chk-h">
                <h2 id="chk-h">
                  <T s={'Check your listing'} />
                </h2>
                <p className="muted">
                  <T s={'This is what buyers will see, in the same order as every other listing. Change anything with Edit.'} />
                </p>
                <dl className="sob-kv">
                  <div>
                    <dt>
                      <T s={'Name'} />
                    </dt>
                    <dd>{check.name}</dd>
                  </div>
                  <div>
                    <dt>
                      <T s={'Category'} />
                    </dt>
                    <dd>
                      {check.category}
                      {check.stack ? ` · ${dig ? 'made for' : 'built with'} ${check.stack}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <T s={'Price'} />
                    </dt>
                    <dd>{money(price)}</dd>
                  </div>
                  <div>
                    <dt>
                      <T s={'Delivery'} />
                    </dt>
                    <dd>
                      {deliveryLabel(check.days)}
                      {check.express && !fastAlready ? `, or in ${CONFIG.delivery.expressHours} hours for ${money(check.express)} more` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <T s={'What it does'} />
                    </dt>
                    <dd>{check.desc}</dd>
                  </div>
                  <div>
                    <dt>
                      <T s={'What is included'} />
                    </dt>
                    <dd>
                      <ul>
                        {check.includes.map((i) => (
                          <li key={i}>{i}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <T s={'With setup help'} />
                    </dt>
                    <dd>{check.setup ? `${money(price + check.setup)} (${money(check.setup)} more)` : tx('Not offered')}</dd>
                  </div>
                  <div>
                    <dt>
                      <T s={'With customisation'} />
                    </dt>
                    <dd>{check.custom ? `${money(price + check.custom)} (${money(check.custom)} more)` : tx('Not offered')}</dd>
                  </div>
                  <div>
                    <dt>
                      <T s={'Licence'} />
                    </dt>
                    <dd>{check.licence}</dd>
                  </div>
                  {dig && (
                    <>
                      <div>
                        <dt>
                          <T s={'Support'} />
                        </dt>
                        <dd>{check.support ? `${check.support} days` : tx('None')}</dd>
                      </div>
                      <div>
                        <dt>
                          <T s={'Updates'} />
                        </dt>
                        <dd>{check.updates ? `${check.updates} days` : tx('None')}</dd>
                      </div>
                      <div>
                        <dt>
                          <T s={'What it needs'} />
                        </dt>
                        <dd>{check.requirements || tx('Not stated')}</dd>
                      </div>
                    </>
                  )}
                  {check.demo && (
                    <div>
                      <dt>
                        <T s={'Demo'} />
                      </dt>
                      <dd>{check.demo}</dd>
                    </div>
                  )}
                  {check.docs && (
                    <div>
                      <dt>
                        <T s={'Documentation'} />
                      </dt>
                      <dd>{check.docs}</dd>
                    </div>
                  )}
                  <div>
                    <dt>
                      <T s={'Pictures and files'} />
                    </dt>
                    <dd>{check.files}</dd>
                  </div>
                  <div>
                    <dt>
                      <T s={'You earn per sale'} />
                    </dt>
                    <dd>{money(you)}</dd>
                  </div>
                </dl>
                {error && (
                  <p role="alert" style={{ color: '#7A2E24', marginTop: 14 }}>
                    {error}
                  </p>
                )}
                {busy && (
                  <div className="sob-upbar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <i style={{ width: pct + '%' }} />
                    <span>{pct < 100 ? tx('Uploading {pct}%', { pct }) : tx('Opening and checking your files')}</span>
                  </div>
                )}
                <div className="sob-acts">
                  <button className="btn" type="button" disabled={busy} onClick={() => go('review')}>
                    {busy ? tx('Please wait') : editSlug ? tx('Send changes for review') : tx('Submit for review')}
                  </button>
                  <button className="btn ghost" type="button" disabled={busy} onClick={() => setCheck(null)}>
                    <T s={'Edit'} />
                  </button>
                </div>
              </div>
            )}
            <form
              className="sob-panel"
              ref={form}
              noValidate
              hidden={!!check}
              onInput={() => setDirty(true)}
              onSubmit={(e) => {
                e.preventDefault();
                openCheck();
              }}
            >
              <div className="field" style={{ marginTop: 0 }}>
                <label>
                  <T s={'What are you selling?'} />
                </label>
                <div className="seg" role="group" aria-label={tx('What are you selling')}>
                  {(
                    [
                      ['web', tx('A website')],
                      ['android', tx('An Android app')],
                      ['ios', tx('An iPhone & iPad app')],
                      ['webapp', tx('A web app')],
                      ['desktop', tx('A desktop app')],
                      ['digital', tx('A digital product')],
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
                <label htmlFor="s-name">{dig ? tx('Product name') : app ? tx('App name') : tx('Site name')}</label>
                <input id="s-name" name="name" required minLength={3} maxLength={60} placeholder={dig ? tx('Lead Capture workflow') : app ? tx('HabitLoop') : tx('Saffron Table')} />
              </div>
              <div className="sob-grid2">
                <div className="field">
                  <label htmlFor="s-cat">
                    <T s={'Category'} />
                  </label>
                  <select id="s-cat" key={kind} name="category" onChange={(e) => setCat(e.target.value)}>
                    {(app ? catsFor(kind) : WEB_CATS).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="s-days">
                    <T s={'Delivery time'} />
                  </label>
                  <select id="s-days" name="days" defaultValue="3" onChange={(e) => setDeliveryV(e.target.value)}>
                    {choices.map(([v, label]) => (
                      <option key={v} value={v}>
                        {v.endsWith('h') ? `Within ${label}` : deliveryLabel(v)}
                      </option>
                    ))}
                  </select>
                  <small>
                    <T
                      s={'Promise only what you can keep. The time starts when the buyer pays. {v0}'}
                      v={{
                        v0: hourChoices.length
                          ? tx('Pick hours for a quick job, days for a bigger one.')
                          : tx('For a faster job, offer 24-hour express below, or agree it with the buyer in the order chat.'),
                      }}
                    />
                  </small>
                </div>
              </div>
              {app && (
                <div className="field">
                  <label htmlFor="s-stack">{dig ? tx('Made for') : tx('Built with')}</label>
                  <select id="s-stack" name="stack" defaultValue={DEFAULT_STACK[kind]} key={'st' + kind}>
                    {toolsFor(kind).map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label htmlFor="s-desc">
                  <T s={'What does it do?'} />
                </label>
                <textarea
                  id="s-desc"
                  name="desc"
                  onChange={(e) => setDescN(e.target.value.trim().length)}
                  rows={3}
                  required
                  minLength={20}
                  maxLength={600}
                  placeholder={app ? tx('Describe the app in two sentences.') : tx('Describe the site in two sentences.')}
                />
              </div>
              <div className="field">
                <label htmlFor="s-inc">
                  <T s={'What is included (one per line, optional)'} />
                </label>
                <textarea
                  id="s-inc"
                  name="inc"
                  onChange={(e) => setIncN(e.target.value.split('\n').filter((l) => l.trim()).length)}
                  rows={3}
                  placeholder={tx('Home, menu and contact pages\nBooking form with email alerts')}
                />
              </div>

              {app ? (
                <div className="field">
                  <label>{dig ? tx('Pictures of your product') : tx('Screenshots of your app')}</label>
                  {shotsBox(
                    dig
                      ? tx('Show what is inside: the files, the main screens, a sample result. Buyers decide from these before they pay.')
                      : tx('Show the main screens, portrait. After payment you also send the buyer a real test build.'),
                    <>
                      <T s={'Choose'} />{' '}
                      <b>
                        <T s={'3 to 6'} />
                      </b>{' '}
                      <T s={'screenshots'} />
                    </>,
                  )}
                </div>
              ) : (
                <div className="field">
                  <label>
                    <T s={'Show buyers your site'} />
                  </label>
                  <div className="seg" role="group" aria-label={tx('How to show your site')}>
                    <button type="button" aria-pressed={how === 'zip'} onClick={() => setHow('zip')}>
                      <T s={'Upload a zip'} />
                    </button>
                    <button type="button" aria-pressed={how === 'link'} onClick={() => setHow('link')}>
                      <T s={'Link to a live demo'} />
                    </button>
                  </div>
                  {how === 'zip' ? (
                    <div className="drop">
                      <input id="s-zip" type="file" accept=".zip,application/zip" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
                      <label htmlFor="s-zip">
                        {file ? (
                          <>
                            <b>{file.name}</b> <T s={'· {v0} MB'} v={{ v0: (file.size / 1024 / 1024).toFixed(1) }} />
                          </>
                        ) : (
                          <>
                            <T s={'Choose your site as a'} />{' '}
                            <b>
                              <T s={'.zip'} />
                            </b>
                          </>
                        )}
                      </label>
                      <small>
                        <T s={'Put'} />{' '}
                        <b>
                          <T s={'index.html'} />
                        </b>{' '}
                        <T s={'at the top. Up to 25 MB. We host it for you, so buyers can scroll through the real site. Scripts run in a sandbox.'} />
                      </small>
                    </div>
                  ) : (
                    <div className="drop">
                      <input id="s-demo" name="demo" type="url" required placeholder="https://demo.example.com" />
                      <small>
                        <T s={'Your own hosted demo. Some sites refuse to be shown inside other pages. If yours does, buyers get an Open in a new tab link.'} />
                      </small>
                    </div>
                  )}
                </div>
              )}
              {!app && (
                <div className="field">
                  <label>
                    <T s={'Pictures of your site (optional)'} />
                  </label>
                  {shotsBox(
                    kept.shots ? tx('You sent {shots} before. Choose new ones to replace them.', { shots: kept.shots }) : tx('The first one is the cover buyers see on the list. Up to 6.'),
                    <>
                      <T s={'Choose up to'} /> <b>6</b> <T s={'pictures'} />
                    </>,
                  )}
                </div>
              )}

              <div className="field">
                <label htmlFor="s-code">{dig ? tx('Link to your files') : tx('Code link')}</label>
                <input id="s-code" name="code" type="url" required placeholder={tx('Private GitHub or Drive link')} />
                <small>
                  {dig ? (
                    tx(
                      'A private link. The buyer gets it only after their payment is held in escrow, through a link that expires in 24 hours, with a licence key. Every download is logged, and you are paid 7 days after they accept.',
                    )
                  ) : (
                    <>
                      <T s={'Only shared with buyers after they accept the {v0}.'} v={{ v0: app ? 'app' : 'site' }} />
                    </>
                  )}{' '}
                  <T s={'The file behind the link can be up to {maxFileMb} MB. We read it once when you submit, and a bigger file cannot be approved.'} v={{ maxFileMb: CONFIG.download.maxFileMb }} />
                </small>
              </div>
              {dig && (
                <div className="field">
                  <label htmlFor="s-demo2">
                    <T s={'Demo or view-only link{v0}'} v={{ v0: needDemo ? '' : ' (optional)' }} />
                  </label>
                  <input
                    id="s-demo2"
                    name="demo"
                    type="url"
                    required={needDemo}
                    value={demoN}
                    onChange={(e) => setDemoN(e.target.value)}
                    placeholder={tx('A video walkthrough, a view-only Figma link or a sample result')}
                  />
                  <small>
                    <T
                      s={'{v0}Do not put the real files here.'}
                      v={{ v0: needDemo ? tx('Buyers cannot try this before they accept, so show it working. A 2-minute video is perfect. ') : tx('Buyers can look before they pay. ') }}
                    />
                  </small>
                </div>
              )}
              {dig && sampleEnabled && (
                <div className="field">
                  <label htmlFor="s-sample">
                    <T s={'Free sample link (optional)'} />
                  </label>
                  <input id="s-sample" name="sample" type="url" placeholder={tx('A small free piece buyers can open, for example one screen or one workflow')} />
                  <small>
                    <T s={'Public: anyone can open it before buying. Show a taste, not the whole product.'} />
                  </small>
                </div>
              )}
              {dig && trialEnabled && needDemo && (
                <div className="field">
                  <label htmlFor="s-trial">
                    <T s={'Limited trial copy (optional file)'} />
                  </label>
                  <input id="s-trial" name="trialFile" type="file" accept=".zip,.pdf,.txt,.md,.json,.csv" />
                  <small>
                    <T
                      s={
                        'Upload a separate cut-down version (fewer features, a time limit or a watermark). We never trim your real file. Private: a signed-in buyer can ask for it once a week, through a link that works for one hour. Every download is logged.'
                      }
                    />
                  </small>
                </div>
              )}
              {dig && (
                <div className="sob-strength" aria-live="polite">
                  <div className="row">
                    <b>
                      <T s={'Listing strength'} />
                    </b>
                    <span>
                      <T s={'{strength} of 4'} v={{ strength }} />
                    </span>
                  </div>
                  <div className="bar">
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
                    <T
                      s={
                        'Listings that show it working sell more. You stay protected: escrow, a licence key per order, a log of every download, a 7-day hold before payout, and disputes that need evidence.'
                      }
                    />
                  </small>
                </div>
              )}
              {dig && (
                <label className="chk sob-clean">
                  <input type="checkbox" name="clean" required />
                  <span>
                    <T s={'I confirm these files contain no malware or hidden code, and I have the right to sell them. We review every product before it goes live.'} />
                  </span>
                </label>
              )}
              {dig && NEEDS_RELEASE.includes(cat) && (
                <label className="chk sob-clean">
                  <input type="checkbox" name="release" required />
                  <span>
                    <T
                      s={
                        'Everything in these files is mine or licensed to me for resale (music, footage, fonts, samples). Anyone who can be recognised, and any private place or artwork shown, has signed a release, and I can show it if asked.'
                      }
                    />
                  </span>
                </label>
              )}
              <div className="field">
                <label htmlFor="s-price">
                  <T s={'Price'} /> <b>{money(price)}</b>
                </label>
                <input
                  id="s-price-n"
                  type="number"
                  inputMode="numeric"
                  min={minPrice}
                  max={maxPrice}
                  step={1}
                  value={price}
                  aria-label={tx('Your price in dollars')}
                  onChange={(e) => setPrice(Math.round(Number(e.target.value)) || 0)}
                  onBlur={() => setPrice((p) => Math.min(maxPrice, Math.max(minPrice, p)))}
                />
                <input id="s-price" type="range" min={minPrice} max={maxPrice} value={Math.min(price, maxPrice)} onChange={(e) => setPrice(+e.target.value)} style={{ accentColor: '#2B3DFF' }} />
                <small>
                  <T s={'Type your own price, from {v0} to {v1}. You can change it later and an admin can adjust it too.'} v={{ v0: money(minPrice), v1: money(maxPrice) }} />
                </small>
              </div>
              <div className="field">
                <label htmlFor="s-lic">
                  <T s={'License'} />
                </label>
                <select id="s-lic" name="license">
                  <option>
                    <T s={'I wrote all of it (or generated it with AI)'} />
                  </option>
                  <option>
                    <T s={'Uses MIT or Apache 2.0 parts'} />
                  </option>
                  <option>
                    <T s={'Uses other licensed parts'} />
                  </option>
                </select>
                <small>
                  <T s={'Sites with GPL parts need a note so buyers know their obligations.'} />
                </small>
              </div>
              <div className="field">
                <label htmlFor="s-ltype">
                  <T s={'What the buyer may do with it'} />
                </label>
                <select id="s-ltype" name="licenceType" defaultValue="single_project">
                  {LICENCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {word(LICENCES[t].label)}
                    </option>
                  ))}
                </select>
                <small>
                  <T s={'Single project: one site, no resale. Multi project: any number of their own projects, no resale. Full transfer: they own it and you stop selling it.'} />
                </small>
              </div>
              <div className="field">
                <label htmlFor="s-setup">
                  <T s={'Price of "with setup help"'} />
                </label>
                <select id="s-setup" name="setupPrice" value={setupShown} onChange={(e) => setSetupP(e.target.value)}>
                  {room(CONFIG.packages.setupCents).map((c) => (
                    <option key={c} value={c / 100}>
                      {c === 0 ? tx('Not offered') : `$${c / 100} on top of the price`}
                    </option>
                  ))}
                </select>
                <small>
                  <T s={'Your own price for doing the setup for the buyer (their name, logo and colours, or installing and connecting it). Choose "Not offered" if you do not do this.'} />
                </small>
              </div>
              <div className="field">
                <label htmlFor="s-custom">
                  <T s={'Price of "with customisation"'} />
                </label>
                <select id="s-custom" name="customPrice" value={customShown} onChange={(e) => setCustomP(e.target.value)}>
                  {room(CONFIG.packages.customCents).map((c) => (
                    <option key={c} value={c / 100}>
                      {c === 0 ? tx('Not offered') : `$${c / 100} on top of the price`}
                    </option>
                  ))}
                </select>
                <small>
                  <T s={'What you charge to change it to fit the buyer. It is paid into escrow before you start. Choose "Not offered" if you only sell it as it is.'} />
                </small>
              </div>
              <div className="field">
                <label htmlFor="s-express">
                  <T s={'24-hour express delivery (optional)'} />
                </label>
                <select id="s-express" name="express" defaultValue="">
                  <option value="">
                    <T s={'Not offered'} />
                  </option>
                  {Array.from({ length: (CONFIG.delivery.expressMaxCents - CONFIG.delivery.expressMinCents) / 500 + 1 }, (_, k) => CONFIG.delivery.expressMinCents / 100 + k * 5).map((d) => (
                    <option key={d} value={d}>
                      <T s={'Offer it for ${d}'} v={{ d }} />
                    </option>
                  ))}
                </select>
                <small>
                  {fastAlready
                    ? tx('Your delivery time is already within {expressHours} hours, so buyers are not offered express.', { expressHours: CONFIG.delivery.expressHours })
                    : tx('Buyers can pay this extra to get it within {expressHours} hours. You keep it, minus the usual fee. Only choose it if you can really deliver that fast.', {
                        expressHours: CONFIG.delivery.expressHours,
                      })}
                </small>
              </div>
              <div className="field">
                <label htmlFor="s-third">
                  <T s={'Third-party code inside (optional)'} />
                </label>
                <textarea id="s-third" name="third" rows={3} placeholder={tx('One per line, for example:\nDate picker - MIT\nChart helper - GPL-3.0')} />
                <small>
                  <T s={'Licences we know: {v0}. Buyers see a note when a licence comes with conditions.'} v={{ v0: THIRD_PARTY_LICENCES.join(', ') }} />
                </small>
              </div>
              {tagsEnabled && (
                <div className="field">
                  <label htmlFor="s-tags">
                    <T s={'Tags (optional)'} />
                  </label>
                  <input id="s-tags" name="tags" maxLength={400} placeholder={tx('For example: restaurant, online booking, dark theme')} autoComplete="off" />
                  <small>
                    <T s={'Up to {maxTags} short words buyers might search for, separated by commas. Changing tags never sends a listing back to review.'} v={{ maxTags: CONFIG.listing.maxTags }} />
                  </small>
                </div>
              )}
              {dig && (
                <>
                  <div className="field">
                    <label htmlFor="s-reqs">
                      <T s={'What it needs to run{v0}'} v={{ v0: needDemo ? '' : ' (optional)' }} />
                    </label>
                    <textarea
                      id="s-reqs"
                      name="requirements"
                      rows={3}
                      maxLength={CONFIG.listing.requirementsMax}
                      placeholder={tx('For example:\nWordPress 6.4 or newer, PHP 8.1\nNode 20 and an OpenAI key')}
                    />
                    <small>
                      <T s={'Shown to buyers before they pay: versions, accounts or keys they need.'} />
                    </small>
                  </div>
                  <div className="field">
                    <label htmlFor="s-docs">
                      <T s={'Documentation link (optional)'} />
                    </label>
                    <input id="s-docs" name="docsUrl" type="url" placeholder="https://docs.example.com/my-product" />
                    <small>
                      <T s={'A public page with the install steps or the guide. Must start with https.'} />
                    </small>
                  </div>
                  <div className="field">
                    <label htmlFor="s-support">
                      <T s={'Support after purchase'} />
                    </label>
                    <select id="s-support" name="supportDays" defaultValue="0">
                      {CONFIG.listing.periodDays.map((d) => (
                        <option key={d} value={d}>
                          {d === 0 ? tx('None') : `${d} days`}
                        </option>
                      ))}
                    </select>
                    <small>
                      <T s={'How long you answer questions in the order chat. Counted from the purchase. Only promise what you will do.'} />
                    </small>
                  </div>
                  <div className="field">
                    <label htmlFor="s-updates">
                      <T s={'Updates after purchase'} />
                    </label>
                    <select id="s-updates" name="updateDays" defaultValue="0">
                      {CONFIG.listing.periodDays.map((d) => (
                        <option key={d} value={d}>
                          {d === 0 ? tx('None') : `${d} days`}
                        </option>
                      ))}
                    </select>
                    <small>
                      <T s={'How long buyers get the new versions you publish. Counted from the purchase.'} />
                    </small>
                  </div>
                </>
              )}
              {dig && (
                <div className="field">
                  <label htmlFor="s-deliv">
                    <T s={'How the buyer gets it'} />
                  </label>
                  <select id="s-deliv" name="delivery" defaultValue="download">
                    <option value="download">
                      <T s={'Download link to your files'} />
                    </option>
                    <option value="repo_access">
                      <T s={'Invite to a private GitHub repository'} />
                    </option>
                  </select>
                  <small>
                    <T s={"With a repository you invite the buyer's GitHub account after they pay, and they confirm they can open it."} />
                  </small>
                </div>
              )}
              <label style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'start' }}>
                <input type="checkbox" required style={{ accentColor: '#2B3DFF', marginTop: 5 }} />
                <span className="muted">
                  <T s={'I own the rights to sell this, and it has no copied or harmful code.'} />
                </span>
              </label>
              {error && (
                <p role="alert" style={{ color: '#7A2E24', marginTop: 14 }}>
                  {error}
                </p>
              )}
              {busy && (
                <div className="sob-upbar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <i style={{ width: pct + '%' }} />
                  <span>{pct < 100 ? tx('Uploading {pct}%', { pct }) : tx('Opening and checking your site')}</span>
                </div>
              )}
              {missing.length > 0 && (
                <div className="sob-note-box" role="alert">
                  <b>{reviewMessage([]).replace(': .', ':')}</b>
                  <ul>
                    {missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  <small>
                    <T s={'You can still save a draft and finish later.'} />
                  </small>
                </div>
              )}
              {note && (
                <p className="tag" role="status">
                  {note}
                </p>
              )}
              <div className="sob-acts">
                <button className="btn" type="submit" disabled={busy}>
                  <T s={'Check my listing'} />
                </button>
                {!editSlug && (
                  <button className="btn ghost" type="button" disabled={busy} onClick={() => go('draft')}>
                    <T s={'Save draft'} />
                  </button>
                )}
              </div>
            </form>
          </>
        )}
        <aside className="sob-sum">
          <h2 style={{ fontSize: '1.5rem' }}>
            <T s={'What you earn'} />
          </h2>
          <div className="row" style={{ marginTop: 12 }}>
            <span>
              <T s={'Buyer pays'} />
            </span>
            <b>{money(price)}</b>
          </div>
          <div className="row">
            <span>
              <T s={'{BRAND_NAME} commission, {v1} ({planName} plan)'} v={{ BRAND_NAME, v1: percent(commissionBps), planName }} />
            </span>
            <b>{money(fee)}</b>
          </div>
          <div className="row sob-tot">
            <span>
              <T s={'You earn'} />
            </span>
            <span>{money(you)}</span>
          </div>
          <div className="sob-note-box" style={{ marginTop: 20 }}>
            <span>
              <T s={'Paid weekly, 7 days after the buyer accepts. Verify your email, phone and payout account before your first listing goes live.'} />
            </span>
          </div>
          <ul className="sob-checks" style={{ gridTemplateColumns: '1fr', marginTop: 22 }}>
            <li>
              <T s={'Checked for copied content before it goes live'} />
            </li>
            <li>
              <T s={'Sell the same site again and again'} />
            </li>
            <li>
              <T s={'Get extra income from customisation jobs'} />
            </li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
