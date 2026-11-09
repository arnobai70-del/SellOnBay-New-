/* One number with its label and a short note, as the design's <div class="glass kpi"> (put several inside <div className="kpis">). */
export function Kpi({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="glass kpi widget">
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {note !== undefined && <div className="s">{note}</div>}
    </div>
  );
}
