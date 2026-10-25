'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { fileReport } from '@/lib/abuse';
import { clientIp } from '@/lib/delivery/service';
import { getViewerId } from '@/lib/supabase/viewer';

/* Public form. Each reporter counts once; enough different reporters pause the listing until an admin looks (lib/abuse.ts). */
export async function reportAbuse(formData: FormData) {
  const r = await fileReport({
    url: String(formData.get('url') ?? ''),
    reason: String(formData.get('reason') ?? ''),
    detail: String(formData.get('detail') ?? ''),
    userId: (await getViewerId()) ?? null,
    ip: clientIp({ headers: await headers() } as Request),
  });
  if (!r.ok) redirect('/report-abuse?error=1');
  redirect('/report-abuse?sent=1');
}
