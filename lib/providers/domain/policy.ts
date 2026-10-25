import type { DomainProvider } from './types';

type Environment = { NODE_ENV?: string; LAUNCHBAY_DEMO?: string };

/** Public availability results must never be advertised as verified by the fake registrar. */
export function isLiveRegistrar(provider: DomainProvider): boolean {
  return provider.name !== 'Demo registrar' && provider.name !== 'unconfigured';
}

/** Only a deliberately enabled prototype may use made-up domain registration. */
export function demoRegistrarAllowed(env: Environment = process.env): boolean {
  return env.NODE_ENV !== 'production' || env.LAUNCHBAY_DEMO === '1';
}

export function mayOfferNewDomain(provider: DomainProvider, env: Environment = process.env): boolean {
  return isLiveRegistrar(provider) || (provider.name === 'Demo registrar' && demoRegistrarAllowed(env));
}
