# Pontifex Industries — App-Only Changes

This file tracks changes that are **native app (iOS/Android) only** — i.e., changes to Capacitor config,
Xcode project, app icons, splash screens, native plugins, build settings, or app store metadata.

Web/API changes that are shared between the app and website go in the main codebase normally.

---

## Separation Policy

| Change Type | Where it lives | Deployed via |
|---|---|---|
| UI pages, API routes, business logic | Next.js codebase (shared) | Vercel (web) + Capacitor webview (app) |
| App icon, splash screen | `ios/App/App/Assets.xcassets/` | Xcode build → simulator/TestFlight |
| Native plugins (NFC, GPS, camera) | `capacitor.config.ts` + `ios/` | Xcode build |
| App Store metadata (screenshots, description) | `APP_CHANGES.md` → manual upload | App Store Connect |
| Push notification certificates | Apple Developer Portal | Xcode / Supabase push config |

### Changes Adopted from App → Website
If a native app change should also be reflected on the web (e.g., a new logo we want on the website too),
add it to the section **"Website Changes to Adopt"** at the bottom of this file.

---

## App Change Log

### 2026-05-21 — App Icon Update
**Status:** ✅ Built & installed on iPhone 17 Pro simulator

**What changed:**
- `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` — updated to Pontifex bridge logo
- Flattened alpha channel: composited bridge logo over solid `#1e1b4b` (deep purple) background
- iOS requires **no alpha channel** on app icons — transparent PNGs show as a gray default

**How to rebuild after this change:**
```bash
cd ios/App
xcodebuild \
  -project App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=CA1B2D65-5DC0-4C85-A072-3C0BFBE85402' \
  -derivedDataPath /tmp/pontifex-ios-build \
  build

xcrun simctl uninstall CA1B2D65-5DC0-4C85-A072-3C0BFBE85402 com.pontifexindustries.app
xcrun simctl install CA1B2D65-5DC0-4C85-A072-3C0BFBE85402 /tmp/pontifex-ios-build/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch CA1B2D65-5DC0-4C85-A072-3C0BFBE85402 com.pontifexindustries.app
```

**Source:** `/Users/afa55/Downloads/new pontifex-logo.svg` → `public/icon-1024.png` → flattened to opaque PNG

---

## Pending App Tasks

### Phase 3 — App Store Prep (next)
- [ ] **Splash screen** — 2732×2732px opaque PNG with bridge logo centered on `#1e1b4b`
  - File: `ios/App/App/Assets.xcassets/Splash.imageset/`
- [ ] **Launch screen storyboard** — verify `LaunchScreen.storyboard` uses asset, not hardcoded color
- [ ] **App name** — confirm `CFBundleDisplayName` = "Pontifex Industries" in `Info.plist`
- [ ] **Bundle ID** — currently `com.pontifexindustries.app` ✅
- [ ] **Version** — set to `1.0.0` for App Store submission

### Phase 4 — Apple Developer Program
- [ ] Enroll at https://developer.apple.com/programs/ ($99/yr)
- [ ] Create App ID: `com.pontifexindustries.app`
- [ ] Create provisioning profile (Distribution → App Store)
- [ ] Configure in Xcode → Signing & Capabilities

### Phase 5 — App Store Submission Checklist
- [ ] Privacy Policy URL: `https://www.pontifexindustries.com/privacy-policy` (page needs to be built)
- [ ] Terms of Service URL: `https://www.pontifexindustries.com/terms`
- [ ] App Store screenshots (iPhone 6.7" required, 6.5" recommended)
- [ ] App description (copy from landing page value props)
- [ ] Age rating: 4+ (no objectionable content)
- [ ] Export compliance: uses HTTPS only (standard encryption exemption)

### Native Features (Planned)
- [ ] **NFC scanning** — `@capacitor-community/nfc` plugin for equipment tagging
- [ ] **Push notifications** — `@capacitor/push-notifications` + Supabase realtime bridge
- [ ] **Background location** — GPS clock-in verification (needs Apple entitlement justification)
- [ ] **Biometric auth** — Face ID / Touch ID for clock-in shortcut

---

## Website Changes to Adopt
*(App changes that should also be reflected on the website)*

| Date | Change | Status |
|---|---|---|
| — | — | — |

---

## App Build Reference

**Simulator device:** iPhone 17 Pro (`CA1B2D65-5DC0-4C85-A072-3C0BFBE85402`) — Booted

**Capacitor config:** `capacitor.config.ts`
- Server URL: `https://www.pontifexindustries.com` (live server mode — app loads production website)
- No local bundling; all UI updates are instant via the web deployment

**Key files:**
```
ios/
  App/
    App.xcodeproj/              ← Xcode project
    App/
      Assets.xcassets/
        AppIcon.appiconset/     ← App icons (1024×1024 source → Xcode generates all sizes)
        Splash.imageset/        ← Splash screen
      Info.plist                ← Bundle ID, display name, permissions
      AppDelegate.swift         ← Capacitor bridge init
capacitor.config.ts             ← App ID, server URL, plugin config
```
