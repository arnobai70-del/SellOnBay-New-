import { NEEDS_DEMO, NEEDS_RELEASE } from './apps';

/*
 * What a listing needs before it can be submitted for review. Drafts are never held to this: a seller can save half a listing.
 * Used by the form (to say what is missing) and by the server (which is the one that enforces it).
 */
export type ReviewInput = {
  kind: string; // web, android, ios, webapp, desktop or digital
  name: string;
  category: string;
  desc: string;
  includes: string[];
  demoLink: string;
  hasZip: boolean; // a website zip chosen
  shots: number; // screenshots chosen
  codeUrl: string;
  clean: boolean; // the "files are clean and mine" tick, digital products only
  release?: boolean; // the "licences and releases" tick, stock media only (NEEDS_RELEASE)
  requirements?: string; // what it needs to run, digital products only
  docsUrl?: string; // optional, but if it is there it must be https
};

const isHttps = (v: string) => {
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};

export function missingForReview(i: ReviewInput): string[] {
  const m: string[] = [];
  const name = i.name.trim();
  if (name.length < 3 || name.length > 60) m.push('a name of 3 to 60 characters');
  if (!i.category.trim()) m.push('a category');
  if (i.desc.trim().length < 20) m.push('a description of at least 20 characters');
  if (i.includes.filter((x) => x.trim()).length < 1) m.push('at least 1 item under "What is included"');
  if (i.kind === 'web') {
    if (!i.hasZip && !isHttps(i.demoLink)) m.push('your site as a zip, or a live demo link');
  } else if (i.shots < 1) m.push('at least 1 screenshot');
  if (i.kind === 'digital' && NEEDS_DEMO.includes(i.category) && !isHttps(i.demoLink)) m.push('a demo link (a short video, a view-only link or a sample result)');
  if (!isHttps(i.codeUrl)) m.push(i.kind === 'digital' ? 'a private link to your files (https)' : 'a private link to your code (https)');
  if (i.kind === 'digital' && !i.clean) m.push('the tick that your files are clean and yours to sell');
  if (i.kind === 'digital' && NEEDS_RELEASE.includes(i.category) && !i.release) m.push('the tick that you hold the licences and signed releases for what the files show');
  if (i.kind === 'digital' && NEEDS_DEMO.includes(i.category) && !(i.requirements ?? '').trim()) m.push('what it needs to run (system requirements)');
  if (i.kind === 'digital' && (i.docsUrl ?? '').trim() && !isHttps(i.docsUrl!.trim())) m.push('a documentation link that starts with https');
  return m;
}

export const reviewMessage = (missing: string[]) => `Before you submit for review, add: ${missing.join('; ')}.`;
