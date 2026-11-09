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
    <div className="sob-ps">
      <header className="sob-ps-bar">
        <Link className="sob-ps-back" href={`/product/${p.id}`}>
          Back to details
        </Link>
        <div className="sob-ps-mid">
          <h1 className="sob-ps-title">{p.name}</h1>
          <div className="seg sob-ps-seg" role="group" aria-label="Device">
            <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>
              Desktop
            </button>
            <button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')}>
              Phone
            </button>
          </div>
        </div>
        <div className="sob-ps-end">
          {p.demo?.type === 'url' && (
            <a className="sob-ps-open" href={p.demo.src} target="_blank" rel="noopener noreferrer">
              Open in a new tab
            </a>
          )}
          <Link className="sob-ps-report" href="/report-abuse">
            Report
          </Link>
          <Link className="btn sm" href={`/checkout?id=${p.id}&pkg=asis`}>
            Get this site {money(p.price)}
          </Link>
        </div>
      </header>
      <div className="sob-ps-stage" data-device={device}>
        {device === 'desktop' ? (
          <DemoView p={p} className="sob-ps-view" />
        ) : (
          <div className="phone sob-ps-phone">
            <div className="sob-phone-bar">{p.id}.com</div>
            <DemoView p={p} className="sob-ps-view sob-ps-view-phone" />
          </div>
        )}
      </div>
    </div>
  );
}
