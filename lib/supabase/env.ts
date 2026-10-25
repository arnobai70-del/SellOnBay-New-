export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
/* Without keys the site runs as the demo prototype and auth is skipped.
   LAUNCHBAY_DEMO=1 forces demo mode on the server even when keys exist (handy for design checks). */
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey) && process.env.LAUNCHBAY_DEMO !== '1';
