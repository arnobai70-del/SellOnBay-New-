import { AdminForm } from './AdminForm';
import { isFlagOn } from '@/lib/featureFlags';
import { CONFIG } from '@/lib/config';
import { defaultRange, fileGone, SALE_STATES } from '@/lib/reports/rules';
import { exportsBy } from '@/lib/reports/service';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/*
 * Sales PDF exports (lib/reports) for the admin Finance page and the seller dashboard: the filter form and the person's own recent files.
 * Files are deleted after 24 hours; the log of what was exported stays.
 */
export async function ReportsPanel({ me, scope, bare = false }: { me: string; scope: 'admin' | 'seller'; bare?: boolean }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const on = await isFlagOn('reports.sales_pdf');
  const mine = await exportsBy(me);
  const { from: monthAgo, to: today } = defaultRange();
  return (
    <div className={bare ? undefined : 'glass card sob-sec'} style={bare ? { marginTop: 14 } : undefined} data-reports={scope}>
      <div className="row sob-hd">
        <div>
          <h2>{scope === 'seller' ? tx('Your sales as PDF') : tx('Sales report (PDF)')}</h2>
          <p className="tag">
            <T
              s={
                "Figures are what each order recorded (price, commission and the seller's share), never today's prices. At most {v0} sales per file; more are split into numbered parts. Files are deleted after {pdfKeepHours} hours.{v2}"
              }
              v={{
                v0: CONFIG.reports.maxRowsPerPdf.toLocaleString('en-US'),
                pdfKeepHours: CONFIG.reports.pdfKeepHours,
                v2: scope === 'seller' ? ' Buyer names and contact details are never included.' : '',
              }}
            />
          </p>
        </div>
      </div>
      {!on ? (
        <p className="muted">
          <T s={'Sales PDF exports are switched off. A Super Admin can switch them on under Feature flags.'} />
        </p>
      ) : (
        <AdminForm
          endpoint={scope === 'seller' ? '/api/seller/reports/sales' : '/api/admin/reports/sales'}
          openLabel="Export"
          submit="Make the PDF"
          fields={[
            { name: 'from', label: tx('From (YYYY-MM-DD, by payment date)'), kind: 'text', value: monthAgo, max: 10, required: true },
            { name: 'to', label: tx('To (YYYY-MM-DD)'), kind: 'text', value: today, max: 10, required: true },
            { name: 'statuses', label: tx('Status'), kind: 'select', options: [['', 'All'], ...SALE_STATES.map((s) => [s, s.replace(/_/g, ' ')] as [string, string])] },
            ...(scope === 'admin'
              ? [
                  { name: 'sellerId', label: tx('Seller account id (optional)'), kind: 'text' as const, max: 36 },
                  { name: 'productId', label: tx('Product id (optional)'), kind: 'text' as const, max: 36 },
                  {
                    name: 'ownerType',
                    label: tx('Owner'),
                    kind: 'select' as const,
                    options: [
                      ['', 'Sellers and SellOnBay'],
                      ['seller', 'Sellers only'],
                      ['platform', 'SellOnBay-owned only'],
                    ] as [string, string][],
                  },
                ]
              : []),
          ]}
        />
      )}
      {mine.length > 0 && (
        <ul className="sob-list" data-exports>
          {mine.map((e) => (
            <li key={e.id}>
              <div className="sob-grow">
                <T
                  s={'{v0} · {rowCount} {v2} · made {v3}'}
                  v={{ v0: e.scope === 'buyer' ? 'Receipt' : `Part ${e.part} of ${e.parts}`, rowCount: e.rowCount, v2: e.rowCount === 1 ? 'row' : 'rows', v3: when(e.createdAt) }}
                />
              </div>
              {fileGone(e) ? (
                <small className="muted">
                  <T s={'Deleted after {pdfKeepHours} hours'} v={{ pdfKeepHours: CONFIG.reports.pdfKeepHours }} />
                </small>
              ) : (
                <a className="btn ghost sm" href={`/api/reports/${e.id}`}>
                  <T s={'Download'} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
