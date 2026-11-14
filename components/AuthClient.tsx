'use client';
import { TopBand } from '@/components/glass/TopBand';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OAuthButtons } from './OAuthButtons';
import { Turnstile } from './Turnstile';
import { authenticate, requestReset } from '@/app/(bare)/login/actions';
import type { OAuthProvider } from '@/lib/supabase/oauth';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
import type { Tx } from '@/lib/i18n/tx';
const ROLES = (tx: Tx) =>
  [
    { key: 'buyer', title: 'I want a website', note: tx('Pick one and go live on my domain.') },
    { key: 'seller', title: 'I sell websites', note: tx('List what I built and get paid.') },
  ] as const;

/* Real sign-in when Supabase keys are set, otherwise the old demo redirect. */
export function AuthClient({
  live,
  error,
  next,
  sent,
  botKey = '',
  oauth = [],
  appleExisting = false,
  codeRequired = true,
  startMode,
}: {
  live: boolean;
  error?: string;
  next?: string;
  sent?: boolean;
  botKey?: string;
  oauth?: OAuthProvider[];
  /* Apple is hidden from new sign-ups; existing Apple accounts keep a secondary link (Addendum 3.5). */
  appleExisting?: boolean;
  /* Sellers and admins need the authenticator code (lib/auth/authenticator.ts); the words about it are hidden while it is off. */
  codeRequired?: boolean;
  startMode?: 'signup' | 'forgot';
}) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
  const router = useRouter();
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer');
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(sent ? 'forgot' : (startMode ?? 'signin'));
  const [show, setShow] = useState(false);
  const signup = mode === 'signup';
  // The bot check shows only when the server has real Turnstile keys. A token works once, so every send gets a fresh widget.
  const bot = live && !!botKey;
  const [token, setToken] = useState('');
  const [round, setRound] = useState(0);
  const afterSend = () => setTimeout(() => (setToken(''), setRound((r) => r + 1)), 0);
  const botCheck = bot && (
    <>
      <Turnstile key={round} siteKey={botKey} onToken={setToken} />
      <input type="hidden" name="turnstile" value={token} />
    </>
  );

  const NOTE: React.CSSProperties = { padding: '10px 14px', borderRadius: 12, background: '#FBF3E3', border: '1px solid #F0DDB4', color: '#6E4B12', fontSize: 13, lineHeight: 1.5 };
  const LINK: React.CSSProperties = { background: 'none', border: 0, padding: 0, cursor: 'pointer', color: '#1A5444', fontSize: 13, fontFamily: 'inherit' };
  // design-reference/signin.html: one glass card, the Sign in / Create account tabs, the fields, then the other ways in.
  return (
    <div data-auth>
      {/* the title and its line sit in the shared top band (owner, 2026-11-14); the form card stays on the light page under it */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px', boxSizing: 'border-box' }}>
        <TopBand
          title={mode === 'forgot' ? tx('Reset your password') : signup ? tx('Create your account') : tx('Welcome back')}
          intro={
            mode === 'forgot'
              ? tx('Enter your email and we will send you a link to choose a new password.')
              : signup
                ? tx('Buy safely with escrow, or sell and keep your share.')
                : tx('Sign in to see your orders and messages.')
          }
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 20px' }}>
        <div className="glass" style={{ width: '100%', maxWidth: 440, padding: 36, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {mode !== 'forgot' && (
            <div className="seg" role="tablist" aria-label={tx('Sign in or create an account')}>
              <button type="button" role="tab" aria-selected={!signup} className={!signup ? 'on' : ''} onClick={() => setMode('signin')}>
                <T s={'Sign in'} />
              </button>
              <button type="button" role="tab" aria-selected={signup} className={signup ? 'on' : ''} onClick={() => setMode('signup')}>
                <T s={'Create account'} />
              </button>
            </div>
          )}
          {!signup && (next?.startsWith('/admin') || next?.startsWith('/dashboard/admin')) && (
            <div style={NOTE}>
              <T s={'You are opening the'} />{' '}
              <b>
                <T s={'admin area'} />
              </b>
              . {codeRequired ? tx('Sign in, then enter the code from your authenticator app.') : tx('Sign in to continue.')}
            </div>
          )}
          {!signup && next?.startsWith('/dashboard/seller') && (
            <div style={NOTE}>
              <T s={'You are opening the'} />{' '}
              <b>
                <T s={'seller dashboard'} />
              </b>
              <T s={'. Sign in to continue.'} />
            </div>
          )}
          {mode === 'forgot' ? (
            <>
              {sent ? (
                <div style={NOTE}>
                  <T s={'If that email has an account, a reset link is on its way. Check your inbox and spam folder.'} />
                </div>
              ) : (
                <form action={requestReset} onSubmit={bot ? afterSend : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="field">
                    <label htmlFor="f-mail">
                      <T s={'Email'} />
                    </label>
                    <input id="f-mail" name="email" className="input" type="email" placeholder="you@example.com" required autoComplete="email" />
                  </div>
                  {botCheck}
                  <button className="btn" type="submit" disabled={bot && !token}>
                    <T s={'Send reset link'} />
                  </button>
                </form>
              )}
              <button type="button" style={{ ...LINK, alignSelf: 'flex-start' }} onClick={() => setMode('signin')}>
                <T s={'Back to sign in'} />
              </button>
            </>
          ) : (
            <>
              {(signup || !live) && (
                <div className="seg" role="radiogroup" aria-label={tx('What brings you here')}>
                  {ROLES(tx).map((r) => (
                    <button key={r.key} type="button" role="radio" aria-checked={role === r.key} className={role === r.key ? 'on' : ''} onClick={() => setRole(r.key)} title={r.note}>
                      {r.title}
                    </button>
                  ))}
                </div>
              )}
              <form
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
                {...(live
                  ? { action: authenticate, onSubmit: bot ? afterSend : undefined }
                  : {
                      onSubmit: (e: React.FormEvent) => {
                        e.preventDefault();
                        router.push('/dashboard/' + role);
                      },
                    })}
              >
                <input type="hidden" name="role" value={role} />
                <input type="hidden" name="mode" value={mode} />
                <input type="hidden" name="next" value={next ?? ''} />
                {signup && (
                  <div className="field">
                    <label htmlFor="a-name">
                      <T s={'Your name'} />
                    </label>
                    <input id="a-name" name="name" className="input" required autoComplete="name" />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="a-mail">
                    <T s={'Email'} />
                  </label>
                  <input id="a-mail" name="email" className="input" type="email" placeholder="you@example.com" required autoComplete="email" />
                </div>
                <div className="field">
                  <label htmlFor="a-pass">
                    <T s={'Password'} />
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="a-pass"
                      name="password"
                      className="input"
                      type={show ? 'text' : 'password'}
                      minLength={8}
                      required
                      style={{ paddingRight: 64 }}
                      autoComplete={signup ? 'new-password' : 'current-password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShow((v) => !v)}
                      aria-pressed={show}
                      style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, cursor: 'pointer', color: '#566C78', fontSize: 13 }}
                    >
                      {show ? tx('Hide') : tx('Show')}
                    </button>
                  </div>
                  {signup && (
                    <div className="tag">
                      <T s={'At least 8 characters.'} />
                    </div>
                  )}
                </div>
                {!signup && live && (
                  <button type="button" onClick={() => setMode('forgot')} style={{ ...LINK, alignSelf: 'flex-end', marginTop: -6 }}>
                    <T s={'Forgot password?'} />
                  </button>
                )}
                {error && (
                  <p role="alert" style={{ color: '#7A2E24', margin: 0, fontSize: 14 }}>
                    {error}
                  </p>
                )}
                {botCheck}
                <button className="btn" type="submit" disabled={bot && !token}>
                  {signup ? tx('Create account') : tx('Sign in')}
                </button>
                {signup && (
                  <div className="tag" style={{ margin: 0 }}>
                    <T s={'By creating an account you accept our terms of service and privacy policy.'} />
                  </div>
                )}
              </form>
              {live && (oauth.length > 0 || appleExisting) && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#566C78' }}>
                    <span style={{ flex: 1, height: 1, background: '#DCE7EC' }} />
                    <T s={'or'} />
                    <span style={{ flex: 1, height: 1, background: '#DCE7EC' }} />
                  </div>
                  <OAuthButtons next={next} providers={oauth} appleExisting={appleExisting} />
                </>
              )}
            </>
          )}
          <div className="tag" style={{ margin: 0 }}>
            <T s={'Money is held in escrow on every order.{v0}'} v={{ v0: codeRequired ? ' Sellers and admins sign in with a code from an authenticator app.' : '' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
