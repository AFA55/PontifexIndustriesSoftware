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

### 2026-06-01 — Build 6 / v1.0.1: new purple "P" icon + splash fade → ✅ SUBMITTED TO APP REVIEW
**Status:** ✅ **SUBMITTED — "1.0.1 Waiting for Review"** (Jun 1, 8:49 PM). Commits `11ccb96a` + `43ccb13c` (native-only, not pushed).
**Version/Build:** `MARKETING_VERSION` 1.0.0 → **1.0.1**, `CURRENT_PROJECT_VERSION` 5 → **6**
**Context:** Apple approved the app, then this build (new brand "P" icon + no-flash launch fade) was
archived, delivered via Transporter, and submitted via App Store Connect — fully automated (Xcode CLI +
Transporter via osascript/cliclick + Claude-in-Chrome). New icon confirmed in ASC "Included Assets".

> ⚠️ **Had to bump to 1.0.1.** First delivery as 1.0.0 hit `409 Invalid Pre-Release Train — '1.0.0' is
> closed for new build submissions` because 1.0.0 was already Ready for Sale. Apple locks a released
> version against new builds → every future App Store change needs a new version number.

**What changed:**
- **App icon** (`AppIcon-512@2x.png`) — re-rendered from the single-stroke bridge-P:
  dark `#120A24` tile + brightened purple→pink→rose gradient stroke (`#8B5CF6 → #EC4899 → #F43F5E`).
  **1024×1024, opaque (`hasAlpha: false`)** — verified, so no Apple alpha rejection.
- **Splash** — white P centered on brand indigo `#1e1b4b` (`Splash.imageset/`, 2732×2732).
- **No white launch flash** — `LaunchScreen.storyboard` bg changed from `systemBackgroundColor`
  (white) to custom `#1e1b4b`; `capacitor.config.ts` got top-level + `ios` + `android`
  `backgroundColor: '#1e1b4b'` (webview first-paint is dark too).
- **Smooth fade** — `SplashScreen`: `launchShowDuration` 2000 → **1200**, added
  `launchFadeOutDuration: 600`. `launchAutoHide` stays `true` (no hang risk — app loads remote prod).
- `npx cap sync ios` applied → native `ios/App/App/capacitor.config.json` updated.

**Render script:** `assets/logo-concepts/render-native-assets.mjs` (`node` it from repo root to regenerate).

**How to ship (manual — Xcode + Apple login required):**
1. `open ios/App/App.xcworkspace`
2. Device selector → **Any iOS Device (arm64)**
3. **Product → Archive** → Organizer → **Distribute App → App Store Connect → Upload**
4. App Store Connect → version → **+ Build → Build 6 → Save** → **Add for Review / Submit**
5. Sanity check before archiving: launch once and confirm dark `#1e1b4b` → white P → fade → login, **no white flash**.

---

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

### Known Values (confirmed May 25, 2026)
| Field | Value |
|---|---|
| Team ID | `MG4K845UH7` |
| Bundle ID | `com.pontifexindustries.app` |
| Account (iCloud) | `andresa.t55@icloud.com` — ANDRES FERNANDO ALTAMIRANO (Individual, $99/yr paid) |
| App ID | ✅ Created — `com.pontifexindustries.app` (Push + NFC enabled) |
| APNs Key ID | `M44JJFDG6G` (Sandbox & Production) ✅ |
| Distribution Cert | ✅ Created — "Apple Distribution: ANDRES FERNANDO ALTAMIR..." (5/24/26, in Keychain) |
| Provisioning Profile | ✅ Created — "Pontifex App Store Distribution" (installed in Xcode) |
| Exported IPA | ✅ `~/Desktop/PontifexExport/App.ipa` (1.7 MB, correctly signed) |

### Step 1 — Apple Developer Portal (do once, all 4 items from scratch)

**A. Create App ID**
1. https://developer.apple.com/account/resources/identifiers/list → **"+"**
2. Select **App IDs** → **App** → Continue
3. Fill in:
   - Description: `Pontifex Industries`
   - Bundle ID: **Explicit** → `com.pontifexindustries.app`
4. Scroll down, check these capabilities:
   - ✅ **Push Notifications**
   - ✅ **NFC Tag Reading**
5. Continue → Register

**B. Create Apple Distribution Certificate**
1. Open **Keychain Access** on your Mac → Menu: Certificate Assistant → **Request a Certificate From a Certificate Authority**
   - Email: your Apple ID email
   - Select: **Saved to disk** → Save the `.certSigningRequest` file to Desktop
2. Back in portal: https://developer.apple.com/account/resources/certificates/list → **"+"**
3. Select **Apple Distribution** → Continue
4. Upload the `.certSigningRequest` file → Continue → Download the `.cer` file
5. Double-click the `.cer` file → installs into Keychain Access automatically

**C. Create APNs Key**
1. https://developer.apple.com/account/resources/authkeys/list → **"+"**
2. Name: `Pontifex APNs`
3. Check: ✅ **Apple Push Notifications service (APNs)**
4. Continue → Register
5. **Download the `.p8` file** — ⚠️ YOU CAN ONLY DOWNLOAD ONCE — save it somewhere safe
6. Note the **Key ID** shown on screen (looks like `ABC123DEF4`)

**D. Create Provisioning Profile**
1. https://developer.apple.com/account/resources/profiles/list → **"+"**
2. Select **App Store Connect** (under Distribution) → Continue
3. App ID: select `com.pontifexindustries.app` → Continue
4. Certificate: select the Distribution cert you just created → Continue
5. Profile Name: `Pontifex App Store Distribution` → Generate → Download the `.mobileprovision` file
6. Double-click the `.mobileprovision` file to install it

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
APNS_KEY_ID       = M44JJFDG6G
APNS_TEAM_ID      = MG4K845UH7
APNS_BUNDLE_ID    = com.pontifexindustries.app
APNS_PRIVATE_KEY  = (full contents of the .p8 file, including -----BEGIN PRIVATE KEY----- lines)
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

### 🚨 CURRENT BLOCKER — Xcode Team Dropdown Bug
Xcode's Team dropdown shows only "Andres Altamirano (Personal Team)" even though:
- The paid account `andresa.t55@icloud.com` IS logged into Xcode Accounts
- Team ID MG4K845UH7 IS the paid account ($99/yr, Individual)
- Both Apple Developer agreements are accepted (May 23, 2026)
- The Distribution cert and Provisioning Profile are both created and installed

**Root cause:** Xcode cached the account as "not enrolled" before the $99 payment was processed.
**Fix to try next session:** Xcode → Settings → Accounts → remove `andresa.t55@icloud.com` → re-add it → Download Manual Profiles → the paid team should then appear in the Team dropdown.

**Bypass already available:** IPA is exported at `~/Desktop/PontifexExport/App.ipa` (signed correctly via CLI). Can be uploaded directly with Transporter (free Mac App Store app) OR via `xcrun altool`.

### 🆕 Claude Agent for Xcode (MCP)
Xcode 26 Intelligence → Agents → **Claude Agent by Anthropic** was downloading at 48% end of session.
- Once it finishes: Xcode → Settings → Intelligence → toggle ON "Allow external agents to use Xcode tools"
- In a new Claude Code session, Claude can directly control Xcode via MCP tools — can fix signing, trigger archives, run builds, all without screenshots
- **This will make future iOS work dramatically faster**

### Remaining Before Submission
- [x] **App ID created** — `com.pontifexindustries.app` (Push + NFC) ✅
- [x] **Distribution Certificate** — "Apple Distribution: ANDRES FERNANDO ALTAMIR..." in Keychain ✅
- [x] **APNs Key** — `M44JJFDG6G`, .p8 file downloaded ✅
- [x] **Provisioning Profile** — "Pontifex App Store Distribution" installed ✅
- [x] **Version 1.0.0 + Build 1** — set in Xcode General tab ✅
- [x] **Push Notifications + NFC capabilities** — added in Signing & Capabilities ✅
- [x] **IPA exported** — `~/Desktop/PontifexExport/App.ipa` (1.7MB, signed) ✅
- [x] **project.pbxproj** — `DEVELOPMENT_TEAM = MG4K845UH7` hardcoded ✅
- [ ] **Fix Xcode Team dropdown** — sign out/in with `andresa.t55@icloud.com` OR use Transporter
- [ ] **Add APNs env vars** to Vercel (4 vars: APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_PRIVATE_KEY)
- [ ] **Create App Store Connect listing** — appstoreconnect.apple.com → My Apps → "+" → New App
- [ ] **Take App Store screenshots** on iPhone 15 Pro Max simulator (5 screens, 1290×2796px)
- [ ] **Upload IPA** — via Xcode Distribute App OR Transporter (drag App.ipa → Deliver)
- [ ] **TestFlight internal test** before submitting for review
- [ ] **Submit for review** — App Store Connect → 1.0 Prepare for Submission → Submit

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
