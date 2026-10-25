import { describe, expect, it } from 'vitest';
import { APPS } from '@/lib/apps';

/* A digital product may not promise something the platform does not deliver. Updates become a real promise only with the update period field and version releases. */
describe('digital starter listings make no update promise yet', () => {
  const digital = APPS.filter((a) => a.platform === 'digital');
  it('there are digital starters to check', () => expect(digital.length).toBeGreaterThan(3));
  it('none carries the Auto-update tag or a free-updates line', () => {
    for (const p of digital) {
      expect(p.does ?? [], p.name).not.toContain('updates');
      expect(
        p.inc.filter((l: string) => /updates?\b/i.test(l)),
        p.name,
      ).toEqual([]);
    }
  });
});
