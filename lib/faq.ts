import { tx } from './i18n/tx'; // marks English words; the screen translates them
import { CONFIG, PAYOUT_HOLD_DAYS, PLAN_FEE_TEXT, REVIEW_HOURS } from './config';
/*
 * One source for every built-in FAQ on the site, in line with the SellOnBay 2.0 rules (request -> quotation -> payment checked -> release
 * approved -> files). An admin can replace it in Admin > CMS (lib/cms); this text shows until a version is published there.
 */
export type Faq = { q: string; a: string };
export type FaqGroup = { title: string; items: Faq[] };

export const FAQ_GROUPS: FaqGroup[] = [
  {
    title: tx('Buying a site'),
    items: [
      {
        q: tx('Do I need to know how to code?'),
        a: tx('No. Choose a website and send a request to buy. SellOnBay sends you a quotation with the price and the terms, and the seller sets it up for you.'),
      },
      { q: tx('Who owns the domain?'), a: tx('You do. The domain is registered in your name, and you can move it any time.') },
      {
        q: tx('How long does it take?'),
        a: tx('Each listing says how long the setup takes. The time starts once your payment has been checked. Your quotation shows the exact time before you pay.'),
      },
      {
        q: tx('Can I change how it looks?'),
        a: tx('Yes. Ask SellOnBay in your order. Changes and extra work are quoted first and paid into escrow before the work starts. Faults in what was delivered are fixed free.'),
      },
    ],
  },
  {
    title: tx('Money and safety'),
    items: [
      {
        q: tx('What if the site does not match the demo?'),
        a: tx("Don't accept it. Open a dispute and our team reviews the delivery log, the messages and the live site. If it doesn't match the listing, you get a refund."),
      },
      {
        q: tx('Can I get a refund after I accept?'),
        a: `Accepting makes the order final, so check carefully during your ${REVIEW_HOURS}-hour review. Problems with security, copyright or a site that stops working are still covered by our bug-fix guarantee for 7 days.`,
      },
      {
        q: tx('When do I get the source files?'),
        a: `After your payment has been checked and SellOnBay has approved the release (we aim for ${CONFIG.release.slaHours} hours, every day). You download them through a private link that expires after 24 hours; you can ask for a new one any time.`,
      },
      {
        q: tx('Why do messages go through SellOnBay?'),
        a: tx(
          'Buyers and sellers do not message each other directly. Write to SellOnBay on your order and we pass on what is needed. Emails, phone numbers and outside payment requests are blocked, because payments made outside are not protected.',
        ),
      },
    ],
  },
  {
    title: tx('Selling a site'),
    items: [
      { q: tx('How do sellers get paid?'), a: `Every week we pay out the earnings that buyers accepted at least ${PAYOUT_HOLD_DAYS} days ago, to the payout method you choose in your dashboard.` },
      {
        q: tx('What does SellOnBay charge?'),
        a: `A commission set by your plan: ${PLAN_FEE_TEXT}. It applies to sales, custom work, extra work and paid revisions. Buyers pay no service fee. Domains and hosting are optional extras.`,
      },
      {
        q: tx('Can I sell the same site again and again?'),
        a: tx('Yes, that is the idea. Each buyer gets their own licence and you keep ownership. Buyers may not resell or share your source code.'),
      },
      { q: tx('How are listings checked?'), a: tx('We review the listing, check your files in a private quarantine, and make sure the demo works before it goes live.') },
    ],
  },
];

export const TOP_FAQ: Faq[] = [FAQ_GROUPS[1].items[0], FAQ_GROUPS[1].items[3], FAQ_GROUPS[2].items[1]];

/* The FAQ the site shows: the version published in Admin > CMS, else the built-in one. Pure: the caller passes what was published. */
export function faqToShow(published: FaqGroup[] | null): { groups: FaqGroup[]; top: Faq[]; selling: Faq[] } {
  if (!published?.length) return { groups: FAQ_GROUPS, top: TOP_FAQ, selling: FAQ_GROUPS[2].items };
  const selling = published.find((g) => /sell/i.test(g.title))?.items ?? published[published.length - 1].items;
  return { groups: published, top: published.flatMap((g) => g.items).slice(0, 3), selling };
}
