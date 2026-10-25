export function Bars({ data, prefix = '', label }: { data: [string, number][]; prefix?: string; label: string }) {
  const max = Math.max(...data.map((d) => d[1]));
  return (
    <div className="bars" aria-label={label}>
      {data.map(([l, v]) => (
        <div key={l}>
          <b>
            {prefix}
            {v}
          </b>
          <i style={{ height: Math.max(4, (v / max) * 78) + '%' }} />
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

export function Spark({ vals, color = '#2B3DFF' }: { vals: number[]; color?: string }) {
  const w = 120,
    h = 36,
    max = Math.max(...vals),
    min = Math.min(...vals);
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, h - 4 - ((v - min) / (max - min || 1)) * (h - 8)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  return (
    <span>
      <svg className="spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <path d={`${d}L${w} ${h}L0 ${h}Z`} fill={color} opacity=".12" />
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
