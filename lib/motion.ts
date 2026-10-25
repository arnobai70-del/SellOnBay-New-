/* Timing for the store home's entrance motion. Kept apart from the component so it can be tested without a browser. */
export const RISE_STEP_MS = 70;
export const RISE_MAX_STEPS = 8;

/* Each item in a group starts a little after the one before it; long rows stop adding delay so the last cards never lag behind. */
export const riseDelay = (index: number) => Math.min(Math.max(Math.floor(index), 0), RISE_MAX_STEPS) * RISE_STEP_MS;

/* Only groups that start below the visible screen are hidden and brought in; anything already in view stays put, so nothing blinks on load. */
export const shouldRise = (top: number, viewportHeight: number, reducedMotion: boolean) => !reducedMotion && viewportHeight > 0 && top >= viewportHeight;
