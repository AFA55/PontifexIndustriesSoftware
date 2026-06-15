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

## 🔧 Claude can do next (code — just say go)
1. **FCM HTTP v1 sender (REQUIRED for Android push).** `lib/send-push.ts` currently calls the **legacy `fcm.googleapis.com/fcm/send` + `FCM_SERVER_KEY`** API, which **Google shut down June 2024 — it no longer works.** Rewrite to **FCM HTTP v1** (`/v1/projects/<id>/messages:send`) using a Firebase **service-account** JSON → OAuth2 token. iOS APNs path is untouched. *(Needs the founder's Firebase service account — step B below — to actually send, but I can write + ship the code now.)*
2. **Build the signed `.aab`** once the keystore exists (`cd android && ./gradlew bundleRelease`) — needs Android SDK locally, or do it in CI.

## 🔑 Founder-only steps (accounts, secrets, store listing — I can't do these)

**A. Google Play Developer account** — one-time **$25**. https://play.google.com/console → register (use the business identity; Play now requires D-U-N-S / org verification for company accounts, allow a few days).

**B. Firebase project (for Android push)** — https://console.firebase.google.com →
   - Create/ös use a project → **Add Android app**, package `com.pontifexindustries.app`.
   - Download **`google-services.json`** → drop it into **`android/app/`** (native push then works; it's gitignored-safe to keep local, or commit — it's not a secret).
   - Project Settings → Service accounts → **Generate new private key** → send me that JSON (or set it as a Vercel env var) so I can wire the HTTP v1 sender. **This is a secret — store it safely.**

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
   - **App access:** provide Play reviewers a **demo login** (e.g. the demo admin/operator creds) since the whole app is behind auth — Google WILL reject if they can't log in.

**E. Upload + roll out** — create an **Internal testing** track first (instant, test on your own device), then Production. Upload the `.aab` from step 2.

## ⚠️ Risk to know
Play policy **4.2 (minimum functionality / "webpage repackaged as an app")** can flag thin webview wrappers. We should pass — the app adds real native value (push, GPS clock-in, camera, biometric, NFC) — but the listing should emphasize those native features, and the demo login (App access) must work for reviewers.

## Order of operations
A (Play acct, in background) ∥ B (Firebase) + C (keystore) → I wire FCM v1 + you drop `google-services.json` → build `.aab` (step 2) → Internal testing track → D (listing) → Production.
