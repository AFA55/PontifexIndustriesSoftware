---
name: ios-release
description: Ship a new Pontifex iOS build to the App Store / TestFlight — version bump, archive with manual signing, export IPA, Transporter upload, App Store Connect submission. Use whenever a NATIVE change ships (icon, splash, plugins, Info.plist, Capacitor config). Web-only changes NEVER need this (the app is a remote webview).
---

# iOS Release Playbook

> **First question: do you even need this?** The iOS app loads `server.url` = production in a
> webview. Web/UI/API changes go live in the app via a normal Vercel deploy — NO App Store
> resubmission. Only NATIVE changes (icon, splash, plugins, entitlements, Info.plist) need a build.

## Facts

| Item | Value |
|---|---|
| Apple ID / ASC login | pontifexindustries@gmail.com (review emails go to iCloud) |
| Transporter login | andresafa55@icloud.com (already signed in) |
| Team ID | MG4K845UH7 · Bundle: com.pontifexindustries.app · App ID: 6772996692 |
| Signing | **MANUAL** — profile "Pontifex App Store Distribution" (do NOT switch to Automatic) |
| Version file | `ios/App/App.xcodeproj/project.pbxproj` |

## Steps

1. **Bump versions** in `project.pbxproj`: `MARKETING_VERSION` (any App Store change needs a NEW
   version number — Apple closes trains once a version is Ready for Sale) and
   `CURRENT_PROJECT_VERSION` (always increment).
2. **Sync web → native**: `npx cap sync ios`
3. **Archive + export** (manual signing):
   ```bash
   cd ios/App
   xcodebuild archive -project App.xcodeproj -scheme App -configuration Release \
     -destination "generic/platform=iOS" -archivePath /tmp/PontifexArchive.xcarchive
   xcodebuild -exportArchive -archivePath /tmp/PontifexArchive.xcarchive \
     -exportOptionsPlist /tmp/ExportOptions.plist -exportPath /tmp/PontifexExport
   ```
   `ExportOptions.plist`: method `app-store-connect`, manual signing, profile "Pontifex App Store Distribution".
4. **Upload via Transporter.app**: drive with `osascript` + `cliclick` (System Events `click at` is
   blocked by assistive access). For the DELIVER button, compute coords from a full-screen
   `screencapture` scaled to screen points — or the founder clicks it. Transporter's list thumbnail
   shows a CACHED old icon — ignore it.
5. **App Store Connect** (Claude-in-Chrome; founder logs in, Claude drives): create the new version
   → attach the processed build → What's New → **Add for Review → Submit**.
6. **Screenshots** (if changed): must be **6.9″ (1320×2868)** in the **iPhone 6.9″ Display** slot —
   smaller slots inherit; the 6.5″ slot REJECTS 6.9″ files. ASC's file_upload only takes
   session-attached files → drive the native Choose File picker (`osascript`: Cmd+Shift+G → paste a
   folder containing ONLY the shots → Cmd+A → Open) with Chrome frontmost.
7. **Log it** in `APP_CHANGES.md` + BACKLOG.md.

## Gotchas learned the hard way

- License Agreement sometimes needs re-accepting in ASC before uploads process (founder).
- Check the rejection email (iCloud inbox) BEFORE rebuilding — there may be multiple reasons.
- Screenshots must not leak real customer data (we got caught with "Harper General CONTRACTORS").
- Status checks: Claude-in-Chrome → ASC (Transporter shows delivery, not review status).
