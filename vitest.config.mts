import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/* `server-only` throws outside the Next server, so unit tests that load server code get an empty stand-in. Without Supabase keys the stores run in memory. */
export default defineConfig({
  resolve: { alias: { '@': here('./'), 'server-only': here('./tests/stubs/server-only.ts') } },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', env: { NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' } },
});
