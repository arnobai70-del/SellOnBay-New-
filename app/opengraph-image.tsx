import { ImageResponse } from 'next/og';
import { BRAND_DOMAIN, BRAND_NAME } from '@/lib/brand';
import { CONFIG, PLAN_KEEP_TEXT } from '@/lib/config';
import { Mark } from '@/lib/og/Mark';

/*
 * The picture shown when a link to the site is shared (WhatsApp, Messenger, Facebook, X, LinkedIn): 1200x630 PNG in the Glass UI colours with the
 * blue SellOnBay mark. A website page draws its own (app/(glass)/websites/[slug]/opengraph-image.tsx).
 */
export const alt = `${BRAND_NAME}: full-stack websites, domains and a seller marketplace`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: 'linear-gradient(135deg, #EAF4F8 0%, #E3F3EC 55%, #EDF3F6 100%)',
        color: '#2B4250',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <Mark px={72} />
        <div style={{ fontSize: 46, fontWeight: 700 }}>{BRAND_NAME}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ fontSize: 70, fontWeight: 700, lineHeight: 1.08, maxWidth: 1000 }}>Buy a website. Get a domain. Or sell your own.</div>
        <div style={{ display: 'flex', fontSize: 32, color: '#566C78', maxWidth: 1000 }}>
          {`Full-stack websites with a live demo, paid into escrow and checked for ${CONFIG.review.hours} hours. Sellers keep ${PLAN_KEEP_TEXT}.`}
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: 30, color: '#1A5444' }}>{BRAND_DOMAIN}</div>
    </div>,
    size,
  );
}
