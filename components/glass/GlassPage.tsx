import { getI18n } from '@/lib/i18n/server';
import { localizedPath } from '@/lib/i18n/config';
import { GlassFrame } from './GlassFrame';

/* GlassFrame with the cookie notice in the page's language (lib/i18n). Error pages use GlassFrame directly. */
export async function GlassPage({ kind = 'p', file, children }: { kind?: 'p' | 'd'; file: string; children: React.ReactNode }) {
  const i = await getI18n();
  const cookieWords = {
    region: i.t('cookie.region'),
    text: i.t('cookie.text'),
    more: i.t('cookie.more'),
    needed: i.t('cookie.needed'),
    all: i.t('cookie.all'),
    link: `${localizedPath('/legal/privacy', i.lang)}#cookies`,
  };
  return (
    <GlassFrame kind={kind} file={file} cookieWords={cookieWords}>
      {children}
    </GlassFrame>
  );
}
