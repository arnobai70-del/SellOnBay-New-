'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { txLookup, type Dict } from '@/lib/i18n/tx';

/*
 * The words of client components in the page's language (lib/i18n/tx.ts). The root layout passes only the strings client components use, and
 * only for a language other than English (an English page sends nothing). useTx() returns a function of (English text, vars?).
 * A provider inside another adds its words to the outer ones: the root layout sends the public words, the (dash) layout the dashboard words.
 */
const Ctx = createContext<Dict>({});
export function TxProvider({ dict, children }: { dict: Dict; children: React.ReactNode }) {
  const outer = useContext(Ctx);
  const value = useMemo(() => (Object.keys(outer).length ? { ...outer, ...dict } : dict), [outer, dict]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useTx() {
  const dict = useContext(Ctx);
  return useCallback((english: string, vars?: Record<string, string | number>) => txLookup(dict, english, vars), [dict]);
}
