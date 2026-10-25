import { marks } from '@/lib/siteSearchCore';

/* Text with the searched words marked. Built from plain parts, never from HTML. */
export function SearchMark({ text, q }: { text: string; q: string }) {
  return <>{marks(text, q).map((p, i) => (p.hit ? <mark key={i}>{p.t}</mark> : p.t))}</>;
}
