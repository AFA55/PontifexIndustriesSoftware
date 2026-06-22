# Biometric (Face ID / Touch ID) + Remember-Me — Verified Architecture

**Source:** deep-research (Jun 19, 2026; 103 agents, 23/25 claims verified). Stack: Next.js 15 + Supabase Auth + Capacitor 8 remote-URL webview (one bundle for web + iOS + Android).

## TL;DR — what to change vs. what we already do right
- ✅ **Plugin is correct:** `@capgo/capacitor-native-biometric` (already installed) is the right 2026 choice — it BOTH verifies identity AND stores secrets in iOS Keychain / Android Keystore, biometric-gated. Alternatives are worse: `@aparajita/capacitor-biometric-auth` doesn't store secrets; `@capawesome` biometrics is paywalled (needs the paid Vault plugin).
- ✅ **Password fallback kept** + **NSFaceIDUsageDescription** present (Build 8). Apple requires both (never biometric-only; guideline 2.5.13).
- ✅ **Navigation kick-out fixed** (commit `964d8d8c`): native uses SPA router, not full `window.location.assign`. Research confirms the root cause is a **www↔apex host mismatch** that Capacitor externalizes to Safari.
- 🔧 **Improve (needs a native build):** store the **Supabase refresh token** instead of the raw password; add **`allowNavigation`** to capacitor config as defense-in-depth.

## Recommended end-state
1. **Credential model — store the Supabase REFRESH TOKEN, not the password.**
   - Access tokens are short-lived (~1 h); the durable secret is the refresh token. Store it in Keychain/Keystore **biometric-gated** (capgo `setCredentials` with `accessControl: BIOMETRY_CURRENT_SET` or `BIOMETRY_ANY`).
   - On app launch: biometric unlock → `supabase.auth.setSession({ access_token, refresh_token })` (or refresh) to restore the session.
   - ⚠️ **Refresh tokens rotate and can be revoked** (the "never expire" claim was REFUTED). So **always handle `setSession` failure → fall back to password login** and re-store the new refresh token after each successful login.
   - Tradeoff note: storing email+password (current) survives token rotation but re-runs the full login each time; the refresh token is server-revocable (better security) but needs the rotation/failure fallback above. Either is acceptable in Keychain; refresh token is the more secure best-practice.
2. **Do NOT trust localStorage in the webview** for session persistence (XSS-exfiltratable; not guaranteed durable). Use a Keychain/Keystore-backed secret + `setSession` on launch. (A custom secure-storage adapter for supabase-js is the alternative.)
3. **Biometric gating:** drive button visibility off `isAvailable()` (NOT `biometryType` — that's only for the "Face ID" vs "Touch ID" label). `verifyIdentity()` then `getCredentials()` (version-safe; the docs site also names `getSecureCredentials` — confirm the pinned version).
4. **Apple compliance:** LocalAuthentication (plugin wraps it) ✓; `NSFaceIDUsageDescription` ✓; keep a non-biometric login + an under-13 alternate (password covers it). `verifyIdentity()` is bypassable on jailbroken devices → always validate server-side (we do — Supabase session).
5. **Navigation:** add to `capacitor.config.ts` → `server.allowNavigation: ['www.pontifexindustries.com', 'pontifexindustries.com']` so even a full-document nav stays in the webview; keep native SPA routing. Keep `window.location.assign` for the **web** path (fires the browser Save-Password prompt) — already gated by `isNativeApp()`.
6. **Android:** same shared capgo API → Android Keystore + BiometricPrompt + `USE_BIOMETRIC` permission. One codebase.
7. **Remember-me UX:** persist the (biometric-gated) refresh token when "Remember me" is on; prompt biometric on app launch (auto) and offer a "Use Face ID" button on the login screen; disabling Remember me clears the stored secret. (We already auto-prompt + clear on opt-out.)

## ⚠️ Standing risk (not introduced here)
Capacitor maintainers warn `server.url` remote-URL apps "are not intended for production" and can trigger **App Store guideline 4.7.1**. Our whole app is this architecture (already approved as v1.0.2), so it's a known, accepted exposure — flagged for awareness, not action.

## Build note
The credential-model + `allowNavigation` changes are **native** → require a new iOS build (Build 9) + `npx cap sync` + Android. The navigation **router** fix already shipped via the web bundle. Sources: supabase.com/docs/guides/auth/sessions, github.com/Cap-go/capacitor-native-biometric, developer.apple.com/app-store/review/guidelines (2.5.13), capacitorjs.com/docs/config.
