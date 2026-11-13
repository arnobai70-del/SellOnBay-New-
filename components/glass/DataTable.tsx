import { getI18n } from '@/lib/i18n/server';
export type Column<T> = {
  key: string;
  label: string;
  /* The header is for screen readers only, as on a column of buttons. */
  hideLabel?: boolean;
  align?: 'left' | 'right';
  cell: (row: T) => React.ReactNode;
};

/*
 * A table that becomes a short list per row on a phone (app/glass.css). `caption` names it for screen readers. The roles are written out because a CSS
 * display change takes the table's meaning away from them in some browsers.
 */
export async function DataTable<T>({ caption, columns, rows, rowKey, empty: emptyGiven }: { caption: string; columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; empty?: React.ReactNode }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const empty = emptyGiven ?? tx('Nothing here yet.');
  if (!rows.length)
    return (
      <p className="muted" style={{ fontSize: 14, padding: '12px 14px' }}>
        {empty}
      </p>
    );
  return (
    <div className="tbl">
      <table role="table">
        <caption className="hidden-label">{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((c) => (
              <th key={c.key} scope="col" role="columnheader" style={c.align === 'right' ? { textAlign: 'right' } : undefined}>
                {c.hideLabel ? <span className="hidden-label">{c.label}</span> : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((r) => (
            <tr key={rowKey(r)} role="row">
              {columns.map((c) => (
                <td key={c.key} role="cell" data-label={c.hideLabel ? '' : c.label} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
