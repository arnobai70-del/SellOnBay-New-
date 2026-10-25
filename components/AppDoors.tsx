import Link from 'next/link';
import { SHELVES, appsFor, shelfHref, type AppPlatform } from '@/lib/apps';
import { AppArt } from './AppPhone';
import { Tilt } from './Tilt';

const TEXT: Record<AppPlatform, string> = {
  android: 'Ready-made apps, rebranded and sent to your Google Play account.',
  ios: 'Ready-made apps for iPhone and iPad, sent to your App Store account.',
  webapp: 'Ready-made web apps, rebranded and live on your own domain.',
  digital: 'Figma kits, templates, plugins, scripts, automations, chatbots, prompts and video templates.',
  desktop: 'Ready-made apps for Windows, Mac and Linux, delivered as installers.',
};

/* Home entrance to the four app shelves: a pair of drawn phones or windows per shelf, in its own colour. */
export function AppDoors() {
  const order: AppPlatform[] = ['android', 'ios', 'webapp', 'desktop'];
  return (
    <div className="appdoors">
      {order.map((k) => {
        const list = appsFor(k);
        const phones = SHELVES[k].delivery === 'store';
        return (
          <Tilt key={k} className="tilt-door" max={5}>
            <Link href={shelfHref(k)} className={'appdoor' + (phones ? '' : ' wide')} data-tone={SHELVES[k].tone}>
              <div className="appdoor-txt">
                <h3>{SHELVES[k].label}</h3>
                <p>{TEXT[k]}</p>
                <span className="door-link">See {list.length} apps</span>
              </div>
              <div className="appdoor-ph" aria-hidden="true">
                {list.slice(0, 2).map((p, i) => (
                  <AppArt key={p.id} p={p} screen={i === 0 ? 0 : 2} className={'adp adp' + i} />
                ))}
              </div>
            </Link>
          </Tilt>
        );
      })}
    </div>
  );
}
