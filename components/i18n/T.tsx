'use client';

import { Fragment } from 'react';
import { useTx } from './TxProvider';

/*
 * A visible word or sentence in the page's language (i18n phase 2). Written by scripts/i18n-codemod.mjs as a T element with the English text in s, or with
 * values in v (placeholders such as {amount}). Works in server and client components alike (the words come from TxProvider in the
 * root layout; an English page has none and shows the English text). A value may be a word, a number or an element (a link inside a sentence).
 */
export function T({ s, v }: { s: string; v?: Record<string, React.ReactNode> }) {
  const tx = useTx();
  const text = tx(s);
  if (!v) return text;
  const parts = text.split(/\{(\w+)\}/g);
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{i % 2 ? (p in v ? v[p] : `{${p}}`) : p}</Fragment>
      ))}
    </>
  );
}
