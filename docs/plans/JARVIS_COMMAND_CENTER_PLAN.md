# JARVIS Command Center — Architecture & Plan

> Founder's vision (Jun 13): a "Jarvis-from-Iron-Man" AI command center, launched from a button at
> the bottom of the dashboard. A 3D spinning arc-reactor centerpiece (Stark-HUD reference image) that
> pulses/scales when speaking, the brand dark palette (purple→red→black→white). Management tabs on the
> left, a right rail with live time + notifications + "employees clocked in (1/10)". Talk to it by
> voice ("okay Jarvis, how's the app doing?") and it answers in a real British Jarvis voice via
> ElevenLabs. Status: PLANNING — no build until the §7 decisions are made.

## 1. What this actually is (three systems, be honest about scope)

This is not one feature — it's **three new subsystems** that happen to share a screen:

| System | New? | Risk | Cost |
|---|---|---|---|
| **A. The HUD** (3D/animated command-center UI + live data rail) | Yes | Low–med (bundle/perf) | $0 |
| **B. The AI brain** (conversational LLM with tenant-scoped tools over live app data) | Yes | **High** (security, hallucination, cost) | $ per message |
| **C. The voice pipeline** (speech-in + ElevenLabs speech-out) | Yes | **High** (iOS webview can't do browser STT) | $ per character |

Building all three at once, big-bang, is how this breaks. The plan phases them so each ships working.

## 2. Frontend — the HUD (System A)

- **Entry:** a "Command Center" button pinned at the bottom of `/dashboard/admin` (and operator dash later). Opens a full-screen overlay route `/dashboard/command-center`.
- **Layout** (matches the founder's sketch):
  ```
  ┌───────────────────────────────────────────────────────────┐
  │  PONTIFEX COMMAND CENTER            ⏱ 11:30 AM · Sat Jun 13│
  ├──────────┬─────────────────────────────────┬──────────────┤
  │  TABS    │                                 │  LIVE RAIL   │
  │ Schedule │        ◉  ARC-REACTOR HUD       │ 👥 Clocked   │
  │ Timecards│      (spins; scales when        │    1 / 10    │
  │ Team     │       Jarvis is speaking)        │ 🔔 3 alerts  │
  │ Billing  │                                 │ 📅 4 jobs    │
  │ ...      │     "How's the app doing?"      │    today     │
  └──────────┴─────────────────────────────────┴──────────────┘
  ```
- **The centerpiece — recommendation: canvas + Web Audio, NOT full Three.js (v1).** A Stark arc-reactor
  rendered with layered SVG/`<canvas>` rings rotating via `requestAnimationFrame`, that **scales/pulses
  to the live audio amplitude** (Web Audio `AnalyserNode` on the ElevenLabs playback stream). This gets
  the "spins, grows when talking" effect the founder wants with ~0 bundle cost and smooth mobile perf.
  Full React-Three-Fiber (+150KB, GPU, mobile battery) is a v2 upgrade if the canvas version isn't
  "wow" enough. Decision in §7.
- **Palette:** reuse `pontifex-brand` tokens — `#7C3AED → #DB2777 → #EF4444` gradient rings on
  `#120A24`/`#1e1b4b` indigo-black; cyan accents from the reference are OPTIONAL (brand is purple→red).
- **States:** idle (slow spin) · listening (ring ripples) · thinking (faster spin + shimmer) ·
  speaking (amplitude-reactive scale). Built with `frontend-design` skill for the wow factor.
- **Right rail data:** reuses existing endpoints where possible — clocked-in from timecards, alerts
  from notifications, today's jobs from the schedule. Read-only, polled (or realtime later).

## 3. The AI brain (System B) — the part that must be rock-solid

- **NEW endpoint `POST /api/command-center/assistant`** (requireAuth, tenant-scoped). The LLM with
  **tool-calling** over a small, curated, READ-ONLY tool set. Recommended provider: **Claude via the
  Vercel AI Gateway** (`"anthropic/claude-..."` per the Vercel knowledge-update guidance) — one key,
  observability, fallbacks. (Anthropic SDK direct is the alternative.)
- **Tools (v1 = READ-ONLY, all tenant-scoped via the caller's `tenant_id`):**
  `get_clocked_in_status` · `get_todays_jobs` · `get_pending_approvals` (time-off + completions) ·
  `get_recent_activity` · `get_revenue_snapshot` (admin+) · `get_team_roster`. Each is a thin wrapper
  over `supabaseAdmin` with a hard `tenant_id` filter — the LLM NEVER gets raw SQL or cross-tenant reach.
- **Security invariants (the "won't break / won't leak" guarantees):**
  1. **Tenant isolation:** every tool resolves the caller's tenant server-side; the model cannot pass a
     tenantId. A guardian review treats this like the platform-write invariant.
  2. **Read-only in v1:** NO tool can write/delete. "Approve Adam's time off" → the assistant explains
     how, never does it. Action tools come in a later phase, behind explicit typed confirmation + rank check.
  3. **Role-scoped answers:** revenue/payroll tools require admin+; an operator's Jarvis can't read them.
  4. **Rate limiting + cost ceiling:** per-user/min cap; both the LLM and ElevenLabs cost money — a
     runaway loop must be impossible. Server-enforced.
  5. **No PII in logs;** prompt-injection hardening (the app's data is data, not instructions).
- **Grounding:** the system prompt gives Jarvis its persona (concise, British-butler tone) + the rule
  that it answers ONLY from tool results, never invents numbers.

## 4. The voice pipeline (System C) — the iOS reality

- **Speech OUT (Jarvis's voice):** ElevenLabs TTS. `POST /api/command-center/speak` proxies ElevenLabs
  (key server-side, NEVER in the client), streams audio back; client plays it + feeds the Web Audio
  analyser that drives the HUD pulse. A British male voice id (founder picks in the ElevenLabs library).
- **Speech IN (talking to Jarvis):**
  - **Web/desktop:** Web Speech API (`SpeechRecognition`) — works in Chrome/Edge/Safari-desktop. Free.
  - **iOS app (Capacitor webview): Web Speech does NOT work.** Two real options (DECISION §7):
    (a) **Type-first on iOS for v1**, voice on web only — ships now, no native build.
    (b) **ElevenLabs STT or a native `@capacitor-community/speech-recognition` plugin** → a new App
        Store build (we just submitted v1.0.3; this would be v1.0.4+). Fuller "talk to it" everywhere.
- **Wake phrase ("okay Jarvis"):** real always-listening wake-word needs native; for v1 a tap-to-talk
  mic button (press, speak, release) is the reliable cross-platform path. "Okay Jarvis" can be a typed
  or tapped trigger that plays a greeting.

## 5. Backend data model

- No destructive schema. One optional additive table `command_center_conversations` (tenant_id, user_id,
  transcript jsonb, created_at) IF we want history — v1 can be stateless (no storage) to keep it simple.
- All reads go through existing tables via the tool wrappers; no new business tables.

## 6. Phasing (ship value, never big-bang)

- **Phase 1 — The HUD shell (no AI, no voice):** the Command Center route + button, the animated
  arc-reactor centerpiece, tabs, and the live right rail (clocked-in/alerts/jobs from real data). This
  alone is a "wow" and is 100% safe (read-only UI). Ships first.
- **Phase 2 — The brain (text):** `/assistant` endpoint + tools + a text chat in the HUD. Jarvis answers
  "how's the app doing?" in writing, grounded in live data. Guardian-hardened tenant isolation.
- **Phase 3 — The voice:** ElevenLabs speech-out + the HUD audio-reactive pulse + web speech-in.
  (iOS voice-in per the §7 decision.)
- **Phase 4 — Actions (optional, later):** carefully-gated write tools (approve, create) behind
  confirmations. Separate review.

Each phase is its own build → guardian → verify → push. Phase 1 is buildable immediately once §7 is set.

## 7. DECISIONS NEEDED (these change the build/cost — founder calls)

1. **AI provider key:** OK to use Claude via Vercel AI Gateway (paid per message; founder provisions the
   key)? Roughly cents per conversation. Confirm willingness + a monthly ceiling.
2. **ElevenLabs:** founder creates an ElevenLabs account, picks a British voice, provides the API key
   (paid per character). Confirm.
3. **iOS voice-in:** v1 = voice on web, type on the iPhone app (no new build) — OR invest in native/
   streaming STT now (new App Store build)? Recommendation: **(a) web-voice v1**, native later.
4. **Centerpiece tech:** canvas/SVG audio-reactive HUD (recommended, light) vs. full Three.js 3D (heavier).
5. **Scope of v1 Jarvis:** READ-ONLY status assistant (recommended) — actions deferred to Phase 4.
6. **Build order:** confirm Phase 1 (HUD shell) first — it's the visible "wow", ships safely with zero
   AI/voice cost, and de-risks the layout before we wire the expensive parts.

## 8. What I'll NOT do without sign-off
Spend on AI/voice APIs, add heavy 3D deps, or ship an assistant that can touch data before the tenant-
isolation guardian pass. This doc is the contract; build starts at Phase 1 once §7 is answered.

---

## DECISIONS MADE (Jun 13, 2026)
1. **Phase 1 first** — build the HUD shell (no AI/voice) and confirm the look before wiring paid APIs.
2. **Centerpiece = canvas/SVG audio-reactive** (not Three.js); built to accept a voice-amplitude input in Phase 3.
3. **AI + voice approved**: Claude (via Vercel AI Gateway) for the brain + ElevenLabs for the voice — founder provisions both keys at Phases 2/3, hard cost ceiling enforced server-side.
4. **iOS voice-in = web-voice v1** (type on the iPhone app, no new App Store build); native STT is a later upgrade.
5. v1 Jarvis is **READ-ONLY** (status assistant); write/action tools deferred to Phase 4 behind confirmations.

### Phase 1 scope (BUILDING NOW)
- Route `/dashboard/command-center` (full-screen, super_admin + admin tier; reuses dashboard auth guard).
- Launch button pinned at the bottom of `/dashboard/admin`.
- Arc-reactor canvas centerpiece: concentric rings, idle slow-spin, state machine (idle/listening/
  thinking/speaking) with an `amplitude` prop wired but driven by a stub in Phase 1. Brand palette
  (#7C3AED→#DB2777→#EF4444 on #0d0820), no external deps.
- Left tabs (reuse existing nav targets), right live rail.
- ONE new read-only endpoint `GET /api/command-center/overview` (requireAdmin, tenant-scoped):
  { clockedIn, rosterCount, todaysJobs, pendingApprovals, unreadAlerts }. Reuse existing query
  patterns; fail-soft (any sub-count error → 0, never 500 the whole panel).
- No AI, no voice, no ElevenLabs, no new deps. Read-only. Guardian: tenant isolation on the overview.
