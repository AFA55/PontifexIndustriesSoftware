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

## What ships without any of this (already live)
The **time-based clock-out reminder** (`1f45c924`) already nudges "clock out soon — auto-clockout at
6 PM" ~30 min before, no rebuild. It covers the "they forget" pain until the geofenced version lands.

## Sequencing recommendation
Build **C0 now** (safe groundwork). Then, when the founder is ready to take on the native/store/legal
work, do **C1** (plugin + geofences + builds) and **C2** (privacy + consent + submission) together —
they gate on his App Store + privacy decisions, so they're one coordinated push, not autonomous.
