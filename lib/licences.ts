/*
 * Licence types a seller picks for each product, in plain words. [LAWYER REVIEW] These texts are shown to buyers and printed on the handover
 * certificate. The certificate is a record of what was delivered; the seller agreement decides which rights actually pass to the buyer.
 */
export const LICENCE_TYPES = ['single_project', 'multi_project', 'full_transfer'] as const;
export type LicenceType = (typeof LICENCE_TYPES)[number];

export const LICENCES: Record<LicenceType, { label: string; terms: string }> = {
  single_project: { label: 'Single project', terms: 'Use it for one site or project of your own. You may not resell it or give it away.' },
  multi_project: { label: 'Multi project', terms: 'Use it for as many projects of your own as you like. You may not resell or give away the product itself.' },
  full_transfer: { label: 'Full transfer', terms: 'Ownership of the product passes to you and the seller stops selling it.' },
};
export const DEFAULT_LICENCE: LicenceType = 'single_project';
export const isLicenceType = (v: unknown): v is LicenceType => typeof v === 'string' && (LICENCE_TYPES as readonly string[]).includes(v);

/* Licences of code a seller did not write. Choosing "Other" or a copyleft licence shows a visible note on the listing. */
export const THIRD_PARTY_LICENCES = ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC', 'MPL-2.0', 'LGPL-3.0', 'GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'Proprietary', 'Other'] as const;
export type ThirdPartyLicence = (typeof THIRD_PARTY_LICENCES)[number];
export const COPYLEFT: readonly string[] = ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-3.0', 'MPL-2.0'];

/* A plain type, not a Zod schema: this file is also used in the browser and Zod does not belong there (it probes for eval, which the security policy blocks). The schema is in lib/schemas.ts. */
export type ThirdParty = { name: string; licence: ThirdPartyLicence }[];

/* The note buyers see when something inside the product has a licence that comes with conditions. */
export const copyleftNote = (list: ThirdParty): string | null => {
  const hit = list.filter((t) => COPYLEFT.includes(t.licence));
  if (!hit.length) return null;
  return `Includes ${hit.map((t) => `${t.name} (${t.licence})`).join(', ')}. These licences can require you to share your own source code if you distribute the result. Read them before you use it.`;
};

/* "Name - MIT" lines from the form into the stored shape. Unknown licences become "Other". */
export function parseThirdParty(text: string): ThirdParty {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((l) => {
      const [name, lic = 'Other'] = l.split(/\s+[-:]\s+|\s*,\s*/, 2);
      const licence = (THIRD_PARTY_LICENCES as readonly string[]).includes(lic.trim()) ? (lic.trim() as ThirdPartyLicence) : 'Other';
      return { name: name.trim().slice(0, 80), licence };
    })
    .filter((t) => t.name);
}
