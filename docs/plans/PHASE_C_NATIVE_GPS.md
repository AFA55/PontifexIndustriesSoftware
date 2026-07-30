# Phase C — Native GPS geofencing (auto-arrival + app-closed clock-out reminder)

**Goal (founder's words):** operators stop having to tap "arrived" — the app auto-detects
arrival within ~0.5 mi of the jobsite; and when they get back to the shop, a notification asks
"ready to clock out?" — even with the app closed. Solves the "they forget" problem at the source.

**Founder greenlit "commit to native GPS" (Jul 30).** This is a real native initiative, not a web
push. Below is the honest, phased plan with what's reversible vs permanent and what needs the founder.

---

## The hard truth about the current stack (from the architecture map)
- The app is a **remote-URL webview** (Capacitor loads the live site). All location today is browser
  `navigator.geolocation` — **foreground-only** (stops when the app backgrounds/locks).
- `@capacitor/geolocation` is installed but **unused**; there is **no background-geolocation plugin**.
- The privacy policy + GPS-consent docs **explicitly promise "never in the background or when the app
  is closed"** (`lib/legal/privacy-policy.ts`, `lib/legal/gps-consent.ts`). Background tracking
  **contradicts this** — it must be rewritten and users re-consented.
- There is **no stored jobsite lat/lng** to geofence against (addresses aren't geocoded + saved).
- `@capacitor/local-notifications` IS installed; the `reminder_log` dedup infra exists.

---

## Phased plan (cheapest reversible step first)

### Phase C0 — Groundwork (SAFE · no rebuild · ADDITIVE · building now)
Delivers value on its own and de-risks everything after it. Reversible.
1. **Persist jobsite coordinates** — new `job_orders.jobsite_latitude/jobsite_longitude` (additive
   migration). Geocode the job address (server-side, reuse the existing Nominatim proxy) via a
   rate-limited **backfill cron** (new + existing jobs). Also improves the existing distance /
   drive-time features, which currently guess.
2. **Foreground auto-arrival** (optional, no native) — while the app is OPEN and In-Route, compare the
   existing `useLocationBroadcast` pings to the jobsite pin; within ~0.5 mi → auto-stamp arrival.
   Partial (app must be open) but zero native cost; a stepping stone to the real thing.

### Phase C1 — Native background geolocation (needs iOS + Android builds)
1. **Pick a plugin** (honest options below). Install + register in `capacitor.config.ts`.
2. **Native permissions/config:** iOS `NSLocationAlwaysAndWhenInUseUsageDescription` +
   `UIBackgroundModes: location`; Android `ACCESS_BACKGROUND_LOCATION` + a foreground service.
3. **Geofences:** register a jobsite geofence (0.5 mi) on dispatch/In-Route and a **shop geofence**;
   on region-enter fire the backend event (auto-arrival) / a local notification ("ready to clock
   out?"). The OS wakes the app on region cross → low battery (vs continuous polling).
4. **New iOS + Android builds** via the `ios-release` / `android-release` skills → store review.

### Phase C2 — Privacy, consent, store review (needs the FOUNDER)
- **Rewrite** `privacy-policy.ts` + `gps-consent.ts` to disclose background/geofenced location, why,
  and how to turn it off. **Re-consent** existing users (a one-time in-app prompt).
- **App Store review:** Apple scrutinizes "Always" location — needs a clear in-app benefit + a
  purpose string + often a demo video. Common rejection area; budget review round-trips.
- **Founder-only steps:** the App Store / Play submissions, the Apple "Always"-location justification,
  and the legal sign-off on tracking employees (labor-law/consent varies by state — SC).

---

## Honest options — the background-location plugin (the one permanent-ish choice)
| Option | Cost | Battery | Store risk | Notes |
|---|---|---|---|---|
| **`@capacitor-community/background-geolocation`** | Free (MIT) | Good (uses OS geofencing/significant-change) | Medium (Always perm) | Community-maintained; solid for geofence enter/exit + background pings. **Recommended default.** |
| **Transistorsoft `@transistorsoft/capacitor-background-geolocation`** | **Paid license** (~$300+ one-time per platform) | Best-in-class | Medium | The gold standard for battery + reliability; overkill unless the community plugin proves unreliable in the field. |
| **Roll our own via `@capacitor/geolocation` + background modes** | Free | Worse (manual) | Higher | More native code to maintain; not worth it vs the plugins above. |

Recommendation: start with the **community plugin** (free, reversible — we can swap to Transistorsoft
if field battery/reliability disappoints). The plugin choice is swappable; the native-permission +
privacy-rewrite work is the same either way.

## Geocoding provider (C0 — VERIFIED + decided)
Tested Nominatim against a real Patriot address ("121 Logistics Way, Gaffney SC"): it resolves the
**city** but NOT the street — useless for a 0.5-mi geofence. So:
- **Primary = Google Places selection (accurate + free).** The schedule form's address autocomplete
  (`GoogleAddressAutocomplete`) already returns the selected place's exact lat/lng; C0 now **persists
  that** onto the job (`jobsite_latitude/longitude`, `jobsite_geocoded_at`). No new API/key/cost — the
  office already picks the address from Places. This is the accurate source for every new job.
- **Fallback = Nominatim backfill cron** (`/api/cron/geocode-jobsites`, every 15 min) for old jobs or
  manually-typed addresses — best-effort, city-level where the street doesn't resolve.
- **If field accuracy ever needs more** (a manual-address job that Nominatim can't place), the options
  are: enable Google **server-side Geocoding** (needs a non-referrer-restricted key + Geocoding API on
  in Google Cloud — a founder config step + tiny $), or let the office drop a map pin. Not needed yet.

---

## C1 status (built Jul 30 — staged, needs a native build + on-device testing)
Done + pushed (web build verified safe — native code is `isNativeApp`-gated + uses
`registerPlugin`, so nothing native is bundled into the web/SSR build; the live app is unaffected):
- `@capacitor-community/background-geolocation@1.2.26` installed (compatible with Cap 8).
- `lib/native/geofence-service.ts` — background watcher → JS geofence math: auto-arrival when
  within 0.5 mi of an in_route job's stored jobsite coords (POSTs in_progress); back-at-shop
  reminder (local notification) when re-entering the shop radius while clocked in (hysteresis).
- `components/GeofenceRegistration.tsx` (headless, native + field-role gated) mounted in the
  dashboard layout; `/api/timecard/current` now returns tenant `shop` coords for the reminder.
- iOS `Info.plist`: background-disclosing usage strings + `UIBackgroundModes: location`.
  Android manifest: `ACCESS_BACKGROUND_LOCATION` + `FOREGROUND_SERVICE(_LOCATION)`.

**⚠️ Not done / blocking before this reaches users:**
1. **A native build** (bump version → `npx cap sync ios/android` → archive/build → TestFlight/internal)
   — the plugin + config only take effect in a fresh binary. Use the `ios-release`/`android-release` skills.
2. **On-device testing + tuning** — permission flow ("Always" grant), `distanceFilter`, the 0.5-mi
   radius, hysteresis, and battery. The geofence logic is v1 and CANNOT be validated without a device.
3. **C2 privacy + consent (founder approval required)** — the live `lib/legal/privacy-policy.ts` +
   `gps-consent.ts` still say "never in the background" and were intentionally NOT changed yet.
4. **Multi-tenant shop fallback** — the back-at-shop reminder uses `getTenantShopLocationOrDefault`,
   which falls back to hardcoded **Patriot** coords when a tenant has no `shop_latitude`. Fine while
   only Patriot is native; set per-tenant shop coords before a 2nd tenant goes native.

Guardian SHOULD-FIX applied (Jul 30): synchronous start/stop race guard (no watcher leak after
logout), cold-start user-readiness retry, roles narrowed to operator/apprentice (no all-day GPS for
shop staff), crew-helper auto-arrival limitation documented.

## C2 — proposed privacy language (DRAFT for founder approval — not yet applied)
> **Background location (while on the clock).** When you are clocked in or have an assigned job, the
> Pontifex app may use your location in the background to automatically record when you arrive at a
> job site and to remind you to clock out when you return to the shop. Background location is only
> active while you are on the clock, is used solely for time-keeping, is never sold or shared, and can
> be turned off at any time in your device Settings (clock-in location verification still works).
Apply this to `privacy-policy.ts` + `gps-consent.ts` AND add a one-time in-app re-consent prompt
before the native build's background tracking is enabled — this is the founder's call + legal sign-off.

## C2 compliance — review done Jul 30 (privacy pro on the team). Verdict: wording good, artifacts needed.
**Applied in code (compliance-critical, done):**
- **Technical-truth fix:** background location now runs ONLY while clocked in — `GeofenceRegistration`
  polls clock status, starts on clock-in, STOPS on clock-out. (The "only while on the clock" claim
  must be literally true — it was starting at login before.)
- **Consent-before-permission:** a `GeofenceConsentModal` (prominent disclosure with Google's
  "even when the app is closed or not in use" phrasing + retention + **Agree / Not now**) shows
  BEFORE the OS prompt; geofencing never starts until "Agree" (`bg-location-consent.ts`). "Not now"
  never triggers the OS prompt. GPS consent version bumped v1.1→**v2.0** to force re-consent.
- **Privacy docs updated** (`privacy-policy.ts` v1.2→v1.3, `gps-consent.ts` v2.0) to disclose on-the-clock
  background location, retention (with the timecard, 3 yrs), no-sale, opt-out.
- **iOS purpose string** tightened ("not used at any other time") + **`PrivacyInfo.xcprivacy`** added
  (Precise Location → App Functionality, not tracking, not shared).

**FOUNDER TASKS before the store build reaches users (REQUIRED — I can't do these):**
1. **Google Play (highest rejection risk):** complete the Play Console **background-location Declaration
   Form** + record a **≤30s demo video** (feature → disclosure dialog → OS prompt) + justify **core
   functionality** (timesheet accuracy; workers shouldn't keep the app open on-site). Confirm the plugin's
   Android foreground service declares `foregroundServiceType="location"` with a persistent notification.
2. **Apple:** in App Store Connect set the **App Privacy label** — Precise Location → App Functionality,
   "Not used to track you," not shared (must match `PrivacyInfo.xcprivacy` + the disclosure). Add the
   "Always" justification to **App Review notes** (When-In-Use requested first, escalates to Always).
3. **Signed employee consent** — a written acknowledgment in onboarding/handbook (SC best practice;
   stronger evidence than the in-app tap). Make the notice per-tenant configurable before a 2nd tenant.
4. **SC-licensed employment/privacy counsel** confirms the consent posture before enabling on real
   employees. (Compliance reviewer is not an attorney; employee-monitoring law is state-specific.)
5. Confirm Patriot revenue < $25M (documents CCPA non-applicability); a future large-CA tenant flips this.

## What ships without any of this (already live)
The **time-based clock-out reminder** (`1f45c924`) already nudges "clock out soon — auto-clockout at
6 PM" ~30 min before, no rebuild. It covers the "they forget" pain until the geofenced version lands.

## Sequencing recommendation
Build **C0 now** (safe groundwork). Then, when the founder is ready to take on the native/store/legal
work, do **C1** (plugin + geofences + builds) and **C2** (privacy + consent + submission) together —
they gate on his App Store + privacy decisions, so they're one coordinated push, not autonomous.
