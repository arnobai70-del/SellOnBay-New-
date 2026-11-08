import { cleanGuideHtml } from '@/lib/guides/html';

/*
 * The only place guide HTML reaches the page (owner, 2026-11-08). It is cleaned here, every time, by the guides allow-list (lib/guides/html.ts):
 * no script, no event handler, no foreign embed. A test keeps raw HTML out of every other file.
 */
export function CleanHtml({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: cleanGuideHtml(html) }} />;
}
