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
/*
 * A word known only at run time, such as a label from a shared list (lib/glass/orderStatus.ts, lib/licences.ts): its translation when this
 * page's dictionary has it, else the word as it is. Words written in the code itself use useTx() with the text in the call.
 */
export function useWord() {
  const dict = useContext(Ctx);
  return useCallback((english: string) => txLookup(dict, english), [dict]);
}
