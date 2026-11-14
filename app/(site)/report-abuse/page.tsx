import { TopBand } from '@/components/glass/TopBand';
import { reportAbuse } from './actions';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';
import { PageExtras } from '@/components/PageExtras';

import { T } from '@/components/i18n/T';
import { getI18n } from '@/lib/i18n/server';
export const generateMetadata = () => pageMetadata('/report-abuse');

export default async function ReportAbuse({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { tx } = await getI18n(); // words in the page's language (lib/i18n/tx.ts)
  const [{ sent, error }, w] = await Promise.all([searchParams, pageWords('/report-abuse')]);
  return (
    <div className="wrap">
      <TopBand title={w.heading} intro={w.intro || undefined} />
      <div style={{ maxWidth: 620, paddingBottom: 88 }}>
        {sent ? (
          <div className="glass card">
            <div className="done">
              <span className="status st-ok">
                <i />
                <T s={'Report received'} />
              </span>
              <h2 style={{ marginTop: 14 }}>
                <T s={'Thanks. We will look at it.'} />
              </h2>
              <p className="muted" style={{ marginTop: 10 }}>
                <T s={'If a site is clearly harmful, we suspend it first and review after.'} />
              </p>
            </div>
          </div>
        ) : (
          <form className="glass card" action={reportAbuse}>
            <div className="field" style={{ marginTop: 0 }}>
              <label htmlFor="r-url">
                <T s={'Site address'} />
              </label>
              <input id="r-url" name="url" required placeholder={tx('example.com')} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="r-reason">
                <T s={'What is wrong?'} />
              </label>
              <select id="r-reason" name="reason" defaultValue="phishing">
                <option value="phishing">
                  <T s={'Fake login or phishing'} />
                </option>
                <option value="counterfeit">
                  <T s={'Counterfeit or scam goods'} />
                </option>
                <option value="malware">
                  <T s={'Malware'} />
                </option>
                <option value="copyright">
                  <T s={'Copied or stolen work'} />
                </option>
                <option value="other">
                  <T s={'Something else'} />
                </option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="r-detail">
                <T s={'Details (optional)'} />
              </label>
              <textarea id="r-detail" name="detail" rows={4} maxLength={1000} placeholder={tx('What did you see?')} />
            </div>
            {error && (
              <p role="alert" style={{ color: 'var(--rose)', marginTop: 12 }}>
                <T s={'We could not send that. Check the address and try again.'} />
              </p>
            )}
            <button className="btn" type="submit" style={{ marginTop: 24 }}>
              <T s={'Send report'} />
            </button>
          </form>
        )}
      </div>
      <PageExtras path="/report-abuse" />
    </div>
  );
}
