'use client';
import { usePathname } from 'next/navigation';

import { useTx } from '@/components/i18n/TxProvider';
/* Blocks an admin set to "top" (Admin > Site builder): drawn above the page they belong to. The layout hands in every page's blocks, already built on the server; this shows the ones for the page being viewed. */
export function TopBlocks({ slots }: { slots: Record<string, React.ReactNode> }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const path = usePathname().replace(/(.)\/$/, '$1');
  const mine = slots[path];
  return mine ? (
    <section className="wrap sob-faq-page" aria-label={tx('Notice')} data-top-blocks>
      {mine}
    </section>
  ) : null;
}
