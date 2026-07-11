# Finish-Line Phases — monetized platform, tested end-to-end (Jul 11, 2026)

> Founder directive: "we are close and have to be careful with our developments to ensure we
> don't break anything — break it into phases and execute 1 by 1." Every phase ships behind the
> full gate (build + tsc + jest + live browser verify + guardian on money/auth code) and batches
> into ONE push. Nothing in a later phase blocks an earlier one.

## Phase 0 — keys & switches (founder tasks, ~15 min total) 🔑
- [ ] **GOOGLE_MAPS_SERVER_KEY** in Vercel → real drive-times (steps in the Jul 11 chat reply;
      the existing NEXT_PUBLIC key is browser-restricted and can't be used server-side).
- [ ] **ELEVENLABS_API_KEY** in Vercel → Artifex voice lights up (built + shipped Jul 9).
- [ ] Verify **TWILIO_PHONE_NUMBER** = +18336954288.
- Claude prep (done): all three features fail soft and flip on automatically when keys land.

## Phase 1 — live-fire test week (no new code; fix what testing finds) 🔫
- [ ] Voice ticket E2E on prod: talk a job ticket into existence, approve it on the schedule
      board, assign, execute the operator flow (GPS photos), complete → invoice.
- [ ] SMS live: en-route/completion/survey/signature texts to a real phone from (833) 695-4288;
      confirm message_usage rows meter each send.
- [ ] Drive-time flips from "~est" to Google exact after Phase 0 key.
- Exit: one full Patriot job lifecycle executed by voice + SMS with zero manual patches.

## Phase 2 — cost visibility: "AI & Usage" dashboard in Platform Hub 📊
The metering already exists: `ai_usage` (Artifex tokens+cost per tenant), `message_usage`
(SMS raw vs billed), `hiring_billing` (ad spend + markup). Build the read layer:
- [ ] Platform Hub page: per-tenant panel — AI cost (tokens), SMS count/cost/billed, voice
      chars (add an `ai_usage`-style meter to the TTS route), Maps calls (log in drive-time lib),
      ad spend. Month picker. Platform-owner eyes only.
- [ ] `docs/reference/OPERATING_COSTS.md` — the founder's cost cheat-sheet (unit prices +
      monthly projections at Patriot scale).
- Known unit economics (Jul 2026): Haiku via gateway ~$1/M in + $5/M out (an Artifex turn ≈
  $0.001–0.01); ElevenLabs Turbo ≈ $0.03–0.07 per spoken reply (Creator $22/mo ≈ 200k chars);
  SMS ≈ $0.008/segment billed at 2.5×; Routes API $5/1k calls (we call ~once per flagged
  clock-out — pennies); toll-free number ~$2.15/mo.

## Phase 3 — Stripe monetization: flat rate + usage fees 💳
- [ ] Tenant plan model: flat monthly base (tenants.plan) + metered add-ons (messaging billed
      2.5×, AI usage pass-through + margin, ads managed-spend markup).
- [ ] Monthly cron: roll up uninvoiced message_usage + ai_usage → Stripe invoice items on the
      tenant's customer (reuse hiring settle machinery — card-on-file, idempotent, CAS-claimed).
      Plan already written: docs/plans/MESSAGING_BILLING_PLAN.md Phase 3.
- [ ] Tenant-facing usage card (billed amounts only — margin never exposed).
- ⚠️ Money code → adversarial guardian review required; test with Stripe test-mode tenant first.

## Phase 4 — ads to the finish line: FB/IG/TikTok live 📣
- [ ] Founder: Meta Business verification + Facebook Page (BLOCKING prerequisite, already in
      BACKLOG; TikTok Business account after).
- [ ] Marketing API integration (campaign create from the ad kit we already generate), spend
      sync into hiring_billing (markup machinery exists), pause/budget controls in the job UI.
- [ ] Ad-economics research (Hireline benchmark): what they spend per job + keep as margin —
      deep-research pass + industry benchmarks (labor-marketplace job ads typically $5–15/day
      per job on Meta; managed-ads resellers keep 20–40%). Sets our default markup + minimums.
- [ ] Funding model decision: tenant pre-funds ad wallet vs. we front + threshold-charge
      (hiring_billing already does threshold charging — likely winner).

## Standing guardrails
One phase in flight at a time · full gate before any push · money/auth diffs get guardian
review · additive idempotent migrations only · BACKLOG.md stays the single source of truth.
