'use client';
import { useEffect } from 'react';
import { pushRecent } from '@/lib/saved';

export function TrackView({ id }: { id: string }) {
  useEffect(() => {
    pushRecent(id);
  }, [id]);
  return null;
}
