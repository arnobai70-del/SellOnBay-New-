'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

import { T } from '@/components/i18n/T';
import { useTx } from '@/components/i18n/TxProvider';
/* Authenticator-app code for sellers and admins. Enrols a factor the first time, verifies after that. */
export function MfaClient({ next }: { next: string }) {
  const tx = useTx(); // words in the page's language (lib/i18n/tx.ts)
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
    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 20px 0' }}>
      <section className="glass ac" style={{ width: '100%', maxWidth: 460 }}>
        <h1 style={{ fontSize: 30, fontWeight: 400 }}>
          <T s={'Enter your code'} />
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          {qr ? 'Scan this with an authenticator app, then enter the 6-digit code.' : 'Open your authenticator app and enter the 6-digit code.'}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {qr && <img src={qr} alt={tx('QR code for your authenticator app')} width={180} height={180} style={{ marginTop: 20 }} />}
        <form onSubmit={verify} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label htmlFor="mfa-code">
              <T s={'Code'} />
            </label>
            <input className="input" id="mfa-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          {error && (
            <p role="alert" style={{ color: '#7A2E24', margin: 0 }}>
              {error}
            </p>
          )}
          <button className="btn" type="submit" disabled={!factorId} style={{ width: '100%' }}>
            <T s={'Continue'} />
          </button>
        </form>
      </section>
    </div>
  );
}
