'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useToast } from './Toast';
import { Thumb } from './MiniSite';

/* ---------- countdown ---------- */
const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (s: number) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

export function Timer({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  return <td className="timer">{fmt(left)}</td>;
}

/* ---------- buyer: the order that is ready to review ---------- */
export function ReviewOrderRow({ seconds }: { seconds: number }) {
  const [accepted, setAccepted] = useState(false);
  const toast = useToast();
  return (
    <tr>
      <td>
        <div className="who">
          <Thumb theme="restaurant" />
          <div>
            <b>Saffron Table</b>
            <div className="muted" style={{ fontSize: 14 }}>
              mariasbakery.com
            </div>
          </div>
        </div>
      </td>
      <td>
        {accepted ? (
          <span className="chip mint">
            <i />
            Accepted
          </span>
        ) : (
          <span className="chip amber">
            <i />
            Ready to review
          </span>
        )}
      </td>
      <Timer seconds={seconds} />
      <td className="num">$69</td>
      <td>
        {accepted ? (
          <span className="muted">Seller paid in next payout</span>
        ) : (
          <>
            <button
              className="btn btn-gold btn-sm"
              onClick={() => {
                setAccepted(true);
                toast("Accepted. Payment moves to the seller's pending balance.");
              }}
            >
              Accept site
            </button>{' '}
            <Link className="btn btn-line btn-sm" href="/dashboard/buyer#dispute">
              Report problem
            </Link>
          </>
        )}
      </td>
    </tr>
  );
}

/* ---------- queue item: buttons toast, then the whole row fades and locks ---------- */
export type QAction = { label: string; cls: string; msg: string };

export function QueueItem({ lead, children, actions, extra }: { lead: React.ReactNode; children: React.ReactNode; actions: QAction[]; extra?: React.ReactNode }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  return (
    <div className="q-item" style={done ? { opacity: 0.45 } : undefined}>
      {lead}
      <div>{children}</div>
      <div className="acts">
        {extra}
        {actions.map((a) => (
          <button
            key={a.label}
            className={'btn btn-sm ' + a.cls}
            disabled={done}
            onClick={() => {
              setDone(true);
              toast(a.msg);
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- admin: tabs ---------- */
export function Tabs({ tabs, panes }: { tabs: { key: string; label: string }[]; panes: Record<string, React.ReactNode> }) {
  const [tab, setTab] = useState(tabs[0].key);
  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={t.key === tab} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} hidden={t.key !== tab}>
          {panes[t.key]}
        </div>
      ))}
    </>
  );
}
