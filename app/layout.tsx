import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import './market.css';
import './light.css';
import { CookieNotice } from '@/components/CookieNotice';
import { isStaging } from '@/lib/stage';
import { SITE_NAME, SITE_URL } from '@/lib/site';

// Bundled OFL fonts keep production builds independent of Google Fonts availability.
const bricolage = localFont({
  src: [
    { path: '../public/fonts/Poppins-Medium.ttf', weight: '500', style: 'normal' },
    { path: '../public/fonts/Poppins-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../public/fonts/Poppins-Bold.ttf', weight: '700', style: 'normal' },
    { path: '../public/fonts/Poppins-ExtraBold.ttf', weight: '800', style: 'normal' },
  ],
  variable: '--font-bricolage',
  display: 'swap',
});
const instrument = localFont({
  src: '../public/fonts/PlusJakartaSans[wght].ttf',
  weight: '400 800',
  variable: '--font-instrument',
  display: 'swap',
});

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${instrument.variable}`} suppressHydrationWarning>
      <body>
        {/* Runs while the page is parsed, before anything paints: allow entrance animations only when JS runs and motion is welcome, so without
            JS everything stays visible. Backticks only, no quotes or < > &, so the text needs no escaping. */}
        <script id="motion-flag">{'if(!matchMedia(`(prefers-reduced-motion: reduce)`).matches)document.documentElement.classList.add(`motion`)'}</script>
        {/* The visitor's light or dark choice, before paint so a light page never flashes dark (components/ThemeSwitch.tsx has the same key). */}
        <script id="theme-flag">{'try{if(localStorage.getItem(`sob-theme`)===`light`)document.documentElement.dataset.theme=`light`}catch(e){}'}</script>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
        <CookieNotice />
      </body>
    </html>
  );
}
