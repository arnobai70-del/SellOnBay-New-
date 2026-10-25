'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/* Authenticator-app code for sellers and admins. Enrols a factor the first time, verifies after that. */
export function MfaClient({ next }: { next: string }) {
  const supabase = createClient();
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: list } = await supabase.auth.mfa.listFactors();
      const verified = list?.totp?.find((f) => f.status === 'verified');
      if (verified) return setFactorId(verified.id);
      // A half-finished setup blocks a new one (Supabase refuses a second unverified factor), so clear it first.
      for (const f of list?.all ?? []) if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (e || !data) return setError(e?.message ?? 'Could not start setup.');
      setFactorId(data.id);
      setQr(data.totp.qr_code);
    })();
  }, [supabase]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: ch, error: ce } = await supabase.auth.mfa.challenge({ factorId });
    if (ce || !ch) return setError(ce?.message ?? 'Try again.');
    const { error: ve } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
    if (ve) return setError('That code is not right. Check your app and try again.');
    window.location.assign(next);
  };

  return (
    <div className="auth">
      <div className="form" style={{ gridColumn: '1/-1', maxWidth: 460, margin: '0 auto' }}>
        <h1 style={{ fontSize: '2.4rem' }}>Enter your code</h1>
        <p className="muted" style={{ marginTop: 8 }}>
          {qr ? 'Scan this with an authenticator app, then enter the 6-digit code.' : 'Open your authenticator app and enter the 6-digit code.'}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr && <img src={qr} alt="QR code for your authenticator app" width={180} height={180} style={{ marginTop: 20 }} />}
        <form onSubmit={verify}>
          <div className="field">
            <label htmlFor="mfa-code">Code</label>
            <input id="mfa-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          {error && (
            <p role="alert" style={{ color: 'var(--rose)', marginTop: 12 }}>
              {error}
            </p>
          )}
          <button className="btn btn-blue btn-lg" type="submit" disabled={!factorId} style={{ width: '100%', marginTop: 24 }}>
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
