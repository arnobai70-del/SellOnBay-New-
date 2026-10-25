import { describe, expect, it } from 'vitest';
import { hireSchema, listingFieldsSchema, orderCreateSchema, paySchema, presaleSchema, replySchema } from '@/lib/schemas';
import { idParam, parseWith, tokenParam } from '@/lib/validate';

describe('API input shapes (Zod)', () => {
  it('route ids: plain characters only, bounded length', () => {
    expect(idParam.safeParse('3f2b8c1e-aaaa-bbbb-cccc-1234567890ab').success).toBe(true);
    expect(idParam.safeParse('my-site_1.2').success).toBe(true);
    for (const bad of ['', '../etc/passwd', 'a b', 'x'.repeat(121), 'a/b', '%00']) expect(idParam.safeParse(bad).success).toBe(false);
    expect(tokenParam.safeParse('short').success).toBe(false);
  });
  it('order create: wrong types and huge text are refused', () => {
    expect(orderCreateSchema.safeParse({ productId: 'x', ai: true, oses: ['Windows'] }).success).toBe(true);
    expect(orderCreateSchema.safeParse({ ai: 'yes' }).success).toBe(false);
    expect(orderCreateSchema.safeParse({ brief: 'x'.repeat(4001) }).success).toBe(false);
    expect(orderCreateSchema.safeParse({ oses: Array(6).fill('Linux') }).success).toBe(false);
    expect(orderCreateSchema.safeParse({ kind: 'steal' }).success).toBe(false);
  });
  it('pay, hire, presale and reply', () => {
    expect(paySchema.safeParse({ card: { number: '4242424242424242' }, otp: '123456' }).success).toBe(true);
    expect(paySchema.safeParse({ card: { number: 4242 } }).success).toBe(false);
    expect(hireSchema.safeParse({ dev: 'a', pack: 'Basic', brief: 'b' }).success).toBe(true);
    expect(hireSchema.safeParse({ dev: 'a' }).success).toBe(false);
    expect(presaleSchema.safeParse({ productKey: 'p', body: 'hi', startedAt: Date.now() }).success).toBe(true);
    expect(presaleSchema.safeParse({ body: { $gt: '' } }).success).toBe(false);
    expect(replySchema.safeParse({ id: 'x', reply: 'ok' }).success).toBe(true);
    expect(replySchema.safeParse({ reply: 'ok' }).success).toBe(false);
  });
  it('listing fields: platform must be one of the six', () => {
    const base = { platform: 'web', stack: '', name: 'n', category: 'c', desc: '', license: '', demo: '', code: '', sample: '', inc: '', price: '10', days: '1 day', clean: '' };
    expect(listingFieldsSchema.safeParse(base).success).toBe(true);
    expect(listingFieldsSchema.safeParse({ ...base, platform: 'toaster' }).success).toBe(false);
    expect(listingFieldsSchema.safeParse({ ...base, desc: 'x'.repeat(5001) }).success).toBe(false);
  });
  it('a bad shape gives a 400 that names the field', async () => {
    const r = parseWith(hireSchema, { dev: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.res.status).toBe(400);
      expect((await r.res.json()).field).toBe('dev');
    }
  });
});
