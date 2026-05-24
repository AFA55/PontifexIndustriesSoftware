/**
 * Tests for the Avatar initials/fallback logic.
 */

import { getInitials, gradientFor } from './Avatar';

describe('getInitials', () => {
  it('returns two initials for first + last name', () => {
    expect(getInitials('Jane Doe')).toBe('JD');
  });
  it('uses first and last token when more than two', () => {
    expect(getInitials('jean paul kowalski')).toBe('JK');
  });
  it('returns a single uppercase initial for one-word names', () => {
    expect(getInitials('madison')).toBe('M');
    expect(getInitials('Bob')).toBe('B');
  });
  it('collapses extra whitespace', () => {
    expect(getInitials('  jean   paul  ')).toBe('JP');
  });
  it('returns "?" for empty / null / undefined', () => {
    expect(getInitials('')).toBe('?');
    expect(getInitials('   ')).toBe('?');
    expect(getInitials(null)).toBe('?');
    expect(getInitials(undefined)).toBe('?');
  });
});

describe('gradientFor', () => {
  it('is deterministic for a given name', () => {
    expect(gradientFor('Jane Doe')).toBe(gradientFor('Jane Doe'));
  });
  it('always returns a tailwind gradient class string', () => {
    expect(gradientFor('Anyone')).toMatch(/^from-.+ to-.+$/);
    expect(gradientFor(null)).toMatch(/^from-.+ to-.+$/);
  });
});
