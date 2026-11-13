import { ToastProvider } from '@/components/Toast';
import { TxProvider } from '@/components/i18n/TxProvider';
import { getI18n } from '@/lib/i18n/server';

/* The dashboards add the words only their client components use (the root layout sends the public ones), so public pages stay light. */
export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const i18n = await getI18n();
  return (
    <TxProvider dict={i18n.dashDict}>
      <ToastProvider>{children}</ToastProvider>
    </TxProvider>
  );
}
