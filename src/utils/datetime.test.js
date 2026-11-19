import { describe, expect, it } from 'vitest';

import { formatCountdown } from './datetime.js';

describe('formatCountdown', () => {
  it('formats a hold as mm:ss', () => {
    expect(formatCountdown(125, 'en')).toBe('02:05');
    expect(formatCountdown(9, 'en')).toBe('00:09');
    expect(formatCountdown(120, 'en')).toBe('02:00');
  });

  it('uses the digits of the active language', () => {
    expect(formatCountdown(125, 'bn')).toBe('০২:০৫');
  });

  it('never shows a negative timer', () => {
    expect(formatCountdown(-4, 'en')).toBe('00:00');
  });
});
