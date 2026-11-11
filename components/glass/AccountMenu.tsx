'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { signOut } from '@/app/(bare)/login/actions';
import { createClient } from '@/lib/supabase/client';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env';

type Who = { initials: string; name: string; admin: boolean };

const initialsOf = (s: string) =>
  s
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'Me';

/*
 * The account button of the public top bar (owner, 2026-11-11). Public pages are static, so the server cannot know who is visiting: the
 * browser reads its own session (no network call) and swaps "Sign in" for an avatar with Dashboard, Admin (admins only) and Sign out.
 */
export function AccountMenu({ fallback }: { fallback: { label: string; href: string } }) {
  const [who, setWho] = useState<Who | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) return;
    let live = true;
    const sb = createClient();
    void sb.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user;
      if (!u || !live) return;
      const name = (u.user_metadata?.full_name as string | undefined) || u.email || 'Account';
      const { data: p } = await sb.from('profiles').select('role').eq('id', u.id).maybeSingle();
      if (live) setWho({ initials: initialsOf(name), name, admin: (p as { role?: string } | null)?.role === 'admin' });
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!who)
    return (
      <Link className="btn" href={fallback.href} prefetch={false}>
        {fallback.label}
      </Link>
    );
  return (
    <div className="sob-acct" ref={box}>
      <button type="button" className="sob-acct-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Account: ${who.name}`} onClick={() => setOpen((v) => !v)}>
        <span className="av" aria-hidden="true">
          {who.initials}
        </span>
      </button>
      {open && (
        <div className="glass sob-acct-menu" role="menu">
          <div className="tag" style={{ margin: '0 0 6px', padding: '0 10px' }}>
            {who.name}
          </div>
          <Link role="menuitem" href="/dashboard" prefetch={false}>
            Dashboard
          </Link>
          {who.admin && (
            <Link role="menuitem" href="/admin" prefetch={false}>
              Admin
            </Link>
          )}
          <form action={signOut}>
            <button role="menuitem" type="submit">
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
