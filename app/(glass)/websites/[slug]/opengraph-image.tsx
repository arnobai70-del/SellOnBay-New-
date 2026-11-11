import { ImageResponse } from 'next/og';
import { BRAND_DOMAIN, BRAND_NAME } from '@/lib/brand';
import { publicWebsites } from '@/lib/glass/catalog';
import { publicSlug } from '@/lib/glass/publicSlug';
import { Mark } from '@/lib/og/Mark';
import { SITE_URL } from '@/lib/site';

/*
 * The share picture of one website (WhatsApp, Messenger, Facebook, X): its first screenshot beside its name, price and seller, 1200x630 PNG.
 * Only live, public websites; any other address gets the site's own picture text. JPEG or PNG screenshots only (what every app shows).
 */
export const alt = `A website on ${BRAND_NAME}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function shot(path: string | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const r = await fetch(new URL(path, SITE_URL), { signal: AbortSignal.timeout(4000) });
    const type = r.headers.get('content-type') ?? '';
    if (!r.ok || !/image\/(jpeg|png)/.test(type)) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    return bytes.length < 4_000_000 ? `data:${type};base64,${bytes.toString('base64')}` : null;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = (await publicWebsites()).find((w) => publicSlug(w.id) === slug || w.id === slug);
  const pic = await shot(p?.shots?.[0]);
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', background: 'linear-gradient(135deg, #EAF4F8 0%, #E3F3EC 60%, #EDF3F6 100%)', color: '#2B4250', padding: 56, gap: 48 }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: pic ? 470 : 1088 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Mark px={56} />
          <div style={{ fontSize: 36, fontWeight: 700 }}>{BRAND_NAME}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: pic ? 48 : 66, fontWeight: 700, lineHeight: 1.1 }}>{(p?.name ?? 'Full-stack websites with a live demo').slice(0, 90)}</div>
          {p && <div style={{ display: 'flex', fontSize: 28, color: '#566C78' }}>{`by ${p.seller} · live demo · escrow`}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {p ? (
            <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, color: '#1A5444', background: '#CDEBDF', borderRadius: 999, padding: '8px 28px' }}>{`$${Math.round(p.price)}`}</div>
          ) : (
            <div style={{ display: 'flex' }} />
          )}
          <div style={{ display: 'flex', fontSize: 26, color: '#1A5444' }}>{BRAND_DOMAIN}</div>
        </div>
      </div>
      {pic && (
        <div style={{ display: 'flex', width: 570, height: 518, borderRadius: 24, overflow: 'hidden', border: '2px solid #FFFFFF', boxShadow: '0 20px 50px rgba(43,66,80,.18)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og draws plain img elements */}
          <img src={pic} alt="" width={570} height={518} style={{ objectFit: 'cover', objectPosition: 'top' }} />
        </div>
      )}
    </div>,
    size,
  );
}
