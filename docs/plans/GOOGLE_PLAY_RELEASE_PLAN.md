# Google Play Store Release Plan — Pontifex Industries (Android)

**Created:** Jun 14, 2026
**App ID:** `com.pontifexindustries.app` · **First release:** versionCode 1 / versionName 1.0.0
**Model:** Capacitor remote-URL webview (loads `https://www.pontifexindustries.com/login`) — exactly like iOS. **Web/UI/API changes ship via Vercel with NO Play resubmission.** Only native changes (icons, plugins, manifest, version bump) need a new `.aab`.

---

## ✅ Done this session (code/config — committed, no Vercel cost)
- **Release signing wired** — `android/app/build.gradle` reads `android/keystore.properties` (gitignored). Without it, debug still builds; with it, `bundleRelease` is signed.
- **Secrets protected** — `android/.gitignore` now ignores `*.jks`, `*.keystore`, `keystore.properties`. Template committed at `android/keystore.properties.template`.
- **Branded icons + splash generated** — adaptive icon (bridge-P, 60% safe-zone padding, white bg / navy dark bg) + legacy mipmaps + light/dark splash, from `public/icon-1024.png` via `@capacitor/assets`. Was the default Capacitor icon.
- **Version** → `1.0.0` (code 1).
- **Verified already-good:** targetSdk **36** (Play requires ≥35), permissions (location, camera, push, media, vibrate, NFC optional), `google-services:4.4.4` classpath present, all 11 plugins sync for Android (incl. push + biometric).

## ✅ Done this session (part 2 — Firebase + push backend)
- **Firebase Android app registered** — project `pontifex-ind-1dc89`, app `com.pontifexindustries.app` (a placeholder `com.mycompany.pontifexind` app also exists in the project — harmless, delete later). `google-services.json` is in `android/app/` (gitignored — public repo — but present for local builds). Spark/free plan; FCM is free.
- **FCM HTTP v1 sender written** — `lib/send-push.ts` rewritten from the dead legacy `fcm/send` API to **HTTP v1** (`/v1/projects/<id>/messages:send`) with an OAuth2 access token minted from the service account (RS256 JWT via `node:crypto`, no new deps; token cached). iOS APNs untouched. tsc clean. **Activates once `FIREBASE_SERVICE_ACCOUNT_JSON` is set (founder step B2).**

## 🔧 Claude can do next (code — just say go)
1. **Build the signed `.aab`** once the keystore exists (`cd android && ./gradlew bundleRelease`) — needs Android SDK locally, or do it in CI.
2. **Store listing copy + graphics** (512 icon, 1024×500 feature graphic) and the **App access** demo-login section.

## 🔑 Founder-only steps (accounts, secrets, store listing — I can't do these)

**A. Google Play Developer account** — one-time **$25**. https://play.google.com/console → register (use the business identity; Play now requires D-U-N-S / org verification for company accounts, allow a few days).

**B. Firebase project (for Android push)** — project `pontifex-ind-1dc89`.
   - ✅ B1: Android app registered + `google-services.json` placed in `android/app/`. (Done.)
   - ⬜ **B2 (the one push blocker left):** Firebase Console → ⚙️ Project settings → **Service accounts** → **Generate new private key** → a JSON downloads. In **Vercel → Project → Settings → Environment Variables**, add `FIREBASE_SERVICE_ACCOUNT_JSON` = the entire JSON file's contents (Production scope). **This is a secret — store it safely; never commit it.** The v1 sender activates the moment this is set.

**C. Upload keystore** — run ONCE from repo root, then back it up (1Password):
   ```
   keytool -genkey -v -keystore android/app/pontifex-upload-key.jks \
     -keyalg RSA -keysize 2048 -validity 10000 -alias pontifex-upload
   ```
   Then `cp android/keystore.properties.template android/keystore.properties` and fill in the 4 values. (With Play App Signing the upload key is recoverable, but don't rely on it.)

**D. Play Console store listing** (in the console):
   - App name, short (80 char) + full (4000) description, app category (Business), contact email.
   - **Privacy policy URL:** `https://www.pontifexindustries.com/privacy-policy` (already live).
   - **Graphics:** app icon 512×512, **feature graphic 1024×500**, ≥2 phone screenshots (+ 7"/10" tablet recommended). I can generate the icon/feature-graphic from the brand assets — ask.
   - **Content rating** questionnaire, **Data safety** form (declare: location, camera/photos, push token; for clock-in/jobs), **Target audience** (not for children).
   - **App access:** the whole app is behind login — Google WILL reject without working credentials. Paste-ready instructions in the "App access (reviewer login)" section below. ✅ prepared.

**E. Upload + roll out** — create an **Internal testing** track first (instant, test on your own device), then Production. Upload the `.aab` from step 2.

## 📋 App access (reviewer login) — paste into Play Console
Play Console → **App content → App access** → choose **"All or some functionality is restricted"** → add an instruction with this (verified live Jun 15, 2026 — admin@pontifex.com is active, tenant Patriot, code PATRIOT):

```
The entire app requires login. Use this demo account to access all functionality:

  Company code: PATRIOT
  Email:        admin@pontifex.com
  Password:     PontifexDemo2026!

Steps: launch the app → on the login screen enter the Company code (PATRIOT),
then the email and password above → sign in. This is an admin demo account with
full access to scheduling, jobs, crews, timecards, and invoicing.

Field-worker (operator) demo, if needed:
  Company code: PATRIOT
  Email:        zack@demopontifex.com
  Password:     Patriot2026!
```

## 🎨 Store graphics — generated (`assets/play/`)
- `icon-512.png` (512×512 high-res icon) and `feature-graphic-1024x500.png` (dark brand banner + P tile + wordmark). Built by `scripts/build-play-graphics.mjs`. Still need **≥2 phone screenshots** (capture from the running app/emulator once the AAB installs). Full store description copy available on request.

## ⚠️ Risk to know
Play policy **4.2 (minimum functionality / "webpage repackaged as an app")** can flag thin webview wrappers. We should pass — the app adds real native value (push, GPS clock-in, camera, biometric, NFC) — but the listing should emphasize those native features, and the demo login (App access) must work for reviewers.

## Order of operations
A (Play acct, in background) ∥ B (Firebase) + C (keystore) → I wire FCM v1 + you drop `google-services.json` → build `.aab` (step 2) → Internal testing track → D (listing) → Production.
