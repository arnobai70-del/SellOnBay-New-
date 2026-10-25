import { BUGFIX_DAYS, REVIEW_HOURS } from './config';

/*
 * The words next to the "accept" box, and their version. Kept apart from lib/consent.ts so the browser can show the same text the server logs.
 * [LAWYER REVIEW] Change the text only together with the version, so every logged acceptance says exactly which words the buyer saw.
 */
export const ACCEPT_TEXT_VERSION = 'accept-v1';
export const ACCEPT_TEXT = `I have checked what the seller delivered and I accept it. The payment is released to the seller. After this I can only report a problem for the reasons in the terms (not as described, does not work, harmful code, copyright), and the fix guarantee lasts ${BUGFIX_DAYS} days. If I do nothing, the order is accepted for me after ${REVIEW_HOURS} hours.`;
