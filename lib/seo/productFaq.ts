import { platformOf } from '../apps';
import { BUGFIX_DAYS, REVIEW_HOURS } from '../config';
import type { Product } from '../data';
import { LICENCES } from '../licences';
import { periodText } from '../productInfo';
import { deliveryText, expressHelps } from '../deliveryTime';
import { tx as en, type Tx } from '../i18n/tx';

/*
 * The questions a buyer asks about one listing, answered from that listing's own saved facts and the shop's rules (lib/config.ts), never invented:
 * what comes with it, how long delivery takes, whether it can be seen first, how payment is held, what if it does not work, the extras the seller
 * offers, and what is special to its kind (a website's domain, an app's store account, a digital product's licence and support).
 * They show on the listing's page until an admin saves questions of their own there (SEO and CMS > Edit page), which replace them.
 * Pure, so it is tested. The same list is what the admin editor offers as a starting point.
 */
export type FaqItem = { q: string; a: string };
/* The page's words (getI18n()): tx for sentences, translate for words kept elsewhere (licence names). English by default. */
export type FaqWords = { tx: Tx; translate: (english: string) => string };
const ENGLISH: FaqWords = { tx: en, translate: (e) => e };

const list = (items: string[]) => items.map((x) => x.replace(/[.\s]+$/, '')).join(', ');

export function productFaqs(p: Product, w: FaqWords = ENGLISH): FaqItem[] {
  const { tx, translate } = w;
  const pl = platformOf(p);
  const out: FaqItem[] = [];

  if (p.inc.length) out.push({ q: tx('What do I get with {name}?', { name: p.name }), a: `${list(p.inc)}.` });

  if (pl === 'digital') {
    out.push({
      q: tx('How do I get the files?'),
      a: tx('You download them through a private link as soon as your payment is held in escrow. The link expires after 24 hours and you can ask for a new one.'),
    });
  } else {
    out.push({
      q: tx('How long does delivery take?'),
      a:
        tx('The seller delivers within {time} of your payment.', { time: deliveryText(p) }) +
        (p.express && expressHelps(p) ? ' ' + tx('The seller also offers 24-hour express delivery for ${price}.', { price: p.express }) : ''),
    });
  }

  if (p.demo || p.sample) {
    out.push({
      q: tx('Can I see it before I buy?'),
      a: p.demo
        ? p.sample
          ? tx('Yes. Open the preview on this page, and the free sample the seller shares, and look at the real thing before you pay.')
          : tx('Yes. Open the preview on this page, and look at the real thing before you pay.')
        : tx('Yes. The seller shares a free sample you can open before you pay.'),
    });
  }

  out.push({
    q: tx('How does payment work?'),
    a: tx('Your payment is held in escrow, not paid to the seller. You have {hours} hours to check what you got. If you accept, or the time runs out, the seller is paid.', { hours: REVIEW_HOURS }),
  });
  out.push({
    q: tx('What if it does not work as described?'),
    a: tx(
      "Open a dispute with your evidence and the seller can fix it first. Refunds are decided case by case for products that are not as described, do not work, carry harmful code or copy someone else's work. A bug that shows up in the first {days} days is fixed for free.",
      { days: BUGFIX_DAYS },
    ),
  });

  if (pl === 'web') {
    out.push({ q: tx('Will it work on my own domain?'), a: tx('Yes. You give us your domain, or buy one here, and the seller puts the site live on it with your name and words.') });
  }
  if (pl === 'android' || pl === 'ios') {
    out.push({
      q: tx('Who publishes the app?'),
      a: tx(
        'The app is published under your own developer account on {store}. The seller sends a test build first. {company} decides whether to approve it, which can take longer than delivery and is not guaranteed.',
        {
          store: pl === 'android' ? 'Google Play' : 'the App Store',
          company: pl === 'android' ? 'Google' : 'Apple',
        },
      ),
    });
  }
  if (pl === 'webapp' || pl === 'desktop') {
    out.push({
      q: pl === 'webapp' ? tx('How is the web app set up?') : tx('What do I receive?'),
      a:
        pl === 'webapp'
          ? tx('The seller sends you a private test link and deploys it on your domain. Hosting is an extra.')
          : tx('You receive installers for the systems you choose. Signing and store accounts are your own.'),
    });
  }

  const extras: string[] = [];
  if (p.setupPrice && p.setupPrice > 0) extras.push(tx('setup help for ${price}', { price: p.setupPrice }));
  if (p.customPrice && p.customPrice > 0) extras.push(tx('customisation for ${price}', { price: p.customPrice }));
  if (extras.length)
    out.push({
      q: tx('Can the seller set it up or change it for me?'),
      a: tx('Yes. The seller offers {extras}, paid into escrow before the work starts.', { extras: extras.join(' ' + tx('and') + ' ') }),
    });

  if (pl === 'digital') {
    const parts: string[] = [];
    if (p.supportDays !== undefined && p.updateDays !== undefined)
      parts.push(
        tx('Support lasts {support} and updates last {updates} from your purchase.', {
          support: periodText(p.supportDays, tx).toLowerCase(),
          updates: periodText(p.updateDays, tx).toLowerCase(),
        }),
      );
    if (p.requirements) parts.push(tx('It needs: {what}.', { what: p.requirements.replace(/[.\s]+$/, '') }));
    if (parts.length) out.push({ q: tx('What do I need, and how long are support and updates?'), a: parts.join(' ') });
  }
  if (p.licence && LICENCES[p.licence]) out.push({ q: tx('What licence comes with it?'), a: `${translate(LICENCES[p.licence].label)}: ${translate(LICENCES[p.licence].terms)}` });

  return out;
}
