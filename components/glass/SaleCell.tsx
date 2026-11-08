import { ActionButton } from '@/components/ActionButton';
import { AdminForm } from '@/components/AdminForm';
import { StatusPill } from './StatusPill';

/* A listing's launch price or sale, in the seller's and the admin's lists: its state, and plan or stop (owner, 2026-11-08). */
export type SaleState = { id: string; kind: 'sale' | 'launch'; saleCents: number; startsAt: number; endsAt: number; running: boolean } | null;
const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const utc = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');

export function SaleCell({ slug, sale, endpoint }: { slug: string; sale: SaleState; endpoint: string }) {
  if (sale)
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
        <StatusPill tone={sale.running ? 'ok' : 'info'}>
          {sale.running ? (sale.kind === 'launch' ? 'Launch' : 'Sale') : 'Planned'} · {usd(sale.saleCents)}
        </StatusPill>
        <span className="g-tag">
          {utc(sale.startsAt)} to {utc(sale.endsAt)} UTC
        </span>
        <ActionButton endpoint={endpoint} label="Stop" tone="line" body={{ slug, action: 'cancel', saleId: sale.id }} />
      </span>
    );
  return (
    <AdminForm
      endpoint={endpoint}
      openLabel="Plan a sale"
      submit="Plan"
      tone="line"
      fixed={{ slug, action: 'plan' }}
      fields={[
        {
          name: 'kind',
          label: 'Kind',
          kind: 'select',
          options: [
            ['sale', 'Sale (shows the earlier price only when the last 30 days allow it)'],
            ['launch', 'Launch price (new listing whose price never changed)'],
          ],
        },
        { name: 'salePrice', label: 'Sale price (US dollars, at least the minimum, below the price)', kind: 'text', required: true },
        { name: 'startsAt', label: 'Start, UTC (YYYY-MM-DD HH:MM)', kind: 'text', required: true },
        { name: 'endsAt', label: 'End, UTC (at most 30 days later)', kind: 'text', required: true },
      ]}
    />
  );
}
