'use client';
import { useEffect, useState } from 'react';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
/*
 * The release target of one order, counted down live and shown in the admin's own time zone (times are stored in UTC).
 * Overdue only changes the colour: nothing is ever released by the clock.
 */
export function SlaClock({ dueAt, slaHours }: { dueAt: number; slaHours: number }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  const local = new Date(dueAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  if (now === null)
    return (
      <small className="muted">
        <T s={'Due {v0} UTC'} v={{ v0: new Date(dueAt).toISOString().slice(0, 16).replace('T', ' ') }} />
      </small>
    );
  const left = dueAt - now;
  const state = left <= 0 ? 'overdue' : left <= (slaHours * 3_600_000) / 4 ? 'due_soon' : 'on_track';
  const h = Math.floor(Math.abs(left) / 3_600_000),
    m = Math.floor((Math.abs(left) % 3_600_000) / 60_000);
  return (
    <span className={state === 'overdue' ? 'status st-bad' : state === 'due_soon' ? 'status st-wait' : 'status st-ok'} data-sla={state} title={tx('Target {local}', { local })}>
      <i />
      <T s={'{v0} · due {local}'} v={{ v0: left <= 0 ? tx('Overdue by {h} h {m} min', { h, m }) : `${h} h ${m} min left`, local }} />
    </span>
  );
}
