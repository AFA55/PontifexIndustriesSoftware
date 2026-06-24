/**
 * Tests for the biometric sign-in module.
 *
 * The Capacitor plugin is native-only; in jsdom (web) `isNativeApp()` is false, so
 * every function must be a safe no-op that never touches the dynamically-imported
 * plugin. These tests lock that web/SSR safety contract and the public API shape so
 * the login flow + My Profile toggle can call them on the website without crashing.
 *
 * (The OS-enforced accessControl path + getSecureCredentials prompt can only be
 * exercised on a real device with the native plugin — that's the founder's manual
 * device test, flagged in the build report.)
 */
import {
  biometricAvailable,
  biometryLabel,
  enrollBiometric,
  hasEnrolledBiometric,
  hasSavedCredentials,
  verifyAndGetSession,
  disableBiometric,
  clearCredentials,
  enrolledBiometricEmail,
  BIOMETRIC_EMAIL_KEY,
} from './biometric';

describe('biometryLabel', () => {
  it('maps biometry types to friendly labels', () => {
    expect(biometryLabel('faceId')).toBe('Face ID');
    expect(biometryLabel('FACE_ID')).toBe('Face ID');
    expect(biometryLabel('touchId')).toBe('Touch ID');
    expect(biometryLabel('fingerprint')).toBe('fingerprint');
    expect(biometryLabel('none')).toBe('biometrics');
    expect(biometryLabel('')).toBe('biometrics');
  });
});

describe('web/SSR no-op contract (isNativeApp() === false in jsdom)', () => {
  it('biometricAvailable reports unavailable on web', async () => {
    await expect(biometricAvailable()).resolves.toEqual({
      available: false,
      biometryType: 'none',
    });
  });

  it('hasEnrolledBiometric is false on web (never prompts / never imports the plugin)', async () => {
    await expect(hasEnrolledBiometric()).resolves.toBe(false);
  });

  it('enrollBiometric is a safe no-op returning false on web', async () => {
    await expect(enrollBiometric('user@example.com', 'refresh-token-abc')).resolves.toBe(false);
  });

  it('enrollBiometric returns false for empty inputs (guards before any plugin call)', async () => {
    await expect(enrollBiometric('', 'token')).resolves.toBe(false);
    await expect(enrollBiometric('user@example.com', '')).resolves.toBe(false);
  });

  it('verifyAndGetSession returns null on web (no biometric session to restore)', async () => {
    await expect(verifyAndGetSession()).resolves.toBeNull();
  });

  it('disableBiometric resolves without throwing on web', async () => {
    await expect(disableBiometric()).resolves.toBeUndefined();
  });
});

describe('per-user binding (BIOMETRIC_EMAIL_KEY)', () => {
  afterEach(() => {
    try { window.localStorage.removeItem(BIOMETRIC_EMAIL_KEY); } catch { /* ignore */ }
  });

  it('exports a stable, namespaced key', () => {
    expect(BIOMETRIC_EMAIL_KEY).toBe('pontifex.biometricEmail');
  });

  it('enrolledBiometricEmail returns null on web even if a key is somehow set', () => {
    // On web isNativeApp() is false, so we never trust/return the binding.
    window.localStorage.setItem(BIOMETRIC_EMAIL_KEY, 'stale@example.com');
    expect(enrolledBiometricEmail()).toBeNull();
  });

  it('disableBiometric clears the email binding even on web (no plugin)', async () => {
    window.localStorage.setItem(BIOMETRIC_EMAIL_KEY, 'user@example.com');
    await disableBiometric();
    expect(window.localStorage.getItem(BIOMETRIC_EMAIL_KEY)).toBeNull();
  });
});

describe('back-compat aliases', () => {
  it('hasSavedCredentials aliases hasEnrolledBiometric', () => {
    expect(hasSavedCredentials).toBe(hasEnrolledBiometric);
  });

  it('clearCredentials aliases disableBiometric', () => {
    expect(clearCredentials).toBe(disableBiometric);
  });
});
