import { AdminForm } from './AdminForm';
import { isFlagOn } from '@/lib/featureFlags';
import { CONFIG } from '@/lib/config';
import { defaultRange, fileGone, SALE_STATES } from '@/lib/reports/rules';
import { exportsBy } from '@/lib/reports/service';

const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/*
 * Sales PDF exports (lib/reports) for the admin Finance page and the seller dashboard: the filter form and the person's own recent files.
 * Files are deleted after 24 hours; the log of what was exported stays.
 */
export async function ReportsPanel({ me, scope }: { me: string; scope: 'admin' | 'seller' }) {
  const on = await isFlagOn('reports.sales_pdf');
  const mine = await exportsBy(me);
  const { from: monthAgo, to: today } = defaultRange();
  return (
    <div className="dp" data-reports={scope}>
      <div className="hd">
        <div>
          <h2>{scope === 'seller' ? 'Your sales as PDF' : 'Sales report (PDF)'}</h2>
          <p className="sub">
            Figures are what each order recorded (price, commission and the seller&apos;s share), never today&apos;s prices. At most {CONFIG.reports.maxRowsPerPdf.toLocaleString('en-US')} sales per
            file; more are split into numbered parts. Files are deleted after {CONFIG.reports.pdfKeepHours} hours.
            {scope === 'seller' ? ' Buyer names and contact details are never included.' : ''}
          </p>
        </div>
      </div>
      {!on ? (
        <p className="muted">Sales PDF exports are switched off. A Super Admin can switch them on under Feature flags.</p>
      ) : (
        <AdminForm
          endpoint={scope === 'seller' ? '/api/seller/reports/sales' : '/api/admin/reports/sales'}
          openLabel="Export"
          submit="Make the PDF"
          fields={[
            { name: 'from', label: 'From (YYYY-MM-DD, by payment date)', kind: 'text', value: monthAgo, max: 10, required: true },
            { name: 'to', label: 'To (YYYY-MM-DD)', kind: 'text', value: today, max: 10, required: true },
            { name: 'statuses', label: 'Status', kind: 'select', options: [['', 'All'], ...SALE_STATES.map((s) => [s, s.replace(/_/g, ' ')] as [string, string])] },
            ...(scope === 'admin'
              ? [
                  { name: 'sellerId', label: 'Seller account id (optional)', kind: 'text' as const, max: 36 },
                  { name: 'productId', label: 'Product id (optional)', kind: 'text' as const, max: 36 },
                  {
                    name: 'ownerType',
                    label: 'Owner',
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
        <ul className="list" data-exports>
          {mine.map((e) => (
            <li key={e.id}>
              <div className="grow">
                {e.scope === 'buyer' ? 'Receipt' : `Part ${e.part} of ${e.parts}`} · {e.rowCount} {e.rowCount === 1 ? 'row' : 'rows'} · made {when(e.createdAt)}
              </div>
              {fileGone(e) ? (
                <small className="muted">Deleted after {CONFIG.reports.pdfKeepHours} hours</small>
              ) : (
                <a className="btn btn-line btn-sm" href={`/api/reports/${e.id}`}>
                  Download
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
