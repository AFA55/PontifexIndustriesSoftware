# App Store Resubmission Plan — Pontifex Industries (Build 4)

**Created:** May 29, 2026
**App:** `com.pontifexindustries.app` · App ID `6772996692` · Team `MG4K845UH7` (Individual, `andresa.t55@icloud.com`)
**Architecture:** Capacitor native shell loading the live site (`server.url = https://www.pontifexindustries.com/login`). Unchanged.

This plan was produced by a 4-agent expert audit (App Store guidelines, IAP/Stripe 3.1.1, account-deletion 5.1.1(v), and iOS build/binary validation). It supersedes the "just add the location string and resubmit" framing — the location fix was real but minor (an automated pre-check). The **human-review** risks below are what actually gate approval.

---

## 1. What was wrong (beyond the location string)

| # | Risk | Guideline | Severity | Status |
|---|------|-----------|----------|--------|
| 1 | Reviewer can't get past `/login` (no demo creds given) | 2.1 | 🔴 BLOCKER | **Needs review notes (you)** |
| 2 | In-app Stripe purchasing reachable in the webview; `SubscriptionGate` *auto-redirected* lapsed users to a purchase page | 3.1.1 | 🟠 HIGH | ✅ **Fixed in code** |
| 3 | No in-app account deletion, but self-registration exists via `/request-access` | 5.1.1(v) | 🟠 HIGH | ✅ **Fixed in code** |
| 4 | Thin web-wrapper appearance | 4.2 | 🟡 MED | **Needs review notes (you)** |
| 5 | `ITMS-90683` missing location purpose string | (automated) | ✅ done | ✅ Fixed (`Info.plist`) |
| 6 | Build number discrepancy (pbxproj=2, docs say 3 submitted) | — | ⚠️ verify | **Confirm in App Store Connect** |

All 18 binary requirements PASS (icon opaque/no-alpha, encryption flag set, arm64, entitlements match App ID). The build will clear *upload*; these fixes are about clearing *human review*.

---

## 2. Code changes already made (web-safe, architecture untouched)

All gating uses a runtime `Capacitor.isNativePlatform()` check (`lib/is-native.ts`) that returns **false on the website** — so the website's billing is completely unchanged. The UI only changes inside the native iOS/Android shell.

**3.1.1 — purchasing hidden in the native shell:**
- `lib/is-native.ts` — new `isNativeApp()` helper (mirrors `PushRegistration.tsx`).
- `components/SubscriptionGate.tsx` — no longer auto-redirects to `/patriot?upgrade=true` in the app (the only *forced* purchase path). Web enforcement unchanged.
- `app/dashboard/admin/subscription/page.tsx` — native shows a "manage billing on the web" card instead of plans/prices/Stripe checkout/portal.
- `components/DashboardSidebar.tsx` — "Billing" nav entry hidden in the app.
- `app/patriot/page.tsx`, `app/pricing/page.tsx`, `app/offer/page.tsx` — native renders `components/NativeWebOnlyNotice.tsx` instead of pricing/checkout.

**5.1.1(v) — in-app account deletion:**
- `app/api/account/delete/route.ts` — new self-scoped route (`requireAuth` → only ever acts on `auth.userId`). Strategy is **full anonymization + permanent login lockout**, not row deletion — because ~30 tables FK to `auth.users` (some NO ACTION would block a hard delete; some CASCADE like `timecards` would destroy legally-required payroll). Step 1 calls the `close_account()` DB function (migration `20260529_account_deletion_infrastructure`): anonymizes the profile, purges personal records (notifications/push tokens/access requests), revokes sessions. Step 2 anonymizes + 100-year-bans the auth identity (tombstone email, random password, cleared metadata). Net: no login, no personal data; payroll/timecards retained de-identified per the privacy policy.
- `app/dashboard/my-profile/page.tsx` — "Danger Zone → Delete My Account" with a type-`DELETE`-to-confirm modal; logs out + redirects to `/company-login` on success.
- `lib/legal/privacy-policy.ts` — added the in-app deletion path (My Profile → Delete My Account) for Guideline 5.1.1(i).
- **DB (already applied to prod):** `profiles.deleted_at` column + `public.close_account(uuid)` SECURITY DEFINER function. ⚠️ Post-deploy, run one real e2e test: create a throwaway operator in-app → Delete My Account → confirm you cannot log back in and the profile shows anonymized + `deleted_at` set.

`npm run build` passes with 0 errors; `/api/account/delete` is registered.

---

## 3. Resubmission runbook

### Step 0 — Confirm the real build number (do NOT skip)
App Store Connect rejects any upload whose `CFBundleVersion` ≤ the highest already uploaded for 1.0.0.
1. App Store Connect → My Apps → Pontifex Industries → **TestFlight** → iOS builds.
2. Read the **highest** build number under version **1.0.0** (count even rejected/invalid builds).
3. New build = that **+ 1** (likely **4**). `pbxproj` currently says `2` — trust TestFlight, not the file.

### Step 1 — Push the web (⚠️ billed Vercel build, needs your OK)
The app loads the live site, so `main` must be current before archiving. Unpushed: `dfa0aea3` (Info.plist fix + docs), `f78a76af` (Maps fix), plus this session's commit.
```bash
cd "/Users/afa55/Documents/Pontifex Industres/pontifex-platform"
git push origin main
```
Wait for the Vercel deploy to go READY before archiving.

### Step 2 — Bump the build number
Edit `ios/App/App.xcodeproj/project.pbxproj` — both `CURRENT_PROJECT_VERSION = 2;` → your confirmed number (likely `4`). `MARKETING_VERSION` stays `1.0.0`.

### Step 3 — Archive + export (CLI; sidesteps the Xcode Team-dropdown bug)
```bash
cd "/Users/afa55/Documents/Pontifex Industres/pontifex-platform/ios/App"
xcodebuild archive \
  -project App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath ~/Desktop/PontifexExport/App.xcarchive \
  CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=MG4K845UH7 \
  PROVISIONING_PROFILE_SPECIFIER="Pontifex App Store Distribution" \
  CODE_SIGN_IDENTITY="Apple Distribution"

cat > ~/Desktop/PontifexExport/ExportOptions.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store</string>
  <key>teamID</key><string>MG4K845UH7</string>
  <key>signingStyle</key><string>manual</string>
  <key>provisioningProfiles</key><dict>
    <key>com.pontifexindustries.app</key><string>Pontifex App Store Distribution</string>
  </dict>
  <key>uploadSymbols</key><true/>
  <key>destination</key><string>export</string>
</dict></plist>
PLIST

xcodebuild -exportArchive \
  -archivePath ~/Desktop/PontifexExport/App.xcarchive \
  -exportPath ~/Desktop/PontifexExport \
  -exportOptionsPlist ~/Desktop/PontifexExport/ExportOptions.plist

# Verify the build number made it in:
unzip -p ~/Desktop/PontifexExport/App.ipa "Payload/App.app/Info.plist" | plutil -extract CFBundleVersion raw -o - -
```
> If `exportArchive` errors on the method value, change `app-store` → `app-store-connect` (newer Xcode).

### Step 4 — Upload via Transporter
Open **Transporter** → sign in as `andresa.t55@icloud.com` → drag `~/Desktop/PontifexExport/App.ipa` → **Deliver**. Appears in TestFlight (~15–30 min).

### Step 5 — App Review notes + demo credentials (the BLOCKER fix)
App Store Connect → the 1.0 version → **App Review Information**:
- **Sign-in required:** YES.
- **Demo account** (company code + email + password — see §4 for the exact values to paste).
- **Notes:** paste §4.

### Step 6 — Attach build + submit
Select the new build → export-compliance = exempt (HTTPS only) → **Add for Review** → **Submit**.

### Step 7 — TestFlight smoke test (recommended, in parallel)
On a real iPhone: login, GPS clock-in, NFC, camera, schedule board, **My Profile → Delete My Account** (use a throwaway account!), and confirm no pricing/checkout appears anywhere.

---

## 4. App Review notes — paste into App Store Connect

Demo account verified in DB: tenant **Patriot Concrete Cutting**, company code **PATRIOT**, status `trialing` (so the subscription gate never triggers for the reviewer). `zack@demopontifex.com` is an **operator** — the best role for showing the native hardware features.

> ⚠️ **Deletion-test caveat:** the demo accounts are shared and live in the real Patriot tenant. The notes below tell the reviewer where account deletion *is* (which is what Apple checks) but ask them NOT to execute it on the shared account. If you'd rather let them actually run it, create a throwaway account first (see §6) and swap it in.

```
This is a B2B field-operations app for concrete-cutting / construction crews. It is
used internally by a company's employees (operator and admin roles), not by the public.

DEMO ACCOUNT (login requires Company Code + Email + Password):
  Company Code: PATRIOT
  Email:        zack@demopontifex.com
  Password:     Patriot2026!

NATIVE DEVICE FEATURES (this is not a website — it uses iPhone hardware):
  • GPS location — verifies the operator is physically at the job site at clock-in
    (checked once per clock-in; no background tracking).
  • NFC — scans employee badges for time-clock punch-in.
  • Camera + Photos — documents completed work at the job site.
  • Push notifications — job assignments and clock-in reminders.

HOW TO EXERCISE CORE FLOWS:
  1. Log in with the demo account above (Company Code PATRIOT).
  2. Operator: "My Jobs" → open a job → clock in (GPS) → log work performed → take a photo.
  3. Account deletion is available in-app at: profile/avatar → "My Profile" → "Danger Zone"
     → "Delete My Account" (type DELETE to confirm). Please note this is a shared demo
     account — the deletion control is fully functional but we ask you not to execute it on
     this shared login.

BILLING: Subscriptions are sold only to companies (enterprise B2B) and are managed on the
website, not in the app — the app contains no in-app purchase UI.
```

## 6. Optional — dedicated deletion-test account
If you want the reviewer to actually run deletion, create a disposable operator in the PATRIOT
tenant (Admin → Team → Add User, or ask Claude to insert one), e.g. `appreview@demopontifex.com`,
and swap it into the notes' step 3. It can be recreated freely if deleted.

---

## 5. Still open / monitor
- **App Privacy "nutrition label"** in App Store Connect must declare Location, Photos, Audio, identifiers — consistent with the plugins.
- **Privacy Policy URL** set + reachable (`https://www.pontifexindustries.com/privacy`).
- If a reviewer still flags 3.1.1, reply citing the enterprise/real-world-service framing in §4 (the app now has zero in-app purchase UI, satisfying the 3.1.3(f) "free companion to a paid web tool" path).
