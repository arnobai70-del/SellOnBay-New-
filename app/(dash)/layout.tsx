import { ToastProvider } from '@/components/Toast';

export default function DashLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
