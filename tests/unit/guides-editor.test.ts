import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleanGuideHtml, readingMinutes, wordCount } from '@/lib/guides/html';
import { isLive, postProblem, type PostInput } from '@/lib/postRules';

const src = (p: string) => readFileSync(p, 'utf8');
const base: PostInput = { slug: 'a-guide', title: 'A guide', metaTitle: '', metaDescription: '', excerpt: '', body: '', coverUrl: '', coverAlt: '', status: 'draft', noindex: false };

describe('guide HTML is cleaned (owner, 2026-11-08)', () => {
  it('drops scripts, handlers and unknown styles, keeps the editor blocks', () => {
    const out = cleanGuideHtml(
      '<h2 style="text-align:center;position:fixed">Hi</h2><p onclick="x()">t<script>alert(1)</script></p><span style="color:#ff0000;font-size:90px">red</span><div data-type="callout" data-tone="tip"><p>tip</p></div>',
    );
    expect(out).toContain('<h2 style="text-align:center">Hi</h2>');
    expect(out).not.toMatch(/script|onclick|position|font-size/);
    expect(out).toContain('style="color:#ff0000"');
    expect(out).toContain('data-type="callout"');
  });
  it('a picture needs alt text and our storage or https; it loads lazily', () => {
    expect(cleanGuideHtml('<img src="/blog/media/a.webp">')).toBe('');
    expect(cleanGuideHtml('<img src="javascript:alert(1)" alt="x">')).toBe('');
    expect(cleanGuideHtml('<img src="/blog/media/a.webp" alt="A cake">')).toContain('loading="lazy"');
  });
  it('embeds only YouTube or Vimeo players, and outside links open safely', () => {
    expect(cleanGuideHtml('<iframe src="https://evil.example/x"></iframe>')).not.toContain('iframe src');
    expect(cleanGuideHtml('<iframe src="https://www.youtube-nocookie.com/embed/abc"></iframe>')).toContain('youtube-nocookie.com/embed/abc');
    expect(cleanGuideHtml('<a href="https://other.example">x</a>')).toContain('rel="noopener noreferrer nofollow"');
    expect(cleanGuideHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript');
  });
  it('counts words and reading time', () => {
    const html = `<p>${'word '.repeat(440)}</p>`;
    expect(wordCount(html)).toBe(440);
    expect(readingMinutes(html)).toBe(2);
  });
});

describe('guide states', () => {
  it('a scheduled guide goes live at its time without a job', () => {
    expect(isLive({ status: 'scheduled', publishAt: 1000 }, 999)).toBe(false);
    expect(isLive({ status: 'scheduled', publishAt: 1000 }, 1000)).toBe(true);
    expect(isLive({ status: 'unpublished' })).toBe(false);
  });
  it('checks the new fields', () => {
    expect(postProblem({ ...base, status: 'scheduled' })).toMatch(/when to publish/);
    expect(postProblem({ ...base, coverUrl: '/blog/media/a.webp', coverAlt: 'x' })).toBeNull();
    expect(postProblem({ ...base, canonical: 'http://x' })).toMatch(/canonical/);
    expect(postProblem({ ...base, tags: Array(13).fill('t') })).toMatch(/12 tags/);
    expect(postProblem({ ...base, status: 'published', bodyHtml: '<p>Hello</p>' })).toBeNull();
  });
  it('the editor API is for Content admins, keeps revisions, and an autosave never changes what is live', () => {
    const api = src('app/api/admin/guides/route.ts');
    expect(api).toMatch(/adminOnly\('content'\)/);
    expect(api).toMatch(/saveRevision\(a\.id, r\.value, d\.autosave\)/);
    expect(api).toMatch(/d\.autosave \? \(before\?\.status \?\? 'draft'\)/);
    const editor = src('components/glass/GuideEditor.tsx');
    for (const feature of [
      'moveBlock',
      'insertGallery',
      'insertWebsite',
      'insertCta',
      'setCallout',
      'setYoutubeVideo',
      'insertTable',
      'toggleTaskList',
      'setColor',
      'toggleHighlight',
      'setTextAlign',
      'characterCount',
      '15_000',
    ])
      expect(editor, feature).toContain(feature);
    expect(src('app/(glass)/guides/[slug]/page.tsx')).toMatch(/'@type': 'Article'/);
  });
});
