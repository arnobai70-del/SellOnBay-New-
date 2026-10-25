/*
 * The one door to wherever buyer sites are deployed (decision D5). Phase A is manual: the seller deploys and ticks "live".
 * Phase B is a one-click deploy into the buyer's own Vercel or Netlify account, Phase C is full automation. Not built yet:
 * this file only fixes the shape so the order flow does not change when a real one is added.
 */
export type DeployState = 'pending' | 'building' | 'live' | 'suspended' | 'failed';
export interface DeployProvider {
  readonly name: string;
  deploy(i: { orderId: string; domain: string }): Promise<{ projectRef: string; url: string }>;
  status(projectRef: string): Promise<{ state: DeployState; sslOk: boolean }>;
  suspend(projectRef: string): Promise<void>; // used by abuse control
}

/* Manual deployment: nothing happens by itself; the seller ticks "live" in the order. */
export class ManualDeployProvider implements DeployProvider {
  readonly name = 'manual';
  async deploy(i: { orderId: string; domain: string }) {
    return { projectRef: `manual:${i.orderId}`, url: `https://${i.domain}` };
  }
  async status() {
    return { state: 'pending' as const, sslOk: false };
  }
  async suspend() {}
}
export const deployProvider = (): DeployProvider => new ManualDeployProvider();
