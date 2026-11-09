import Link from 'next/link';
import { MarkRead } from '@/components/MarkRead';
import type { Notification } from '@/lib/notify';

/* The groups of the design's filter (design-reference/buyer-notifications.html, seller-notifications.html), by notification kind. */
export const GROUPS = { all: 'All', orders: 'Orders', websites: 'Websites', domains: 'Domains', payouts: 'Payouts', support: 'Support' } as const;
export type Group = keyof typeof GROUPS;
const groupOf = (k: string): Exclude<Group, 'all'> =>
  /domain/.test(k)
    ? 'domains'
    : /payout|identity|plan_/.test(k)
      ? 'payouts'
      : /dispute|message|ticket|chat|abuse|account_suspended/.test(k)
        ? 'support'
        : /listing|version|product_update|file_|repo_|files_released/.test(k)
          ? 'websites'
          : 'orders';
const LOOK: Record<Exclude<Group, 'all'>, [bg: string, path: string]> = {
  orders: ['#FBEFD9', 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'],
  websites: ['#E6E2F4', 'M12 4v12M7 11l5 5 5-5M5 20h14'],
  domains: ['#F6E3E0', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18'],
  payouts: ['#DCF0E7', 'M3 7h18v10H3zM7 12h.01M17 12h.01'],
  support: ['#DDEAF6', 'M4 5h16v11H8l-4 4z'],
};
const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60_000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : m < 2880 ? 'Yesterday' : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/*
 * The notifications page of both dashboards in the design's look: a filter by kind, "Mark all read" (/api/notifications), and each notice with its
 * icon and a way to what it is about. `link` gives the address for a notice (its order, the domains page...).
 */
export function NotificationsList({
  list,
  group,
  base,
  groups,
  link,
  now,
  labels = {},
}: {
  list: Notification[];
  group: Group;
  base: string;
  groups: Group[];
  link: (n: Notification, g: Exclude<Group, 'all'>) => [href: string, label: string];
  now: number;
  /* The seller's words for the groups (Sales, Listings, Disputes). */
  labels?: Partial<Record<Group, string>>;
}) {
  const unread = list.filter((n) => !n.read).length;
  const shown = group === 'all' ? list : list.filter((n) => groupOf(n.kind) === group);
  return (
    <>
      <div className="row">
        <div>
          <h1>Notifications</h1>
          <div className="tag">{unread} unread</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="seg" role="tablist" aria-label="Type">
            {groups.map((g) => (
              <Link key={g} role="tab" className={g === group ? 'on' : ''} aria-selected={g === group} href={g === 'all' ? base : `${base}?type=${g}`} prefetch={false}>
                {labels[g] ?? GROUPS[g]}
              </Link>
            ))}
          </div>
          {unread > 0 && <MarkRead />}
        </div>
      </div>
      <section className="glass" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {shown.length ? (
          shown.map((n) => {
            const g = groupOf(n.kind);
            const [href, label] = link(n, g);
            return (
              <div key={n.id} className={n.read ? 'nt' : 'nt unread'}>
                <span className="nic" style={{ background: LOOK[g][0] }} aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2B4250" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={LOOK[g][1]} />
                  </svg>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <b style={{ fontWeight: 500, fontSize: 14 }}>{n.subject}</b>
                    <span className="tag" style={{ margin: 0 }}>
                      {ago(n.at, now)}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>
                    {n.text}
                  </div>
                </div>
                <Link className="btn sm ghost" href={href} prefetch={false}>
                  {label}
                </Link>
              </div>
            );
          })
        ) : (
          <p className="muted" style={{ margin: 10, fontSize: 14 }}>
            Nothing here yet. Order updates, reminders and answers from us show up here.
          </p>
        )}
      </section>
    </>
  );
}
