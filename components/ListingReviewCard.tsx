import Link from 'next/link';
import { AdminForm } from './AdminForm';
import type { QueueListing } from '@/lib/admin/queue';
import { catForCategory } from '@/lib/catAccent';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
const money = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0 });

/* One listing waiting for review: what the seller wrote, the links, the price (with a way to fix it) and the decision. */
export async function ListingReviewCard({ l }: { l: QueueListing }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  return (
    <div className="sob-item sob-cat-card" data-cat={catForCategory(l.category)}>
      <h3>{l.name}</h3>
      <div className="meta">
        <span>
          <T s={'by {seller}'} v={{ seller: l.seller }} />
        </span>
        <span className="sob-cat-tag">{l.category}</span>
        <span>{l.platform}</span>
        <span>{money(l.priceCents)}</span>
        <span>{l.licence ?? tx('no licence type')}</span>
        {l.hasTrial && (
          <span>
            <T s={'has a trial copy'} />
          </span>
        )}
      </div>
      <p>{l.description}</p>
      <ul className="sob-checks">
        {l.includes.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      <div className="meta">
        {l.demoUrl && (
          <a href={l.demoUrl} target="_blank" rel="noopener noreferrer nofollow">
            <T s={'Demo'} />
          </a>
        )}
        {l.codeUrl && (
          <a href={l.codeUrl} target="_blank" rel="noopener noreferrer nofollow">
            <T s={'Files (private link)'} />
          </a>
        )}
        {l.sampleUrl && (
          <a href={l.sampleUrl} target="_blank" rel="noopener noreferrer nofollow">
            <T s={'Free sample'} />
          </a>
        )}
        <Link href={`/product/${l.slug}`}>
          <T s={'Listing page'} />
        </Link>
        <Link href={`/admin/seo/product?slug=${encodeURIComponent(l.slug)}`}>
          <T s={'Edit price and details'} />
        </Link>
      </div>
      {l.thirdParty.length > 0 && (
        <p className="muted">
          <T s={'Third-party code:'} /> {l.thirdParty.map((t) => `${t.name} (${t.licence})`).join(', ')}
        </p>
      )}
      <div className="sob-acts" data-decisions>
        <AdminForm
          endpoint={`/api/admin/listings/${l.slug}/decide`}
          fixed={{ decision: 'approve' }}
          fields={[
            { name: 'note', label: tx('Note for the seller (optional)'), kind: 'textarea' },
            ...(l.digital ? [{ name: 'filesChecked', label: tx('I opened the files in a sandbox and they are clean (needed for a digital product)'), kind: 'checkbox' as const }] : []),
          ]}
          submit={tx('Approve and publish')}
          openLabel={tx('Approve')}
          tone="blue"
        />
        <AdminForm
          endpoint={`/api/admin/listings/${l.slug}/decide`}
          fixed={{ decision: 'reject' }}
          fields={[{ name: 'note', label: tx('Why is it declined? The seller reads this (at least 5 characters)'), kind: 'textarea', required: true }]}
          submit={tx('Decline')}
          openLabel={tx('Decline')}
          tone="line"
        />
        <AdminForm
          endpoint={`/api/admin/listings/${l.slug}/decide`}
          fixed={{ decision: 'changes' }}
          fields={[{ name: 'note', label: tx('What should the seller change? (at least 5 characters)'), kind: 'textarea', required: true }]}
          submit={tx('Send back')}
          openLabel={tx('Send back for changes')}
          tone="line"
        />
        <Link className="btn sm" href={`/admin/seo/product?slug=${encodeURIComponent(l.slug)}`}>
          <T s={'Edit the whole listing'} />
        </Link>
      </div>
    </div>
  );
}
