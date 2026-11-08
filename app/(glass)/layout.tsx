import { Suspense } from 'react';
import { TawkChat } from '@/components/TawkChat';
import { VisitTracker } from '@/components/VisitTracker';

/* The public pages. Each page draws its own frame (components/glass/PublicFrame.tsx) with the design file it is ported from. */
export default function GlassLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <VisitTracker />
      </Suspense>
      <TawkChat />
    </>
  );
}
