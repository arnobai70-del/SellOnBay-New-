export type PillTone = 'ok' | 'wait' | 'bad' | 'info' | 'draft';

/* The design's .status chip with its tone (.st-ok, .st-wait, ...). */
export function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return <span className={`status st-${tone}`}>{children}</span>;
}
