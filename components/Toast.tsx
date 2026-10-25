'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const Ctx = createContext<(msg: string) => void>(() => {});

export const useToast = () => useContext(Ctx);

/* One toast for the whole section. Wrap a layout in it, call useToast() anywhere below. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('');
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    setOn(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), 2400);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className={'toast' + (on ? ' show' : '')} role="status">
        {msg}
      </div>
    </Ctx.Provider>
  );
}
