'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { supabaseConfigured } from '@/lib/supabase/env';
import { DIGITAL_TOPICS, findAny, platformOf } from '@/lib/apps';
import type { MenuEntry } from '@/lib/marketMenu';
import { legacyPublic } from '@/lib/legacy';
import { SiteNav } from './SiteNav';

/* The digital shelf's topic lives in the address (?topic=audio). Read apart, under its own Suspense, so the rest of the bar still renders on the server. */
function TopicWatch({ set }: { set: (t: string) => void }) {
  const topic = useSearchParams().get('topic') ?? '';
  useEffect(() => set(topic), [topic, set]);
  return null;
}

/* Picks the highlighted nav item from the URL and swaps Sign in for My dashboard when signed in.
   The check runs in the browser so public pages stay static and fast. */
export function SiteNavByPath({ menu }: { menu?: MenuEntry[] }) {
  const path = usePathname();
  const [dash, setDash] = useState<string>();
  const [topic, setTopic] = useState('');
  const slugKey: Record<string, string> = { android: 'android', ios: 'ios', web: 'webapp', desktop: 'desktop', digital: 'digital' };
  const productKey = () => {
    const pl = findAny(path.split('/')[2]);
    if (pl && platformOf(pl) === 'digital') return DIGITAL_TOPICS.find((t) => t.cats.includes(pl.cat))?.key ?? 'digital';
    return pl && platformOf(pl) !== 'web' ? platformOf(pl) : 'browse';
  };
  // The five template categories: the home page is E-commerce Templates, /templates/<ending> the others.
  const hubKey = path === '/' ? 'ecommerce' : path.startsWith('/templates/') ? (path.split('/')[2] ?? '') : '';
  const active = !legacyPublic()
    ? hubKey
    : path.startsWith('/sell')
      ? 'sell'
      : path.startsWith('/developers')
        ? 'dev'
        : path.startsWith('/domains')
          ? 'domains'
          : path.startsWith('/find')
            ? 'find'
            : path.startsWith('/how-it-works')
              ? 'how'
              : path === '/apps/digital' && DIGITAL_TOPICS.some((t) => t.key === topic)
                ? topic
                : path.startsWith('/apps/')
                  ? (slugKey[path.split('/')[2]] ?? 'apps')
                  : path.startsWith('/product/')
                    ? productKey()
                    : /^\/(browse|checkout)/.test(path)
                      ? 'browse'
                      : '';

  useEffect(() => {
    if (!supabaseConfigured) return;
    const sb = createClient();
    (async () => {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) return setDash(undefined);
      const { data } = await sb.from('profiles').select('role').eq('id', user.id).single();
      setDash('/dashboard/' + (data?.role ?? 'buyer'));
    })();
  }, [path]);

  return (
    <>
      <Suspense fallback={null}>
        <TopicWatch set={setTopic} />
      </Suspense>
      <SiteNav active={active} dashHref={dash} menu={menu} />
    </>
  );
}
