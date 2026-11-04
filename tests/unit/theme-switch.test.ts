import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

describe('light and dark switch', () => {
  it('the script that runs before paint and the switch use the same key', () => {
    const key = /const KEY = '([^']+)'/.exec(read('components/ThemeSwitch.tsx'))?.[1];
    expect(key).toBeTruthy();
    expect(read('app/layout.tsx')).toContain('localStorage.getItem(`' + key + '`)');
  });

  it('stays dark unless light was chosen, and keeps dashboards dark', () => {
    expect(read('app/layout.tsx')).toContain('===`light`');
    for (const line of read('app/light.css').split('\n')) if (/^html\[data-theme=light\].*--night:/.test(line)) expect(line).toContain('.night');
    expect(read('app/light.css')).toMatch(/html\[data-theme=light\] \.night\{\n\s*--night:/);
  });
});
