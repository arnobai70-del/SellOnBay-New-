import type { Instrumentation } from 'next';

/* Request timing for Server health (lib/timing.ts): one hook on the Node.js server, sampled, no bodies and no personal data. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const [{ installTiming }, http] = await Promise.all([import('./lib/timing'), import('node:http')]);
  installTiming(http);
}

/* Every server error Next catches is reported by lib/monitor.ts: a JSON log line, and a webhook post when ERROR_WEBHOOK_URL is set. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { reportError } = await import('./lib/monitor');
  await reportError(err, request, context);
};
