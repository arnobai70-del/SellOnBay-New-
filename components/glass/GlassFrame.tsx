import '@/app/sob.css';
import '@/app/sob-extra.css';
import '@/app/sob-parts.css';
import { CookieNotice, type CookieWords } from '@/components/CookieNotice';
import { inter } from './font';

/*
 * The root of every page on the design (design-reference/, app/sob.css): the scope of its group (`p` public, `d` dashboards), the design file it
 * is ported from (its own rules and keyframes) and the drifting background (.page). The design file's <body> becomes this element.
 * No server code here, so the error pages (client components) can use it; GlassPage adds the cookie notice's words in the page's language.
 */
export function GlassFrame({ kind = 'p', file, children, cookieWords }: { kind?: 'p' | 'd'; file: string; children: React.ReactNode; cookieWords?: CookieWords }) {
  return (
    <div className={`sob-${kind} ${inter.variable}`} data-sob={file}>
      <div className="page">{children}</div>
      <CookieNotice words={cookieWords} />
    </div>
  );
}
