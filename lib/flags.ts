/*
 * Switches for features that need a decision from the owner. Rules for each are written in docs/DECISIONS.md.
 *  FEATURE_TRIAL_COPY=1               sellers of code and automation products may add a limited trial copy (OFF by default: it hands out a copy before payment)
 *  FEATURE_FREE_SAMPLE=0              turns the free sample link off (ON by default)
 *  NEXT_PUBLIC_FEATURE_DEMO_RANKING=0 turns the lift for listings with good demos off (ON by default)
 */
export const flags = {
  trialCopy: process.env.FEATURE_TRIAL_COPY === '1',
  freeSample: process.env.FEATURE_FREE_SAMPLE !== '0',
  demoRanking: process.env.NEXT_PUBLIC_FEATURE_DEMO_RANKING !== '0',
};
