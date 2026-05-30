# App Store Review Risk Audit
**Date:** 2026-05-30 · **App:** Pontifex Industries (ID 6772996692) · **Build under review:** 1.0 (5)

Proactive audit of everything App Review could flag next, after the **2.3.3 screenshots**
rejection (13" iPad showed only a splash screen). Goal: fix code/config risks now and surface
the App-Store-Connect-side items the developer must verify, so we don't get bounced a third time.

---

## ✅ Code / binary / config — CLEAN (no action needed)

| Area | Guideline | Status |
|---|---|---|
| **Permission usage strings** (`Info.plist`) | 5.1.1 | ✅ All present + descriptive (non-placeholder): Camera, Microphone, Photo Library (read + add), Location WhenInUse + AlwaysAndWhenInUse. Each maps to a real feature (job photos, voice notes, GPS clock-in). |
| **Location string (ITMS-90683)** | — | ✅ Both location keys present (the original rejection cause). |
| **NFC** | 2.1 | ✅ NFC entitlement + usage string removed (iOS uses PIN fallback; Web NFC is Android-only) — no "declared but unused" capability. |
| **Encryption export compliance** | — | ✅ `ITSAppUsesNonExemptEncryption = false` set → no per-submission prompt. |
| **Account deletion** | 5.1.1(v) | ✅ My Profile → Danger Zone → Delete My Account (anonymize + ban; reviewer can test). |
| **In-app purchase / external payment** | 3.1.1 | ✅ All Stripe/billing UI hidden in the native shell via `isNativeApp()`; `/patriot`, `/pricing`, `/offer` show a "manage on web" notice. |
| **Web Speech API in WKWebView** | 2.1 | ✅ Voice mic buttons feature-detect `SpeechRecognition`; render **disabled** with "not supported" tooltip in WKWebView (no broken/dead button for the reviewer). |
| **getUserMedia / camera / photo capture** | 2.1 | ✅ Supported in WKWebView (iOS 14.3+) with the usage strings present. |
| **Privacy policy content** | 5.1.1 | ✅ 1,300-word policy at `/privacy` (and `/privacy-policy` redirects to it) covering location/GPS, camera, photos, microphone/voice, biometric, contact info, retention, deletion, third parties. Matches actual data use. |
| **Terms** | — | ✅ `/terms` + `/terms-of-service` present. |
| **SMS opt-in** (Twilio A2P) | — | ✅ `/sms-opt-in` present. |

---

## ⚠️ App Store Connect side — VERIFY before resubmitting (developer action)

These can't be fixed in code — they live in App Store Connect:

### 1. 🔴 App Privacy "nutrition label" must match the privacy policy
This is the **#1 remaining rejection risk.** Reviewers cross-check the privacy label against the
prompts the app shows (location, camera) and the privacy policy. ASC → **App Privacy** → ensure these
**are declared** (the app genuinely collects them):
- **Location** — Precise, "App Functionality" (GPS clock-in verification). *Not* used for tracking.
- **Photos or Videos** (User Content) — job-site photos.
- **Contact Info** — name, email, phone (profile + SMS alerts).
- **User Content** — job notes, daily reports, voice notes.
- **Identifiers** — user ID / device token (push notifications).
- **Diagnostics / Usage Data** — only if you actually collect analytics (you log errors → "Diagnostics").
If the label currently says "Data Not Collected," that's an automatic mismatch → fix it.

### 2. 🟡 Support URL must resolve to a working page
There is **no `/support` route** in the app. Confirm the **Support URL** in ASC points to a live page
(e.g. `https://www.pontifexindustries.com/` or a contact/request-demo page). A dead Support URL is a
1.5 / metadata rejection. *(Optional: add a lightweight `/support` or `/contact` page.)*

### 3. 🟡 Review notes + demo account
Keep the App Review notes (in `APP_STORE_RESUBMISSION.md`) attached: demo login
`PATRIOT` / `zack@demopontifex.com` / `Patriot2026!`, and a one-line explanation that the app is
**role-based** (the demo is an Operator: clock-in, schedule, timecard, profile) so the reviewer
doesn't think functionality is missing.

---

## 📸 Screenshots — FIXED (pending upload)

The 2.3.3 cause is resolved. Four real-app 13-inch iPad screenshots (exactly **2752×2064**) generated to
`~/Desktop/PontifexAppStore_iPad/`:
1. `1-dashboard.png` — Welcome / Clock-In hero
2. `2-my-schedule.png` — dispatched job + continuing projects
3. `3-timecard.png` — clock-in keypad + weekly grid
4. `4-my-profile.png` — profile management

**Upload steps:** ASC → version → Previews and Screenshots → **View All Sizes in Media Manager** →
**13" iPad** → delete the splash images → drag these in → **Resubmit to App Review** (no new build).

---

## Bottom line
The **binary and code are in good shape** — no permission, encryption, IAP, deletion, or broken-feature
risks remain. The next rejection, if any, would almost certainly come from the **App Privacy label** (item 1)
or a dead **Support URL** (item 2) — both ASC-side. Fix those two, upload the screenshots, resubmit.
