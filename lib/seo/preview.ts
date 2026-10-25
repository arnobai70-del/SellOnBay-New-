import 'server-only';

import { supabaseConfigured } from '../supabase/env';
import { getViewer } from '../supabase/viewer';

/*
 * May this visitor look at a page that is not published? Only a signed-in admin, so a draft is never visible to anyone else
 * and a preview address shared with a visitor shows nothing. Asked only when a page is closed, so open pages stay cacheable.
 * Demo mode (no accounts) has no admin to ask, so a closed page stays closed there.
 */
const isNextSignal = (e: unknown) => typeof e === 'object' && e !== null && 'digest' in e;

export async function adminMayPreview(): Promise<boolean> {
  if (!supabaseConfigured) return false;
  try {
    return (await getViewer())?.role === 'admin';
  } catch (e) {
    if (isNextSignal(e)) throw e;
    return false;
  }
}
