import { Suspense } from 'react';
import { TawkChat } from '@/components/TawkChat';
import { VisitTracker } from '@/components/VisitTracker';
import { RefTracker } from '@/components/glass/RefTracker';

/* The public pages. Each page draws its own frame (components/glass/PublicFrame.tsx) with the design file it is ported from. */
export default function GlassLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <VisitTracker />
        <RefTracker />
      </Suspense>
      <TawkChat />
    </>
  );
}
