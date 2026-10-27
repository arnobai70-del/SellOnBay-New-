import { describe, expect, it } from 'vitest';
import { revisionsOf } from '@/lib/cms/history';
import { rollback } from '@/lib/cms/restore';
import { nextRevision, trackedKey, type Revision } from '@/lib/cms/rules';
import { checkDraft, docForPath, licenceVersionLabel, nextDraft, type LegalDoc } from '@/lib/legal/rules';
import { currentLicenceVersion, deleteDraft, legalDoc, publishedLegal, publishLegal, recordReview, saveDraft } from '@/lib/legal/service';
import { LICENCE_TEXT_VERSION } from '@/lib/licenceTiers';
import { savedMenu, saveSite } from '@/lib/site/contentStore';
import { setRobotsExtra } from '@/lib/seo/robotsStore';

describe('CMS history rules (P04)', () => {
  it('knows which settings are kept and refuses others', () => {
    expect(trackedKey('site:menu')).toMatchObject({ kind: 'menu' });
    expect(trackedKey('site:blocks:/faq')).toMatchObject({ kind: 'blocks', path: '/faq' });
    expect(trackedKey('seo:ctl:/templates/saas')).toMatchObject({ kind: 'seo_controls', path: '/templates/saas' });
    expect(trackedKey('page:words:/terms')).toMatchObject({ kind: 'page_words' });
    expect(trackedKey('seo:redirects')).toBeNull(); // has its own log
    expect(trackedKey('site:blocks:faq')).toBeNull(); // not a path
    expect(trackedKey('payments:anything')).toBeNull();
  });
  it('numbers revisions per key; a rollback must name an older, existing revision', () => {
    const h: Revision[] = [1, 2, 3].map((version) => ({ id: String(version), key: 'site:menu', version, value: null, action: 'save', fromVersion: null, changedBy: null, at: version }));
    expect(nextRevision(h, { key: 'site:menu', value: [], action: 'save' })).toEqual({ ok: true, version: 4 });
    expect(nextRevision(h, { key: 'site:menu', value: [], action: 'rollback', fromVersion: 2 })).toEqual({ ok: true, version: 4 });
    expect(nextRevision(h, { key: 'site:menu', value: [], action: 'rollback', fromVersion: 3 })).toMatchObject({ ok: false });
    expect(nextRevision(h, { key: 'site:menu', value: [], action: 'rollback', fromVersion: 9 })).toMatchObject({ ok: false });
    expect(nextRevision([], { key: 'nope', value: 1, action: 'save' })).toMatchObject({ ok: false });
  });
});

describe('CMS history store and rollback', () => {
  it('keeps the built-in state as revision 1, every save after it, and a rollback as a new revision through the same checks', async () => {
    const a = [{ label: 'Pricing', href: '/sell' }];
    const b = [{ label: 'Help', href: '/faq' }];
    expect((await saveSite('admin-1', 'menu', a)).ok).toBe(true);
    expect((await saveSite('admin-1', 'menu', b)).ok).toBe(true);
    const h = await revisionsOf('site:menu');
    expect(h.map((r) => r.version)).toEqual([3, 2, 1]);
    expect(h[2].value).toBeNull(); // the built-in menu
    expect((await rollback('admin-2', 'site:menu', 2)).ok).toBe(true);
    expect((await savedMenu(0))?.[0]?.label).toBe('Pricing');
    const after = await revisionsOf('site:menu');
    expect(after[0]).toMatchObject({ version: 4, action: 'rollback', fromVersion: 2, changedBy: 'admin-2' });
    expect(await rollback('admin-2', 'site:menu', 4)).toMatchObject({ ok: false, status: 409 }); // already current
    expect((await rollback('admin-2', 'site:menu', 1)).ok).toBe(true); // back to the built-in menu
    expect(await savedMenu(0)).toBeNull();
    expect(await rollback('admin-2', 'site:menu', 99)).toMatchObject({ ok: false, status: 404 });
    expect(await rollback('admin-2', 'seo:redirects', 1)).toMatchObject({ ok: false, status: 404 });
  });
  it('a rollback cannot bring back something the setter would now refuse', async () => {
    expect((await setRobotsExtra('admin-1', ['/private-a'])).ok).toBe(true);
    expect((await setRobotsExtra('admin-1', ['/private-b'])).ok).toBe(true);
    const h = await revisionsOf('seo:robots');
    expect(h[0].value).toEqual(['/private-b']);
    expect((await rollback('admin-1', 'seo:robots', h[1].version)).ok).toBe(true);
  });
});

describe('legal documents (P05)', () => {
  it('checks drafts and allows one open draft per document', () => {
    expect(checkDraft({ title: 'Terms', body: 'x'.repeat(30) }).ok).toBe(true);
    expect(checkDraft({ title: 'T', body: 'x'.repeat(30) })).toMatchObject({ ok: false });
    expect(checkDraft({ title: 'Terms', body: 'short' })).toMatchObject({ ok: false });
    expect(checkDraft({ title: 'Terms', body: 'Fine text here <script>alert(1)</script>' })).toMatchObject({ ok: false });
    const d = { docKey: 'terms', status: 'draft', version: 2 } as LegalDoc;
    expect(nextDraft([d], 'terms')).toMatchObject({ ok: false });
    expect(nextDraft([{ ...d, status: 'published' }], 'terms')).toEqual({ ok: true, version: 3 });
    expect(docForPath('/acceptable-use')).toBe('acceptable_use');
    expect(docForPath('/faq')).toBeNull();
    expect(licenceVersionLabel(null, 'built-in')).toBe('built-in');
  });
  it('draft, review, publish; a published version never changes; the next publish retires it', async () => {
    const body = 'These terms apply to every purchase on SellOnBay. [LAWYER REVIEW]';
    const d1 = await saveDraft('content-1', { docKey: 'refunds', title: 'Refund policy', body });
    expect(d1.ok).toBe(true);
    if (!d1.ok) return;
    expect(await saveDraft('content-1', { docKey: 'refunds', title: 'Refund policy', body })).toMatchObject({ ok: false, status: 409 }); // one draft
    expect((await recordReview('super-1', d1.value.id, 'Reviewed by counsel, 2026-11-01')).ok).toBe(true);
    expect((await saveDraft('content-1', { id: d1.value.id, docKey: 'refunds', title: 'Refund policy', body: body + ' Edited.' })).ok).toBe(true);
    expect((await legalDoc(d1.value.id))?.lawyerReviewed).toBe(false); // an edit needs a new review
    expect(await publishLegal('super-1', d1.value.id, '')).toMatchObject({ ok: false, status: 400 });
    expect((await publishLegal('super-1', d1.value.id, 'First published version.')).ok).toBe(true);
    expect((await publishedLegal('refunds'))?.version).toBe(1);
    expect(await saveDraft('content-1', { id: d1.value.id, docKey: 'refunds', title: 'Changed', body })).toMatchObject({ ok: false, status: 409 });
    expect(await deleteDraft('content-1', d1.value.id)).toMatchObject({ ok: false, status: 409 });
    expect(await recordReview('super-1', d1.value.id, 'Reviewed again by counsel')).toMatchObject({ ok: false, status: 409 });
    const d2 = await saveDraft('content-1', { docKey: 'refunds', title: 'Refund policy', body: body + ' Version two.' });
    expect(d2.ok && d2.value.version).toBe(2);
    if (!d2.ok) return;
    expect((await publishLegal('super-1', d2.value.id, 'Second version.')).ok).toBe(true);
    expect((await legalDoc(d1.value.id))?.status).toBe('retired');
    expect((await publishedLegal('refunds', Date.now() + 120_000))?.version).toBe(2);
  });
  it('quotations record the published licence version', async () => {
    expect(await currentLicenceVersion()).toBe(LICENCE_TEXT_VERSION);
    const d = await saveDraft('content-1', { docKey: 'licences', title: 'Licence terms', body: 'Single project, multi project and extended commercial licences. [LAWYER REVIEW]' });
    if (!d.ok) throw new Error(d.error);
    await publishLegal('super-1', d.value.id, 'Licence text v1.');
    expect(await currentLicenceVersion()).toBe('licences-v1');
  });
});

describe('social links (CMS)', () => {
  it('keeps only https links on each network own domains, one per network, and records them in the history', async () => {
    const { cleanSocial } = await import('@/lib/site/social');
    expect(
      cleanSocial('instagram https://instagram.com/sellonbay\nx https://x.com/sellonbay\nfacebook http://facebook.com/a\nyoutube https://evil.example/yt\ninstagram https://instagram.com/other'),
    ).toEqual([
      { network: 'instagram', url: 'https://instagram.com/sellonbay' },
      { network: 'x', url: 'https://x.com/sellonbay' },
    ]);
    expect(cleanSocial([{ network: 'github', url: 'https://user:pw@github.com/x' }])).toEqual([]);
    const { savedSocial } = await import('@/lib/site/contentStore');
    expect(await saveSite('content-1', 'social', 'nonsense')).toMatchObject({ ok: false, status: 400 });
    expect((await saveSite('content-1', 'social', 'linkedin https://www.linkedin.com/company/sellonbay')).ok).toBe(true);
    expect((await savedSocial(0)).map((l) => l.network)).toEqual(['linkedin']);
    expect((await revisionsOf('site:social'))[0]).toMatchObject({ action: 'save' });
  });
});
