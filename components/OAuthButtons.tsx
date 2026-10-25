'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { OAuthProvider as Provider } from '@/lib/supabase/oauth';

const APPLE = (
  <path
    fill="currentColor"
    d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.800 2.300-1.600 2.800-.4 7 1.200 9.300.8 1.100 1.700 2.400 2.900 2.300 1.200 0 1.600-.7 3-.7s1.800.7 3 .7c1.300 0 2.100-1.100 2.800-2.200.9-1.300 1.300-2.500 1.300-2.600-.1 0-2.500-1-2.500-3.900zM14.200 5.800c.6-.8 1.100-1.900.9-3-.9 0-2.100.6-2.700 1.400-.6.700-1.100 1.800-1 2.900 1.100.1 2.200-.5 2.800-1.300z"
  />
);
const GOOGLE = (
  <>
    <path fill="#4285F4" d="M21.600 12.200c0-.7-.1-1.400-.2-2H12v3.800h5.400a4.600 4.600 0 0 1-2 3v2.500h3.200c1.900-1.700 3-4.300 3-7.300z" />
    <path fill="#34A853" d="M12 22c2.700 0 5-.9 6.600-2.400l-3.200-2.500c-.9.600-2 1-3.400 1-2.600 0-4.800-1.800-5.600-4.100H3.100v2.600A10 10 0 0 0 12 22z" />
    <path fill="#FBBC05" d="M6.400 13.900a6 6 0 0 1 0-3.800V7.500H3.100a10 10 0 0 0 0 9z" />
    <path fill="#EA4335" d="M12 6c1.500 0 2.800.5 3.800 1.500l2.900-2.900A10 10 0 0 0 3.100 7.500l3.300 2.600C7.200 7.800 9.400 6 12 6z" />
  </>
);

/* Only the providers switched on in Supabase are passed in (`enabledOAuth`), so no button leads to an error page. */
export function OAuthButtons({ next, providers }: { next?: string; providers: Provider[] }) {
  const [error, setError] = useState('');
  const go = async (provider: Provider) => {
    setError('');
    const redirectTo = `${location.origin}/auth/callback${next ? '?next=' + encodeURIComponent(next) : ''}`;
    const { error: e } = await createClient().auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (e) setError('That sign-in method is not available yet. Use email below.');
  };
  return (
    <div style={{ marginTop: 24 }}>
      <p className="muted" style={{ fontSize: 14, marginBottom: 10 }}>
        Or continue with
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${providers.length}, minmax(0, 1fr))`, gap: 12 }}>
        {providers.map((p) => (
          <button key={p} type="button" className="btn btn-line" onClick={() => go(p)}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              {p === 'google' ? GOOGLE : APPLE}
            </svg>
            {p === 'google' ? 'Google' : 'Apple'}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" style={{ color: 'var(--rose)', marginTop: 10 }}>
          {error}
        </p>
      )}
    </div>
  );
}
