import localFont from 'next/font/local';

// DM Serif Display italic (OFL, bundled like the other fonts) for a few accent words on the home page only.
export const serif = localFont({
  src: '../../public/fonts/DMSerifDisplay-Italic.ttf',
  weight: '400',
  style: 'italic',
  variable: '--font-serif',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
});
