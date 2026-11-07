import localFont from 'next/font/local';

/*
 * Inter 300 to 600 (OFL, bundled, latin only, 48 KB) for the glass UI. Bundled like the other fonts so a build never depends on Google Fonts. Imported
 * only by GlassPage, so pages still on the old look do not load it.
 */
export const inter = localFont({
  src: '../../public/fonts/Inter-Variable-latin.woff2',
  weight: '300 600',
  style: 'normal',
  variable: '--font-inter',
  display: 'swap',
});
