import { NextResponse } from 'next/server';
import { type ThemeKey } from '@/lib/data';
import { WEB_CATS, isWebCat } from '@/lib/webCategories';
import { NEEDS_DEMO, NEEDS_RELEASE, catsFor, toolsFor } from '@/lib/apps';
import { DemoZipError, LIMITS, openDemoZip } from '@/lib/demoZip';
import { removeDemo, saveDemo } from '@/lib/demoStore';
import { limit } from '@/lib/rateLimit';
import { flags } from '@/lib/flags';
import { missingForReview, reviewMessage } from '@/lib/listingRules';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { CONFIG } from '@/lib/config';
import { DEFAULT_LICENCE, isLicenceType, parseThirdParty } from '@/lib/licences';
import { listingFieldsSchema } from '@/lib/schemas';
import { idParam, parseWith } from '@/lib/validate';
import { cannotAct } from '@/lib/accounts';
import { guard } from '@/lib/guard';
import { getSettings } from '@/lib/settings';
import { audit } from '@/lib/admin/audit';
import { FUNDED_STATES } from '@/lib/orders/machine';
import { maintenanceFor } from '@/lib/maintenance/service';
import { forgetLiveProducts } from '@/lib/catalog';

export const runtime = 'nodejs';
export const maxDuration = 60;

const THEME: Record<string, ThemeKey> = {
  'E-commerce Templates': 'store',
  'SaaS & Startup Templates': 'saas',
  'Portfolio & Agency Templates': 'portfolio',
  Restaurants: 'restaurant',
  Health: 'clinic',
  Portfolios: 'portfolio',
  Stores: 'store',
  'Landing pages': 'saas',
  'Real estate': 'estate',
  Tools: 'tool',
};
const MAX_SHOT = 4 * 1024 * 1024;

/* The file's real type, from its first bytes, never from its name or the type the browser claims. */
function sniffImage(b: Uint8Array): { ext: string; type: string } | null {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', type: 'image/png' };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return { ext: 'webp', type: 'image/webp' };
  return null;
}
/* A listing the seller may change after sending it. Every change sends it back to review. */
const EDITABLE = ['in_review', 'live', 'rejected', 'paused'];
const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });
const isHttps = (v: string) => {
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'site';

/* A seller creates a listing, optionally with a zip of the site to host. New listings start in review and only the owner and admins can see them until approved. */
export async function POST(req: Request) {
  const closed = await maintenanceFor('upload'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return fail('Sign in first.', 401);

  const { data: me } = await sb.from('profiles').select('role, banned, suspended_until').eq('id', user.id).single();
  if (!me || cannotAct(me)) return fail('This account cannot list sites.', 403);
  if (me.role === 'buyer') return fail('Only seller accounts can list sites. Create a seller account to continue.', 403);
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') return fail('Enter your authenticator code first.', 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail('That upload could not be read.');
  }
  const text = (k: string) => String(form.get(k) ?? '').trim();
  const fields = parseWith(listingFieldsSchema, {
    platform: text('platform') || 'web',
    stack: text('stack'),
    name: text('name'),
    category: text('category'),
    desc: text('desc'),
    license: text('license'),
    demo: text('demo'),
    code: text('code'),
    sample: text('sample'),
    inc: text('inc'),
    price: text('price'),
    days: text('days'),
    clean: text('clean'),
    release: text('release'),
    licenceType: text('licenceType'),
    third: text('third'),
    delivery: text('delivery'),
    express: text('express'),
    docsUrl: text('docsUrl'),
    requirements: text('requirements'),
    supportDays: text('supportDays'),
    updateDays: text('updateDays'),
    setupPrice: text('setupPrice'),
    customPrice: text('customPrice'),
  });
  if (!fields.ok) return fields.res;

  const platform = fields.data.platform;
  const isApp = platform !== 'web';
  const stack = text('stack');
  const name = text('name'),
    category = text('category'),
    desc = text('desc'),
    license = text('license');
  const demoUrl = text('demo'),
    codeUrl = text('code');
  // Optional extras for digital products. A free sample is a public link; a trial copy is private and only handed out when the trial switch is on.
  // Licence, third-party code and how the product is handed over.
  const licenceType = isLicenceType(fields.data.licenceType) ? fields.data.licenceType : DEFAULT_LICENCE;
  const thirdParty = parseThirdParty(fields.data.third ?? '');
  const deliveryType = platform === 'digital' && fields.data.delivery === 'repo_access' ? 'repo_access' : null;
  // Optional 24-hour express delivery: a whole-dollar price between the limits in lib/config.ts.
  const expressDollars = Math.round(Number(fields.data.express ?? ''));
  const expressOk = Number.isFinite(expressDollars) && expressDollars * 100 >= CONFIG.delivery.expressMinCents && expressDollars * 100 <= CONFIG.delivery.expressMaxCents;
  if (fields.data.express && !expressOk) return fail(`Express delivery costs $${CONFIG.delivery.expressMinCents / 100} to $${CONFIG.delivery.expressMaxCents / 100}.`);
  const expressCents = fields.data.express && expressOk ? expressDollars * 100 : null;
  // What a buyer of a digital product is told up front: documentation, what it needs, and how long support and updates last (from the purchase).
  const dig = platform === 'digital';
  const docsUrl = dig ? text('docsUrl') : '';
  const requirements = dig ? text('requirements').slice(0, CONFIG.listing.requirementsMax) : '';
  const period = (v: string) => (CONFIG.listing.periodDays.includes(Number(v)) ? Number(v) : 0);
  const supportDays = dig ? period(text('supportDays')) : 0;
  const updateDays = dig ? period(text('updateDays')) : 0;
  // What the seller charges on top for setup help and customisation: one of the allowed amounts (0 = not offered), else the default.
  const price = Math.round(Number(text('price')));
  const lim = await getSettings();
  const pick = (v: string, list: readonly number[], fallback: number) => (v !== '' && list.includes(Number(v) * 100) ? Number(v) * 100 : fallback);
  const fits = (cents: number) => Math.round(price) * 100 + cents <= lim.priceMaxCents;
  const given = (k: string) => text(k) !== '';
  let setupCents = pick(text('setupPrice'), CONFIG.packages.setupCents, CONFIG.packages.defaultSetupCents);
  let customCents = pick(text('customPrice'), CONFIG.packages.customCents, CONFIG.packages.defaultCustomCents);
  // Not chosen by the seller and too big for the price range: simply not offered. Chosen by the seller and too big: they are told.
  if (!given('setupPrice') && !fits(setupCents)) setupCents = 0;
  if (!given('customPrice') && !fits(customCents)) customCents = 0;
  const sampleRaw = platform === 'digital' && flags.freeSample ? text('sample') : '';
  // The trial copy is a SEPARATE cut-down file the seller uploads. We never trim the real file ourselves.
  const trialAllowed = platform === 'digital' && flags.trialCopy && NEEDS_DEMO.includes(category);
  const trialInput = form.get('trialFile');
  const trialFile = trialAllowed && trialInput instanceof File && trialInput.size > 0 ? trialInput : null;
  const trialExt = trialFile ? (trialFile.name.split('.').pop() ?? '').toLowerCase() : '';
  // Delivery days: a number from the form (1 to 7); older forms sent words such as "1 to 2 days".
  const dRaw = text('days');
  const dNum = dRaw.startsWith('1 to ') ? Number(dRaw.slice(5, 6)) : parseInt(dRaw, 10);
  const days = Number.isInteger(dNum) ? Math.min(CONFIG.delivery.maxDays, Math.max(CONFIG.delivery.minDays, dNum)) : 3;
  const includes = text('inc')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((l) => l.slice(0, 120));
  const zip = form.get('zip');
  const shotFiles = form.getAll('shots').filter((f): f is File => f instanceof File && f.size > 0);

  const intent = text('intent') === 'draft' ? 'draft' : 'review';
  const draftSlug = text('draft');

  if (intent === 'draft') {
    // Soft save: only a name is needed. Files are not kept in drafts, and nothing here is shown to buyers.
    if (name.length < 3 || name.length > 60) return fail('Give your draft a name of 3 to 60 characters so you can find it later.');
    if (!(await limit(`draft:${user.id}`, 40, 60 * 60_000))) return fail('You are saving drafts very fast. Try again in a minute.', 429);
    const admin = createAdminClient();
    const cats = isApp ? catsFor(platform) : WEB_CATS;
    const row = {
      seller_id: user.id,
      name,
      category: cats.includes(category) ? category : cats[0],
      tagline: category,
      description: desc.slice(0, 600) || 'Draft',
      includes,
      theme: isApp ? 'bio' : (THEME[category] ?? 'bio'),
      platform,
      app_stack: isApp && toolsFor(platform).includes(stack) ? stack : null,
      price_cents: Math.min((await getSettings()).priceMaxCents, Math.max((await getSettings()).priceMinCents, (price || 39) * 100)),
      delivery_days: days,
      demo_url: isHttps(demoUrl) ? demoUrl : 'about:blank',
      code_url: isHttps(codeUrl) ? codeUrl : 'about:blank',
      sample_url: isHttps(sampleRaw) ? sampleRaw : null,
      licence_type: licenceType,
      third_party: thirdParty,
      delivery_type: deliveryType,
      express_price_cents: expressCents,
      docs_url: isHttps(docsUrl) ? docsUrl : null,
      requirements: requirements || null,
      support_days: supportDays,
      update_days: updateDays,
      setup_price_cents: setupCents,
      custom_price_cents: customCents,
      license: license || 'I wrote all of it',
      status: 'draft',
    };
    if (draftSlug) {
      const { data: upd } = await admin.from('products').update(row).eq('slug', draftSlug).eq('seller_id', user.id).eq('status', 'draft').select('slug');
      if (upd?.length) return NextResponse.json({ ok: true, draft: true, slug: draftSlug });
    }
    for (let i = 0; i < 4; i++) {
      const slug = `draft-${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
      const { error } = await admin.from('products').insert({ ...row, slug });
      if (!error) return NextResponse.json({ ok: true, draft: true, slug });
      if (!/duplicate|unique/i.test(error.message)) break;
    }
    return fail('Could not save the draft. Try again.', 500);
  }

  // Editing a listing that was already sent: the seller's own, not a draft. Its saved files count unless new ones are sent.
  const editSlug = text('edit');
  let editing: {
    id: string;
    status: string;
    demo_path: string | null;
    app_shots: string[] | null;
    demo_url: string;
    code_url: string;
    sample_url: string | null;
    docs_url: string | null;
    delivery_type: string | null;
  } | null = null;
  if (editSlug) {
    const { data: ex } = await createAdminClient()
      .from('products')
      .select('id, status, platform, demo_path, app_shots, demo_url, code_url, sample_url, docs_url, delivery_type')
      .eq('slug', editSlug)
      .eq('seller_id', user.id)
      .in('status', EDITABLE)
      .maybeSingle();
    if (!ex) return fail('That listing was not found.', 404);
    if (ex.platform !== platform) return fail('The kind of product cannot be changed. List it again as a new product instead.');
    editing = ex;
  }
  const keptShots = editing?.app_shots?.length ?? 0;
  const keptZip = !!editing?.demo_path && !isApp;

  // Submit for review: everything the listing needs, said in one clear sentence.
  const hasZipFile = (!isApp && zip instanceof File && zip.size > 0) || keptZip;
  const missing = missingForReview({
    kind: platform,
    name,
    category,
    desc,
    includes,
    demoLink: demoUrl,
    hasZip: hasZipFile,
    shots: shotFiles.length || keptShots,
    codeUrl,
    clean: text('clean') === 'on',
    release: text('release') === 'on',
    requirements,
    docsUrl,
  });
  if (missing.length) return fail(reviewMessage(missing), 422, { missing });

  if (sampleRaw && !isHttps(sampleRaw)) return fail('The free sample link must start with https.');
  if (trialFile && !['zip', 'pdf', 'txt', 'md', 'json', 'csv'].includes(trialExt)) return fail('The trial copy must be a zip, pdf, txt, md, json or csv file.');
  if (trialFile && trialFile.size > CONFIG.trialCopy.maxFileMb * 1024 * 1024) return fail(`The trial copy file can be at most ${CONFIG.trialCopy.maxFileMb} MB.`);
  const trialBytes = trialFile ? new Uint8Array(await trialFile.arrayBuffer()) : null;
  if (name.length < 3 || name.length > 60) return fail('Give the site a name of 3 to 60 characters.');
  if (isApp ? !catsFor(platform).includes(category) : !isWebCat(category)) return fail('Pick a category.');
  if (isApp && !toolsFor(platform).includes(stack)) return fail(platform === 'digital' ? 'Say what the product is made for.' : 'Say what the app is built with.');
  if (platform === 'digital' && NEEDS_DEMO.includes(category) && !(demoUrl && isHttps(demoUrl)))
    return fail('Add a demo link (a short video, a view-only link or a sample result) so buyers can see it working.');
  if (platform === 'digital' && text('clean') !== 'on') return fail('Confirm that the files are clean and yours to sell.');
  if (platform === 'digital' && NEEDS_RELEASE.includes(category) && text('release') !== 'on') return fail('Confirm that you hold the licences and signed releases for everything the files show.');
  if (desc.length < 20 || desc.length > 600) return fail('Describe the site in 20 to 600 characters.');
  if (!(price * 100 >= lim.priceMinCents && price * 100 <= lim.priceMaxCents)) return fail(`Price must be between $${lim.priceMinCents / 100} and $${lim.priceMaxCents / 100} for now.`);
  if (!fits(setupCents) || !fits(customCents))
    return fail(`The price plus your setup help or customisation price must stay under $${lim.priceMaxCents / 100} for now. Lower the price or choose a smaller setup or customisation price.`);
  if (!codeUrl || !isHttps(codeUrl)) return fail('Add a private link to your code (https).');
  if (demoUrl && !isHttps(demoUrl)) return fail('The live demo link must start with https.');
  if (!license) return fail('Choose a license.');
  const hasZip = !isApp && zip instanceof File && zip.size > 0;
  if (!isApp && !hasZip && !keptZip && !demoUrl) return fail('Upload your site as a zip, or add a live demo link.');
  if (shotFiles.length > CONFIG.listing.maxShots) return fail(`Add at most ${CONFIG.listing.maxShots} screenshots.`);
  if (hasZip && (zip as File).size > LIMITS.zipBytes) return fail(`The zip is larger than ${LIMITS.zipBytes / 1024 / 1024} MB.`);

  // Check every screenshot BEFORE anything is created, by its real bytes.
  const checked: { bytes: Uint8Array; ext: string; type: string }[] = [];
  for (const f of shotFiles) {
    if (f.size > MAX_SHOT) return fail(`${f.name} is larger than 4 MB.`);
    const bytes = new Uint8Array(await f.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) return fail(`${f.name} is not a PNG, JPG or WebP picture.`);
    checked.push({ bytes, ...kind });
  }

  // Only a listing that passed the cheap checks counts against the limit; opening a zip and storing files is the costly part.
  // An edit is not a new listing: it has its own, looser limit.
  if (editing) {
    if (!(await limit(`edit:${user.id}`, 20, 60 * 60_000))) return fail('You are sending changes very fast. Try again in a few minutes.', 429);
  } else {
    const g = await guard('listing', user.id);
    if (!g.ok) return fail(g.error, g.status);
  }

  // Open and check the zip BEFORE anything is created, so a bad upload leaves nothing behind.
  let opened: ReturnType<typeof openDemoZip> | null = null;
  if (hasZip) {
    try {
      opened = openDemoZip(new Uint8Array(await (zip as File).arrayBuffer()));
    } catch (e) {
      return fail(e instanceof DemoZipError ? e.message : 'That zip could not be opened.');
    }
  }

  const admin = createAdminClient();
  let productId = '',
    slug = '';
  const row = {
    name,
    category,
    tagline: category,
    description: desc,
    includes: includes,
    theme: isApp ? 'bio' : (THEME[category] ?? 'bio'),
    platform,
    app_stack: isApp ? stack : null,
    price_cents: price * 100,
    delivery_days: days,
    demo_url: isApp ? (platform === 'digital' && demoUrl ? demoUrl : 'about:blank') : demoUrl || 'about:blank',
    code_url: codeUrl,
    sample_url: sampleRaw || null,
    licence_type: licenceType,
    third_party: thirdParty,
    delivery_type: deliveryType,
    express_price_cents: expressCents,
    docs_url: docsUrl || null,
    requirements: requirements || null,
    support_days: supportDays,
    update_days: updateDays,
    setup_price_cents: setupCents,
    custom_price_cents: customCents,
    license,
    status: 'in_review' as const,
  };
  // An edit that changes a link or a file goes back to review (buyers cannot buy it until it is approved again): that is where harm could hide.
  // Text, prices and options are saved at once and a live listing stays live (still scanned below). A paused listing stays paused; a rejected one is reviewed again.
  const linksOrFiles =
    !!editing &&
    (row.demo_url !== editing.demo_url ||
      row.code_url !== editing.code_url ||
      row.sample_url !== editing.sample_url ||
      row.docs_url !== editing.docs_url ||
      row.delivery_type !== editing.delivery_type ||
      hasZip ||
      checked.length > 0 ||
      !!trialFile);
  // A paused listing was stopped by an admin or a report: sending it back to review would get around that, so only text edits are saved until it is reopened.
  if (editing?.status === 'paused' && linksOrFiles) return fail('This listing is paused. You can change its text and prices now; links and files can be changed once it is reopened.', 409);
  // Buyers who paid already download the file behind code_url: changing it under them would swap what they bought.
  if (editing && (row.code_url !== editing.code_url || row.delivery_type !== editing.delivery_type)) {
    const { count } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', editing.id)
      .in('status', [...FUNDED_STATES]);
    if (count === null || count > 0)
      return fail(
        platform === 'digital'
          ? 'Buyers already have the files of this listing. To give them new files, publish a new version from your seller dashboard; it is reviewed before buyers get it.'
          : 'Buyers already have the files of this listing, so the files link and delivery cannot change. List the new files as a new product instead.',
        409,
      );
  }
  const editStatus = editing && !linksOrFiles && (editing.status === 'live' || editing.status === 'paused') ? editing.status : 'in_review';
  if (editing) {
    const { error } = await admin
      .from('products')
      .update({ ...row, status: editStatus })
      .eq('id', editing.id)
      .eq('seller_id', user.id);
    if (error) return fail('Could not save your changes. Try again.', 500);
    productId = editing.id;
    slug = editSlug;
    await audit(user.id, 'listing_edited', 'product', editSlug, { name, review: editStatus === 'in_review' });
  }
  for (let i = 0; i < 4 && !productId; i++) {
    slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await admin
      .from('products')
      .insert({ ...row, slug, seller_id: user.id })
      .select('id')
      .single();
    if (data) productId = data.id;
    else if (error && !/duplicate|unique/i.test(error.message)) return fail('Could not save the listing. Try again.', 500);
  }
  if (!productId) return fail('Could not save the listing. Try again.', 500);
  // A failed upload never deletes a listing that already existed.
  const undo = async () => {
    if (!editing) await admin.from('products').delete().eq('id', productId);
  };

  if (trialFile) {
    const tpath = `trial/${productId}/trial.${trialExt}`;
    const { error: terr } = await admin.storage.from('demos').upload(tpath, trialBytes!, { contentType: 'application/octet-stream', upsert: true });
    if (terr) {
      await undo();
      return fail('The trial copy could not be stored. Nothing was saved, please try again.', 500);
    }
    await admin
      .from('products')
      .update({ trial_url: `storage:${tpath}` })
      .eq('id', productId);
  }
  if (opened) {
    try {
      await saveDemo(admin, productId, opened.files);
      await admin.from('products').update({ demo_path: productId, demo_entry: opened.entry, demo_files: opened.count, demo_bytes: opened.bytes }).eq('id', productId);
    } catch {
      if (!editing) await removeDemo(admin, productId).catch(() => {});
      await undo();
      return fail('The site files could not be stored. Nothing was saved, please try again.', 500);
    }
  }
  if (checked.length) {
    const names: string[] = [];
    try {
      for (let i = 0; i < checked.length; i++) {
        const n = `shots/${i + 1}.${checked[i].ext}`;
        const { error } = await admin.storage.from('demos').upload(`${productId}/${n}`, checked[i].bytes, { contentType: checked[i].type, upsert: true });
        if (error) throw new Error(error.message);
        names.push(n);
      }
      // A website keeps its own demo (zip or link): its pictures are only added beside it.
      await admin
        .from('products')
        .update(isApp ? { demo_path: productId, app_shots: names, demo_files: names.length } : { app_shots: names })
        .eq('id', productId);
    } catch {
      if (!editing) await removeDemo(admin, productId).catch(() => {});
      await undo();
      return fail('The screenshots could not be stored. Nothing was saved, please try again.', 500);
    }
    if (draftSlug) await admin.from('products').delete().eq('slug', draftSlug).eq('seller_id', user.id).eq('status', 'draft');
    if (editing) forgetLiveProducts(); // an edit of a live listing shows on the shelves at once on this copy
    return NextResponse.json({
      ok: true,
      slug,
      hosted: !isApp && (!!opened || keptZip),
      files: isApp ? names.length : (opened?.count ?? 0),
      edited: !!editing,
      status: editing ? editStatus : 'in_review',
    });
  }
  if (draftSlug) await admin.from('products').delete().eq('slug', draftSlug).eq('seller_id', user.id).eq('status', 'draft');
  if (editing) forgetLiveProducts();
  return NextResponse.json({ ok: true, slug, hosted: !!opened || keptZip, files: opened?.count ?? 0, edited: !!editing, status: editing ? editStatus : 'in_review' });
}

/* The seller opens one of their own drafts, or (with ?edit=) a listing they already sent, to change it. */
export async function GET(req: Request) {
  const closed = await maintenanceFor('upload'); // module maintenance (lib/maintenance)
  if (closed) return closed;
  const q = new URL(req.url).searchParams;
  const isEdit = q.has('edit');
  const d = idParam.safeParse(q.get(isEdit ? 'edit' : 'draft') ?? '');
  const slug = d.success ? d.data : '';
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return fail('Sign in first.', 401);
  // The answer holds the private files link: the same authenticator code as saving a listing.
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== 'aal2') return fail('Enter your authenticator code first.', 403);
  const { data: p } = await createAdminClient()
    .from('products')
    .select(
      'name, category, description, includes, platform, app_stack, price_cents, delivery_days, demo_url, code_url, license, sample_url, licence_type, third_party, delivery_type, express_price_cents, docs_url, requirements, support_days, update_days, setup_price_cents, custom_price_cents, status, demo_path, app_shots',
    )
    .eq('slug', slug)
    .eq('seller_id', user.id)
    .in('status', isEdit ? EDITABLE : ['draft'])
    .maybeSingle();
  if (!p) return fail(isEdit ? 'Listing not found.' : 'Draft not found.', 404);
  const clear = (v: string) => (v === 'about:blank' ? '' : v);
  return NextResponse.json({
    platform: p.platform,
    name: p.name,
    category: p.category,
    desc: p.description === 'Draft' ? '' : p.description,
    includes: (p.includes ?? []).join('\n'),
    stack: p.app_stack ?? '',
    price: p.price_cents / 100,
    days: p.delivery_days,
    demo: clear(p.demo_url),
    code: clear(p.code_url),
    sample: p.sample_url ?? '',
    licenceType: p.licence_type ?? '',
    third: (Array.isArray(p.third_party) ? (p.third_party as { name: string; licence: string }[]) : []).map((t) => `${t.name} - ${t.licence}`).join('\n'),
    delivery: p.delivery_type ?? '',
    express: p.express_price_cents ? String(Math.round(p.express_price_cents / 100)) : '',
    docsUrl: p.docs_url ?? '',
    requirements: p.requirements ?? '',
    supportDays: String(p.support_days ?? 0),
    updateDays: String(p.update_days ?? 0),
    setupPrice: String(Math.round((p.setup_price_cents ?? CONFIG.packages.defaultSetupCents) / 100)),
    customPrice: String(Math.round((p.custom_price_cents ?? CONFIG.packages.defaultCustomCents) / 100)),
    license: p.license,
    status: p.status,
    keptZip: !!p.demo_path && p.platform === 'web',
    keptShots: (p.app_shots ?? []).length,
  });
}
