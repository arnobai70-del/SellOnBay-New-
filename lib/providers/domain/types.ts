import type { DomainResult } from '../../domains';

/*
 * The one door to a domain registrar (NameSilo, Namecheap or another, decision D3). Domains are registered in the buyer's name.
 * Today the implementation is a demo with made-up availability. To go live, write a class that implements this interface,
 * read the registrar's current docs first, keep its key on the server only, and change the one line in ./index.ts.
 */
export interface DomainProvider {
  readonly name: string;
  search(name: string): Promise<DomainResult[]>;
  register(i: { domain: string; ownerEmail?: string }): Promise<{ ref: string; expires: string }>;
}
