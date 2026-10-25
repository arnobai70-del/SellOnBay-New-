import { platformOf } from '../apps';
import { BUGFIX_DAYS, REVIEW_HOURS } from '../config';
import type { Product } from '../data';
import { LICENCES } from '../licences';
import { periodText } from '../productInfo';

/*
 * The questions a buyer asks about one listing, answered from that listing's own saved facts and the shop's rules (lib/config.ts), never invented:
 * what comes with it, how long delivery takes, whether it can be seen first, how payment is held, what if it does not work, the extras the seller
 * offers, and what is special to its kind (a website's domain, an app's store account, a digital product's licence and support).
 * They show on the listing's page until an admin saves questions of their own there (SEO and CMS > Edit page), which replace them.
 * Pure, so it is tested. The same list is what the admin editor offers as a starting point.
 */
export type FaqItem = { q: string; a: string };

const day = (n: number) => (n === 1 ? '1 day' : `${n} days`);
const list = (items: string[]) => items.map((x) => x.replace(/[.\s]+$/, '')).join(', ');

export function productFaqs(p: Product): FaqItem[] {
  const pl = platformOf(p);
  const out: FaqItem[] = [];

  if (p.inc.length) out.push({ q: `What do I get with ${p.name}?`, a: `${list(p.inc)}.` });

  if (pl === 'digital') {
    out.push({ q: 'How do I get the files?', a: 'You download them through a private link as soon as your payment is held in escrow. The link expires after 24 hours and you can ask for a new one.' });
  } else {
    out.push({
      q: 'How long does delivery take?',
      a: `The seller delivers within ${day(p.days)} of your payment.${p.express ? ` The seller also offers 24-hour express delivery for $${p.express}.` : ''}`,
    });
  }

  if (p.demo || p.sample) {
    out.push({
      q: 'Can I see it before I buy?',
      a: p.demo
        ? `Yes. Open the preview on this page${p.sample ? ', and the free sample the seller shares' : ''}, and look at the real thing before you pay.`
        : 'Yes. The seller shares a free sample you can open before you pay.',
    });
  }

  out.push({
    q: 'How does payment work?',
    a: `Your payment is held in escrow, not paid to the seller. You have ${REVIEW_HOURS} hours to check what you got. If you accept, or the time runs out, the seller is paid.`,
  });
  out.push({
    q: 'What if it does not work as described?',
    a: `Open a dispute with your evidence and the seller can fix it first. Refunds are decided case by case for products that are not as described, do not work, carry harmful code or copy someone else's work. A bug that shows up in the first ${BUGFIX_DAYS} days is fixed for free.`,
  });

  if (pl === 'web') {
    out.push({ q: 'Will it work on my own domain?', a: 'Yes. You give us your domain, or buy one here, and the seller puts the site live on it with your name and words.' });
  }
  if (pl === 'android' || pl === 'ios') {
    const store = pl === 'android' ? 'Google Play' : 'the App Store';
    out.push({
      q: 'Who publishes the app?',
      a: `The app is published under your own developer account on ${store}. The seller sends a test build first. ${store === 'the App Store' ? 'Apple' : 'Google'} decides whether to approve it, which can take longer than delivery and is not guaranteed.`,
    });
  }
  if (pl === 'webapp' || pl === 'desktop') {
    out.push({
      q: pl === 'webapp' ? 'How is the web app set up?' : 'What do I receive?',
      a:
        pl === 'webapp'
          ? 'The seller sends you a private test link and deploys it on your domain. Hosting is an extra.'
          : 'You receive installers for the systems you choose. Signing and store accounts are your own.',
    });
  }

  const extras: string[] = [];
  if (p.setupPrice && p.setupPrice > 0) extras.push(`setup help for $${p.setupPrice}`);
  if (p.customPrice && p.customPrice > 0) extras.push(`customisation for $${p.customPrice}`);
  if (extras.length) out.push({ q: 'Can the seller set it up or change it for me?', a: `Yes. The seller offers ${extras.join(' and ')}, paid into escrow before the work starts.` });

  if (pl === 'digital') {
    const parts: string[] = [];
    if (p.supportDays !== undefined && p.updateDays !== undefined)
      parts.push(`Support lasts ${periodText(p.supportDays).toLowerCase()} and updates last ${periodText(p.updateDays).toLowerCase()} from your purchase.`);
    if (p.requirements) parts.push(`It needs: ${p.requirements.replace(/[.\s]+$/, '')}.`);
    if (parts.length) out.push({ q: 'What do I need, and how long are support and updates?', a: parts.join(' ') });
  }
  if (p.licence && LICENCES[p.licence]) out.push({ q: 'What licence comes with it?', a: `${LICENCES[p.licence].label}: ${LICENCES[p.licence].terms}` });

  return out;
}
