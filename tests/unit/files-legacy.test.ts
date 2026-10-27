import { describe, expect, it } from 'vitest';
import { legacyEvidence } from '@/lib/files/legacy';

const a = 'a'.repeat(64),
  b = 'b'.repeat(64);

describe('legacy file evidence (F-15)', () => {
  it('no earlier downloads: nothing to compare, no evidence review needed beyond the normal checks', () => {
    expect(legacyEvidence(a, [])).toEqual({ priorHashes: 0, matchesEarlierDownloads: null, needsEvidenceReview: false });
  });
  it('the same bytes every earlier buyer got: no extra review', () => {
    expect(legacyEvidence(a, [a])).toEqual({ priorHashes: 1, matchesEarlierDownloads: true, needsEvidenceReview: false });
  });
  it('different bytes, or buyers got several different files: evidence review before approval', () => {
    expect(legacyEvidence(a, [b])).toMatchObject({ matchesEarlierDownloads: false, needsEvidenceReview: true });
    expect(legacyEvidence(a, [a, b])).toMatchObject({ matchesEarlierDownloads: true, needsEvidenceReview: true });
  });
});
