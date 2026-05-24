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

## 🚨 App Store Submission — Step-by-Step (Apple Developer APPROVED ✅)

### What's Already Done
- [x] App icon — opaque 1024×1024, no alpha channel ✅
- [x] Splash images — `Splash.imageset/` has 2732×2732 PNGs ✅  
- [x] `CFBundleDisplayName` = "Pontifex Industries" ✅
- [x] Bundle ID: `com.pontifexindustries.app` ✅
- [x] All privacy usage strings in Info.plist (Location, Camera, Mic, NFC, Photos) ✅
- [x] `ITSAppUsesNonExemptEncryption = false` added (HTTPS-only, no EAR issues) ✅
- [x] `UIRequiredDeviceCapabilities` changed from `armv7` → `arm64` (armv7 causes upload rejection in Xcode 12+) ✅
- [x] `App.entitlements` created with `aps-environment = production` for push notifications ✅
- [x] Privacy Policy at `/privacy`, Terms at `/terms` ✅

### Step 1 — Apple Developer Portal (do once)
1. Go to https://developer.apple.com/account/resources/identifiers/list
2. **Identifiers → "+" → App IDs → App** 
   - Description: "Pontifex Industries"
   - Bundle ID (Explicit): `com.pontifexindustries.app`
   - Capabilities: check **Push Notifications** + **NFC Tag Reading** + **Associated Domains** (for future universal links)
   - Save

3. **Certificates → "+" → Apple Distribution** 
   - Follow the CSR instructions in Keychain Access
   - Download + double-click to install the .cer file

4. **Profiles → "+" → App Store Connect**
   - Select the `com.pontifexindustries.app` App ID
   - Select your Distribution Certificate
   - Name: "Pontifex App Store Distribution"
   - Download the .mobileprovision file

5. **Keys → "+" → APNs key** (for push notifications)
   - Name: "Pontifex APNs"
   - Check "Apple Push Notifications service (APNs)"
   - Download the `.p8` file — **SAVE IT, you can only download once**
   - Note the **Key ID** shown on the page
   - Find your **Team ID** at: https://developer.apple.com/account → Membership → Team ID

### Step 2 — Xcode (one-time setup before archive)
1. Open `ios/App/App.xcodeproj` in Xcode
2. Select "App" target → **General** tab:
   - Version: `1.0.0`
   - Build: `1`
3. **Signing & Capabilities** tab:
   - Team: select "Andres Altamirano" (or your org)
   - Bundle Identifier: `com.pontifexindustries.app`
   - Uncheck "Automatically manage signing"
   - Provisioning Profile: select "Pontifex App Store Distribution"
4. **Add capabilities** (click "+" in Signing & Capabilities):
   - Push Notifications ← Xcode will wire `App.entitlements` automatically
   - NFC Tag Reading ← already in Info.plist, add capability to match

### Step 3 — Add APNs vars to Vercel (activates native push)
In Vercel Dashboard → your project → Settings → Environment Variables, add:
```
APNS_KEY_ID       = (Key ID from Step 1-5)
APNS_TEAM_ID      = (Team ID from Step 1-5)
APNS_BUNDLE_ID    = com.pontifexindustries.app
APNS_PRIVATE_KEY  = (full contents of the .p8 file, newlines preserved)
```
Code is already built in `lib/send-push.ts` — these 4 vars are all it needs.

### Step 4 — App Store Connect (create the listing)
1. Go to https://appstoreconnect.apple.com → My Apps → "+"
2. **New App**:
   - Platform: iOS
   - Name: `Pontifex Industries`
   - Primary language: English (U.S.)
   - Bundle ID: `com.pontifexindustries.app`
   - SKU: `pontifexindustries001`
3. Fill in App Information:
   - Category: **Business**
   - Secondary: Productivity
   - Privacy Policy URL: `https://www.pontifexindustries.com/privacy`
4. **Version Information** (1.0 Prepare for Submission):
   - Screenshots: minimum 3 for iPhone 6.7" (1290×2796px). Take on iPhone 15 Pro Max simulator:
     ```bash
     # In Xcode Simulator → File → Take Screenshot
     # Or: xcrun simctl io <DEVICE_ID> screenshot screen.png
     ```
     Suggested screens to capture: Login, Schedule Board, Job Detail, My Jobs (operator), Admin Dashboard
   - Description (use this):
     ```
     Pontifex Industries is the complete field operations platform for concrete cutting and construction teams.
     
     Operators clock in from the job site with GPS verification, receive dispatched tickets, log work performed, capture job photos, and submit digital signatures — all from their phone.
     
     Managers schedule jobs, track crews in real-time, manage equipment inventory, approve timecards, and generate invoices.
     
     Key features:
     • GPS-verified clock-in/out with NFC badge support
     • Digital job tickets and dispatch
     • Real-time crew tracking
     • Equipment checkout with voice recognition
     • Timecard management and payroll export
     • Invoice generation and customer signatures
     • Multi-tenant: works for any concrete cutting or construction company
     ```
   - Keywords: `concrete cutting,construction,field operations,crew management,timecard,job scheduling,equipment tracking`
   - Age Rating: **4+**
   - Copyright: `2026 Pontifex Industries`

### Step 5 — Archive & Upload (Xcode)
```
Xcode menu → Product → Archive
After archive: Window → Organizer → Distribute App → App Store Connect
→ Upload → accept defaults → Done
```
The build will appear in App Store Connect → TestFlight within ~30 minutes.

### Step 6 — TestFlight (test before submitting)
1. In App Store Connect → TestFlight → select the build
2. Add yourself as internal tester
3. Install TestFlight on your iPhone → install the build
4. Test: login, clock-in, schedule board, my jobs, camera, NFC
5. If all good → go to App Store Connect → 1.0 Prepare for Submission → "Submit for Review"

### Step 7 — Review Timeline
- Apple typically reviews in **24-48 hours** for straightforward B2B apps
- First submission may take longer (1-3 days)
- Common rejections to avoid:
  - ✅ All permission strings are already in Info.plist
  - ✅ Privacy policy URL is live
  - ✅ ITSAppUsesNonExemptEncryption is set
  - ⚠️ Make sure screenshots look polished — use the iPhone 15 Pro Max simulator

---

## Pending App Tasks

### Remaining Before Submission
- [ ] **Set Version 1.0.0 + Build 1** in Xcode → Target → General
- [ ] **Add Push Notifications + NFC capabilities** in Xcode → Signing & Capabilities
- [ ] **Add APNs env vars** to Vercel (4 vars from Step 3 above)
- [ ] **Take App Store screenshots** on iPhone 15 Pro Max simulator (5 screens)
- [ ] **Archive + upload** via Xcode → Product → Archive
- [ ] **TestFlight internal test** before submitting for review

### Native Features (Planned — post-launch)
- [ ] **NFC scanning** — `@capacitor-community/nfc` plugin for equipment tagging
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
