'use client';

import { useEffect, useId, useState } from 'react';

import { useTx } from '@/components/i18n/TxProvider';
/*
 * On phones (owner, 2026-11-11) a panel that would fill the screen before the content (the website filters, a dashboard's sidebar) starts closed
 * behind one button. On wider screens the wrapper disappears (display: contents) and the panel shows as the design draws it.
 */
export function MobileToggle({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  return (
    <div className={`sob-mt ${open ? 'open' : ''} ${className}`}>
      <button type="button" className="btn ghost sob-mt-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        {open ? tx('Close {v0}', { v0: label.toLowerCase() }) : label}
      </button>
      <div id={id} className="sob-mt-body">
        {children}
      </div>
    </div>
  );
}
