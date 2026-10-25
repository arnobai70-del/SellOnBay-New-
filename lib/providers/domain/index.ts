import 'server-only';
import { FakeDomainProvider } from './demo';
import { demoRegistrarAllowed, isLiveRegistrar, mayOfferNewDomain } from './policy';
import type { DomainProvider } from './types';

const fake = ((globalThis as { __fakeDomains?: FakeDomainProvider }).__fakeDomains ??= new FakeDomainProvider());
const unavailable: DomainProvider = {
  name: 'unconfigured',
  async search() {
    throw new Error('Real registrar not connected. Search is unavailable.');
  },
  async register() {
    throw new Error('Real registrar not connected. Registration is unavailable.');
  },
};

/*
 * Fail closed for real production. Only a local or explicitly demo-labelled
 * prototype can use the invented availability and registration references.
 * When D3 is decided, replace this selection with the actual verified provider.
 */
export const domainProvider = (): DomainProvider => (demoRegistrarAllowed() ? fake : unavailable);
export { isLiveRegistrar, mayOfferNewDomain };
export type { DomainProvider } from './types';
