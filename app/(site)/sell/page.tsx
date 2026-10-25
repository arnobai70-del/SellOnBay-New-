import Link from 'next/link';
import { CountUp } from '@/components/CountUp';
import { FaqList } from '@/components/FaqList';
import { HowItWorks } from '@/components/HowItWorks';
import { PageHero } from '@/components/PageHero';
import { Reveal } from '@/components/Reveal';
import { SellerCalc } from '@/components/SellerCalc';
import { FAQ_GROUPS } from '@/lib/faq';
import { BRAND_NAME } from '@/lib/brand';
import { CONFIG, FEE_SALE_TEXT } from '@/lib/config';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { pageWords } from '@/lib/seo/pageWords';
import { PageExtras } from '@/components/PageExtras';

export const generateMetadata = () => pageMetadata('/sell');

export default async function Sell() {
  const w = await pageWords('/sell');
  return (
    <>
      <PageHero tone="mint" video title={w.heading} lead={w.intro ?? ''}>
        <Link className="btn btn-dark btn-lg" href="/sell/new">
          List your first site
        </Link>
        <a className="hero-link" href="#earn">
          See what you could earn
        </a>
      </PageHero>

      <div className="wrap">
        <div className="facts">
          <div>
            <b>
              <CountUp to={(10_000 - CONFIG.fees.saleBps) / 100} suffix="%" />
            </b>
            <span>Yours on every sale from ${CONFIG.fees.saleLowBelowCents / 100}</span>
          </div>
          <div>
            <b>
              <CountUp to={24} suffix=" hours" />
            </b>
            <span>To review your listing</span>
          </div>
          <div>
            <b>Weekly</b>
            <span>Payouts, every Sunday</span>
          </div>
          <div>
            <b>Again and again</b>
            <span>Sell the same site many times</span>
          </div>
        </div>
      </div>

      <Reveal className="section" id="earn">
        <div className="wrap split">
          <div>
            <h2>What could you earn?</h2>
            <p className="lead">
              Pick a price and how many you sell in a month. {BRAND_NAME} keeps {FEE_SALE_TEXT}, buyers pay no extra fee.
            </p>
          </div>
          <SellerCalc />
        </div>
      </Reveal>

      <Reveal className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <HowItWorks initial="sell" toggle={false} title="How selling works" />
        </div>
      </Reveal>

      <Reveal className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-head">
            <h2>Seller questions</h2>
            <Link className="link-u" href="/faq">
              All questions
            </Link>
          </div>
          <FaqList items={FAQ_GROUPS[2].items} />
        </div>
      </Reveal>

      <section className="cta-band" data-tone="mint">
        <div className="wrap">
          <h2>Your first listing takes about ten minutes.</h2>
          <Link className="btn btn-dark btn-lg" href="/sell/new">
            List your first site
          </Link>
        </div>
      </section>
      <PageExtras path="/sell" />
    </>
  );
}
