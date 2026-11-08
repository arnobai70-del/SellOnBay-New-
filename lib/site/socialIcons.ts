import { siBehance, siDiscord, siDribbble, siFacebook, siGithub, siInstagram, siPinterest, siTelegram, siThreads, siTiktok, siWhatsapp, siX, siYoutube } from 'simple-icons';
import type { Network } from './social';

/*
 * Brand marks for the social links (owner, 2026-11-08), from simple-icons (CC0 paths; each brand's own guidelines still apply). Named imports only,
 * so the rest of the set is not bundled. simple-icons has no LinkedIn mark (removed at LinkedIn's request), so LinkedIn gets a plain "in" glyph.
 * `hex` is the brand colour for hover; a near-black brand uses the ink colour instead so the hover still shows.
 */
type Mark = { path: string; hex: string };
const LINKEDIN_IN =
  'M3 3h18v18H3zM7 10v7h2.4v-7zm1.2-3.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zM11 10v7h2.4v-3.7c0-1 .4-1.6 1.3-1.6.8 0 1.2.6 1.2 1.6V17h2.4v-4.3c0-2-1-3-2.6-3-1 0-1.8.5-2.3 1.1V10z';
export const SOCIAL_MARKS: Record<Network, Mark> = {
  facebook: { path: siFacebook.path, hex: siFacebook.hex },
  instagram: { path: siInstagram.path, hex: siInstagram.hex },
  x: { path: siX.path, hex: siX.hex },
  linkedin: { path: LINKEDIN_IN, hex: '0A66C2' },
  youtube: { path: siYoutube.path, hex: siYoutube.hex },
  tiktok: { path: siTiktok.path, hex: siTiktok.hex },
  github: { path: siGithub.path, hex: siGithub.hex },
  telegram: { path: siTelegram.path, hex: siTelegram.hex },
  whatsapp: { path: siWhatsapp.path, hex: siWhatsapp.hex },
  discord: { path: siDiscord.path, hex: siDiscord.hex },
  threads: { path: siThreads.path, hex: siThreads.hex },
  pinterest: { path: siPinterest.path, hex: siPinterest.hex },
  behance: { path: siBehance.path, hex: siBehance.hex },
  dribbble: { path: siDribbble.path, hex: siDribbble.hex },
};
