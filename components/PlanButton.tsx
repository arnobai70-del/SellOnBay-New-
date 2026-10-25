'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/* Makes this week's payout batch and says who was left out and why. */
export function PlanButton({ week }: { week: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string[]>([]);
  return (
    <div style={{ margin: '12px 0' }}>
      <button
        className="btn btn-blue btn-sm"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await fetch('/api/admin/payouts/plan', { method: 'POST' });
          const j = await r.json().catch(() => ({}));
          setBusy(false);
          if (!r.ok) return setMsg([j.error ?? 'Something went wrong.']);
          setMsg([
            `${j.created} payout(s) made for the week starting ${j.weekStart}.`,
            ...(j.skipped ?? []).map(
              (s: { sellerId: string; reason: string; amountCents: number }) => `Left out: seller ${s.sellerId.slice(0, 8)}, $${(s.amountCents / 100).toFixed(2)}: ${s.reason}.`,
            ),
          ]);
          router.refresh();
        }}
      >
        {busy ? 'One moment...' : `Make this week's batch (${week})`}
      </button>
      {msg.map((m) => (
        <p key={m} className="muted" role="status" style={{ margin: '6px 0 0' }}>
          {m}
        </p>
      ))}
    </div>
  );
}
