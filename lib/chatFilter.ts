/*
 * Keeps contact details and outside payments off SellOnBay. Used on the server for every message (order chat, pre-sale questions,
 * briefs, profiles) and in the browser as a friendly preview. The server result is the one that counts.
 *
 * It looks at a cleaned-up copy of the text, so tricks like "name at gmail dot com", "n a m e @ g m a i l", "five five five 0123",
 * zero-width characters, full-width digits or Cyrillic look-alike letters do not get through. Plain mentions that a buyer or a
 * seller may really need ("add a WhatsApp button", "can I take payments with PayPal on the finished site?", "call me Bob")
 * are allowed: a channel or a payment method is only blocked when the words around it offer it as a way to reach or pay someone.
 */
export type BlockReason = 'email' | 'phone' | 'contact_channel' | 'link' | 'outside_payment';
export type FilterResult = { ok: true } | { ok: false; reason: BlockReason };

/* Cyrillic and Greek letters that look like Latin ones. */
const LOOKALIKE: Record<string, string> = {
  а: 'a',
  в: 'b',
  е: 'e',
  ё: 'e',
  з: '3',
  і: 'i',
  ї: 'i',
  ј: 'j',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  ѕ: 's',
  т: 't',
  у: 'y',
  х: 'x',
  ԁ: 'd',
  ӏ: 'l',
  ɡ: 'g',
  α: 'a',
  β: 'b',
  ε: 'e',
  η: 'n',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
  ω: 'w',
};

/* Lower case, plain letters, no zero-width or invisible characters, look-alike letters made Latin. */
const clean = (raw: string) =>
  raw
    .normalize('NFKD')
    .replace(/[̀-ͯ​-‏⁠﻿­]/g, '')
    .toLowerCase()
    .replace(/[а-ӿͰ-Ͽɡ]/g, (c) => LOOKALIKE[c] ?? c);

/* "n a m e" -> "name": joins runs of three or more single characters, so spaced-out words are read as words. */
const joinSpaced = (t: string) => t.replace(/(?<=^|\s)(?:[a-z0-9@.]\s+){2,}[a-z0-9@.](?=\s|$)/g, (m) => m.replace(/\s+/g, ''));

const MAIL_HOSTS = '(?:gmail|googlemail|yahoo|ymail|hotmail|outlook|live|icloud|me\\.com|proton(?:mail)?|aol|yandex|gmx|zoho|mail\\.ru)';
// words that come before "at gmail" in a normal sentence ("sign in at gmail")
const NOT_A_NAME = /\b(in|up|on|me|it|is|log|login|sign|signin|look|work|works|account|inbox|address|email|mail|logged|check)\s*$/;

const looksLikeEmail = (t: string): boolean => {
  const plain = /[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}/;
  if (plain.test(t)) return true;
  if (new RegExp(`[a-z0-9._%+-]@\\s*${MAIL_HOSTS}\\b`).test(t)) return true; // "john@gmail"
  let s = joinSpaced(t);
  // "name (at) gmail", "name[at]gmail", "name_at_gmail", "[.]", "(dot)": these forms are only ever used to hide an address
  s = s.replace(/\s*(?:[[({<]\s*at\s*[\])}>]|_at_|-at-)\s*/g, '@').replace(/\s*(?:[[({<]\s*(?:dot|\.)\s*[\])}>]|_dot_|-dot-)\s*/g, '.');
  // a bare " at " only when a mail host or "something dot com" follows, so "point the site at mybakery.com" stays fine
  s = s.replace(new RegExp(`\\s+at\\s+(?=${MAIL_HOSTS}\\b|[a-z0-9-]+\\s+dot\\s+[a-z]{2,}\\b)`, 'g'), (m, off: number) => (NOT_A_NAME.test(s.slice(0, off)) ? m : '@'));
  s = s.replace(/\s+dot\s+(?=[a-z]{2,}\b)/g, '.');
  s = s.replace(/\s*@\s*/g, '@').replace(/(?<=@[a-z0-9.-]*)\s*\.\s*/g, '.');
  if (plain.test(s)) return true;
  return new RegExp(`[a-z0-9._%+-]@${MAIL_HOSTS}\\b`).test(s);
};

const DATES = [
  /\b\d{4}[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/g, // 2026-10-08
  /\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](19|20)?\d\d\b/g, // 08/10/2026
  /\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.](19|20)?\d\d\b/g, // 10/08/2026
  /\b\d{1,3}(,\d{3}){2,}(\.\d+)?\b/g, // 1,250,000
];

const looksLikePhone = (t: string): boolean => {
  const s = DATES.reduce((acc, re) => acc.replace(re, ' ; '), t);
  let run = 0;
  let gap = 0;
  for (const m of s.matchAll(/(\d)|(?<![a-z])(zero|oh|one|two|three|four|five|six|seven|eight|nine)(?![a-z])|([\s\-().+/_,])|(.)/g)) {
    if (m[1] || m[2]) {
      run++;
      gap = 0;
      if (run >= 7) return true;
    } else if (m[3]) {
      if (++gap > 3) run = 0;
    } else {
      run = 0;
      gap = 0;
    }
  }
  return false;
};

const CHANNEL =
  '(wh?ats?\\s*app?|watsapp|whatsap|wa|tele\\s*gr?a?m|telegrm|tg|skype|discord|we\\s*chat|viber|signal|messenger|imo|insta(?:gram)?|ig|facebook|fb|snap(?:chat)?|linked\\s*in|line\\s+app|kakao(?:talk)?)';
// "my skype is abc", but not "my WhatsApp is not connected yet"
const NAMED = "is\\b(?!\\s+(not|n't|broken|down|connected|linked|set|working|ready|already|also|the|a|an|on|in|for)\\b)";
const CONTACT = [
  new RegExp(`\\b(add|find|message|msg|ping|contact|reach|text|call|dm|hit|catch|follow|talk\\s+to|chat\\s+with|connect\\s+with)\\s+(me|us)\\s+(up\\s+)?(on|at|via|through|in|over)\\s+${CHANNEL}\\b`),
  new RegExp(`\\b(talk|chat|speak|continue|connect|discuss|message|text|move)\\s+(this\\s+|it\\s+)?(on|via|over|through|to)\\s+${CHANNEL}\\b`),
  new RegExp(`\\b(i'?m|i\\s+am|we'?re|we\\s+are)\\s+(also\\s+)?(on|available\\s+on|active\\s+on)\\s+${CHANNEL}\\b`),
  new RegExp(`\\b(my|our)\\s+${CHANNEL}\\s*(${NAMED}|:|id\\b|handle\\b|username\\b|user\\s*name\\b|number\\b|no\\b|num\\b)`),
  new RegExp(`\\b${CHANNEL}\\s*[:\\-]?\\s*@[a-z0-9_.]{2,}`), // "tg: @john", "ig @john"
  new RegExp(`\\b${CHANNEL}\\s*:\\s*(?!(yes|no|ok|okay|maybe|not|none|n/a)\\b)[a-z0-9_.+]{3,}`), // "insta: john"
  /\b(my|our)\s+(number|phone|mobile|cell|whats\s*app|contact|email|e-mail|gmail)(\s+number|\s+no|\s+address|\s+id)?\s*(:|is\s+[+(\d])/,
  new RegExp(`\\b(send|give|share|drop|tell)\\s+me\\s+your\\s+(${CHANNEL}|number|phone|mobile|email|e-mail|gmail|contact)\\b`),
  /\b(text|ring|dm|ping|msg|inbox|whats\s*app|watsapp|telegram|imessage|sms)\s+me\b/,
  /\bcall\s+me\s+(on|at|back|now|via|asap|later|tomorrow|tonight|today|anytime|any\s+time)\b/,
  /\b(contact\s+me\s+(at|on|outside|via|directly|privately)|reach\s+me\s+(at|on|via|directly|privately))\b/,
  /\b(t\.me|wa\.me|discord\.gg)\b/,
];
const LINK = /(https?:\/\/|\bwww\.|\bbit\.ly\/|\btinyurl\.com\/)/;

/* Methods that are only ever used to pay a person. Letters may be spaced or dotted ("b.kash", "v e n m o"). */
const spaced = (w: string) => w.split('').join('[\\s.\\-_*]?');
const PAY_STANDALONE = new RegExp(`\\b(${['venmo', 'zelle', 'cashapp', 'bkash', 'nagad', 'moneygram'].map(spaced).join('|')}|cash\\s+app|western\\s+union)\\b`);
const METHOD =
  '(paypal|payoneer|wise|crypto(?:currency)?|bitcoin|btc|eth|ethereum|litecoin|ltc|usdt|usdc|tether|binance|bank(?:\\s+transfer)?|wire(?:\\s+transfer)?|upi|paytm|remitly|skrill|neteller|revolut|venmo|zelle|bkash|nagad)';
const WALLET = /\b(bc1[a-z0-9]{20,60}|0x[0-9a-f]{40})\b/;
/* Always an offer to pay someone directly, whatever else the message says. */
const PAY_STRONG = [
  new RegExp(`\\b(pay|send|transfer|wire)\\s+(me|you|us)\\b.{0,30}\\b${METHOD}\\b`), // "pay me via bank transfer"
  new RegExp(`\\b(i|we)(\\s+will|'ll|\\s+can|\\s+could|\\s+would|'d|\\s+prefer\\s+to|\\s+want\\s+to)?\\s+(pay|send|transfer|wire)\\s+(you|it)\\b.{0,30}\\b${METHOD}\\b`),
  new RegExp(`\\b(send|transfer|wire|deposit)\\s+(it|the\\s+money|money|the\\s+payment|payment|funds|cash|${METHOD})\\b.{0,30}\\b(to|into|on)\\s+(my|our)\\b`),
  new RegExp(`\\b(to|into|on|via)\\s+my\\s+${METHOD}\\b`), // "send it to my paypal"
  /\b(pay|deal|talk|chat|contact|buy|order)\s+(me\s+|you\s+)?(outside|off\s*site|off[\s-]*platform|directly|direct)\b/,
  /\b(outside|off|without)\s+(the\s+)?(platform|sellonbay|launchbay|escrow|site)\b/,
  /\b(skip|bypass|avoid)\s+(the\s+)?(escrow|fees?|platform)\b/,
  /\bdirect\s+payment\b/,
  /\bpay\s+me\b(?!\s+back)/,
  /\bpay\s+me\s+back\s+(on|via|through|over|to\s+my)\b/, // "pay me back on whatsapp"
];
/* Offers to pay outside, unless the message is clearly about payments on the buyer's own site or app. */
const PAY_WEAK = [
  new RegExp(`\\b(i|we)\\s+(can\\s+|only\\s+|also\\s+|do\\s+|will\\s+|would\\s+)?(accept|take|prefer|receive)\\s+(payment\\s+(via|by|through|in|on)\\s+)?${METHOD}\\b`),
  new RegExp(`\\b(pay|payment|paying)\\s+(via|by|through|with|using|over|in)\\s+${METHOD}\\b`),
  new RegExp(`\\b(use|try|via|through|with|by)\\s+${METHOD}\\s+(instead\\b(?!\\s+of)|directly|outside)`),
  new RegExp(`\\b${METHOD}(\\s+\\w+)?\\s+(is|would\\s+be|will\\s+be|'s)\\s+(cheaper|easier\\s+for\\s+(me|us)|better\\s+for\\s+(me|us))`),
  new RegExp(`\\b(my|our)\\s+${METHOD}\\s*(account|id|email|address|details|wallet|number|no|info|handle|link|is|:)`),
  new RegExp(`\\b${METHOD}\\s*[:=]\\s*@?(?!(yes|no|ok|okay|maybe|not|none)\\b)[a-z0-9._%+-]{3,}`), // "paypal: john"
  new RegExp(`\\b${METHOD}\\s+wallet\\b`),
];
const SITE_TALK =
  /\b(site|website|store|shop|checkout|cart|customers?|clients?|visitors?|users?|app|plugin|template|theme|integrat\w*|gateway|button|form|woocommerce|shopify|wordpress|stripe|donations?)\b/;

export function checkMessage(raw: string): FilterResult {
  const t = clean(raw);
  if (looksLikeEmail(t)) return { ok: false, reason: 'email' };
  if (WALLET.test(t)) return { ok: false, reason: 'outside_payment' };
  if (looksLikePhone(t)) return { ok: false, reason: 'phone' };
  const j = joinSpaced(t);
  if (PAY_STANDALONE.test(j) || PAY_STRONG.some((re) => re.test(j))) return { ok: false, reason: 'outside_payment' };
  if (!SITE_TALK.test(j) && PAY_WEAK.some((re) => re.test(j))) return { ok: false, reason: 'outside_payment' };
  if (CONTACT.some((re) => re.test(j))) return { ok: false, reason: 'contact_channel' };
  if (LINK.test(t)) return { ok: false, reason: 'link' };
  return { ok: true };
}

export const isBlocked = (text: string) => !checkMessage(text).ok;

export const REASON_TEXT: Record<BlockReason, string> = {
  email: 'an email address',
  phone: 'a phone number',
  contact_channel: 'another way to contact you',
  link: 'a link',
  outside_payment: 'paying outside SellOnBay',
};
export const BLOCKED_MESSAGE = 'We could not send that. Please keep contact details, links and payments on SellOnBay, so both of you stay protected. Ask your question without them.';
