// node scripts/i18n-add.mjs <file.json> — merges machine-drafted translations into lib/i18n/strings/<lang>.json.
// The input is { "English text": ["bn", "ar", "hi", "es", "fr", "de", "pt"] }. Drafts stay unpublished until an admin reviews and publishes
// the language (Admin › Language Management). Placeholders like {n} must match the English text (the strings test checks it).
import fs from 'node:fs';

const LANGS = ['bn', 'ar', 'hi', 'es', 'fr', 'de', 'pt'];
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const [i, lang] of LANGS.entries()) {
  const file = `lib/i18n/strings/${lang}.json`;
  const cur = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  for (const [en, list] of Object.entries(input)) if (Array.isArray(list) && typeof list[i] === 'string' && list[i].trim()) cur[en] = list[i];
  const sorted = Object.fromEntries(
    Object.keys(cur)
      .sort()
      .map((k) => [k, cur[k]]),
  );
  fs.writeFileSync(file, JSON.stringify(sorted, null, 1) + '\n');
}
console.log(`${Object.keys(input).length} strings merged into ${LANGS.length} languages`);
