import { permanentRedirect } from 'next/navigation';

/* /explore is now the home page. The old address keeps working, and keeps a chosen tab. */
export default async function Explore({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab;
  permanentRedirect(tab === 'new' || tab === 'top' ? `/?tab=${tab}` : '/');
}
