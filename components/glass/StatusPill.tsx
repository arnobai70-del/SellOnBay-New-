export type PillTone = 'ok' | 'wait' | 'bad' | 'info' | 'draft';

export function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return <span className={`g-pill g-pill-${tone}`}>{children}</span>;
}
