import Image from 'next/image';
import { findAny } from '@/lib/apps';
import { imageFor } from '@/lib/data';
import { DEVS, fromPrice } from '@/lib/developers';
import { AppPhone } from './AppPhone';
import { DevAvatar } from './DevParts';

/* Four pictures for the scroll story. Pure markup and CSS (no scripts), so they can be shown twice: beside the text on a laptop
   and under each chapter on a phone. Each child carries --k, how far it drifts as you scroll. */
const K = (n: number) => ({ '--k': n }) as React.CSSProperties;

const SiteCard = ({ id, k, cls }: { id: string; k: number; cls: string }) => {
  const p = findAny(id),
    img = imageFor(id);
  return (
    <div className={'sv-card sv-site ' + cls} style={K(k)}>
      {img && <Image src={img.src} alt="" width={img.width} height={img.height} sizes="260px" />}
      <b>{p?.name}</b>
      <small>
        {p?.cat} · ${p?.price}
      </small>
    </div>
  );
};

export function Chapter1() {
  const a = findAny('fittrack'),
    b = findAny('notenest');
  return (
    <div className="sv sv1">
      <SiteCard id="saffron-table" k={-26} cls="a" />
      <SiteCard id="clinic-desk" k={-52} cls="b" />
      {a && (
        <div className="sv-phone p1" style={K(-70)}>
          <AppPhone p={a} />
        </div>
      )}
      {b && (
        <div className="sv-phone p2" style={K(-34)}>
          <AppPhone p={b} />
        </div>
      )}
      <span className="sv-chip c1" style={K(-60)}>
        Restaurants
      </span>
      <span className="sv-chip c2" style={K(-18)}>
        Android apps
      </span>
      <span className="sv-chip c3" style={K(-44)}>
        Web apps
      </span>
    </div>
  );
}

export function Chapter2() {
  const img = imageFor('saffron-table');
  return (
    <div className="sv sv2">
      <div className="sv-win" style={K(-24)}>
        <div className="sv-wbar">
          <i />
          <i />
          <i />
          <span className="sv-url">
            <u>https://mariasbakery.com</u>
          </span>
        </div>
        <div className="sv-wbody">{img && <Image src={img.src} alt="" width={img.width} height={img.height} sizes="420px" />}</div>
      </div>
      <div className="sv-card sv-dom" style={K(-58)}>
        <small>Your domain</small>
        <b className="sv-type">
          <u>mariasbakery.com</u>
        </b>
      </div>
      <ul className="sv-card sv-res" style={K(-40)}>
        {[
          ['mariasbakery.com', '$14'],
          ['mariasbakery.co', '$29'],
          ['mariasbakery.shop', '$12'],
        ].map(([d, p]) => (
          <li key={d}>
            <b>{d}</b>
            <em>Available</em>
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <span className="sv-chip c1" style={K(-70)}>
        Registered in your name
      </span>
    </div>
  );
}

export function Chapter3() {
  return (
    <div className="sv sv3">
      <div className="sv-ph l" style={K(-30)}>
        <i className="sv-notch" />
        <div className="sv-scr">
          <div className="sv-in">
            <small>Payment held</small>
            <b>$69</b>
            <span className="sv-lockrow">Held in escrow</span>
          </div>
          <div className="sv-in">
            <small>Seller is building</small>
            <div className="sv-prog">
              <i />
            </div>
          </div>
          <div className="sv-in dim">
            <small>Domain</small>
            <b>mariasbakery.com</b>
          </div>
        </div>
      </div>
      <div className="sv-ph r" style={K(-64)}>
        <i className="sv-notch" />
        <div className="sv-scr">
          <div className="sv-in">
            <small>Ready to review</small>
            <b>47:59:12</b>
            <span className="sv-lockrow">left to check it</span>
          </div>
          <span className="sv-btn">Accept and release payment</span>
          <div className="sv-in dim">
            <small>Seller is paid</small>
            <b>7 days after</b>
          </div>
        </div>
      </div>
      <div className="sv-card sv-note n1" style={K(-80)}>
        <i />
        Source files released
      </div>
      <div className="sv-card sv-note n2" style={K(-46)}>
        <i />
        7-day bug-fix guarantee
      </div>
    </div>
  );
}

export function Chapter4() {
  const devs = ['marco-bianchi', 'lucas-ferreira', 'emily-chen'].map((id) => DEVS.find((d) => d.id === id)!).filter(Boolean);
  return (
    <div className="sv sv4">
      <div className="sv-card sv-earn" style={K(-30)}>
        <small>Available to withdraw</small>
        <b>$642</b>
        <div className="sv-bars">
          {[40, 62, 48, 80, 70, 100, 86].map((h, i) => (
            <i key={i} style={{ height: h + '%' }} />
          ))}
        </div>
        <span className="sv-chip-in">Next payout Sunday</span>
      </div>
      {devs.map((d, i) => (
        <div key={d.id} className={'sv-card sv-dev d' + i} style={K(-40 - i * 22)}>
          <DevAvatar dev={d} size={40} />
          <span>
            <b>{d.name}</b>
            <small>{d.langs.slice(0, 2).join(' · ')}</small>
          </span>
          <em>from ${fromPrice(d)}</em>
        </div>
      ))}
      <span className="sv-chip c1" style={K(-74)}>
        New order. You earn $33.15
      </span>
    </div>
  );
}
