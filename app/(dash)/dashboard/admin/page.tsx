import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminForm, type Field } from '@/components/AdminForm';
import { DashIcon, type IconName } from '@/components/DashIcon';
import { DashShell } from '@/components/DashShell';
import { ListingReviewCard } from '@/components/ListingReviewCard';
import { devQueue, listReports, listingQueue } from '@/lib/admin/queue';
import { ageText, opsQueues } from '@/lib/admin/opsQueues';
import { SCOPE_LABEL, hasScope } from '@/lib/admin/scopes';
import { openDisputes } from '@/lib/disputes';
import { listPayouts } from '@/lib/payouts';
import { blockedList } from '@/lib/presale/service';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

const REASON_LABEL: Record<string, string> = { email: 'email address', phone: 'phone number', contact_channel: 'other contact channel', link: 'link', outside_payment: 'outside payment' };
const SHORTCUTS: { label: string; text: string; href: string; icon: IconName }[] = [
  { label: 'Listings', text: 'Approve new sites and fix prices', href: '/dashboard/admin/listings', icon: 'bag' },
  { label: 'Site builder', text: 'Menu, footer and page blocks', href: '/dashboard/admin/site', icon: 'layers' },
  { label: 'Write a blog post', text: 'With its own meta title and description', href: '/dashboard/admin/seo/post', icon: 'plus' },
  { label: 'SEO and blog', text: 'Posts, Google title, Search Console', href: '/dashboard/admin/seo', icon: 'search' },
  { label: 'Pages', text: 'Heading, text, meta title and description', href: '/dashboard/admin/seo/pages', icon: 'list' },
  { label: 'Accounts', text: 'Find, ban or unban a person', href: '/dashboard/admin/users', icon: 'user' },
  { label: 'Risk', text: 'Daily numbers and the emergency switch', href: '/dashboard/admin/risk', icon: 'pulse' },
  { label: 'Settings', text: 'Site switches and limits', href: '/dashboard/admin/settings', icon: 'gear' },
  { label: 'Launch check', text: 'What the live server still needs', href: '/dashboard/admin/launch', icon: 'check' },
];

const decisionFields = (digital: boolean): Field[] => [
  {
    name: 'decision',
    label: 'Decision',
    kind: 'select',
    options: [
      ['approve', 'Approve and publish'],
      ['changes', 'Send back for changes'],
      ['reject', 'Reject'],
    ],
  },
  { name: 'note', label: 'Note for the seller (needed unless you approve)', kind: 'textarea' },
  ...(digital ? [{ name: 'filesChecked', label: 'I opened the files in a sandbox and they are clean (needed to approve a digital product)', kind: 'checkbox' as const }] : []),
];

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/admin', roles: ['admin'] });
  const { denied } = await searchParams;
  const [ops, listings, devs, disputes, payouts, reports, blocked] = await Promise.all([
    opsQueues(),
    listingQueue(),
    devQueue(),
    openDisputes(),
    listPayouts({ status: ['scheduled', 'exported'] }),
    listReports(true),
    blockedList(30),
  ]);
  const counts: { label: string; n: number; href: string; icon: IconName; tone: string }[] = [
    { label: 'Listings to review', n: listings.length, href: '/dashboard/admin/listings', icon: 'bag', tone: 'blue' },
    { label: 'Developer profiles', n: devs.length, href: '#developers', icon: 'user', tone: 'violet' },
    { label: 'Open disputes', n: disputes.length, href: '/dashboard/admin/disputes', icon: 'scale', tone: 'rose' },
    { label: 'Payouts to send', n: payouts.length, href: '/dashboard/admin/payouts', icon: 'wallet', tone: 'mint' },
    { label: 'Abuse reports', n: reports.length, href: '/dashboard/admin/abuse', icon: 'flag', tone: 'gold' },
  ];
  const queues = ops.filter((q) => !viewer || hasScope(viewer.scopes, q.scope));
  // The menu shows how much waits behind each item (DashShell badges): the work queues and the counts above, by menu key.
  const QUEUE_ITEM: Record<string, string> = {
    requests: 'admin-requests',
    custom: 'admin-requests',
    super: 'admin-requests',
    payments: 'admin-payments-review',
    releases: 'admin-releases',
    revisions: 'admin-revisions',
    files: 'admin-files',
    tickets: 'admin-support',
    plans: 'admin-sellers',
  };
  const badges: Record<string, number> = { 'admin-listings': listings.length, 'admin-disputes': disputes.length, 'admin-payouts': payouts.length, 'admin-abuse': reports.length };
  for (const q of queues) if (QUEUE_ITEM[q.key]) badges[QUEUE_ITEM[q.key]] = (badges[QUEUE_ITEM[q.key]] ?? 0) + q.n;
  const scopes = viewer?.scopes ?? [];
  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin" title="Admin overview" badges={badges}>
      {denied && (
        <p className="note warn" role="alert" data-denied>
          <span>Your admin account does not have permission for that page. A Super Admin can change your permissions.</span>
        </p>
      )}
      <div className="dp adm-hello">
        <small className="adm-label">Admin overview</small>
        <h2>{viewer?.name ? `Hello, ${viewer.name.split(' ')[0]}` : 'Hello'}</h2>
        <div className="adm-chips">
          {scopes.map((sc) => (
            <span key={sc} className="chip st-violet">
              <i />
              {SCOPE_LABEL[sc]}
            </span>
          ))}
        </div>
      </div>

      <div className="kpis">
        {counts.map((c) => (
          <Link key={c.label} href={c.href} className={'kpi' + (c.n > 0 ? ' kpi-on' : '')}>
            <span className={'kpi-i ' + c.tone}>
              <DashIcon n={c.icon} />
            </span>
            <small>{c.label}</small>
            <b>{c.n}</b>
            <em>{c.n > 0 ? 'Needs you' : 'All clear'}</em>
          </Link>
        ))}
      </div>

      <div className="dp" data-ops-queues>
        <div className="hd">
          <div>
            <h2>Waiting for you</h2>
            <p className="sub">
              Requests, payments, releases and the rest, with how long the oldest has waited. Releases aim for 12 hours, every day of the year; a missed target never releases anything.
            </p>
          </div>
        </div>
        <div className="ops-grid">
          {queues.map((q) => (
            <Link key={q.key} href={q.href} className={'ops-tile' + (q.overdue ? ' late' : '') + (q.n > 0 ? ' on' : '')} data-queue={q.key}>
              <span className="ops-top">
                <span>{q.label}</span>
                <span className="ops-scope">{SCOPE_LABEL[q.scope]}</span>
              </span>
              <b>{q.n}</b>
              <small>{q.n === 0 ? 'All clear' : q.overdue ? `${q.overdue} past the target · oldest ${ageText(q.oldestAt)}` : `oldest ${ageText(q.oldestAt)}`}</small>
            </Link>
          ))}
        </div>
      </div>

      <div className="dp" id="listings">
        <div className="hd">
          <div>
            <h2>New listings</h2>
            <p className="sub">Read the listing, open the demo and the files, then decide. The seller is told your note. Open the files in a sandbox first.</p>
          </div>
        </div>
        {listings.length === 0 && <p className="muted">Nothing is waiting for review.</p>}
        {listings.map((l) => (
          <ListingReviewCard key={l.slug} l={l} />
        ))}
      </div>

      <div className="dp" id="developers">
        <div className="hd">
          <div>
            <h2>Developer profiles</h2>
            <p className="sub">Profiles stay hidden until you approve them.</p>
          </div>
        </div>
        {devs.length === 0 && <p className="muted">Nothing is waiting for review.</p>}
        {devs.map((d) => (
          <div className="adm-card" key={d.handle}>
            <h3>{d.name}</h3>
            <p>
              <b>{d.headline}</b>
            </p>
            <p>{d.bio}</p>
            <AdminForm endpoint={`/api/admin/developers/${d.handle}/decide`} fields={decisionFields(false)} submit="Save decision" openLabel="Decide" tone="gold" />
          </div>
        ))}
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Blocked messages</h2>
            <p className="sub">Attempts to share contact details or pay outside. Three in 30 days warn the person, five suspend the account.</p>
          </div>
        </div>
        <ul className="lst" data-blocked-list>
          {blocked.length === 0 && (
            <li>
              <div className="grow">
                <small>No blocked messages yet.</small>
              </div>
            </li>
          )}
          {blocked.map((m) => (
            <li key={m.id}>
              <span className="av">{(m.sender_name || m.sender_id)[0]?.toUpperCase()}</span>
              <div className="grow">
                <b>
                  {m.sender_name || 'User ' + String(m.sender_id).slice(0, 8)} · {REASON_LABEL[m.reason] ?? m.reason}
                </b>
                <small>
                  {m.context === 'presale' ? 'Pre-sale question' : m.context === 'presale_reply' ? 'Seller reply' : 'Order chat'}
                  {m.product_key ? ` on ${m.product_key}` : ''}: &ldquo;{(m.body ?? '').slice(0, 140)}&rdquo;
                </small>
              </div>
              <span className="chip st-pink">
                <i />
                Blocked
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="dp">
        <div className="hd">
          <div>
            <h2>Build the site</h2>
            <p className="sub">The pages you open most.</p>
          </div>
        </div>
        <div className="qlinks">
          {SHORTCUTS.map((q) => (
            <Link key={q.href + q.label} href={q.href} className="qlink">
              <span className="kpi-i">
                <DashIcon n={q.icon} />
              </span>
              <span>
                <b>{q.label}</b>
                <small>{q.text}</small>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </DashShell>
  );
}
