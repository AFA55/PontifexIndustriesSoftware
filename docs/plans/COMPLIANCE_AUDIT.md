# Compliance Audit — Rock-Solid Sprint Batch 4

**Date:** July 21, 2026
**Scope:** App-legal compliance for the Pontifex platform (web + iOS + Android webview apps): privacy policy accuracy, data-collection disclosure, subprocessors, consent flows, retention, store permission strings.
**Trigger:** Founder's compliance request (IG reel on app-legal requirements) — Rock-Solid Sprint batch 4.

---

## Verdict

The foundation was already strong — real privacy policy + ToS pages, consent checkboxes at self-registration, GPS consent modal, in-app account deletion (Apple 5.1.1(v) satisfied), no ad trackers, Sentry with session replay disabled, biometrics never leaving the device. The audit found **accuracy gaps** (policy said less than the app does) rather than missing infrastructure. The high-risk inaccuracies were fixed same-day (v1.2); the rest are tracked below.

## What was accurate before the audit (no action needed)

- **Account deletion in-app**: `POST /api/account/delete` → `close_account()` RPC anonymizes PII, tombstones the auth user, bans for 100 years, keeps legally-required payroll records de-identified. Documented in policy §6.
- **Consent at self-registration**: `/request-access` requires two checkboxes linking `/privacy` + `/terms`, age-18 attestation.
- **Biometrics**: verification is 100% on-device (`@capgo/capacitor-native-biometric`); only a Supabase refresh token sits in Keychain (`BIOMETRY_CURRENT_SET`). No biometric data server-side — verified by grep of all API routes.
- **No analytics/ad trackers**: no GA, no Meta pixel. Only Sentry (DSN-gated, replay disabled).
- **SMS consent capture**: `sms_consent` table with consent text, IP, user-agent, method; public opt-in page displays STOP/HELP language (A2P proof page).
- **Android manifest is minimal**: media-read permissions explicitly stripped (`tools:node="remove"`); NFC/camera declared optional.
- **Retention schedule documented**: OSHA 30yr, payroll 7yr, GPS 3yr, voice 90d — policy §4.

## Gaps found → FIXED July 21, 2026 (privacy policy v1.2 + setup-account)

| # | Gap | Fix |
|---|-----|-----|
| 1 | **Policy claimed "GPS only once at clock-in, never continuous"** — but the app records GPS at workflow milestones (`timecard_gps_logs`), streams live location ~35s while In Route (`operator_location_pings`), and stamps GPS on every job photo (`photo_locations`). Materially inaccurate disclosure = the worst kind of privacy-policy problem. | §1.2 rewritten to disclose all four collection events precisely, incl. the live In-Route sharing (foreground-only, stops on arrival/app close). §2 and §9 and the summary HTML updated to match. |
| 2 | **Only 2 of 9 wired subprocessors named** (Supabase, Resend). Telnyx, Twilio, Stripe, Anthropic (via Vercel AI Gateway), ElevenLabs, Google Maps, Sentry, Vercel were undisclosed. | §5 now has a full subprocessor table: provider, purpose, data involved. Notes card numbers never touch our servers (Stripe-direct). |
| 3 | **Biometric sign-in, push tokens, SMS consent records absent from "Information We Collect."** | New §1.9 (biometric — on-device only, what's actually stored) and §1.10 (push tokens, SMS consent records, STOP/HELP). |
| 4 | **Invited-user setup (`/setup-account`) waiver never linked the canonical `/privacy` + `/terms`** — invited employees (the majority of users) technically never saw the real policy. | Waiver now has a §9 referencing both, and the acceptance checkbox line links both pages. |
| 5 | Policy effective date / version stale. | v1.2, effective July 21, 2026. |

## Remaining gaps → BACKLOG (not blocking, tracked)

| Priority | Gap | Detail |
|---|------|--------|
| P1 | **iOS Info.plist location strings understate collection.** `NSLocationWhenInUseUsageDescription` says "checked once per clock-in… not tracked in the background." Foreground In-Route sharing makes "once per clock-in" wrong (though "no background tracking" is true). Apple rejects for permission-string mismatch. **Fix at the next native build** (needs App Store submission anyway): reword to "Pontifex uses your location to verify job-site attendance at clock-in and to share your progress with dispatch while you are en route. Location is never tracked in the background." Same for the AlwaysAndWhenInUse string. | `ios/App/App/Info.plist` |
| P1 | **App Store / Play data-safety labels** should be rechecked against v1.2 (location: yes, linked to user, app functionality; no tracking). Founder does this in ASC / Play Console — 10 min each. | store consoles |
| P2 | **SMS STOP is advertised but not enforced in our code.** Carrier/provider-level STOP blocking exists (Twilio/Telnyx auto-block A2P STOP replies), so messages do stop — but we never see the STOP, and `sendSMSAny` doesn't check an opt-out list. Add: inbound webhook (Telnyx + Twilio) → mark `sms_consent.opted_out` → suppression check in `lib/sms.ts`. | `lib/sms.ts`, new webhook route |
| P2 | **Retention windows are promised but nothing purges.** Policy says voice 90d, GPS 3yr, photos account+3yr — no cron deletes anything. Add a monthly `data-retention` cron: purge `operator_location_pings` > 3yr, `timecard_gps_logs` > 3yr, voice artifacts > 90d. (Nothing is old enough to violate yet — platform is ~8 months old; voice recordings are the nearest deadline.) | new `/api/cron/data-retention` |
| P3 | **No EXIF stripping on photo upload.** Original camera files (with embedded EXIF GPS) upload as-is; we also store explicit GPS in `photo_locations`. Since we now disclose per-photo location, this is a hardening nicety, not a violation. Consider canvas re-encode on upload. | `components/PhotoUploader.tsx` |
| P3 | **Cookie/localStorage disclosure** is thin (no cookie section). We use localStorage for session/prefs, no third-party cookies. Low risk; add a short §1.11 next policy rev. | `lib/legal/privacy-policy.ts` |

## Facts inventory (for future reference)

- **Legal pages:** `app/privacy` ← `lib/legal/privacy-policy.ts` (v1.2); `app/terms` ← `lib/legal/terms-of-service.ts` (v1.0, Mar 22 2026 — still accurate: ESIGN §5, GPS consent §6, SMS STOP §7, SC governing law §13).
- **Location capture points:** clock-in/out (`app/api/timecard/clock-in/route.ts` → `timecards.clock_in_latitude/longitude`), workflow segments (`app/api/timecard/log-segment/route.ts` → `timecard_gps_logs`), live In-Route (`hooks/useLocationBroadcast.ts` ~35s → `operator_location_pings`, foreground only), photo stamps (`components/PhotoUploader.tsx` → `photo_locations`). Consent gate: `components/GpsConsentModal.tsx` → `consent_records`.
- **Biometric:** `lib/biometric.ts` — refresh token in Keychain, nothing server-side.
- **Push:** `app/api/push-tokens/register` → `push_tokens`, deleted on logout.
- **SMS:** `lib/sms.ts` Telnyx primary / Twilio fallback; consent via `/api/sms-opt-in` + setup-account checkbox → `sms_consent`.
- **Signatures:** base64 in DB columns (`customer_signature`, `daily_signature_data`, etc.), ESIGN consent text in `lib/legal/esign-consent.ts`, audit metadata per ToS §5.
- **Deletion:** `app/api/account/delete` + `close_account()` (migration 20260529).
- **Store permissions:** iOS Info.plist strings quoted in this audit's source session; Android manifest minimal.
