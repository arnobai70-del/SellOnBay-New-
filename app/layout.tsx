import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import './market.css';
import { CookieNotice } from '@/components/CookieNotice';
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${instrument.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
        <CookieNotice />
      </body>
    </html>
  );
}
