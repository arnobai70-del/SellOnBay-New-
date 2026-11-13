import { tx } from './i18n/tx'; // marks English words; the screen translates them
import { PLAN_KEEP_TEXT } from './config';

export type Mode = 'buy' | 'sell';
/* The built-in steps (SellOnBay 2.0 flow). Admin > CMS can publish others (lib/cms/docs.ts how_it_works); pages pass them in as `steps`. */
export const BUILT_IN_STEPS: Record<Mode, { t: string; d: string }[]> = {
  buy: [
    { t: tx('Choose a website'), d: tx('Open the live demo, check it on your phone, and pick the one that fits.') },
    { t: tx('Request it'), d: tx('Send a request to buy. SellOnBay sends you a quotation with the price and the terms.') },
    { t: tx('Pay, check and accept'), d: tx('Pay the quoted price. Once the payment is checked it is set up and released to you. You check it, then accept.') },
  ],
  sell: [
    { t: tx('List your site'), d: `Upload it once and set your price. You keep ${PLAN_KEEP_TEXT} of every sale, depending on your plan.` },
    { t: tx('We check it'), d: tx('We review the listing and check your files in a private quarantine before it goes live.') },
    { t: tx('Get paid weekly'), d: tx('Earnings are paid out 7 days after the buyer accepts.') },
  ],
};
