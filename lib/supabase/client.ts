import { createBrowserClient } from '@supabase/ssr';
import { sessionCookieOptions } from './cookieOptions';
import { supabaseAnonKey, supabaseUrl } from './env';

export const createClient = () => createBrowserClient(supabaseUrl, supabaseAnonKey, { cookieOptions: sessionCookieOptions() });
