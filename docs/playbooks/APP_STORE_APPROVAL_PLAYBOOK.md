# App Store Approval Playbook — Pontifex Industries
**Date:** 2026-05-30 · **App ID:** 6772996692 · **Bundle:** com.pontifexindustries.app

What it takes to get **this specific app** (a Capacitor-wrapped B2B field-operations SaaS, loading the
live web app via `server.url`) approved — and a guideline-by-guideline readiness check so we don't get
bounced again. This is the definitive guide; `APP_STORE_REVIEW_AUDIT.md` has the technical detail and
`APP_STORE_RESUBMISSION.md` has the build/upload runbook.

---

## The 3 things that actually get an app like ours rejected

Your app type — a **wrapper that loads a remote website**, B2B, with hardware features — has a very
specific rejection profile. In priority order:

### 🥇 1. Guideline 2.1 — Reviewer gets stuck at the login screen
The app opens directly to `/login`, which asks for a **Company Code** *before* email/password. A reviewer
who doesn't know to type `PATRIOT` is stuck on screen one → **automatic rejection.** This is the
single highest-probability rejection and is 100% preventable with the review notes below.
**Status: ✅ Covered** — paste the notes in §"Review Notes" and it's a non-issue.

### 🥈 2. Guideline 4.2 — "This is just a website in an app"
Because the binary loads 100% remote content (`server.url = https://www.pontifexindustries.com/login`),
Apple can argue it's a repackaged website with no native value. **This is our top structural risk.**
- **Why we're OK:** the app uses real native iOS capabilities — **Camera** (job photos), **GPS/Location**
  (clock-in verification), **Push Notifications** (job dispatch), local notifications, haptics, status-bar
  theming. That's genuine native value, and we've **already passed multiple review rounds** without a 4.2
  flag (the reviewer has been inside the app).
- **How we defuse it:** the review notes explicitly tell the reviewer which **native hardware features**
  to exercise. A reviewer who sees the camera + location prompts does not file 4.2.
- **Do NOT** remove the native plugins or the app becomes a pure web view (then 4.2 is real).

### 🥉 3. Guideline 2.3 — Inaccurate metadata (screenshots / privacy label)
- Screenshots: ✅ **fixed** (real 13" iPad shots, replacing the splash screens).
- App Privacy label: ⚠️ **verify in ASC** — it must declare what the app collects (see §ASC checklist).

---

## Guideline-by-guideline readiness

| Guideline | Applies because… | Status |
|---|---|---|
| **2.1 Completeness** | Account-gated app; reviewer needs working demo + clear login | ✅ Demo creds + company-code walkthrough in notes |
| **2.1 Broken features in WKWebView** | Web NFC + Web Speech aren't supported in iOS WebView | ✅ Both feature-detect and fall back (NFC→PIN, mic→disabled) |
| **2.3.3 Screenshots** | Prior rejection cause | ✅ Real-app 2752×2064 shots ready to upload |
| **2.3 Metadata accuracy** | Description/keywords must match app; no other-platform mentions | ✅ verify description has no "Android"/"Google Play" |
| **2.5.2 Remote code** | App loads remote site | ✅ Loads web UI only (no executable code download); standard pattern |
| **3.1.1 In-App Purchase** | App sells SaaS subscriptions | ✅ All billing/checkout hidden in native (`isNativeApp()`); operator demo sees no purchase path. B2B/business-service model. |
| **4.2 Minimum functionality** | Web-wrapper | 🟡 Mitigated by native features + review notes (see above) |
| **4.0 Design** | Must be app-like, mobile-polished | ✅ Mobile-responsive audited; safe-area/status-bar handled |
| **5.1.1 Permission strings** | Camera/Mic/Photos/Location used | ✅ All present + descriptive in Info.plist |
| **5.1.1(v) Account deletion** | App has accounts | ✅ My Profile → Delete My Account (anonymize+ban) |
| **5.1.1(ix) Sign in with Apple** | Only required if 3rd-party/social login offered | ✅ N/A — email/password only (first-party) |
| **5.1.2 Privacy label** | App collects data | ⚠️ Verify ASC label matches privacy policy |
| **5.1.5 Location** | GPS clock-in | ✅ Relevant use, clear string, no background tracking |
| **1.2 User-generated content** | Job notes/photos | ✅ N/A — internal B2B content, not public UGC |
| **Encryption (export compliance)** | All apps | ✅ `ITSAppUsesNonExemptEncryption=false` |
| **App icon / launch** | All apps | ✅ 1024px icon present, no alpha; splash configured |

**Bottom line: the binary + web app are review-ready.** No code changes required. The remaining work is
(a) paste the review notes, (b) upload screenshots, (c) verify the privacy label — all in App Store Connect.

---

## Review Notes — paste into App Store Connect → App Review Information

> Sign-In required: **YES**. Paste this exactly into the "Notes" field.

```
Pontifex Industries is a B2B field-operations app for concrete-cutting companies. Accounts are
provisioned by each company's administrator — there is no public self-signup. Please use the demo
account below.

=== HOW TO LOG IN (important — there are 3 fields) ===
The login screen FIRST asks for a Company Code, then Email and Password:
  1. Company Code:  PATRIOT
  2. Tap Continue.
  3. Email:         zack@demopontifex.com
  4. Password:      Patriot2026!
  5. Tap Sign In.
This demo user is an Operator (field crew) — the role that best shows the app's native iOS features.

=== NATIVE FEATURES TO TRY (this is a native app, not a web page) ===
- Location: open the dashboard "Clock In" flow — the app uses GPS to verify the operator is at the
  job site (you'll see the iOS location permission prompt).
- Camera: in a job's work log, "add photo" opens the camera to document completed work.
- Push Notifications: the app registers for APNs to receive job-dispatch alerts.
- Timecard: clock-in via PIN (NFC is used on supported hardware; iOS falls back to PIN automatically).

=== ACCOUNT DELETION (Guideline 5.1.1(v)) ===
Account deletion is at: tap the profile (top-right) → My Profile → scroll to "Delete My Account"
(type DELETE to confirm). NOTE: this demo account is shared across the review — please do not execute
the deletion on it; the option is shown so you can confirm it exists. (If you need to test the full
deletion flow on a disposable account, contact us and we'll provision one.)

=== BILLING ===
Subscriptions are a business-to-business service billed to the company on the web, not to individual
app users. There is no in-app purchase, and no purchasing UI is shown in the iOS app (Guideline 3.1.1).

Support: pontifexindustries.com/support · pontifexindustries@gmail.com
```

---

## Pre-submission checklist (App Store Connect — your clicks)

- [ ] **Screenshots** → Media Manager → **13" iPad** → delete splash images → upload the 4 from
      `~/Desktop/PontifexAppStore_iPad/`.
- [ ] **Support URL** → `https://www.pontifexindustries.com/support` *(live, verified)*.
- [ ] **Privacy Policy URL** → `https://www.pontifexindustries.com/privacy` *(live)*.
- [ ] **App Privacy label** → declare: **Location** (App Functionality, not tracking), **Photos/Videos**,
      **Contact Info** (name/email/phone), **User Content**, **Identifiers** (push token). Not "Data Not Collected."
- [ ] **App Review notes** → paste the block above. Set **Sign-In required = YES**.
- [ ] **Description** → confirm no mention of Android / Google Play / other platforms.
- [ ] **Build** → ensure Build 5 (or newer) is attached.
- [ ] **Resubmit to App Review.**

---

## If it still comes back

Most likely remaining flags and the response:
- **4.2 (web-wrapper):** reply in Resolution Center emphasizing the native Camera/Location/Push usage and
  point to the in-app flows; offer a video. (Have not been flagged on this yet.)
- **Privacy label mismatch:** fix the label to match observed prompts; resubmit (metadata-only, fast).
- **Anything else:** send me the Resolution Center message and I'll diagnose + fix.
