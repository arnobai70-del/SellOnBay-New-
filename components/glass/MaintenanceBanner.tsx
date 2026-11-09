import { upcomingMaintenance } from '@/lib/maintenance/state';

/* "Heads up" before a planned closure, from its banner time until it starts (owner, 2026-11-08). Nothing when none is coming. */
export async function MaintenanceBanner() {
  const soon = await upcomingMaintenance().catch(() => []);
  if (!soon.length) return null;
  const at = (t: number) => new Date(t).toISOString().slice(11, 16) + ' UTC';
  return (
    <p className="sob-note sob-note-warn" role="status">
      {soon
        .slice(0, 2)
        .map((s) => `${s.label} will pause for maintenance at ${at(s.startAt)}.`)
        .join(' ')}
    </p>
  );
}
