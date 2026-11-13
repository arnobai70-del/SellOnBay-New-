import Link from 'next/link';
import { type Attraction, type DayLine, type Named, type Top, DAY_FIELDS, LEVEL_LABEL } from '@/lib/analyticsCore';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
/* The tables of the admin Visitors page and its daily report (app/(dash)/admin/visitors/details). */
const LEVEL_CHIP: Record<Attraction['level'], string> = { strong: 'status st-ok', fair: 'status st-wait', weak: 'status st-bad', few: 'status st-draft' };

function Empty({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="muted">
        {text}
      </td>
    </tr>
  );
}

export async function DaysTable({ days }: { days: DayLine[] }) {
  const most = Math.max(1, ...days.map((d) => d.visitors));
  return (
    <div className="tbl">
      <table className="">
        <thead>
          <tr>
            <th>
              <T s={'Day'} />
            </th>
            {DAY_FIELDS.map(([k, label]) => (
              <th key={k}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map((d) => (
            <tr key={d.day}>
              <td>
                <Link className="" href={`/admin/visitors/report?day=${d.day}`}>
                  {d.day}
                </Link>
              </td>
              {DAY_FIELDS.map(([k]) => (
                <td key={k}>
                  {k === 'visitors' ? (
                    <span className="sob-an-bar">
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

export async function CompareTable({ today, before }: { today: DayLine; before: DayLine }) {
  return (
    <div className="tbl">
      <table className="">
        <thead>
          <tr>
            <th>
              <T s={'Number'} />
            </th>
            <th>{today.day}</th>
            <th>{before.day}</th>
            <th>
              <T s={'Change'} />
            </th>
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
                <td className={diff > 0 ? 'sob-an-up' : diff < 0 ? 'sob-an-down' : 'muted'}>{diff > 0 ? `+${diff}` : diff}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export async function TopTable({ rows, what, link }: { rows: Named<Top>[]; what: string; link?: (key: string) => string }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  return (
    <div className="tbl">
      <table className="">
        <thead>
          <tr>
            <th>{what}</th>
            <th>
              <T s={'Opens'} />
            </th>
            <th>
              <T s={'Different visitors'} />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <Empty cols={3} text={tx('Nothing yet for these days.')} />}
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                {link ? (
                  <Link className="" href={link(r.key)}>
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

export async function AttractionTable({ rows }: { rows: Named<Attraction>[] }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  return (
    <div className="tbl">
      <table className="">
        <thead>
          <tr>
            <th>
              <T s={'Product'} />
            </th>
            <th>
              <T s={'People who opened it'} />
            </th>
            <th>
              <T s={'People who clicked Buy'} />
            </th>
            <th>
              <T s={'Share who clicked Buy'} />
            </th>
            <th>
              <T s={'Attraction'} />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <Empty cols={5} text={tx('Nothing yet for these days.')} />}
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                <Link className="" href={`/product/${r.key}`}>
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
