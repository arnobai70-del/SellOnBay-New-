import type { Metadata } from 'next';
import './globals.css';
import { Suspense } from 'react';
import { GoogleAnalytics } from '@/components/GoogleAnalytics';
import { isStaging } from '@/lib/stage';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { TxProvider } from '@/components/i18n/TxProvider';
import { getI18n } from '@/lib/i18n/server';

const description = 'Ready-made websites and small tools, live on your own domain in 1 to 7 days. Payment is held until you accept.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: ready-made websites on your domain`, template: `%s · ${SITE_NAME}` },
  description,
  openGraph: { type: 'website', siteName: SITE_NAME, title: `${SITE_NAME}: ready-made websites on your domain`, description },
  twitter: { card: 'summary_large_image', title: SITE_NAME, description },
  // Staging (SITE_STAGE=staging, lib/stage.ts) is never indexed; production keeps each page's own robots setting.
  ...(isStaging() ? { robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } } } : {}),
};

// The page's language and direction come from the request (lib/i18n): /bn/… is Bengali, Arabic is right to left. English otherwise.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const i18n = await getI18n();
  const lang = i18n.lang;
  const dir = i18n.dir;
  return (
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <body>
        {/* Runs while the page is parsed, before anything paints: allow entrance animations only when JS runs and motion is welcome, so without
            JS everything stays visible. Backticks only, no quotes or < > &, so the text needs no escaping. */}
        <script id="motion-flag">{'if(!matchMedia(`(prefers-reduced-motion: reduce)`).matches)document.documentElement.classList.add(`motion`)'}</script>
        <a className="sob-skip" href="#main">
          Skip to content
        </a>
        <TxProvider dict={i18n.clientDict}>{children}</TxProvider>
        {/* Loads nothing until the visitor accepts analytics in the cookie notice. */}
        <Suspense fallback={null}>
          <GoogleAnalytics />
        </Suspense>
      </body>
    </html>
  );
}
