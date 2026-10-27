/* Types for scripts/verify-staging-target.mjs (used by tests/unit/stage.test.ts). */
export const PRODUCTION_SUPABASE_REF: string;
export const STAGING_SUPABASE_REF: string;
export function checkStagingTarget(env: Record<string, string | undefined>): { ok: boolean; problems: string[] };
