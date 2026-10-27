/*
 * The gtag function for direct GA4 (owner decision D-G: keep G-FEK9C0CM04, no GTM).
 * gtag.js only acts on dataLayer entries that are a function's `arguments` object, exactly as Google's own snippet pushes them. A plain array
 * (for example from `(...args) => dataLayer.push(args)`) is ignored, so every command would be lost. Kept separate so a test can check the shape.
 */
type GaWindow = { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

export function installGtag(w: GaWindow): (...args: unknown[]) => void {
  w.dataLayer = w.dataLayer || [];
  const layer = w.dataLayer;
  // A classic function, not an arrow: only it has its own `arguments`.
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments);
  };
  return w.gtag;
}
