'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useTx } from '@/components/i18n/TxProvider';
/* Makes this week's payout batch and says who was left out and why. */
export function PlanButton({ week }: { week: string }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string[]>([]);
  return (
    <div style={{ margin: '12px 0' }}>
      <button
        className="btn sm"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await fetch('/api/admin/payouts/plan', { method: 'POST' });
          const j = await r.json().catch(() => ({}));
          setBusy(false);
          if (!r.ok) return setMsg([j.error ?? tx('Something went wrong.')]);
          setMsg([
            `${j.created} payout(s) made for the week starting ${j.weekStart}.`,
            ...(j.skipped ?? []).map((s: { sellerId: string; reason: string; amountCents: number }) =>
              tx('Left out: seller {v0}, ${v1}: {reason}.', { v0: s.sellerId.slice(0, 8), v1: (s.amountCents / 100).toFixed(2), reason: s.reason }),
            ),
          ]);
          router.refresh();
        }}
      >
        {busy ? tx('One moment...') : tx("Make this week's batch ({week})", { week })}
      </button>
      {msg.map((m) => (
        <p key={m} className="muted" role="status" style={{ margin: '6px 0 0' }}>
          {m}
        </p>
      ))}
    </div>
  );
}
