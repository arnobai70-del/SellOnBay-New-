'use client';
import Link from 'next/link';
import { useState } from 'react';
import { brandFromDomain, cleanDomain } from '@/lib/domain';
import type { Product } from '@/lib/data';
import { DemoView } from './PreviewShell';
import { ScaledPage } from './ScaledPage';
import { TemplatePage } from './TemplatePage';

/* "Preview in browser": scroll the whole site inside a desktop or phone frame, and try it with your own domain. */
export function PreviewFrame({ p }: { p: Product }) {
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [value, setValue] = useState('');
  const typed = cleanDomain(value);
  const shown = typed || p.name.toLowerCase().replace(/[^a-z]/g, '') + '.com';
  const brand = typed ? brandFromDomain(typed) : undefined;
  const href = `/checkout?id=${p.id}&pkg=asis${typed ? '&domain=' + encodeURIComponent(typed) : ''}`;

  return (
    <section className="pf" aria-label="Preview in browser">
      <div className="pf-bar">
        <div className="seg pf-seg" role="group" aria-label="Device">
          <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>
            Desktop
          </button>
          <button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')}>
            Phone
          </button>
        </div>
        <label className="field pf-domain">
          <span className="sr">See it on your domain</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="See it on your domain: mybusiness.com" autoComplete="off" spellCheck={false} />
        </label>
        <Link className="btn btn-line btn-sm" href={`/preview/${p.id}`} target="_blank">
          Preview in browser
        </Link>
        <Link className="btn btn-blue btn-sm" href={href}>
          {typed ? `Use ${typed}` : 'Use this site'}
        </Link>
      </div>

      <div className="pf-stage">
        {device === 'desktop' ? (
          <div className="frame pf-desktop">
            <div className="frame-bar">
              <i />
              <i />
              <i />
              <span>https://{shown}</span>
            </div>
            {p.demo ? (
              <DemoView p={p} className="pf-scroll pf-frame" />
            ) : (
              <div className="pf-scroll" tabIndex={0} aria-label="Scrollable site preview">
                <ScaledPage>
                  <TemplatePage p={p} brand={brand} domain={typed || undefined} />
                </ScaledPage>
              </div>
            )}
          </div>
        ) : (
          <div className="phone pf-phone">
            <div className="phone-bar">{shown}</div>
            {p.demo ? (
              <DemoView p={p} className="pf-scroll pf-phone-scroll pf-frame" />
            ) : (
              <div className="pf-scroll pf-phone-scroll" tabIndex={0} aria-label="Scrollable site preview">
                <TemplatePage p={p} brand={brand} domain={typed || undefined} />
              </div>
            )}
          </div>
        )}
      </div>
      <p className="muted pf-note">Preview only. Scroll inside the frame. Your seller sets up the real site on your domain after payment.</p>
    </section>
  );
}
