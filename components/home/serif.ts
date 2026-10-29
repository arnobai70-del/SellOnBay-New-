import localFont from 'next/font/local';

// DM Serif Display italic (OFL, bundled as WOFF2, 30 KB) for a few accent words on the home page only. "optional": the accent word in the h1
// uses it only if it is there in time (it is preloaded), so it never swaps in after the first paint and moves the headline (CLS).
export const serif = localFont({
  src: '../../public/fonts/DMSerifDisplay-Italic.woff2',
  weight: '400',
  style: 'italic',
  variable: '--font-serif',
  display: 'optional',
  adjustFontFallback: 'Times New Roman',
  fallback: ['Georgia', 'serif'],
});
