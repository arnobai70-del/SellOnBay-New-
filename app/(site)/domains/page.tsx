import Link from 'next/link';
import { DomainSearch } from '@/components/DomainSearch';
import { ALL_TLDS, cleanName } from '@/lib/domains';
import { domainProvider, isLiveRegistrar } from '@/lib/providers/domain';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';
import { PageExtras } from '@/components/PageExtras';

export const generateMetadata = () => pageMetadata('/domains');

const GET: [string, string][] = [
  ['Domain registration', 'This feature is not yet live. Bring your own domain for now.'],
  ['Example prices', 'Displayed ending prices are illustrative only, not live registrar quotes.'],
  ['Privacy', 'Domain contact privacy depends on a real registrar and the chosen ending.'],
  ['Ownership', 'Registration and transfer terms will be confirmed when a registrar is connected.'],
];
const STEPS: [string, string][] = [
  ['Explore a name', 'Preview ideas here; example results do not verify availability.'],
  ['Bring your own domain', 'Choose a website and enter a domain you already control.'],
  ['Connect the website', 'The seller can help configure your domain according to the selected service.'],
];
const QA: [string, string][] = [
  ['Can I buy a new domain here?', 'Not yet. Live registrar checks and registrations are not connected. You can use a domain you already own.'],
  ['Can I use a domain I already own?', 'Yes. Choose "I have a domain" at checkout, or use the box below. The seller connects it for you, and you only change two settings at your provider.'],
  ['Are these names available?', 'Example results are simulated. Availability must be checked with a real registrar before you decide to buy.'],
  ['When do I pay for a domain?', 'New domain purchase is not available at SellOnBay until a real registrar is connected.'],
  ['What happens at renewal?', 'The renewal price and schedule depend on the provider you use. The prices shown here are examples.'],
];

export default async function Domains({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ q }, w] = await Promise.all([searchParams, pageWords('/domains')]);
  const registrarConnected = isLiveRegistrar(domainProvider());
  return (
    <div className="dm-page">
      <DomainSearch initial={cleanName(q ?? '')} registrarConnected={registrarConnected} heading={w.heading} intro={w.intro} />

      <section className="dm-sec">
        <div className="wrap">
          <h2>Every domain here</h2>
          <ul className="dm-get">
            {GET.map(([t, d]) => (
              <li key={t}>
                <b>{t}</b>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="dm-sec dm-conn">
        <div className="wrap">
          <h2>From name to live site</h2>
          <ol className="dm-steps">
            {STEPS.map(([t, d], i) => (
              <li key={t}>
                <i>{i + 1}</i>
                <b>{t}</b>
                <span>{d}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="dm-sec">
        <div className="wrap dm-split">
          <div>
            <h2>Already own one?</h2>
            <p className="dm-lead">Bring it. Pick a site, and the seller connects your domain to it.</p>
            <form className="dm-own-form" action="/browse" method="get">
              <label className="sr" htmlFor="dm-own">
                Your domain
              </label>
              <input id="dm-own" name="domain" placeholder="mybusiness.com" autoComplete="off" autoCapitalize="none" spellCheck={false} required />
              <button className="btn btn-gold" type="submit">
                Pick a site
              </button>
            </form>
          </div>
          <div>
            <h2>Illustrative yearly prices — not live quotes</h2>
            <ul className="dm-prices">
              {ALL_TLDS.map(([t, p]) => (
                <li key={t}>
                  <b>{t}</b>
                  <span>${p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="dm-sec dm-faq">
        <div className="wrap">
          <h2>Questions about domains</h2>
          {QA.map(([qq, a]) => (
            <details key={qq}>
              <summary>{qq}</summary>
              <p>{a}</p>
            </details>
          ))}
          <p className="dm-more">
            More answers in the <Link href="/faq">FAQ</Link>.
          </p>
        </div>
      </section>
      <PageExtras path="/domains" />
    </div>
  );
}
