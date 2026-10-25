import type { Instrumentation } from 'next';

/* Every server error Next catches is reported by lib/monitor.ts: a JSON log line, and a webhook post when ERROR_WEBHOOK_URL is set. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { reportError } = await import('./lib/monitor');
  await reportError(err, request, context);
};
