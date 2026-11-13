import { ActionButton } from '@/components/ActionButton';
import { AdminForm } from '@/components/AdminForm';
import { StatusPill } from './StatusPill';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
/* A listing's launch price or sale, in the seller's and the admin's lists: its state, and plan or stop (owner, 2026-11-08). */
export type SaleState = { id: string; kind: 'sale' | 'launch'; saleCents: number; startsAt: number; endsAt: number; running: boolean } | null;
const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const utc = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');

export async function SaleCell({ slug, sale, endpoint }: { slug: string; sale: SaleState; endpoint: string }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  if (sale)
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
        <StatusPill tone={sale.running ? 'ok' : 'info'}>
          {sale.running ? (sale.kind === 'launch' ? tx('Launch') : tx('Sale')) : tx('Planned')} · {usd(sale.saleCents)}
        </StatusPill>
        <span className="tag">
          <T s={'{v0} to {v1} UTC'} v={{ v0: utc(sale.startsAt), v1: utc(sale.endsAt) }} />
        </span>
        <ActionButton endpoint={endpoint} label={tx('Stop')} tone="line" body={{ slug, action: 'cancel', saleId: sale.id }} />
      </span>
    );
  return (
    <AdminForm
      endpoint={endpoint}
      openLabel={tx('Plan a sale')}
      submit={tx('Plan')}
      tone="line"
      fixed={{ slug, action: 'plan' }}
      fields={[
        {
          name: 'kind',
          label: tx('Kind'),
          kind: 'select',
          options: [
            ['sale', tx('Sale (shows the earlier price only when the last 30 days allow it)')],
            ['launch', tx('Launch price (new listing whose price never changed)')],
          ],
        },
        { name: 'salePrice', label: tx('Sale price (US dollars, at least the minimum, below the price)'), kind: 'text', required: true },
        { name: 'startsAt', label: tx('Start, UTC (YYYY-MM-DD HH:MM)'), kind: 'text', required: true },
        { name: 'endsAt', label: tx('End, UTC (at most 30 days later)'), kind: 'text', required: true },
      ]}
    />
  );
}
