import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient as createJsClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { supabaseAnonKey, supabaseUrl } from './env';

/* Acts as the signed-in user. RLS applies. */
export async function createClient() {
  const jar = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* called from a Server Component; proxy refreshes the session */ }
      },
    },
  });
}

/* Bypasses RLS. Only for server code that moves money, changes roles or writes order state. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createJsClient(supabaseUrl, key, { auth: { persistSession: false } });
}
