import { describe, expect, it } from 'vitest';
import { missingForReview, reviewMessage, type ReviewInput } from '@/lib/listingRules';

const site: ReviewInput = {
  kind: 'web',
  name: 'Saffron Table',
  category: 'Restaurants',
  desc: 'A calm restaurant site with a menu and booking.',
  includes: ['Home page'],
  demoLink: 'https://demo.example.com',
  hasZip: false,
  shots: 0,
  codeUrl: 'https://drive.example.com/file',
  clean: false,
};
const script: ReviewInput = {
  kind: 'digital',
  name: 'Lead Capture',
  category: 'Scripts',
  desc: 'Captures leads and sends them to a CRM.',
  includes: ['The script'],
  demoLink: 'https://video.example.com/1',
  hasZip: false,
  shots: 1,
  codeUrl: 'https://drive.example.com/file',
  clean: true,
  requirements: 'Python 3.10 or newer.',
};
const figma: ReviewInput = { ...script, category: 'Figma kits', demoLink: '' };

describe('submit for review: allowed', () => {
  it('a complete website (live demo link instead of a zip)', () => expect(missingForReview(site)).toEqual([]));
  it('a complete website (zip instead of a demo link)', () => expect(missingForReview({ ...site, demoLink: '', hasZip: true })).toEqual([]));
  it('a complete script with a demo link and one screenshot', () => expect(missingForReview(script)).toEqual([]));
  it('a Figma kit needs no demo link', () => expect(missingForReview(figma)).toEqual([]));
});

describe('submit for review: blocked, and the message says what is missing', () => {
  it('nothing filled in lists everything', () => {
    const m = missingForReview({ ...script, name: '', category: '', desc: '', includes: [], demoLink: '', shots: 0, codeUrl: '', clean: false });
    expect(m).toEqual([
      'a name of 3 to 60 characters',
      'a category',
      'a description of at least 20 characters',
      'at least 1 item under "What is included"',
      'at least 1 screenshot',
      'a private link to your files (https)',
      'the tick that your files are clean and yours to sell',
    ]);
  });
  it.each([['Plugins'], ['Scripts'], ['AI automations'], ['Chatbots'], ['AI prompts'], ['Video templates']])('a %s listing without a demo link', (category) => {
    expect(missingForReview({ ...script, category, demoLink: '' })).toEqual(['a demo link (a short video, a view-only link or a sample result)']);
  });
  it('a demo link that is not https does not count', () => {
    expect(missingForReview({ ...script, demoLink: 'http://video.example.com' })).toHaveLength(1);
    expect(missingForReview({ ...script, demoLink: 'not a link' })).toHaveLength(1);
  });
  it('no screenshot on an app or digital product', () => {
    for (const kind of ['android', 'ios', 'webapp', 'desktop', 'digital']) expect(missingForReview({ ...script, kind, category: 'Figma kits', shots: 0 })).toContain('at least 1 screenshot');
  });
  it('a website with neither a zip nor a demo link', () => {
    expect(missingForReview({ ...site, demoLink: '', hasZip: false })).toEqual(['your site as a zip, or a live demo link']);
  });
  it('no included items, a short description, a bad name', () => {
    expect(missingForReview({ ...site, includes: ['', '  '] })).toEqual(['at least 1 item under "What is included"']);
    expect(missingForReview({ ...site, desc: 'too short' })).toEqual(['a description of at least 20 characters']);
    expect(missingForReview({ ...site, name: 'ab' })).toEqual(['a name of 3 to 60 characters']);
    expect(missingForReview({ ...site, name: 'x'.repeat(61) })).toEqual(['a name of 3 to 60 characters']);
  });
  it('the files-are-clean tick is only asked for digital products', () => {
    expect(missingForReview({ ...script, clean: false })).toEqual(['the tick that your files are clean and yours to sell']);
    expect(missingForReview({ ...site, clean: false })).toEqual([]);
  });
  it('builds one readable sentence', () => {
    expect(reviewMessage(['a name of 3 to 60 characters', 'at least 1 screenshot'])).toBe('Before you submit for review, add: a name of 3 to 60 characters; at least 1 screenshot.');
  });
});

describe('stock media needs the licences and releases tick', () => {
  const photos: ReviewInput = { ...figma, category: 'Photos' };
  it('photos without the tick are held back, with a plain reason', () => expect(missingForReview(photos)).toEqual(['the tick that you hold the licences and signed releases for what the files show']));
  it('photos with the tick can go to review', () => expect(missingForReview({ ...photos, release: true })).toEqual([]));
  it('kinds that are not stock media never ask for it', () => expect(missingForReview(figma)).toEqual([]));
});
