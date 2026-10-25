'use client';
import { useRouter } from 'next/navigation';

export function MarkRead() {
  const router = useRouter();
  return (
    <button
      className="btn btn-line btn-sm"
      type="button"
      onClick={async () => {
        await fetch('/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'all' }) });
        router.refresh();
      }}
    >
      Mark all as read
    </button>
  );
}
