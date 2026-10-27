/*
 * The declared list of optional features an admin may switch (R-4). Pure, safe in the browser, tested.
 * Only optional features belong here. NEVER add a flag for: payment verification, release approval, file scanning, private immutable storage,
 * permissions or audit logging. tests/unit/feature-flags.test.ts refuses keys and labels that look like those.
 * `locked`: a reason the flag cannot be turned on yet (a blocker in the owner's blocker register); it can still be kept off.
 */
export type FlagDef = { label: string; area: 'Sign-in' | 'Analytics' | 'Advertising' | 'Requests' | 'Reports' | 'Future'; default: boolean; locked?: string };

export const FLAGS = {
  'login.google': { label: 'Sign in with Google', area: 'Sign-in', default: false, locked: 'Waiting for the social-login security tests S1 to S15 (blocker B-7).' },
  'login.microsoft': { label: 'Sign in with Microsoft (personal and work)', area: 'Sign-in', default: false, locked: 'Waiting for the social-login security tests S1 to S15 (blocker B-7).' },
  'login.github': { label: 'Sign in with GitHub', area: 'Sign-in', default: false, locked: 'Waiting for the social-login security tests S1 to S15 (blocker B-7).' },
  'login.gitlab': { label: 'Sign in with GitLab.com', area: 'Sign-in', default: false, locked: 'Waiting for the social-login security tests S1 to S15 (blocker B-7).' },
  'login.apple_existing': { label: 'Sign-in path for existing Apple accounts', area: 'Sign-in', default: true },
  'analytics.ga4_country': { label: 'Country report from GA4', area: 'Analytics', default: false, locked: 'Waiting for GA4 Data API access (blocker B-5).' },
  'analytics.first_party_country': { label: 'First-party country counts', area: 'Analytics', default: false, locked: 'Waiting for legal and privacy approval (blocker B-12).' },
  'ads.meta': { label: 'Seller promotions on Meta (Facebook, Instagram)', area: 'Advertising', default: false, locked: 'Waiting for Meta to confirm access (blocker B-9) and legal review (B-10).' },
  'ads.google': { label: 'Seller promotions on Google Ads', area: 'Advertising', default: false, locked: 'Waiting for Google to confirm access (blocker B-9) and legal review (B-10).' },
  'requests.custom_dev': { label: 'Custom development requests', area: 'Requests', default: false },
  'reports.sales_pdf': { label: 'Sales PDF exports', area: 'Reports', default: false },
  'api.v1': { label: 'Versioned API for apps', area: 'Future', default: false, locked: 'A future feature; not built yet.' },
  'ai.chatbot': { label: 'AI chatbot', area: 'Future', default: false, locked: 'A future feature; not built yet.' },
} as const satisfies Record<string, FlagDef>;

export type FlagKey = keyof typeof FLAGS;
export const flagDef = (k: FlagKey): FlagDef => FLAGS[k];
export const isFlagKey = (k: string): k is FlagKey => Object.hasOwn(FLAGS, k);

/* Words that mark a mandatory control. A flag key or label containing one is refused by the test. */
export const MANDATORY_CONTROL_WORDS = ['payment', 'reconcil', 'release', 'scan', 'quarantine', 'storage', 'immutable', 'permission', 'scope', 'audit', 'mfa', 'totp', 'rls'];
