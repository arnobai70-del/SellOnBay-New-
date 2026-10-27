import 'server-only';
import type { AdPlatform } from './rules';

/*
 * The boundary for a real advertising platform (Blueprint 9.1, model A). It is written against the platform's documentation only after
 * Meta or Google confirms in writing that a marketplace app may act for its users, with which scopes and capabilities (blocker B-9), and
 * counsel has reviewed the terms (B-10). Until then there is NO implementation: adapterFor() returns null for every platform, so nothing
 * can connect an account, submit, pause or read a campaign, and no code calls an advertising API. Do not add a stand-in that pretends to.
 */
export type ConnectStart = { url: string; state: string };
export type PlatformCampaign = { externalId: string; status: 'pending' | 'active' | 'paused' | 'rejected' | 'ended'; note?: string };

export interface AdPlatformAdapter {
  readonly platform: AdPlatform;
  /* OAuth with the smallest scopes the platform offers; the seller authorises their own account. */
  connectUrl(sellerId: string, redirectTo: string): Promise<ConnectStart>;
  /* Exchanges the code for a token; the caller stores it encrypted (lib/ads/tokens.ts) and keeps only a reference. */
  finishConnect(code: string, state: string): Promise<{ accountId: string; accountName: string; token: string }>;
  submit(token: string, promo: { headline: string; text: string; landingUrl: string; dailyBudgetCents: number; days: number; imageUrl?: string }): Promise<PlatformCampaign>;
  pause(token: string, externalId: string): Promise<PlatformCampaign>;
  status(token: string, externalId: string): Promise<PlatformCampaign>;
  disconnect(token: string): Promise<void>;
}

export function adapterFor(_platform: AdPlatform): AdPlatformAdapter | null {
  return null; // B-9 and B-10 not cleared for any platform
}
