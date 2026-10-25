import { CrystalLogo } from './CrystalLogo';
import { LoopVideo } from './LoopVideo';

export type Tone = 'cobalt' | 'gold' | 'mint' | 'violet';

/* Every inner page opens with a band in its own colour, so each page feels like a place of its own. */
export function PageHero({ tone, title, lead, children, art = true, video = false }: { tone: Tone; title: string; lead: string; children?: React.ReactNode; art?: boolean; video?: boolean }) {
  return (
    <section className="phero" data-tone={tone}>
      <span className="phero-blob b1" aria-hidden="true" />
      <span className="phero-blob b2" aria-hidden="true" />
      <div className="wrap phero-in">
        <div className="phero-copy">
          <h1>{title}</h1>
          <p className="lead">{lead}</p>
          {children && <div className="phero-cta">{children}</div>}
        </div>
        {video ? (
          <div className="phero-art vid">
            <div className="phero-video">
              <LoopVideo src="/video/work-laptop.mp4" poster="/video/work-laptop-poster.webp" />
            </div>
          </div>
        ) : (
          art && (
            <div className="phero-art">
              <CrystalLogo />
            </div>
          )
        )}
      </div>
    </section>
  );
}
