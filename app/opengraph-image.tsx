import { ImageResponse } from 'next/og';
import { BRAND_DOMAIN, BRAND_NAME } from '@/lib/brand';
import { CONFIG } from '@/lib/config';

/* The picture shown when a link to the site is shared (WhatsApp, Facebook, X, LinkedIn). Drawn from the brand colours, no photos. */
export const alt = `${BRAND_NAME}: ready-made websites, apps and digital products`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#0F1330', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: '#2B3DFF', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: '#FFB52E' }} />
        </div>
        <div style={{ fontSize: 44, fontWeight: 800 }}>{BRAND_NAME}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, maxWidth: 980 }}>Ready-made websites, apps and digital products.</div>
        <div style={{ display: 'flex', fontSize: 34, color: '#C9CEF5' }}>
          {`Live on your own domain in ${CONFIG.delivery.minDays} to ${CONFIG.delivery.maxDays} days. Payment is held until you accept.`}
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: 30, color: '#FFB52E' }}>{BRAND_DOMAIN}</div>
    </div>,
    size,
  );
}
