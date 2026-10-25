'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OAuthButtons } from './OAuthButtons';
import { Turnstile } from './Turnstile';
import { authenticate, requestReset } from '@/app/(bare)/login/actions';
import { PAYOUT_HOLD_DAYS, REVIEW_HOURS } from '@/lib/config';
import type { OAuthProvider } from '@/lib/supabase/oauth';

const ROLES = [
  { key: 'buyer', title: 'I want a site', note: 'Pick one and go live on my domain.' },
  { key: 'seller', title: 'I sell sites', note: 'List what I built and get paid.' },
] as const;

/* The order card on the left: what happens to a buyer's money, or to a seller's sale, step by step. */
const JOURNEY = {
  buyer: { title: 'Your order', domain: 'yourname.com', steps: ['Paid into escrow', 'Live on your domain', `${REVIEW_HOURS} hours to check it`, 'Seller paid after you accept'] },
  seller: { title: 'Your sale', domain: 'Payout', steps: ['Buyer pays into escrow', 'You deliver the site', 'Buyer accepts', `Paid ${PAYOUT_HOLD_DAYS} days later`] },
} as const;

function RoleIcon({ k }: { k: 'buyer' | 'seller' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {k === 'buyer' ? <path d="M6 7h12l-1 13H7L6 7zM9 7a3 3 0 0 1 6 0" /> : <path d="M4 10l1.5-5h13L20 10M4 10v9h16v-9M4 10h16M9 19v-5h6v5" />}
    </svg>
  );
}

/* Real sign-in when Supabase keys are set, otherwise the old demo redirect. */
export function AuthClient({
  live,
  error,
  next,
  sent,
  botKey = '',
  oauth = [],
}: {
  live: boolean;
  error?: string;
  next?: string;
  sent?: boolean;
  botKey?: string;
  oauth?: OAuthProvider[];
}) {
  const router = useRouter();
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer');
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(sent ? 'forgot' : 'signin');
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

  return (
    <div className="auth" data-auth>
      <div className="art auth-art">
        <h2>{signup ? 'Your site is one domain away.' : 'Everything you bought or sold, in one place.'}</h2>
        <div className="auth-card" key={signup ? role : 'signin'} aria-hidden="true">
          <div className="auth-card-top">
            <b>{JOURNEY[signup ? role : 'buyer'].title}</b>
            <span>{JOURNEY[signup ? role : 'buyer'].domain}</span>
          </div>
          <ol>
            {JOURNEY[signup ? role : 'buyer'].steps.map((t, n) => (
              <li key={t} className={n < 2 ? 'done' : n === 2 ? 'now' : ''}>
                <i />
                {t}
              </li>
            ))}
          </ol>
        </div>
        <ul className="auth-trust">
          <li>Money held in escrow on every order</li>
          <li>Sellers sign in with an authenticator code</li>
        </ul>
      </div>
      <div className="form">
        <h1 style={{ fontSize: '2.4rem' }}>{mode === 'forgot' ? 'Reset your password' : signup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          {mode === 'forgot'
            ? 'Enter your email and we will send you a link to choose a new password.'
            : signup
              ? 'Two minutes and you can pick a site or list your own.'
              : 'Sign in to see your orders and messages.'}
        </p>
        {!signup && next?.startsWith('/dashboard/admin') && (
          <div className="note" style={{ marginTop: 16 }}>
            <span>
              You are opening the <b>admin area</b>. Sign in, then enter the code from your authenticator app.
            </span>
          </div>
        )}
        {!signup && next?.startsWith('/dashboard/seller') && (
          <div className="note" style={{ marginTop: 16 }}>
            <span>
              You are opening the <b>seller dashboard</b>. Sign in to continue.
            </span>
          </div>
        )}

        {mode === 'forgot' ? (
          <>
            {sent ? (
              <div className="note" style={{ marginTop: 24 }}>
                <span>If that email has an account, a reset link is on its way. Check your inbox and spam folder.</span>
              </div>
            ) : (
              <form action={requestReset} onSubmit={bot ? afterSend : undefined}>
                <div className="field">
                  <label htmlFor="f-mail">Email</label>
                  <input id="f-mail" name="email" type="email" required autoComplete="email" />
                </div>
                {botCheck}
                <button className="btn btn-blue btn-lg" type="submit" disabled={bot && !token} style={{ width: '100%', marginTop: 24 }}>
                  Send reset link
                </button>
              </form>
            )}
            <p style={{ marginTop: 20 }} className="muted">
              <button
                type="button"
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--cobalt)', fontWeight: 600, textDecoration: 'underline' }}
                onClick={() => setMode('signin')}
              >
                Back to sign in
              </button>
            </p>
          </>
        ) : (
          <>
            {(signup || !live) && (
              <div role="radiogroup" aria-label="What brings you here" className="auth-roles">
                {ROLES.map((r) => (
                  <button key={r.key} type="button" role="radio" aria-checked={role === r.key} onClick={() => setRole(r.key)} className="auth-role">
                    <span className="auth-role-ico">
                      <RoleIcon k={r.key} />
                    </span>
                    <b>{r.title}</b>
                    <span className="muted">{r.note}</span>
                  </button>
                ))}
              </div>
            )}

            <form
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
                  <label htmlFor="a-name">Your name</label>
                  <input id="a-name" name="name" required autoComplete="name" />
                </div>
              )}
              <div className="field">
                <label htmlFor="a-mail">Email</label>
                <input id="a-mail" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="field">
                <label htmlFor="a-pass">Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="a-pass"
                    name="password"
                    type={show ? 'text' : 'password'}
                    minLength={8}
                    required
                    style={{ width: '100%', paddingRight: 64 }}
                    autoComplete={signup ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    className="pw-toggle"
                    onClick={() => setShow((v) => !v)}
                    aria-pressed={show}
                    style={{
                      position: 'absolute',
                      right: 14,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 0,
                      cursor: 'pointer',
                      color: 'var(--mute)',
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                  >
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
                {signup && <small>At least 8 characters.</small>}
                {!signup && live && (
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    style={{ background: 'none', border: 0, padding: 0, marginTop: 8, cursor: 'pointer', color: 'var(--cobalt)', fontWeight: 600, fontSize: 14 }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              {error && (
                <p role="alert" style={{ color: 'var(--rose)', marginTop: 12 }}>
                  {error}
                </p>
              )}
              {botCheck}
              <button className="btn btn-blue btn-lg" type="submit" disabled={bot && !token} style={{ width: '100%', marginTop: 24 }}>
                {signup ? 'Create account' : 'Sign in'}
              </button>
              {signup && (
                <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
                  By creating an account you accept our terms of service and privacy policy.
                </p>
              )}
            </form>

            {live && oauth.length > 0 && <OAuthButtons next={next} providers={oauth} />}

            <p style={{ marginTop: 20 }} className="muted">
              {signup ? 'Already have an account? ' : 'New to SellOnBay? '}
              <button
                type="button"
                style={{ background: 'none', border: 0, padding: '8px 0', cursor: 'pointer', color: 'var(--cobalt)', fontWeight: 600, textDecoration: 'underline' }}
                onClick={() => setMode(signup ? 'signin' : 'signup')}
              >
                {signup ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          </>
        )}

        <p className="muted" style={{ marginTop: 8, fontSize: '14.5px' }}>
          Sellers and admins sign in with a code from an authenticator app.
        </p>
      </div>
    </div>
  );
}
