# ARTIFEX — the live agentic AI inside Pontifex (master plan + progress tracker)

> **Artifex** is the Pontifex platform's in-app AI agent: a *live*, voice-driven, Claude-powered
> assistant with scoped access to a company's entire dataset (jobs, schedule, timecards, customers,
> invoicing, equipment, team) that can **answer questions, pull/generate reports, run real analysis,
> and take actions** — and is sold as a **per-tenant add-on** to other companies.
> Founder's bar: "a TRUE Jarvis feel — not static, real live, makes analysis and makes things happen."

**Status:** PLANNING / Phase 1 shipped. **Deep-research in flight** (`wf_54908403-68e`, launched Jun 21) — its verified 2026 architecture (agentic tool-use, data grounding, the security model, the voice pipeline, productization, phasing) will be folded into §Architecture + the phase specs when it lands.

**Reference the founder gave:** "Fable 5 OS" by chase.h.ai (Instagram) — a Claude-Code-based personal "Jarvis": voice command word, V.A.U.L.T. memory/token system, a skills marketplace, agentic. It's a *developer's* Claude wrapper, not a SaaS feature — Artifex takes that **live voice-agent feel** and grounds it in our multi-tenant business data as a productized feature.

---

## Architecture (source of truth)
The detailed 3-system design + security invariants already live in **`docs/plans/JARVIS_COMMAND_CENTER_PLAN.md`** — do NOT duplicate it; extend it. In short:
- **System A — the HUD** (`/dashboard/command-center`, `ArcReactor` canvas that pulses to audio). ✅ Phase-1 shell shipped (commit `88efd8d`).
- **System B — the brain:** `POST /api/command-center/assistant` (requireAuth, tenant-scoped), Claude with **tool-calling** over a curated, **read-only-first** tool set; every tool resolves the caller's `tenant_id` server-side and respects the caller's role. The model never sees raw SQL or another tenant.
- **System C — voice:** ElevenLabs TTS out (server-proxied, streamed, drives the HUD pulse) + speech-in (Web Speech on web; iOS needs a native plugin or ElevenLabs STT → a build).

The deep-research will harden this with verified specifics (Anthropic tool-use/Agent SDK/MCP/prompt-caching, ElevenLabs Conversational AI, pgvector grounding, OWASP LLM prompt-injection defense, per-tenant cost metering). Cross-check every decision against the **`dev-decisions`** skill (§11: tenant isolation, RLS, secrets, the read-path/write-path rule).

## Non-negotiable security invariants (an AI with company-wide data access)
1. **Tenant isolation per tool call** — the model cannot pass a tenantId; every tool filters by the caller's server-resolved tenant. Guardian-review this like the platform-write invariant.
2. **Never exceeds the asking user's permissions** — role-scoped tools (operator's Artifex can't read payroll/revenue).
3. **Read-only until Phase 4** — write/action tools come later, behind typed confirmation + rank check + audit.
4. **Cost ceiling + rate limit** server-enforced (Claude + ElevenLabs both cost per call; no runaway loop).
5. **Prompt-injection hardening** — company data is data, not instructions; answer ONLY from tool results, cite provenance, never invent numbers. No secrets/PII in logs.

## Phases (progress tracker — keep this current)
- [x] **Phase 1 — HUD shell** (route, ArcReactor, tabs, live right rail from real data; no AI/voice). Shipped `88efd8d`.
- [ ] **Phase 2 — The brain (text):** `/assistant` endpoint + read-only tenant-scoped tools + text chat in the HUD. Grounded answers. Guardian-hardened isolation. ← **next build**
- [ ] **Phase 3 — Voice:** ElevenLabs speech-out + audio-reactive HUD + web speech-in (iOS voice-in per the §7 decision).
- [ ] **Phase 4 — Actions:** carefully-gated write tools (approve/create/edit) behind confirmation + rank check + audit. Separate review.
- [ ] **Phase 5 — "Alive" + productization:** proactive insights/alerts, report generation, per-tenant usage metering + add-on billing, model-tier/caching cost control, an enable/disable toggle per tenant.

Each phase: build → guardian-review → verify end-to-end → (hold push until founder says). No big-bang.

## Open decisions (from JARVIS plan §7 — founder calls)
- Claude via **Vercel AI Gateway** (`"anthropic/claude-…"`, one key + observability + fallbacks) vs Anthropic SDK direct. *(Leaning Gateway.)*
- Voice-in on iOS: type-first v1 (no build) vs native STT plugin / ElevenLabs STT (needs a build).
- ElevenLabs **Conversational AI agent** (managed STT+LLM+TTS loop) vs rolling our own pipeline.
- HUD: canvas (shipped) vs React-Three-Fiber upgrade.

## Progress log
- **Jun 21, 2026** — Artifex plan created; deep-research launched (`wf_54908403-68e`); executive onboarding brief for a dedicated builder agent written (`ARTIFEX_AGENT_BRIEF.md`). ElevenLabs setup: founder handling in their own Claude terminal. Phase 2 not started.
