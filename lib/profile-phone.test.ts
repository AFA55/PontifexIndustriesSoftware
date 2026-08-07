import { readProfilePhone, normalizeProfilePhone } from './profile-phone';

describe('readProfilePhone', () => {
  it('prefers phone_number, the column signup and invites actually write', () => {
    expect(readProfilePhone({ phone_number: '(864) 275-0064', phone: null })).toBe('(864) 275-0064');
  });

  it('falls back to the legacy phone column when phone_number is empty', () => {
    expect(readProfilePhone({ phone_number: null, phone: '470-658-6313' })).toBe('470-658-6313');
    expect(readProfilePhone({ phone_number: '  ', phone: '470-658-6313' })).toBe('470-658-6313');
  });

  it('never lets the legacy column win — the bug that made crew numbers look missing', () => {
    // Both of the founder's profiles carry disagreeing values. The canonical
    // column has to be the answer, or the SMS and the UI name different numbers.
    expect(readProfilePhone({ phone_number: '(864) 940-7161', phone: '470-658-6313' }))
      .toBe('(864) 940-7161');
  });

  it('returns null rather than an empty string when nothing is on file', () => {
    expect(readProfilePhone({ phone_number: null, phone: null })).toBeNull();
    expect(readProfilePhone({ phone_number: '', phone: '' })).toBeNull();
    expect(readProfilePhone(null)).toBeNull();
    expect(readProfilePhone(undefined)).toBeNull();
  });
});

describe('normalizeProfilePhone', () => {
  it('collapses every shape live in production to one', () => {
    // These three all exist in the profiles table right now.
    expect(normalizeProfilePhone('(864) 275-0064')).toBe('(864) 275-0064');
    expect(normalizeProfilePhone('470-658-6313')).toBe('(470) 658-6313');
    expect(normalizeProfilePhone('+4706586313')).toBe('(470) 658-6313');
  });

  it('handles a leading US country code', () => {
    expect(normalizeProfilePhone('+1 (864) 275-0064')).toBe('(864) 275-0064');
    expect(normalizeProfilePhone('18642750064')).toBe('(864) 275-0064');
  });

  it('normalises bare digits', () => {
    expect(normalizeProfilePhone('8648249943')).toBe('(864) 824-9943');
  });

  it('returns null for empty input so a cleared field clears the column', () => {
    expect(normalizeProfilePhone('')).toBeNull();
    expect(normalizeProfilePhone('   ')).toBeNull();
    expect(normalizeProfilePhone(null)).toBeNull();
    expect(normalizeProfilePhone(undefined)).toBeNull();
  });

  it('passes through anything it does not recognise instead of rejecting it', () => {
    // An operator with an unusual number must never be blocked from saving
    // their profile. lib/sms.ts decides what is textable, not this.
    expect(normalizeProfilePhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
    expect(normalizeProfilePhone('ext 402')).toBe('ext 402');
  });
});
