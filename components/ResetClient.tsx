'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/* The reset link already signed this person in, so they only need to choose a new password. */
export function ResetClient() {
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pw.length < 8) return setError('Use at least 8 characters.');
    if (pw !== again) return setError('The two passwords do not match.');
    setBusy(true);
    const sb = createClient();
    const { error: err } = await sb.auth.updateUser({ password: pw });
    if (err) {
      setBusy(false);
      // Accounts with an authenticator must enter its code before the password can change; come back here after.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (/aal2/i.test(err.message)) return window.location.assign('/login/mfa?next=' + encodeURIComponent('/reset-password'));
      return setError(
        /weak|leaked|pwned/i.test(err.message)
          ? 'Choose a stronger password: this one is too common or has appeared in a leak.'
          : /same/i.test(err.message)
            ? 'Choose a password different from your old one.'
            : 'Could not save the password. Request a new reset link and try again.',
      );
    }
    const {
      data: { user },
    } = await sb.auth.getUser();
    const { data: p } = user ? await sb.from('profiles').select('role').eq('id', user.id).single() : { data: null };
    // A full page load, so the new session cookies are read fresh on the server.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/dashboard/' + (p?.role ?? 'buyer'));
  };

  return (
    <div className="auth">
      <div className="form" style={{ gridColumn: '1/-1', maxWidth: 460, margin: '0 auto' }}>
        <h1 style={{ fontSize: '2.4rem' }}>Choose a new password</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          You will be signed in right after.
        </p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="r-pw">New password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="r-pw"
                type={show ? 'text' : 'password'}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
                style={{ width: '100%', paddingRight: 64 }}
              />
              <button
                type="button"
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
            <small>At least 8 characters.</small>
          </div>
          <div className="field">
            <label htmlFor="r-pw2">Type it again</label>
            <input id="r-pw2" type={show ? 'text' : 'password'} value={again} onChange={(e) => setAgain(e.target.value)} required autoComplete="new-password" />
          </div>
          {error && (
            <p role="alert" style={{ color: 'var(--rose)', marginTop: 12 }}>
              {error}
            </p>
          )}
          <button className="btn btn-blue btn-lg" type="submit" disabled={busy} style={{ width: '100%', marginTop: 24 }}>
            {busy ? 'Saving' : 'Save password'}
          </button>
        </form>
      </div>
    </div>
  );
}
