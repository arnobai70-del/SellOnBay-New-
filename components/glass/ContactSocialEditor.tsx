'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BRAND_DOMAIN } from '@/lib/brand';
import type { ContactRoutes } from '@/lib/site/contact';
import { checkSocialUrl, NETWORKS, type Network, type SocialLink } from '@/lib/site/social';
import { Button } from './Button';
import { Field } from './Field';
import { SocialRow } from './SocialRow';
import { Switch } from './Switch';

import { T } from '@/components/i18n/T';
type Row = { network: Network; url: string; enabled: boolean };
const LABEL: Record<keyof ContactRoutes, string> = {
  support: 'Support',
  sales: 'Sales',
  billing: 'Billing',
  business: 'Business',
  report: 'Reports and abuse',
  dev: 'Developers and alerts',
  administrator: 'Administrator',
};

async function post(body: unknown) {
  const res = await fetch('/api/admin/contact-social', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  const data = ((await res?.json().catch(() => null)) ?? {}) as { error?: string; issues?: { message?: string }[] };
  return res?.ok ? null : (data.issues?.[0]?.message ?? data.error ?? 'Could not save. Please try again.');
}

/* Admin › Settings › Contact & social (owner, 2026-11-08). The server checks everything again; this only collects and previews. */
export function ContactSocialEditor({ routes, social }: { routes: ContactRoutes; social: SocialLink[] }) {
  const router = useRouter();
  const [mail, setMail] = useState(routes);
  const [rows, setRows] = useState<Row[]>(social.map((s) => ({ network: s.network, url: s.url, enabled: s.enabled !== false })));
  const [add, setAdd] = useState<Network | ''>('');
  const [drag, setDrag] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const free = (Object.keys(NETWORKS) as Network[]).filter((n) => !rows.some((r) => r.network === n));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length || from === to) return;
    const next = [...rows];
    const [r] = next.splice(from, 1);
    next.splice(to, 0, r);
    setRows(next);
  };
  const problems = rows.map((r) => (r.url ? checkSocialUrl(r.network, r.url) : { ok: false as const, error: `${NETWORKS[r.network].label}: add the address.` }));
  const save = async (part: 'contact' | 'social') => {
    setMsg(null);
    if (part === 'social') {
      const bad = problems.find((p) => !p.ok);
      if (bad && !bad.ok) return setMsg({ ok: false, text: bad.error });
    }
    setBusy(true);
    const error = await post(part === 'contact' ? { contact: mail } : { social: rows });
    setBusy(false);
    setMsg(error ? { ok: false, text: error } : { ok: true, text: 'Saved. It shows on the site within a minute.' });
    if (!error) router.refresh();
  };
  return (
    <div className="sob-stack">
      <section className="glass card">
        <h2>
          <T s={'Contact addresses'} />
        </h2>
        <p className="tag">
          <T s={'Each must end with @{BRAND_DOMAIN}. Email routing uses them at once.'} v={{ BRAND_DOMAIN }} />
        </p>
        <div className="grid2" style={{ marginTop: 10 }}>
          {(Object.keys(LABEL) as (keyof ContactRoutes)[]).map((k) => (
            <Field key={k} label={LABEL[k]} type="email" value={mail[k]} onChange={(e) => setMail({ ...mail, [k]: e.target.value.trim().toLowerCase() })} />
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <Button onClick={() => save('contact')} disabled={busy}>
            <T s={'Save addresses'} />
          </Button>
        </div>
      </section>

      <section className="glass card">
        <h2>
          <T s={'Social links'} />
        </h2>
        <p className="tag">
          <T s={"Drag a row, or use the arrows, to change the order. Each address must be https on that network's own site."} />
        </p>
        <ol className="sob-stack" style={{ listStyle: 'none', padding: 0, marginTop: 10 }}>
          {rows.map((r, i) => (
            <li
              key={r.network}
              className="li"
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (drag !== null) move(drag, i);
                setDrag(null);
              }}
              style={{ flexWrap: 'wrap', gap: 8, opacity: drag === i ? 0.5 : 1 }}
            >
              <span aria-hidden="true" style={{ cursor: 'grab' }}>
                ⠿
              </span>
              <b style={{ width: 90 }}>{NETWORKS[r.network].label}</b>
              <input
                className="input"
                style={{ flex: '1 1 220px', minWidth: 0 }}
                aria-label={`${NETWORKS[r.network].label} address`}
                value={r.url}
                placeholder={`https://${NETWORKS[r.network].hosts[0]}/sellonbay`}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, url: e.target.value.trim() } : x)))}
              />
              <Switch label={`Show ${NETWORKS[r.network].label}`} checked={r.enabled} onChange={(on) => setRows(rows.map((x, j) => (j === i ? { ...x, enabled: on } : x)))} />
              <button type="button" className="btn ghost sm" aria-label={`Move ${NETWORKS[r.network].label} up`} onClick={() => move(i, i - 1)} disabled={i === 0}>
                ↑
              </button>
              <button type="button" className="btn ghost sm" aria-label={`Move ${NETWORKS[r.network].label} down`} onClick={() => move(i, i + 1)} disabled={i === rows.length - 1}>
                ↓
              </button>
              <button type="button" className="btn ghost sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <T s={'Remove'} />
              </button>
              {!problems[i].ok && r.url && (
                <span className="sob-err" style={{ flexBasis: '100%' }}>
                  {(problems[i] as { error: string }).error}
                </span>
              )}
            </li>
          ))}
        </ol>
        {free.length > 0 && (
          <div className="row" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
            <label className="hidden-label" htmlFor="add-network">
              <T s={'Network to add'} />
            </label>
            <select id="add-network" className="input" style={{ maxWidth: 200 }} value={add} onChange={(e) => setAdd(e.target.value as Network)}>
              <option value="">
                <T s={'Choose a network'} />
              </option>
              {free.map((n) => (
                <option key={n} value={n}>
                  {NETWORKS[n].label}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="sm"
              disabled={!add}
              onClick={() => {
                if (!add) return;
                setRows([...rows, { network: add, url: '', enabled: true }]);
                setAdd('');
              }}
            >
              <T s={'Add'} />
            </Button>
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <span className="tag">
            <T s={'Footer preview'} />
          </span>
          <div className="glass" style={{ padding: 12, borderRadius: 12, marginTop: 6 }}>
            {rows.some((r, i) => r.enabled && problems[i].ok) ? (
              <SocialRow links={rows.filter((r, i) => problems[i].ok).map((r) => ({ network: r.network, url: r.url, ...(r.enabled ? {} : { enabled: false as const }) }))} label="Preview" />
            ) : (
              <span className="tag">
                <T s={'No links are shown: the row is hidden.'} />
              </span>
            )}
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Button onClick={() => save('social')} disabled={busy}>
            <T s={'Save social links'} />
          </Button>
        </div>
      </section>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'tag' : 'sob-err'}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
