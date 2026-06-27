---
name: android-release
description: Ship a new Pontifex Android build to Google Play — version bump, cap sync, signed AAB build, upload via the Android Publisher API (scripts/play-upload.mjs), and Play Console submission. Use whenever a NATIVE change ships (icon, splash, plugins, Capacitor config, permissions, target SDK). Web-only changes NEVER need this (the app is a remote webview). Also use to analyze Play Console release/review status.
---

# Android (Google Play) Release Playbook

> **First question: do you even need a new build?** The Android app loads `server.url` =
> production in a WebView (Capacitor remote-URL, same as iOS). Web/UI/API changes go live in the
> app via a normal Vercel deploy — **NO Play resubmission**. Only NATIVE changes (icon, splash,
> plugins, permissions, `AndroidManifest`, target SDK, Capacitor config) need a new AAB.

## Facts (verified Jun 27, 2026)
- **Developer account: `PontifexIndustriesLLC` — ORGANIZATION account** (Account ID `6154125269780562477`). Android developer verification is **complete** ("All of your apps have been successfully registered").
- **Org accounts are EXEMPT from the new-personal-account closed-testing mandate** (12 testers × 14 days before production). That requirement only applies to *personal* accounts created after ~Nov 2023. **We can publish straight to Production after review.** The dashboard's "Set up your closed test track (X of 5)" card is an **optional** guided checklist — ignore it; it is NOT a gate.
- **Package:** `com.pontifexindustries.platform` · **App ID (console):** `4973761380467352338`.
- **Current store state:** Production **Release 2 (1.0.1) IN REVIEW** (Submission 4, submitted Jun 22, 2026), 1 country/region (United States), Managed publishing = **OFF** → auto-publishes the moment Google approves. First review of a brand-new app can take up to ~7 days.
- **Version source of truth:** `android/app/build.gradle` → `versionCode` (integer, must increment every upload) + `versionName` (e.g. `"1.0.1"`). Currently `versionCode 2` / `versionName "1.0.1"`.
- **Signing:** `android/keystore.properties` (upload keystore) is already configured; `gradlew bundleRelease` signs automatically. Do NOT commit the keystore or its passwords.
- **Upload tooling:** `scripts/play-upload.mjs` — a zero-dependency Android Publisher API uploader (mints an OAuth2 token from a service-account JSON key, then runs insert → upload bundle → set track → commit). **No more manual file-picking in the console.** Needs a service-account key with release rights (Play Console → Users and permissions).
- **Store graphics/screenshots:** `scripts/build-play-graphics.mjs`, `scripts/capture-play-screenshots.mjs`, `scripts/capture-play-tablet.mjs`, `scripts/capture-play-demo.mjs`.
- **Store copy must stay GENERIC** ("construction operations software") — the founder has a non-compete; no employer/niche specifics in public-facing text.

## Release procedure (native change)
1. **Bump version** in `android/app/build.gradle`: `versionCode` +1 (required — Play rejects a duplicate code) and `versionName` if user-facing.
2. **Sync web → native:** `npx cap sync android` (copies the built web + plugins into the Android project).
3. **Build the signed AAB:**
   ```bash
   cd android && ./gradlew bundleRelease
   # → android/app/build/outputs/bundle/release/app-release.aab
   ```
4. **Upload + roll out** via the API uploader (preferred over manual upload):
   ```bash
   node scripts/play-upload.mjs \
     --key /path/to/service-account.json \
     --aab android/app/build/outputs/bundle/release/app-release.aab \
     --track production \
     --notes "What changed (generic, non-compete safe)." \
     --status completed --rollout 1
   ```
   (`--track internal` for a quick internal-testing sanity check first; `--status inProgress --rollout 0.2` for a staged rollout.)
5. **Finish in the console** if first-time declarations changed (see checklist). Then it enters **review**; with managed publishing off it auto-publishes on approval.
6. **Log it** in `APP_CHANGES.md` (native-only change log).

## Play Console submission checklist (all must be green to enter review)
Required once per app, then only when they change. Submission 4 already covers these — verify they stay complete:
- **App content / declarations:** Content rating questionnaire · Target audience & content · Privacy policy URL (`https://www.pontifexindustries.com/privacy-policy`) · Ads declaration · **Data safety** form · Government-app / financial-features / health declarations as applicable.
- **Store listing (en-US):** app name (Pontifex Industries), short + full description (GENERIC copy), icon, feature graphic, phone + tablet screenshots.
- **Production track:** the AAB, release notes, target **countries/regions** (currently US only — expand under Production → Countries/regions if needed), target SDK level meets Google's current floor.

## What blocks vs. what doesn't
- **BLOCKS review/publish:** a missing required declaration, no AAB on the track, a duplicate `versionCode`, an unsigned/ debuggable build, target SDK below Google's floor, a "we found problems with your release" error panel.
- **Does NOT block (safe to ignore for launch):**
  - The **closed-testing checklist / "Create closed testing release"** flow — org-exempt. If you opened a closed-test draft and it errors with *"doesn't add or remove any app bundles" / "doesn't allow existing users to upgrade"*, that's because there's no NEW AAB to put on that track (the bundle is on Production). **Discard the draft** — don't fix it.
  - **"1 action recommended: deprecated APIs/parameters for edge-to-edge"** — an Android 15 edge-to-edge advisory from the Capacitor shell. Recommended, not required; address in a future native build (set `enableEdgeToEdge`/window insets), not a launch blocker.

## Analyzing review status (no build needed)
Use Chrome (claude-in-chrome) on the logged-in console; the API uploader can't read review state. Key pages:
- **Dashboard** (`/app/<id>/app-dashboard`) — Update status + Production summary + the optional guided cards.
- **Publishing overview** (`/app/<id>/publishing`) — "Changes in review" vs "action required"; Managed publishing toggle; Submission activity.
- **Production** (`/app/<id>/tracks/production`) — "Track summary: … Release N in review", recommended actions, countries.
- **Submission activity** (`/app/<id>/publishing/submission-activity/<n>/details`) — the full list of changes in a submission + its review status.
- Read-only analysis is fine; **never click Discard / Save / Send for review / Start rollout without founder confirmation** (irreversible, outward-facing).

## Founder-only steps (cannot be automated)
- Creating the service-account key + granting it release rights in Play Console.
- Any Google identity/payments/agreement prompts.
- Final "Send for review" / "Start rollout" clicks if you want a human gate (otherwise the API uploader commits).
