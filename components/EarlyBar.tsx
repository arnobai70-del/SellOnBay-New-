import { barText, getSettings } from '@/lib/settings';

/* The thin bar on top of every page while the shop is opening in small steps. An admin turns it on or off in Settings. */
export async function EarlyBar() {
  const s = await getSettings();
  if (!s.earlyAccessOn) return null;
  return <div className="early-bar">{barText(s)}</div>;
}
