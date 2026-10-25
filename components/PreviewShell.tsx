'use client';
import Link from 'next/link';
import { useState } from 'react';
import { money, type Product } from '@/lib/data';
import { TemplatePage } from './TemplatePage';

/* Sandbox for a seller's site: scripts and forms work, but it can never read our cookies or sign-in (no allow-same-origin). */
export const DEMO_SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals';

export function DemoView({ p, className }: { p: Product; className?: string }) {
  if (!p.demo)
    return (
      <div className={className}>
        <TemplatePage p={p} />
      </div>
    );
  return <iframe className={className} src={p.demo.src} title={`${p.name} demo`} sandbox={DEMO_SANDBOX} loading="lazy" referrerPolicy="no-referrer" />;
}

/* Full-page preview, like opening the live demo: a slim bar on top, the whole site below, Desktop or Phone. */
export function PreviewShell({ p }: { p: Product }) {
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  return (
    <div className="ps">
      <header className="ps-bar">
        <Link className="ps-back" href={`/product/${p.id}`}>
          Back to details
        </Link>
        <div className="ps-mid">
          <h1 className="ps-title">{p.name}</h1>
          <div className="seg ps-seg" role="group" aria-label="Device">
            <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>
              Desktop
            </button>
            <button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')}>
              Phone
            </button>
          </div>
        </div>
        <div className="ps-end">
          {p.demo?.type === 'url' && (
            <a className="ps-open" href={p.demo.src} target="_blank" rel="noopener noreferrer">
              Open in a new tab
            </a>
          )}
          <Link className="ps-report" href="/report-abuse">
            Report
          </Link>
          <Link className="btn btn-blue btn-sm" href={`/checkout?id=${p.id}&pkg=asis`}>
            Get this site {money(p.price)}
          </Link>
        </div>
      </header>
      <div className="ps-stage" data-device={device}>
        {device === 'desktop' ? (
          <DemoView p={p} className="ps-view" />
        ) : (
          <div className="phone ps-phone">
            <div className="phone-bar">{p.id}.com</div>
            <DemoView p={p} className="ps-view ps-view-phone" />
          </div>
        )}
      </div>
    </div>
  );
}
