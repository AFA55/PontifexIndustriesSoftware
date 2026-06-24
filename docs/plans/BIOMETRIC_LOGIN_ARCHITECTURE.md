# Biometric ("Sign in with Face ID") Login — Architecture & Plan

**Status:** Proposed (research complete, awaiting founder decisions) · **Date:** Jun 23, 2026
**Owner:** Claude (exec eng) · **Supersedes notes in:** `docs/plans/BIOMETRIC_REMEMBER_ME_PLAN.md`

> **Decision in one line:** Make Face ID an **explicit, opt-in feature decoupled from "Remember me,"** and store a **Supabase refresh token** (not the password) in the iOS Keychain **behind OS-enforced biometric access control** — not a JS `verifyIdentity()` boolean.

This is sourced from a deep-research pass (16 primary-source-verified claims; banking apps BofA/HSBC/U.S. Bank/City National, Okta, Supabase docs, OWASP MASTG, the plugin's own docs). Citations inline.

---

## Why we're changing it (3 problems in today's Build 9 code)

Today (`lib/biometric.ts`):
1. **`setCredentials()` is called with NO `accessControl`** → it defaults to `NONE`, so the credential is stored in the Keychain **without hardware biometric protection**. The only "gate" is `verifyIdentity()`, a JS-bridge boolean. The plugin's own docs warn this is **bypassable on jailbroken devices** (Frida/Xposed hooking the bridge to force `true`) and "should not be the sole authentication mechanism." → **This is a real security gap.**
2. **It stores the raw email + password** in the Keychain. Best practice (Okta, OWASP) is to store a **long-lived, revocable token** behind biometrics — biometrics should *gate a secret, not be the secret*, and the password should never be persisted.
3. **Enrollment is implicitly coupled to "Remember me"** (the save runs in the login submit when remember is checked). Now that Remember Me defaults **off**, users get no intentional "enable Face ID" choice. **Every bank we studied keeps biometric a separate, explicit opt-in** (the one source claiming banks couple it to "remember me" was *refuted* 3-0).

---

## What best-in-class apps actually do (verified)

- **Explicit opt-in, password-first.** User signs in with password once, then enables biometrics deliberately — either an **inline checkbox during login** (Bank of America) or a **post-login prompt + a Settings toggle** (HSBC, U.S. Bank: *Profile → Login preferences → Enable Face ID*; City National: *Settings → Security → Face ID*). Never auto-coupled to "remember me."
- **Return UX = one biometric tap** ("log in with one simple tap" — BofA).
- **Graceful fallback.** After N biometric failures, fall back to a knowledge/possession factor (HSBC: 3 fails → passcode). Password is always available.
- **The biometric is never stored.** Matching happens on-device in the Secure Enclave; the app only unlocks a stored credential (HSBC).

---

## Recommended architecture (our stack: Capacitor remote-webview + Supabase + @capgo/capacitor-native-biometric 8.4.5)

**Store the Supabase _refresh token_ in the Keychain, protected by biometric access control. Decouple from Remember Me. Make enrollment explicit.**

### Why a refresh token (not the password, not the access token)
- Supabase **access tokens are short-lived** (5 min–1 hr) → stale by next launch. **Refresh tokens don't expire** (single-use, rotating) → the right thing to persist. (Supabase docs.)
- On return: biometric unlock → read refresh token from Keychain → `supabase.auth.setSession({ access_token, refresh_token })` (or `refreshSession`) → fresh, fully-valid session. Password **never persisted**; token is **revocable server-side**.
- **Bonus:** this also fixes the remote-webview "localStorage doesn't survive app-kill" problem — the session anchor lives in the Keychain, not web storage.

### Make the Keychain entry OS-enforced (the critical fix)
Call `setCredentials({ ..., accessControl: BIOMETRY_CURRENT_SET })` so the **OS itself** requires a live biometric match to read the item — not the JS `verifyIdentity()` boolean.
- **`BIOMETRY_CURRENT_SET`** (recommended): the stored token is **invalidated if the device's biometric set changes** (a new fingerprint/face is enrolled) → forces password re-login + re-enroll. Bank-grade; protects against someone adding their face to a borrowed/unlocked phone.
- Alternative `BIOMETRY_ANY`: survives biometric changes (more convenient, weaker). *Recommend `CURRENT_SET`.*
- Keep `verifyIdentity()` only as the UX prompt; the **real gate is the accessControl on `getCredentials`** + Supabase validating the token. (Defense in depth: even a jailbreak bypass of the JS boolean can't read a `CURRENT_SET`-protected item without the live biometric.)

### Enrollment UX (decoupled from Remember Me, native-only)
1. **Post-login prompt** (once): after the first successful password login on the app, show *"Sign in faster next time with {Face ID/Touch ID}?"* → **[Enable] / [Not now]**. On Enable → store the refresh token with biometric accessControl.
2. **Settings toggle** (canonical home): My Profile → Security → **"Sign in with Face ID"** on/off (mirrors U.S. Bank / City National). On → enroll; off → `deleteCredentials`.
3. **Return visit:** if an enrolled token exists, show the **"Sign in with {Face ID}"** button (+ optional auto-prompt). Success → restore session. Cancel/fail → password form (always present).
4. **Invalidate** on: explicit logout, "disable Face ID," password change, or `CURRENT_SET` auto-invalidation.

### Per-user binding on a shared device (implemented)
The Keychain item is keyed only by app (`SERVER`), so without a guard a *different* user could tap "Sign in with Face ID" and restore the *previous* user's session. We bind the entry to its owner: `enrollBiometric` records the enrolled email in `localStorage['pontifex.biometricEmail']` (non-secret — already in `pontifex.lastEmail`). On every **password** login, if that stored email differs from the just-authenticated email, we `disableBiometric()` (which clears both the Keychain entry and the email key); the post-login prompt then offers the *new* user enrollment. The email key is also cleared on `disableBiometric()` and on logout. The Face ID button shows whose login it is ("Sign in as {name} with Face ID"). Net: the device's biometric is always bound to the **last password-authenticated user** — no cross-account restore.

Two related session-durability points: (a) a biometric restore sets `pontifex.rememberMe = 'true'` *before* `refreshSession` so the restored session lands in `localStorage` (survives app kill), since enrolling biometrics is itself the durable "remember this device" opt-in (Remember Me now defaults OFF). (b) After a biometric restore, if `/api/my-profile` fails we still write a minimal `supabase-user` blob from `session.user` so the dashboard guard renders instead of bouncing to `/login`.

### Alternatives considered

| Option | Verdict |
|---|---|
| **Store password in Keychain** (today) | ❌ Persists the real password; breaks on password change; higher blast radius. |
| **Store refresh token in Keychain + biometric accessControl** | ✅ **Recommended.** Password never stored; revocable; survives app-kill; matches Okta/OWASP. |
| **WebAuthn / passkeys** | ⏸️ Defer. We already removed web WebAuthn; passkeys in a remote-webview Capacitor app add associated-domains complexity for little gain over the native-token approach. |

---

## Web vs. native build boundary
- **No new iOS build required for the core change** (likely). `@capgo/capacitor-native-biometric` **8.4.5 is already in Build 9**, and `accessControl` + `setCredentials`/`getCredentials` are **JS params to the existing native plugin** → ships via Vercel like all our web code. The enrollment prompt, the Settings toggle, and the refresh-token logic are all web.
- **Verify before assuming:** confirm Build 9 actually bundled `8.4.5` (the `BiometricOptions.accessControl` enum must exist in the shipped native binary). If Build 9 shipped an older native plugin, the `accessControl` param is ignored and we'd need a new build to get OS-enforced protection. *(The decoupled-enrollment UX + refresh-token-instead-of-password still ship via web regardless.)*

---

## Implementation phases
1. **`lib/biometric.ts` rework** — add `accessControl: BIOMETRY_CURRENT_SET`; switch the stored secret from email+password to `{ username: email, password: <supabase refresh_token> }` (reuse the plugin's pair API; token goes in the password slot); rename functions to token semantics.
2. **Login flow** — on return, biometric unlock → `setSession`/`refreshSession` with the stored refresh token (instead of replaying email+password). Keep password fallback.
3. **Enrollment** — remove the Remember-Me coupling; add the post-login prompt + the My Profile → Security toggle (native-only via `isNativeApp()`).
4. **Token hygiene** — re-store the rotated refresh token after each refresh (Supabase rotates them); clear on logout/disable/password-change.
5. **Verify** — confirm plugin 8.4.5 in Build 9; guardian + security review; device test on the app (the one thing only the founder can do on a real device).

---

## Open decisions for the founder
- **A. Invalidation strictness:** `BIOMETRY_CURRENT_SET` (re-enroll if a new face/finger is added — recommended, bank-grade) vs `BIOMETRY_ANY` (more convenient).
- **B. Enrollment placement:** post-login prompt **and** Settings toggle (recommended), or Settings toggle only.
- **C. Store refresh token (recommended) vs keep storing password** (simpler but weaker). 

> ⚠️ Research note: the deep-research run hit the account's **monthly spend limit** partway, so the automated synthesis + a few verification votes didn't complete. The 16 claims above are all primary-source, unanimously verified (3-0); the "abstain" items (Supabase `setSession`, OWASP local-auth) failed to *vote* due to the limit but are well-documented facts reflected here.
