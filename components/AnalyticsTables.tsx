import Link from 'next/link';
import { type Attraction, type DayLine, type Named, type Top, DAY_FIELDS, LEVEL_LABEL } from '@/lib/analyticsCore';

/* The tables of the admin Visitors page and its daily report (app/(dash)/dashboard/admin/analytics). */
const LEVEL_CHIP: Record<Attraction['level'], string> = { strong: 'chip mint', fair: 'chip amber', weak: 'chip rose', few: 'chip' };

function Empty({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="muted">
        {text}
      </td>
    </tr>
  );
}

export function DaysTable({ days }: { days: DayLine[] }) {
  const most = Math.max(1, ...days.map((d) => d.visitors));
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            <th>Day</th>
            {DAY_FIELDS.map(([k, label]) => (
              <th key={k}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map((d) => (
            <tr key={d.day}>
              <td>
                <Link className="link-u" href={`/dashboard/admin/analytics/report?day=${d.day}`}>
                  {d.day}
                </Link>
              </td>
              {DAY_FIELDS.map(([k]) => (
                <td key={k}>
                  {k === 'visitors' ? (
                    <span className="an-bar">
                      <i style={{ width: `${Math.round((d.visitors / most) * 100)}%` }} />
                      {d.visitors}
                    </span>
                  ) : (
                    d[k]
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CompareTable({ today, before }: { today: DayLine; before: DayLine }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            <th>Number</th>
            <th>{today.day}</th>
            <th>{before.day}</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {DAY_FIELDS.map(([k, label]) => {
            const diff = today[k] - before[k];
            return (
              <tr key={k}>
                <td>{label}</td>
                <td>
                  <b>{today[k]}</b>
                </td>
                <td>{before[k]}</td>
                <td className={diff > 0 ? 'an-up' : diff < 0 ? 'an-down' : 'muted'}>{diff > 0 ? `+${diff}` : diff}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TopTable({ rows, what, link }: { rows: Named<Top>[]; what: string; link?: (key: string) => string }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            <th>{what}</th>
            <th>Opens</th>
            <th>Different visitors</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <Empty cols={3} text="Nothing yet for these days." />}
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                {link ? (
                  <Link className="link-u" href={link(r.key)}>
                    {r.name}
                  </Link>
                ) : (
                  r.name
                )}
              </td>
              <td>{r.total}</td>
              <td>{r.people}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AttractionTable({ rows }: { rows: Named<Attraction>[] }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>People who opened it</th>
            <th>People who clicked Buy</th>
            <th>Share who clicked Buy</th>
            <th>Attraction</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <Empty cols={5} text="Nothing yet for these days." />}
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                <Link className="link-u" href={`/product/${r.key}`}>
                  {r.name}
                </Link>
              </td>
              <td>{r.viewers}</td>
              <td>{r.buyers}</td>
              <td>{r.pct}%</td>
              <td>
                <span className={LEVEL_CHIP[r.level]}>{LEVEL_LABEL[r.level]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
