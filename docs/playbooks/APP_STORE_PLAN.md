# Pontifex Industries — App Store Publication Plan
**Created:** May 20, 2026  
**Goal:** Ship iOS (App Store) + Android (Google Play) apps wrapping the existing Next.js platform using Capacitor  
**Approach:** Zero rewrite — Capacitor bundles the web app into a native shell with native plugins  

---

## Technology Choice: Capacitor

We use **Capacitor** (by Ionic) over React Native because:
- Our app is already built in Next.js — zero code rewrite
- Capacitor wraps any web app in a native shell
- Full access to native APIs: camera, geolocation, NFC, push notifications, haptics, biometrics
- Ships to App Store + Google Play from the same codebase
- Maintained by Ionic with a massive ecosystem of plugins

---

## Phase 1 — Environment Setup (30–60 min)

### 1.1 Install Capacitor

```bash
cd pontifex-platform
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios @capacitor/android
npx cap init "Pontifex Industries" "com.pontifexindustries.app" --web-dir=out
```

### 1.2 Update `next.config.ts` for static export

Capacitor needs a static build. Add to `next.config.ts`:

```typescript
const nextConfig = {
  output: 'export',       // ← add this
  trailingSlash: true,    // ← add this
  images: { unoptimized: true }, // ← required for static export
};
```

> **IMPORTANT:** Static export means no server-side rendering. All `getServerSideProps`, Server Components, and API routes run on the backend (Vercel). The app shell communicates with them via fetch. This is already how our operator pages work, so it should be fine.

### 1.3 Build and test static export

```bash
npm run build      # generates /out directory
npx cap add ios
npx cap add android
npx cap sync       # copies /out into native projects
```

### 1.4 Native plugins to install

```bash
npm install @capacitor/camera
npm install @capacitor/geolocation
npm install @capacitor/haptics
npm install @capacitor/push-notifications
npm install @capacitor/app
npm install @capacitor/status-bar
npm install @capacitor/splash-screen
npm install @capacitor/keyboard
npm install @capacitor/network        # detect offline state
npm install @capacitor/local-notifications
```

For NFC (used in timecard clock-in):
```bash
npm install capacitor-nfc
```

---

## Phase 2 — Native Configuration (1–2 hours)

### 2.1 `capacitor.config.ts`

Create at project root:

```typescript
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pontifexindustries.app',
  appName: 'Pontifex Industries',
  webDir: 'out',
  server: {
    // Point to prod URL for live reload during dev; remove for production build
    // url: 'https://www.pontifexindustries.com',
    // cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1e1b4b',   // indigo-950 (matches our dark theme)
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1e1b4b',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Geolocation: {
      // iOS requires NSLocationWhenInUseUsageDescription in Info.plist
    },
  },
};

export default config;
```

### 2.2 iOS Configuration (requires Mac + Xcode)

Open iOS project:
```bash
npx cap open ios
```

In Xcode, configure:
- **Bundle ID:** `com.pontifexindustries.app`
- **Team:** Select your Apple Developer account
- **Info.plist** — add these usage strings:
  ```
  NSLocationWhenInUseUsageDescription → "Pontifex uses your location to verify job site clock-ins."
  NSCameraUsageDescription → "Pontifex uses the camera to capture job site photos and document work."
  NSMicrophoneUsageDescription → "Pontifex uses the microphone for voice-based equipment checkout."
  NFCReaderUsageDescription → "Pontifex uses NFC to scan employee badges for time tracking."
  ```
- **App Icons:** Replace `Assets.xcassets/AppIcon.appiconset/` — need icons at all sizes (1024×1024 source)
- **Launch Screen:** Update storyboard with Pontifex branding

### 2.3 Android Configuration (requires Android Studio)

Open Android project:
```bash
npx cap open android
```

In `android/app/src/main/AndroidManifest.xml`, verify permissions:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.NFC" />
<uses-permission android:name="android.permission.VIBRATE" />
```

In `android/app/build.gradle`:
- Set `applicationId "com.pontifexindustries.app"`
- Set `versionCode` and `versionName`

App icons: Replace in `android/app/src/main/res/` (mipmap-* folders)

---

## Phase 3 — App Assets (2–4 hours)

### 3.1 App Icon

Create a 1024×1024 PNG icon. Can use Canva or Figma.
- Primary color: `#4f46e5` (indigo-600) or match Patriot brand
- Use the "P" logomark or concrete saw icon
- Must have **no transparency** for iOS

Generate all sizes:
```bash
npx @capacitor/assets generate --iconBackgroundColor '#4f46e5' --iconBackgroundColorDark '#1e1b4b' --splashBackgroundColor '#1e1b4b'
```
> Requires placing `icon.png` (1024×1024) and `splash.png` (2732×2732) in `assets/` folder

### 3.2 Splash Screen

Dark background (`#1e1b4b`) with centered Pontifex logo. 2732×2732 PNG.

### 3.3 App Store Screenshots

**iOS** (required sizes):
- iPhone 6.7" (1290×2796) — iPhone 15 Pro Max
- iPhone 6.5" (1242×2688) — iPhone 11 Pro Max
- iPad 12.9" (2048×2732) — if supporting iPad

**Android** (required):
- Phone screenshots (minimum 2, maximum 8): any 16:9 or 9:16 resolution

Screens to capture:
1. Login screen with Patriot branding
2. Operator dashboard (jobs assigned)
3. Job in-route / arrival confirmation
4. Work performed entry
5. Schedule board (admin)
6. Invoice/billing view

Use the Vercel preview URL or localhost with browser dev tools set to iPhone viewport.

---

## Phase 4 — Store Account Setup

### 4.1 Apple Developer Program

1. Go to https://developer.apple.com/programs/enroll/
2. Cost: **$99/year** (personal or organization)
3. Enrollment: Apple ID → agree to terms → pay
4. Processing: **24–48 hours** for approval
5. After approval: access to App Store Connect at https://appstoreconnect.apple.com

**Required info:**
- Legal entity name (Pontifex Industries or Patriot Concrete Cutting LLC)
- D-U-N-S number (for organization enrollment — free, takes 3–5 business days)
- Or enroll as individual (faster, no D-U-N-S required)

### 4.2 Google Play Console

1. Go to https://play.google.com/console/signup
2. Cost: **$25 one-time**
3. Instant access after payment
4. Requires: Google account + valid payment method

---

## Phase 5 — Legal & Store Listing Requirements

### 5.1 Privacy Policy (REQUIRED by both stores)

Must have a public URL. Create at:
`https://www.pontifexindustries.com/privacy-policy`

Minimum content:
- What data is collected (name, email, location, photos, NFC scans)
- How data is used (job tracking, payroll, invoicing)
- Who data is shared with (not sold; used internally)
- Data retention and deletion rights
- Contact information

### 5.2 Terms of Service

Create at `https://www.pontifexindustries.com/terms`

### 5.3 App Store Listing Copy

**App Name:** Pontifex Industries  
**Subtitle:** Field Operations Platform  
**Category:** Business  
**Age Rating:** 4+  

**Description (for App Store):**
```
Pontifex Industries is the all-in-one field operations platform for concrete cutting and construction crews.

FOR OPERATORS:
• View and accept assigned jobs
• GPS-verified clock-in at job sites
• Capture work performed with photos
• NFC badge scanning for time tracking
• Submit completion reports and collect customer signatures

FOR MANAGERS:
• Real-time schedule board with operator assignments
• Automated invoicing from completed jobs
• Equipment and fleet management
• Timecard approval and payroll export
• Customer portal and digital signatures

Built for the field. Works on phones. No laptop required.
```

**Keywords (iOS, 100 chars max):**
`concrete,construction,field service,job scheduling,timecard,invoicing,crew management`

---

## Phase 6 — Build & Submit

### 6.1 iOS Submission

```bash
# Final sync
npm run build
npx cap sync ios

# In Xcode:
# 1. Product → Archive
# 2. Window → Organizer → Distribute App
# 3. App Store Connect → Upload
```

In App Store Connect:
1. Create new app → enter Bundle ID
2. Fill in metadata (name, description, keywords, screenshots)
3. Set pricing (Free — it's a B2B tool with subscription billing handled separately)
4. Add Privacy Policy URL
5. Submit for review (typically **1–3 business days**)

### 6.2 Android Submission

```bash
# Build release APK/AAB
cd android
./gradlew bundleRelease

# Sign the AAB:
keytool -genkey -v -keystore pontifex-release.keystore -alias pontifex -keyalg RSA -keysize 2048 -validity 10000
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore pontifex-release.keystore app/build/outputs/bundle/release/app-release.aab pontifex
```

In Google Play Console:
1. Create new app → fill details
2. Upload AAB to Internal Testing first
3. Fill in store listing (description, screenshots, category)
4. Content rating questionnaire
5. Add Privacy Policy URL
6. Roll out to Production (typically **2–7 days** for first submission)

---

## Phase 7 — Push Notifications Setup

Push notifications are needed for: job assignments, signature requests, clock-in reminders.

### 7.1 iOS (APNs)

1. In Apple Developer portal: Certificates → Keys → Create new key with Push Notifications enabled
2. Download the `.p8` file — store securely
3. Note: Key ID + Team ID

For sending, we'll use **Supabase Edge Functions** with `web-push` or direct APNs HTTP/2 API.

### 7.2 Android (FCM)

1. Create project at https://console.firebase.google.com
2. Add Android app with package `com.pontifexindustries.app`
3. Download `google-services.json` → place in `android/app/`
4. In `android/build.gradle`: add `classpath 'com.google.gms:google-services:4.3.15'`
5. In `android/app/build.gradle`: add `apply plugin: 'com.google.gms.google-services'`

---

## Phase 8 — Live Update Strategy (Skip App Store Review for Updates)

Use **Capacitor Live Updates** (via Appflow) or implement manually:

### Manual approach (free):
On app launch, check the current deploy hash against a `/api/app-version` endpoint. If a new version is available and it's a web-only change (no native plugin changes), the web layer auto-updates without going through app review.

```typescript
// lib/capacitor-update.ts
import { App } from '@capacitor/app';

export async function checkForUpdate() {
  const info = await App.getInfo();
  const res = await fetch('/api/app-version');
  const { version } = await res.json();
  if (version !== info.build) {
    // Reload the webview to pick up the latest static build
    window.location.reload();
  }
}
```

> This means: once the native shell is in the store, all UI/logic changes deploy instantly via Vercel without needing App Store re-approval. Only native plugin changes require a new store submission.

---

## Current Status Checklist

- [ ] Install Capacitor packages
- [ ] Update `next.config.ts` for static export
- [ ] Test static build locally
- [ ] Add iOS + Android platforms
- [ ] Configure `capacitor.config.ts`
- [ ] Create 1024×1024 app icon
- [ ] Create 2732×2732 splash screen
- [ ] Capture App Store screenshots
- [ ] Create Privacy Policy page at `/privacy-policy`
- [ ] Create Terms of Service page at `/terms`
- [ ] Enroll in Apple Developer Program ($99/yr)
- [ ] Register Google Play Console ($25 one-time)
- [ ] Configure iOS project in Xcode (Bundle ID, signing, permissions)
- [ ] Configure Android project (permissions, signing keystore)
- [ ] Set up APNs key for iOS push notifications
- [ ] Set up Firebase project for Android FCM
- [ ] Build and archive iOS (Xcode → Archive → App Store Connect)
- [ ] Build and sign Android AAB (gradlew bundleRelease)
- [ ] Submit iOS to App Store Review
- [ ] Submit Android to Google Play Internal Testing → Production

---

## Estimated Timeline

| Phase | Task | Time |
|-------|------|------|
| 1 | Install Capacitor + configure next.config | 30 min |
| 2 | Native iOS/Android project config | 1–2 hours |
| 3 | App icons, splash, screenshots | 2–4 hours |
| 4 | Developer account setup | 30 min (+ 24–48hr Apple approval) |
| 5 | Privacy Policy + store listing copy | 1 hour |
| 6 | Build, sign, and upload | 1–2 hours |
| — | Apple review | 1–3 business days |
| — | Google Play first-time review | 2–7 days |

**Total hands-on work:** ~6–10 hours  
**Total calendar time to live:** 2–7 business days (gated by store review)

---

## Important Notes

1. **Static export limitation:** Next.js `output: 'export'` means no Server Components, no server-side API routes in the app shell. All data comes via `fetch` to the Vercel backend. Our existing operator pages already work this way.

2. **HTTPS required:** The native app will call `https://www.pontifexindustries.com`. All our APIs are already HTTPS on Vercel. ✓

3. **Supabase auth in Capacitor:** Supabase JS client works in Capacitor webview. Cookie-based sessions work fine. Deep linking for auth callbacks needs `@capacitor/app` and URL scheme registration (`pontifex://`).

4. **First submission is slowest:** After your first app is approved, updates to the same app typically review in under 24 hours.

5. **TestFlight (iOS):** Before public App Store release, distribute to internal testers via TestFlight. Add tester emails in App Store Connect. No review required for TestFlight.
