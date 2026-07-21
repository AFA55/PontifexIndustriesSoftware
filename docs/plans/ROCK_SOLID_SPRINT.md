# Rock-Solid Sprint — app containment, login, issue-reporting, compliance

> Founder directive Jul 21, 2026: "you are in charge of making this app rock solid."
> Employees are using the app daily and finding real breaks. Work these in order.
> Method: expert agents audit → builders fix → guardian-review → LIVE verify (device-class
> testing where possible) → gate → one push per batch.

## P0-A · App containment ("NEVER leave the app")

**Symptoms (founder, Jul 21):** (1) completing a dispatched ticket sent the operator to the
web browser instead of staying in the app; (2) tapping timecard did the same. Rule: EVERYTHING
stays in the app.

**Known facts:** app = Capacitor remote webview, server.url `https://www.pontifexindustries.com/login`;
lib/app-url PROD_APP_ORIGIN matches (www). So kicks come from: SMS/notification links tapped
OUTSIDE the app (SMS links can never open the app without Universal Links), `window.open`,
un-gated full navigations, target=_blank, or PDF/export links.

**Audit in flight:** `webview-escape-auditor` agent is producing a ranked file:line list of
every escape path in operator surfaces (dashboard, my-jobs, job-schedule, my-profile,
NotificationBell, clock modals, SMS bodies). FIX PLAN once it reports:
- In-app navigations → Next router (or same-origin relative nav) everywhere on native;
  `isNativeApp()` gates any deliberate full-nav (login save-password flow stays web-only).
- PDFs/downloads on native → open in-webview viewer route or Capacitor Browser plugin decision
  (dev-decisions: honest options — in-app PDF page vs plugin vs skip-on-native).
- SMS deep links: short-term, reword dispatch/reminder SMS to "Open the Pontifex app → My Jobs"
  (link only helps web users; it ALWAYS opens the browser from a text). Long-term option:
  Universal Links / App Links (needs native build + AASA + assetlinks hosting — a store
  release; queue as iOS Build 10 / Android vc3 item, founder decides timing).
- **Ask the founder (blocking Q):** for each symptom, did the operator tap INSIDE the app or
  on a TEXT-MESSAGE link? And iPhone or Android? (Determines which fix closes their exact case.)

## P0-B · Login lifecycle on native (log out / log in / remembered / Face ID)

**Audit in flight:** `login-session-auditor` agent tracing: remember-me on app kill (WKWebView
localStorage vs sessionStorage), tenant-guard edge cases from the Jul 12–14 auth changes, Face
ID enrollment prompt conditions (does remember-me auto-resume skip it? does logout()'s
disableBiometric() kill enrollment every time → users never keep Face ID?), operator logout
placement, native post-login navigation.

**Fix bar:** an operator can (1) log out from the app, (2) log back in with password,
(3) stay remembered across app kills when they opt in, (4) get OFFERED Face ID once and keep
it working after logouts, (5) never land in Safari during any of it. Known heavier item if
WKWebView storage eviction is confirmed: Keychain refresh-token persistence
(docs/plans/BIOMETRIC_REMEMBER_ME_PLAN.md — Build 10 native work).

## P1 · In-app issue reporting → agent triage → founder approves from Hub

Architecture (founder: "they need a place to report these issues, an agent analyzes and
comes up with a solution, I accept from the hub"):

1. **Report capture (tenant app, all roles):** "Report a problem" button (operator dashboard
   + admin sidebar). Sheet: what happened (voice-to-text friendly), what they were doing,
   auto-attached context: user id/role/tenant, page route, app vs web (isNativeApp), platform,
   screenshot upload (optional), timestamp. Writes to existing `feedback` table if compatible
   (CHECK: /api/admin/feedback shape + Platform Hub Bug & Feedback panel reads it) — extend
   with `context jsonb` + `analysis jsonb` + `proposed_fix text` + `analysis_status` rather
   than a new table if possible.
2. **Agent triage (server, async):** on submit, fire-and-forget analysis job (Haiku via
   gateway): classify (bug/confusion/feature), match against known issues (search feedback +
   recent commits), propose: probable cause + suggested fix + affected surface + severity.
   Store into `analysis jsonb`. NO code changes by the agent — analysis only.
3. **Hub approval queue:** Platform Hub Bug & Feedback panel upgrades: each report shows the
   agent's analysis + proposed fix; founder actions: Approve fix (→ creates a BACKLOG-style
   task entry the dev session picks up; v1 = marks approved + notifies founder's next Claude
   session via BACKLOG.md append is NOT automatable server-side — instead an
   `approved_fixes` view the session reads), Dismiss, or Needs-info (notifies reporter).
4. **Loop closure:** when a fix ships, mark the report resolved → reporter gets a notification
   ("Fixed in today's update").
   
   v1 scope = capture + agent analysis + hub queue with Approve/Dismiss. The "approved →
   auto-picked-up by dev session" convention: session startup reads open approved items from
   the feedback API (add to CLAUDE_HANDOFF session-start checklist).

## P1 · Compliance audit (the reel = app-legal, not OSHA)

Reel "How to NOT get sued building an app" (privacy/legal checklist). Our real exposure:
- **Employee GPS tracking** (clock-in/out, en-route, photo GPS): consent flow exists
  (GpsConsentModal) — audit coverage: shown to every operator? recorded? disclosed in policy?
- **Biometric login (Face ID)** — biometric-consent language (BIPA-class state laws; we store
  a refresh token behind the OS biometric, not biometric data itself — document that).
- **SMS (TCPA):** dispatch/reminder/survey texts — opt-in recorded at invite (phone consent
  fields exist), STOP handling = Twilio default; document.
- **Privacy Policy + Terms:** pages exist (/privacy? /terms, /terms-of-service) — audit
  they cover: GPS, photos, biometrics-adjacent auth, SMS, data retention, deletion (profile
  hard-delete exists), subprocessors (Supabase/Vercel/Twilio/Resend/Stripe/Anthropic/ElevenLabs).
- **App Store privacy labels** vs actual collection (location, photos, identifiers).
- Deliverable: docs/plans/COMPLIANCE_AUDIT.md checklist + gap fixes; agent sweep AFTER P0s.

## Standing context
- P0 crew items from Jul 14 remain open (helper visibility bug, shop tickets, multi-helper:
  docs/plans/SHOP_TICKETS_AND_CREW_PLAN.md) — fold the helper-visibility fix INTO P0-B batch
  if the audits confirm overlap, else immediately after.
- Every push = billed build; batch per section. Live crews: never break clock-out/dispatch
  midday; test with demo operator Keon (pattern: Jul 20 clock-out E2E, clean up test rows).
