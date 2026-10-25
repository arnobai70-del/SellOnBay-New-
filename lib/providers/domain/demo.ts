import { lookup } from '../../domains';
import type { DomainProvider } from './types';

const rid = () => Math.random().toString(36).slice(2, 10).toUpperCase();

/* Demo registrar: a stable made-up availability and a fake registration that lasts a year. Records its calls for tests. */
export class FakeDomainProvider implements DomainProvider {
  readonly name = 'Demo registrar';
  calls: { method: string; args: unknown[] }[] = [];
  async search(name: string) {
    this.calls.push({ method: 'search', args: [name] });
    return lookup(name);
  }
  async register(i: { domain: string; ownerEmail?: string }) {
    this.calls.push({ method: 'register', args: [i.domain] });
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return { ref: 'dom_demo_' + rid(), expires: d.toISOString().slice(0, 10) };
  }
}
