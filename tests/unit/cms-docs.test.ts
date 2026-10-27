import { describe, expect, it } from 'vitest';
import { checkEmail, checkFaq, checkHow, faqToText, fillTemplate, howToText, parseFaqText, parseHowText, publishProblem } from '@/lib/cms/docs';
import { discardDraft, draftOf, publishDraft, publishedFaq, publishedOf, saveDraft } from '@/lib/cms/docStore';
import { renderNotification } from '@/lib/cms/emailRender';
import { revisionsOf } from '@/lib/cms/history';
import { rollback } from '@/lib/cms/restore';
import { FAQ_GROUPS, faqToShow } from '@/lib/faq';
import { BUILT_IN_STEPS } from '@/lib/howSteps';

const content = ['content'] as const;
const superS = ['super'] as const;
const faqText =
  '# Buying\nQ: How do I buy a template?\nA: Send a request to buy and accept the quotation.\nIt is paid into escrow first.\n\n# Selling\nQ: What do I keep?\nA: It depends on your plan.';

describe('CMS document rules (pure)', () => {
  it('reads and writes the plain-text editor forms', () => {
    const faq = parseFaqText(faqText);
    expect(faq.groups.map((g) => g.title)).toEqual(['Buying', 'Selling']);
    expect(faq.groups[0].items[0].a).toBe('Send a request to buy and accept the quotation.\nIt is paid into escrow first.');
    expect(checkFaq(faq).ok).toBe(true);
    expect(parseFaqText(faqToText({ groups: FAQ_GROUPS }))).toEqual(JSON.parse(JSON.stringify({ groups: FAQ_GROUPS })));
    expect(parseHowText(howToText(BUILT_IN_STEPS))).toEqual(BUILT_IN_STEPS);
  });
  it('refuses HTML, wrong counts and bad placeholders', () => {
    expect(checkFaq({ groups: [{ title: 'Buying', items: [{ q: 'Is it <b>safe</b>?', a: 'Yes, it is paid into escrow.' }] }] })).toMatchObject({ ok: false });
    expect(checkFaq({ groups: [] })).toMatchObject({ ok: false });
    expect(checkHow({ buy: BUILT_IN_STEPS.buy.slice(0, 2), sell: BUILT_IN_STEPS.sell })).toMatchObject({ ok: false });
    expect(checkEmail({ subject: 'Your order {{title}}', text: 'Hello, {{note}} more text here.' }).ok).toBe(true);
    expect(checkEmail({ subject: 'Your order {{Title!}}', text: 'Hello, more text here.' })).toMatchObject({ ok: false });
  });
  it('fills placeholders with plain values only', () => {
    expect(fillTemplate({ subject: 'Order {{title}}\nX', text: 'Note: {{note}} {{missing}} {{obj}}' }, { title: 'Kit', note: 'ready', obj: { a: 1 } })).toEqual({
      subject: 'Order Kit X',
      text: 'Note: ready  ',
    });
  });
  it('four eyes: the last editor cannot publish their own draft, unless a Super Admin; emails need a Super Admin', () => {
    expect(publishProblem({ name: 'faq', draftEditedBy: 'a', publisher: 'a', publisherScopes: content })).toMatch(/Another admin/);
    expect(publishProblem({ name: 'faq', draftEditedBy: 'a', publisher: 'b', publisherScopes: content })).toBeNull();
    expect(publishProblem({ name: 'faq', draftEditedBy: 'a', publisher: 'a', publisherScopes: superS })).toBeNull();
    expect(publishProblem({ name: 'email:order_funded', draftEditedBy: 'a', publisher: 'b', publisherScopes: content })).toMatch(/Super/);
    expect(publishProblem({ name: 'faq', draftEditedBy: 'a', publisher: 'b', publisherScopes: ['finance'] })).toMatch(/cannot publish/);
  });
});

describe('CMS documents: draft, publish, history, rollback', () => {
  it('a draft changes nothing public until another admin publishes it; the publish is kept and can be rolled back', async () => {
    expect(await saveDraft('fin-1', ['finance'], 'faq', parseFaqText(faqText))).toMatchObject({ ok: false, status: 403 });
    expect((await saveDraft('c-1', content, 'faq', parseFaqText(faqText))).ok).toBe(true);
    expect(await publishedFaq()).toBeNull();
    expect(faqToShow(null).groups).toBe(FAQ_GROUPS);
    expect(await publishDraft('c-1', content, 'faq')).toMatchObject({ ok: false, status: 403 });
    expect((await publishDraft('c-2', content, 'faq')).ok).toBe(true);
    expect(await draftOf('faq')).toBeNull();
    expect((await publishedOf('faq', true))?.version).toBe(1);
    expect(faqToShow((await publishedOf<{ groups: typeof FAQ_GROUPS }>('faq', true))!.data.groups).selling[0].q).toBe('What do I keep?');
    // a second version, then roll back to the first
    const v2 = parseFaqText(faqText.replace('What do I keep?', 'What does SellOnBay keep?'));
    await saveDraft('c-1', content, 'faq', v2);
    await publishDraft('s-1', superS, 'faq');
    const h = await revisionsOf('cms:doc:faq');
    expect(h[0].version).toBeGreaterThan(h[h.length - 1].version);
    const first = h.find((r) => JSON.stringify(r.value).includes('What do I keep?'))!;
    expect((await rollback('c-3', 'cms:doc:faq', first.version)).ok).toBe(true);
    expect(JSON.stringify((await publishedOf('faq', true))?.data)).toContain('What do I keep?');
    expect(await discardDraft('c-1', content, 'faq')).toMatchObject({ ok: false, status: 404 });
  });
  it('a published email template replaces the built-in words; without one the built-in words are used', async () => {
    const before = await renderNotification('order_funded', { title: 'Shop kit' });
    expect(before?.subject).toBeTruthy();
    await saveDraft('c-1', content, 'email:order_funded', { subject: 'Payment checked: {{title}}', text: 'Your payment for {{title}} is checked. SellOnBay will release it soon.' });
    expect(await publishDraft('c-2', content, 'email:order_funded')).toMatchObject({ ok: false, status: 403 }); // Super Admin only
    expect((await publishDraft('s-1', superS, 'email:order_funded')).ok).toBe(true);
    expect(await renderNotification('order_funded', { title: 'Shop kit' })).toEqual({
      subject: 'Payment checked: Shop kit',
      text: 'Your payment for Shop kit is checked. SellOnBay will release it soon.',
    });
    expect(await renderNotification('order_delivered', { title: 'Shop kit' })).not.toBeNull(); // other kinds untouched
  });
});
