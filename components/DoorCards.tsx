import Link from 'next/link';
import { SELLER_KEEP_TEXT } from '@/lib/config';
import { Tilt } from './Tilt';

/* Three doors from the home page into the three places that explain the rest. Each has its own colour and a tiny moving scene. */
export function DoorCards() {
  return (
    <div className="doors">
      <Tilt className="tilt-door">
        <Link href="/find" className="door" data-tone="violet">
          <div className="door-vis" aria-hidden="true">
            <div className="dq">
              <i />
              <i className="hot" />
              <i />
              <i />
            </div>
          </div>
          <h3>Find the right site</h3>
          <p>Answer three questions and get three sites that fit your business.</p>
          <span className="door-link">Start the quiz</span>
        </Link>
      </Tilt>
      <Tilt className="tilt-door">
        <Link href="/how-it-works" className="door" data-tone="gold">
          <div className="door-vis" aria-hidden="true">
            <div className="dt">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
          <h3>See how it works</h3>
          <p>From picking a site to the seller getting paid, step by step.</p>
          <span className="door-link">Watch the 25-second tour</span>
        </Link>
      </Tilt>
      <Tilt className="tilt-door">
        <Link href="/sell" className="door" data-tone="mint">
          <div className="door-vis" aria-hidden="true">
            <div className="db">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
          <h3>Sell what you built</h3>
          <p>Upload once, sell again and again, and keep {SELLER_KEEP_TEXT} of every sale.</p>
          <span className="door-link">See what you could earn</span>
        </Link>
      </Tilt>
    </div>
  );
}
