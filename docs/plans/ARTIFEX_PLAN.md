# ARTIFEX — the live agentic AI inside Pontifex (master plan + progress tracker)

> **Artifex** is the Pontifex platform's in-app AI agent: a *live*, voice-driven, Claude-powered
> assistant with scoped access to a company's entire dataset (jobs, schedule, timecards, customers,
> invoicing, equipment, team) that can **answer questions, pull/generate reports, run real analysis,
> and take actions** — and is sold as a **per-tenant add-on** to other companies.
> Founder's bar: "a TRUE Jarvis feel — not static, real live, makes analysis and makes things happen."

**Status:** PLANNING / Phase 1 shipped. **Deep-research DONE** (`wf_54908403-68e`, 113 agents) — verified findings on agentic architecture + security are in §Verified below. The research did NOT fully cover voice / cost-metering / RAG specifics / copilot teardowns → those need a focused follow-up pass (voice + phasing are already covered in the JARVIS plan).

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

## Verified architecture & security (deep-research, primary sources — all 3-0 verified)
**Agentic core**
- Build on **Claude tool use** (client tools execute in our app: `stop_reason:'tool_use'` → run → return `tool_result`; loop until done), optionally orchestrated by the **Claude Agent SDK** (same loop as Claude Code, no CLI). This loop = "agentic, not a static chatbot."
- **Design tools FOR the agent, not as APIs:** `strict:true` JSON schemas; keep a **FEW high-signal, consolidated tools** — tool-selection accuracy *collapses* as the set grows (benchmarks 43%→<14%). Prefer `get_customer_context` / `search_jobs` over many `list_*` dumps; just-in-time loading; return the smallest high-signal token set.
- **NO generic `execute_sql` tool.** Scoped custom tools = parameterized RPCs/views with the tenant/role filter set OUTSIDE the agent; allowlist the functions/tables in BOTH the system prompt and the backend. (`strict:true` is structural only — still server-validate values/business rules.)

**Security — the load-bearing decision (OWASP LLM06 Excessive Agency)**
- **The agent is NEVER the gatekeeper.** Authorization is enforced **downstream in Supabase** (RLS + SECURITY DEFINER helpers + least-privilege Postgres roles) — "complete mediation." Every tool runs in the **asking user's authorization context** with minimum privileges.
- **Do NOT use a generic high-privileged (service-role) identity that can reach all tenants.** ⚠️ This differs from our current `supabaseAdmin`-everywhere pattern: Artifex's data tools should execute **RLS-enforced** (per-request client with the user's JWT, or `security_invoker=true` RPCs/views) so the DB is the gatekeeper, not a manual `tenant_id` filter the agent could be tricked around. Defense-in-depth: a dedicated minimal DB role for the agent.
- **Supabase footguns to avoid:** views bypass RLS unless `security_invoker=true`; never `user_metadata` for authz (user-editable → `app_metadata`/helpers); never expose service_role to the client.
- **Prompt-injection:** deliver ALL untrusted content (customer notes, emails, OCR, tool outputs) to Claude ONLY inside `tool_result` blocks — never in the system prompt or plain user text. Least privilege so a successful injection does minimal damage. (This is one layer, not a complete defense.)
- **Actions (Phase 4):** gate via the Agent SDK permission system — `allowed_tools` (auto-approve) / `disallowed_tools` (block) / `permission_mode` (uncovered), command-level scoping, **PreToolUse hooks** that intercept/modify/block before execution, MCP `allowedTools` allowlist. Destructive ops require explicit typed confirmation + rank check + audit. NOTE: a *pure* action-selector can't do read-heavy report Q&A (it blocks tool outputs feeding back) → use the **hybrid** (read tools feed the model; write tools gated).

**Still to research (focused follow-up):** the voice pipeline (ElevenLabs Conversational AI vs roll-your-own, STT, barge-in, latency), per-tenant cost metering/billing + Claude tier selection + prompt-caching savings, RAG specifics (chunking/embedding/citation format) for notes vs live metrics, and real B2B copilot teardowns (Sierra/Glean/Fin/Agentforce/Copilot).

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
