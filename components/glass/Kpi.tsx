import { GlassCard } from './GlassCard';

/* One number with its label and a short note. Put several inside <div className="g-kpis">. */
export function Kpi({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <GlassCard pad={false} className="g-kpi">
      <div className="g-kpi-l">{label}</div>
      <div className="g-kpi-v">{value}</div>
      {note !== undefined && <div className="g-kpi-s">{note}</div>}
    </GlassCard>
  );
}
