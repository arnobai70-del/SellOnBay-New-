import { DevBrowse } from '@/components/DevBrowse';
import { AREAS, LANGS } from '@/lib/developers';
import { getDevs } from '@/lib/devsDb';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { PageExtras } from '@/components/PageExtras';

export const generateMetadata = () => pageMetadata('/developers');
export const dynamic = 'force-dynamic';

export default async function Developers({ searchParams }: { searchParams: Promise<{ lang?: string; area?: string; q?: string }> }) {
  const sp = await searchParams;
  const devs = await getDevs();
  // Junk values in the address are ignored.
  const lang = (LANGS as readonly string[]).includes(sp.lang ?? '') ? sp.lang : undefined;
  const area = (AREAS as readonly string[]).includes(sp.area ?? '') ? sp.area : undefined;
  return (
    <>
      <DevBrowse devs={devs} initial={{ lang, area, q: (sp.q ?? '').slice(0, 60) }} />
      <PageExtras path="/developers" />
    </>
  );
}
