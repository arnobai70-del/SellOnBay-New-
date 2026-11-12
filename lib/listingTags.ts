import { tx } from './i18n/tx';
import { isBlocked } from './chatFilter';
import { CONFIG } from './config';

const { maxTags, tagMinChars, tagMaxChars } = CONFIG.listing;
const WORDS = /^[\p{L}\p{N}][\p{L}\p{N} &+.-]*$/u;

/*
 * Tags on a listing (owner, 2026-11-03): a few short words the seller picks so buyers find it in search. One rule for the form (as a
 * friendly preview) and the server (the one that counts), for a new listing and an edit alike. Separated by commas or new lines, kept in
 * lower case, tidied and without repeats. An empty field is no tags.
 */
export function cleanTags(raw: string): { ok: true; tags: string[] } | { ok: false; error: string } {
  const tags: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const t = part.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!t || tags.includes(t)) continue;
    if (t.length < tagMinChars || t.length > tagMaxChars) return { ok: false, error: `Each tag is ${tagMinChars} to ${tagMaxChars} characters ("${t.slice(0, 30)}").` };
    if (!WORDS.test(t)) return { ok: false, error: `Tags use letters, numbers and spaces only ("${t.slice(0, 30)}").` };
    if (isBlocked(t)) return { ok: false, error: tx('Keep emails, phone numbers and links out of the tags.') };
    tags.push(t);
  }
  if (tags.length > maxTags) return { ok: false, error: `Use up to ${maxTags} tags.` };
  return { ok: true, tags };
}
