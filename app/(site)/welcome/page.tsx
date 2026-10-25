import Link from 'next/link';
import { CountUp } from '@/components/CountUp';
import { GlobeHero } from '@/components/GlobeHero';
import { LoopVideo } from '@/components/LoopVideo';
import { ProductCard } from '@/components/MiniSite';
import { Reveal } from '@/components/Reveal';
import { StoryScenes } from '@/components/StoryScenes';
import { PRODUCTS, imageFor } from '@/lib/data';
import { REVIEW_HOURS } from '@/lib/config';
import { getLiveDbProducts } from '@/lib/catalog';
import { showExamples } from '@/lib/examples';
import { pageMetadata } from '@/lib/seo/pageMeta';
import { PageExtras } from '@/components/PageExtras';

export const generateMetadata = () => pageMetadata('/welcome');

/* Home: a hero that says what we do, a scroll story that shows how, then proof and the way in. Detail lives on each page. */
export default async function Home() {
  // Newest first: sellers' live sites, then the examples while they are shown.
  const sites = [...(await getLiveDbProducts('web')), ...((await showExamples()) ? PRODUCTS : [])];
  // The wall of site pictures is made of the example sites, so it goes with them.
  const shots = (await showExamples())
    ? PRODUCTS.flatMap((p) => {
        const i = imageFor(p.id);
        return i ? [{ id: p.id, name: p.name, src: i.src, width: i.width, height: i.height }] : [];
      })
    : [];
  return (
    <>
      <GlobeHero />

      <StoryScenes shots={shots} />

      <section className="st-facts">
        <div className="wrap">
          <div>
            <b>1 to 7 days</b>
            <span>From payment to live site</span>
          </div>
          <div>
            <b>
              <CountUp to={REVIEW_HOURS} suffix=" hours" />
            </b>
            <span>To review before you accept</span>
          </div>
          <div>
            <b>
              <CountUp to={7} suffix=" days" />
            </b>
            <span>Bug-fix guarantee after accepting</span>
          </div>
          <div>
            <b>Your name</b>
            <span>On every domain we register</span>
          </div>
        </div>
      </section>

      <section className="section dk">
        <div className="wrap">
          <div className="sec-head">
            <h2>Newly added</h2>
            <Link className="link-u" href="/browse">
              See all {sites.length} sites
            </Link>
          </div>
          <div className="grid g4">
            {[...sites]
              .sort((a, b) => b.added.localeCompare(a.added))
              .slice(0, 8)
              .map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
          </div>
        </div>
      </section>

      <section className="cta-band has-video" data-tone="cobalt">
        <LoopVideo className="cta-video" src="/video/work-laptop.mp4" poster="/video/work-laptop-poster.webp" />
        <div className="wrap">
          <h2>Your site is one domain away.</h2>
          <Reveal className="cta-pair">
            <Link className="btn btn-gold btn-lg" href="/browse">
              Find a site
            </Link>
            <Link className="btn btn-dark btn-lg" href="/sell">
              Sell a site
            </Link>
          </Reveal>
          <p className="cta-note">Your payment is held in escrow until you have checked the site and accepted it.</p>
        </div>
      </section>
      <PageExtras path="/welcome" />
    </>
  );
}
