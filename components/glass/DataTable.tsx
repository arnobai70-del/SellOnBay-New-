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
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty = 'Nothing here yet.',
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: React.ReactNode;
}) {
  if (!rows.length) return <p className="g-table-empty">{empty}</p>;
  return (
    <div className="g-tbl">
      <table className="g-table" role="table">
        <caption className="g-sr">{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((c) => (
              <th key={c.key} scope="col" role="columnheader" className={c.align === 'right' ? 'g-right' : undefined}>
                {c.hideLabel ? <span className="g-sr">{c.label}</span> : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((r) => (
            <tr key={rowKey(r)} role="row">
              {columns.map((c) => (
                <td key={c.key} role="cell" data-label={c.hideLabel ? '' : c.label} className={c.align === 'right' ? 'g-right' : undefined}>
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
