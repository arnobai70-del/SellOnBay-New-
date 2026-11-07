import { describe, expect, it } from 'vitest';
import { plainWords, publicListing } from '@/lib/glass/words';

describe('the removed word in listings the owner wrote', () => {
  it('is replaced for the public, in the forms real listings use', () => {
    expect(plainWords('Aperture – Wedding Photographer Portfolio Template (Dark)')).toBe('Aperture – Wedding Photographer Portfolio Website (Dark)');
    expect(plainWords('Bedrock – Construction Company Website Template')).toBe('Bedrock – Construction Company Website');
    expect(plainWords('Kinetic – Dark Sports & Fitness Gear Store HTML Template')).toBe('Kinetic – Dark Sports & Fitness Gear Store HTML Website');
    expect(plainWords('a clean website template and more templates')).toBe('a clean website and more websites');
    expect(plainWords('Contemplate this')).toBe('Contemplate this');
  });
  it('leaves the stored listing and its address alone', () => {
    const p = { id: 'kept-template-slug', name: 'A Template', desc: 'a template', inc: ['one template'], tag: 'template' };
    expect(publicListing(p)).toEqual({ id: 'kept-template-slug', name: 'A Website', desc: 'a website', inc: ['one website'], tag: 'website' });
    expect(p.name).toBe('A Template');
  });
});
