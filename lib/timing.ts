import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { keep, routeOf, sampleEvery, statusClass, type Sample } from './timingCore';

/*
 * The one shared timing hook (owner, 2026-11-08), installed once from instrumentation.ts on the Node.js server: every API request's time from
 * arrival to the last byte, sampled, kept in memory for an hour (lib/timingCore.ts). It reads nothing from the request but its method and path.
 */
const g = globalThis as { __timing?: { samples: Sample[]; installed: boolean; n: number } };
const state = (g.__timing ??= { samples: [], installed: false, n: 0 });
export const samples = () => state.samples;

export function installTiming(http: { Server: typeof Server }, env: Record<string, string | undefined> = process.env): void {
  const every = sampleEvery(env);
  if (state.installed || every === 0) return;
  state.installed = true;
  const emit = http.Server.prototype.emit;
  http.Server.prototype.emit = function (this: Server, event: string, ...args: unknown[]) {
    if (event === 'request') {
      const [req, res] = args as [IncomingMessage, ServerResponse];
      const url = req.url ?? '';
      if (url.startsWith('/api/') && ++state.n % every === 0) {
        const t0 = performance.now();
        res.once('finish', () =>
          keep(state.samples, { at: Date.now(), route: routeOf(url), method: req.method ?? 'GET', status: statusClass(res.statusCode), ms: Math.round(performance.now() - t0) }),
        );
      }
    }
    return emit.apply(this, [event, ...args] as Parameters<typeof emit>);
  } as typeof emit;
}
