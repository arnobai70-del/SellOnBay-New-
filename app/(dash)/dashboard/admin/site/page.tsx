import type { Metadata } from 'next';
import Link from 'next/link';
import { DashShell } from '@/components/DashShell';
import { FOOTER_COLUMNS } from '@/components/Footer';
import { BlocksBuilder, FooterBuilder, MenuBuilder, SectionsBuilder } from '@/components/SiteBuilder';
import { applyNav } from '@/lib/navConfig';
import { MARKET_MENU } from '@/lib/marketMenu';
import { navConfig } from '@/lib/seo/navStore';
import { realListings } from '@/lib/seo/hubStore';
import { SEO_PAGES } from '@/lib/seo/pageList';
import { entriesToMenu, HOME_SECTIONS } from '@/lib/site/content';
import { homeSections, pageBlocks, pagesWithBlocks, savedFooter, savedMenu } from '@/lib/site/contentStore';
import { requireViewer } from '@/lib/supabase/viewer';

export const metadata: Metadata = { title: 'Site builder', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TABS: [string, string][] = [
  ['menu', 'Top menu'],
  ['footer', 'Footer'],
  ['sections', 'Home sections'],
  ['blocks', 'Page blocks'],
];

/* Edit the pieces of the site from one place: the top menu, the footer columns, and blocks (headings, text, pictures, buttons, listings, questions) on any page. */
export default async function SiteBuilderPage({ searchParams }: { searchParams: Promise<{ tab?: string; path?: string }> }) {
  const viewer = await requireViewer({ path: '/dashboard/admin/site', roles: ['admin'] });
  const q = await searchParams;
  const tab = TABS.some(([k]) => k === q.tab) ? q.tab! : 'menu';
  const pages: [string, string][] = [['/', 'Home page'], ...SEO_PAGES.filter((p) => p.path !== '/').map((p) => [p.path, p.name] as [string, string])];
  const path = pages.some(([p]) => p === q.path) || /^[/]product[/][A-Za-z0-9_-]{1,80}$/.test(q.path ?? '') ? q.path! : '/';

  const menu = tab === 'menu' ? await savedMenu(0) : null;
  const footer = tab === 'footer' ? await savedFooter(0) : null;
  const withBlocks = tab === 'blocks' ? await pagesWithBlocks() : [];
  const blocks = tab === 'blocks' ? await pageBlocks(path) : [];
  const listings = tab === 'blocks' ? (await realListings()).map((p) => [p.id, p.name] as [string, string]) : [];

  return (
    <DashShell name={viewer?.name} signedIn={!!viewer} viewerRole={viewer?.role} role="admin" active="admin-site" title="Site builder">
      <div className="dp">
        <div className="hd">
          <div>
            <h2>Build the site</h2>
            <p className="sub">
              Add, remove and reorder the menu, the footer and the blocks of any page. Nothing changes on the site until you save, and each part can go back to the built-in version.
            </p>
          </div>
        </div>
        <div className="adm-btns" aria-label="Parts of the site">
          {TABS.map(([k, label]) => (
            <Link key={k} className={'btn btn-sm ' + (tab === k ? 'btn-dark' : 'btn-line')} href={`/dashboard/admin/site?tab=${k}`}>
              {label}
            </Link>
          ))}
        </div>

        {tab === 'menu' && <MenuBuilder initial={menu ?? entriesToMenu(applyNav(MARKET_MENU, await navConfig(0)))} custom={!!menu} />}

        {tab === 'sections' && <SectionsBuilder keys={HOME_SECTIONS} initial={await homeSections()} />}

        {tab === 'footer' && <FooterBuilder initial={footer ?? FOOTER_COLUMNS.map((c) => ({ title: c.title, links: c.links.map(([label, href]) => ({ label, href })) }))} custom={!!footer} />}

        {tab === 'blocks' && (
          <>
            <div className="field" style={{ marginTop: 14 }}>
              <label>Page</label>
              <div className="adm-btns">
                {pages.map(([p, name]) => (
                  <Link key={p} className={'btn btn-sm ' + (p === path ? 'btn-dark' : 'btn-line')} href={`/dashboard/admin/site?tab=blocks&path=${encodeURIComponent(p)}`}>
                    {name}
                    {withBlocks.includes(p) ? ' •' : ''}
                  </Link>
                ))}
              </div>
              <small>A dot means the page already has blocks.</small>
              <label style={{ marginTop: 10 }}>Or a listing</label>
              <div className="adm-btns">
                {listings.slice(0, 40).map(([id, name]) => (
                  <Link
                    key={id}
                    className={'btn btn-sm ' + (path === `/product/${id}` ? 'btn-dark' : 'btn-line')}
                    href={`/dashboard/admin/site?tab=blocks&path=${encodeURIComponent(`/product/${id}`)}`}
                  >
                    {name}
                    {withBlocks.includes(`/product/${id}`) ? ' •' : ''}
                  </Link>
                ))}
                {listings.length === 0 && <small className="muted">No live listings yet.</small>}
              </div>
            </div>
            <BlocksBuilder key={path} path={path} initial={blocks} listings={listings} />
          </>
        )}
      </div>
    </DashShell>
  );
}
