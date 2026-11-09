import type { Metadata } from 'next';
import Link from 'next/link';
import { BuyerShell } from '@/components/glass/BuyerShell';
import { CONFIG, DAY_MS } from '@/lib/config';
import { buyerDomains, buyerOrders } from '@/lib/glass/buyer';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Domains', robots: { index: false } };
export const dynamic = 'force-dynamic';

const month = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/*
 * design-reference/buyer-domains.html. No registrar is connected yet (owner, 2026-11-07): domains are registered by hand, in the buyer's own
 * name, so renewing, DNS changes and the transfer code are asked for through Support, and reminders are emailed (lib/config.ts).
 */
export default async function BuyerDomains() {
  const viewer = await requireViewer({ path: '/dashboard/buyer/domains', roles: ['buyer', 'seller'] });
  const domains = viewer ? await buyerDomains(viewer.id, await buyerOrders(viewer.id)) : [];
  const now = Date.now();
  const me = viewer?.name ? `${viewer.name.split(' ')[0]} (you)` : 'You';
  return (
    <BuyerShell viewer={viewer} active="domains" file="buyer-domains" title="Domains" head={false}>
      <div className="row">
        <div>
          <h1>Domains</h1>
          <div className="tag">Registered in your own name · renew, connect and transfer</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn ghost" href="/dashboard/buyer/support" prefetch={false}>
            Transfer a domain in
          </Link>
          <Link className="btn" href="/domains" prefetch={false}>
            + Find a new domain
          </Link>
        </div>
      </div>
      {domains.length ? (
        <div className="grid3">
          {domains.map((d) => {
            const left = d.expires ? Math.ceil((Date.parse(d.expires) - now) / DAY_MS) : null;
            const soon = left !== null && left <= 30;
            return (
              <section key={d.name} className="glass dc">
                <div className="row">
                  <b style={{ fontWeight: 500, fontSize: 17 }}>{d.name}</b>
                  <span className={`status ${d.status === 'requested' ? 'st-wait' : soon ? 'st-bad' : 'st-ok'}`}>{d.status === 'requested' ? 'Setting up' : soon ? 'Expires soon' : 'Active'}</span>
                </div>
                <div className="tag" style={{ margin: 0 }}>
                  Owner: {me} · {d.status === 'requested' ? 'being registered' : left === null ? 'expiry not recorded' : soon ? `expires in ${left} days` : `expires ${month(d.expires!)}`}
                </div>
                <div className="li" style={{ fontSize: 14, padding: '8px 0' }}>
                  <span style={{ flex: 1 }}>Connected to</span>
                  <span className="muted">{d.site ?? 'Not connected'}</span>
                </div>
                <div className="row" style={{ fontSize: 14 }}>
                  <span>Renewal</span>
                  <span className="tag" style={{ margin: 0 }}>
                    By hand, we remind you
                  </span>
                </div>
                <div className="row" style={{ fontSize: 14 }}>
                  <span>Auto-renew</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="status st-draft">Coming soon</span>
                    <button type="button" className="sw" disabled aria-label="Auto-renew (coming soon)" />
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link className="btn sm" href="/dashboard/buyer/support" prefetch={false}>
                    Renew 1 year
                  </Link>
                  <button className="btn sm ghost" type="button" disabled title="DNS settings are coming soon; ask Support for a change">
                    DNS settings
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="glass card">
          <h2>No domains yet</h2>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, margin: '8px 0 0' }}>
            Ask for a domain when you request a website, or use one you already own.
          </p>
        </section>
      )}
      <section className="glass card">
        <div className="row">
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <h2>DNS</h2>
              <span className="status st-draft">Coming soon</span>
            </div>
            <div className="tag">The seller connects your domain to your website when it goes live. To point it somewhere else, ask us and we change the records for you.</div>
          </div>
          <Link className="btn sm ghost" href="/dashboard/buyer/support" prefetch={false}>
            Ask for a change
          </Link>
        </div>
      </section>
      <div className="grid2">
        <section className="glass card">
          <h2>Reminders</h2>
          <div className="li" style={{ fontSize: 14 }}>
            <span style={{ flex: 1 }}>Email me {CONFIG.domain.reminderDays.join(', ')} days before expiry</span>
            <span className="status st-ok">On</span>
          </div>
          <div className="tag">
            Emails go to the address on your <Link href="/dashboard/buyer/account">account</Link>.
          </div>
        </section>
        <section className="glass card">
          <h2>Transfer out</h2>
          <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, margin: '8px 0 12px' }}>
            The domain is yours. Ask us for the authorization code to move it to another registrar any time after 60 days from registration.
          </p>
          <Link className="btn sm ghost" href="/dashboard/buyer/support" prefetch={false}>
            Get transfer code
          </Link>
        </section>
      </div>
    </BuyerShell>
  );
}
