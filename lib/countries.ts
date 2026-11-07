/* Every country, by ISO code, with its English name. For profiles, invoices and the beta form. Safe in the browser. */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const names = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
const NOT_COUNTRIES = new Set([
  'AC',
  'AN',
  'BU',
  'CP',
  'CS',
  'CT',
  'DD',
  'DG',
  'DY',
  'EA',
  'EU',
  'EZ',
  'FQ',
  'FX',
  'HV',
  'IC',
  'JT',
  'MI',
  'NH',
  'NQ',
  'NT',
  'PC',
  'PU',
  'PZ',
  'QO',
  'RH',
  'SU',
  'TA',
  'TP',
  'UK',
  'UN',
  'VD',
  'WK',
  'YD',
  'YU',
  'ZR',
  'XA',
  'XB',
  'XK',
]);

export const COUNTRIES: { code: string; name: string }[] = LETTERS.flatMap((a) =>
  LETTERS.map((b) => a + b)
    .filter((code) => !NOT_COUNTRIES.has(code))
    .map((code) => ({ code, name: names.of(code) ?? '' }))
    .filter((c) => c.name && c.name !== c.code),
).sort((a, b) => a.name.localeCompare(b.name));
