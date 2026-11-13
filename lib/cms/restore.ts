import 'server-only';
import { tx } from '../i18n/tx';
import { saveSite } from '../site/contentStore';
import { setPageControls } from '../seo/controlStore';
import { DEFAULT_CONTROLS, type PageControls } from '../seo/controls';
import { setNavConfig } from '../seo/navStore';
import type { NavConfig } from '../navConfig';
import { setPageSeo } from '../seo/pageMeta';
import type { PageSeo, PageWordsInput } from '../seo/pageList';
import { setPageWords } from '../seo/pageWords';
import { setRobotsExtra } from '../seo/robotsStore';
import { revision, revisionsOf, rollbackContext } from './history';
import { publishValue } from './docStore';
import type { DocName } from './docs';
import { nextRevision, trackedKey } from './rules';

type Result = { ok: true } | { ok: false; status: number; error: string };
const obj = <T>(v: unknown, empty: T): T => (v && typeof v === 'object' ? (v as T) : empty);

/*
 * Puts an older revision of a setting back (Content admins; the route checks the scope). It goes through the setting's own setter, so every
 * check that applies to a save applies here too, and the setter records the result as a new "rollback" revision. History is never rewritten.
 */
export async function rollback(adminId: string | null, key: string, version: number): Promise<Result> {
  const t = trackedKey(key);
  if (!t) return { ok: false, status: 404, error: tx('This setting has no history.') };
  const r = await revision(key, version);
  if (!r) return { ok: false, status: 404, error: tx('That revision does not exist.') };
  const ok = nextRevision(await revisionsOf(key, 1000), { key, value: r.value, action: 'rollback', fromVersion: version });
  if (!ok.ok) return { ok: false, status: 409, error: ok.error };
  const v = r.value;
  const path = t.path ?? '/';
  return rollbackContext.run({ key, fromVersion: version }, async (): Promise<Result> => {
    switch (t.kind) {
      case 'menu':
        return saveSite(adminId, 'menu', v ?? []);
      case 'footer':
        return saveSite(adminId, 'footer', v ?? []);
      case 'social':
        return saveSite(adminId, 'social', v ?? []);
      case 'sections':
        return saveSite(adminId, 'sections', v ?? { order: [], hidden: [] });
      case 'blocks':
        return saveSite(adminId, 'blocks', v ?? [], path);
      case 'seo_page':
        return setPageSeo(adminId, path, obj<PageSeo>(v, { title: '', description: '' }));
      case 'seo_controls':
        return setPageControls(adminId, path, obj<PageControls>(v, DEFAULT_CONTROLS));
      case 'page_words':
        return setPageWords(adminId, path, obj<PageWordsInput>(v, { heading: '', intro: '', body: '' }));
      case 'nav':
        return setNavConfig(adminId, obj<NavConfig>(v, { order: [], hidden: [] }));
      case 'cms_doc':
        if (v === null) return { ok: false, status: 409, error: tx('The built-in text cannot be put back from here. Publish a new version instead.') };
        return publishValue(adminId, path as DocName, v, null);
      case 'robots':
        return setRobotsExtra(adminId, Array.isArray(v) ? v.map(String) : []);
    }
  });
}
