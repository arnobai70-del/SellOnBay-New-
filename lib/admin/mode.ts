/**
 * Local prototypes deliberately have no user database; production must never
 * interpret absent Supabase credentials as a logged-in administrator.
 * A production demo is permitted only when deliberately marked as such.
 */
export function mayUseDemoAdmin(env: { NODE_ENV?: string; LAUNCHBAY_DEMO?: string }): boolean {
  return env.NODE_ENV !== 'production' || env.LAUNCHBAY_DEMO === '1';
}

type ShellRole = 'buyer' | 'seller' | 'admin';
/*
 * Which menu a shared dashboard page (Messages) shows. A signed-in person always gets their own role's menu.
 * Without accounts (demo) the page keeps the view it was opened from (?view=), so the admin menu does not turn into the buyer one;
 * the admin view is offered only where the demo admin is allowed at all.
 */
export function shellRole(viewerRole: ShellRole | undefined, view: string | undefined, env: { NODE_ENV?: string; LAUNCHBAY_DEMO?: string }): ShellRole {
  if (viewerRole) return viewerRole;
  if (view === 'seller') return 'seller';
  if (view === 'admin' && mayUseDemoAdmin(env)) return 'admin';
  return 'buyer';
}
