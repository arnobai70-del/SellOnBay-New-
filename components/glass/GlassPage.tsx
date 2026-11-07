import '@/app/glass.css';
import { inter } from './font';

/* The root of every page on the glass UI: its tokens, its font and the drifting background. Pages on the old look never load any of it. */
export function GlassPage({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`g-ui g-page ${inter.variable} ${className}`.trim()}>{children}</div>;
}
