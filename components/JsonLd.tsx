/*
 * Structured data for search engines. The only place in the app that writes raw script text: the data is built from our own fields, and every "<" is
 * replaced so nothing in it can close the script tag. tests/unit/secrets.test.ts allows dangerouslySetInnerHTML in this file only.
 */
const LINE_SEPARATORS = new RegExp('[' + String.fromCharCode(0x2028) + String.fromCharCode(0x2029) + ']', 'g');

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(LINE_SEPARATORS, '');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
