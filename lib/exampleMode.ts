import { supabaseConfigured } from './supabase/env';

/*
 * Made-up example listings can exist only where nobody pays: with no database (demo mode) or on the test server (EXAMPLE_ORDERS=1).
 * On a live site with a database they are removed everywhere, whatever the Settings switch says. Safe to import in the browser too.
 */
export const examplesAllowed = () => !supabaseConfigured || process.env.EXAMPLE_ORDERS === '1' || process.env.NEXT_PUBLIC_EXAMPLE_ORDERS === '1';
