'use client';
import { toggleSaved, useList } from '@/lib/saved';

export function SaveButton({ id, name }: { id: string; name: string }) {
  const saved = useList('saved').includes(id);
  return (
    <button type="button" className="save" aria-pressed={saved} aria-label={saved ? `Remove ${name} from saved sites` : `Save ${name} to saved sites`} onClick={() => toggleSaved(id)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.8a4.3 4.3 0 0 1 7.5 2.7c0 5.4-7.5 10-7.5 10z" />
      </svg>
    </button>
  );
}
