import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminShell } from '@/components/glass/AdminShell';
import { GlassCard } from '@/components/glass/GlassCard';
import { StatusPill } from '@/components/glass/StatusPill';
import { alertCriticals, serverHealth } from '@/lib/admin/health';
import type { Level, Metric } from '@/lib/admin/healthCore';
import { limit } from '@/lib/rateLimit';
import { requireViewer } from '@/lib/supabase/viewer';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const metadata: Metadata = { title: 'Server health', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TONE: Record<Level, 'ok' | 'wait' | 'bad' | 'draft'> = { ok: 'ok', warn: 'wait', bad: 'bad', off: 'draft' };
const WORD: Record<Level, string> = { ok: 'Normal', warn: 'Warning', bad: 'Critical', off: 'Not measured' };

function Rows({ list }: { list: Metric[] }) {
  return (
    <>
      {list.map((m) => (
        <div key={m.key} className="li" style={{ flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 160 }}>{m.label}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{m.value}</span>
          <StatusPill tone={TONE[m.level]}>{WORD[m.level]}</StatusPill>
          {m.note && (
            <span className="tag" style={{ flexBasis: '100%' }}>
              {m.note}
            </span>
          )}
        </div>
      ))}
    </>
  );
}

/*
 * Admin › System › Server health (owner, 2026-11-08): read only, Super Admin or Dev, at most 20 loads a minute each. Under 80% normal, 80 to 90%
 * a warning, over 90% critical; a critical metric emails dev@ at most once an hour. No key or value from the environment is ever shown.
 */
export default async function ServerHealth() {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const viewer = await requireViewer({ path: '/admin/system', roles: ['admin'], scope: 'dev' });
  if (!(await limit(`health-page:${viewer?.id ?? 'demo'}`, 20, 60_000)))
    return (
      <AdminShell viewer={viewer} active="system" title={tx('Server health')}>
        <GlassCard as="section" role="status">
          <T s={'Too many refreshes. Wait a minute and load the page again.'} />
        </GlassCard>
      </AdminShell>
    );
  const h = await serverHealth();
  await alertCriticals(h);
  const worst: Level = [...h.machine, ...h.metrics].some((m) => m.level === 'bad') ? 'bad' : [...h.machine, ...h.metrics].some((m) => m.level === 'warn') ? 'warn' : 'ok';
  return (
    <AdminShell
      viewer={viewer}
      active="system"
      title={tx('Server health')}
      subtitle={
        <>
          <T s={'Read only. Checked {v0} UTC.'} v={{ v0: new Date(h.at).toISOString().slice(11, 16) }} />
        </>
      }
    >
      <GlassCard as="section">
        <p>
          <StatusPill tone={TONE[worst]}>{worst === 'ok' ? tx('All normal') : worst === 'warn' ? tx('Something needs a look') : tx('Something is critical')}</StatusPill>
        </p>
        <p className="tag" style={{ marginTop: 8 }}>
          <T s={'Under 80% normal, 80 to 90% warning, over 90% critical. A critical figure emails dev@ at most once an hour.'} />
        </p>
      </GlassCard>
      <GlassCard as="section">
        <h2>
          <T s={'The machine'} />
        </h2>
        {h.machine.length ? (
          <Rows list={h.machine} />
        ) : (
          <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
            {h.hostNote}
          </p>
        )}
      </GlassCard>
      <GlassCard as="section">
        <h2>
          <T s={'The site'} />
        </h2>
        <Rows list={h.metrics} />
      </GlassCard>
      <p>
        <Link href="/admin/system/details">
          <T s={'Services, build, database and error details'} />
        </Link>
      </p>
    </AdminShell>
  );
}
