# ARTIFEX — the live agentic AI inside Pontifex (master plan + progress tracker)

> **Artifex** is the Pontifex platform's in-app AI agent: a *live*, voice-driven, Claude-powered
> assistant with scoped access to a company's entire dataset (jobs, schedule, timecards, customers,
> invoicing, equipment, team) that can **answer questions, pull/generate reports, run real analysis,
> and take actions** — and is sold as a **per-tenant add-on** to other companies.
> Founder's bar: "a TRUE Jarvis feel — not static, real live, makes analysis and makes things happen."

**Status:** PLANNING / Phase 1 shipped. **Deep-research DONE** (`wf_54908403-68e` 113 agents + focused follow-up Jun 20, 45+ primary sources) — all verified findings are in §Verified below.

**Reference the founder gave:** Fable 5 OS by chase.h.ai (Instagram) — a Claude-Code-based personal "Jarvis": voice command word, V.A.U.L.T. memory/token system, a skills marketplace, agentic. It's a *developer's* Claude wrapper, not a SaaS feature — Artifex takes that **live voice-agent feel** and grounds it in our multi-tenant business data as a productized, multi-company add-on.

---

## Architecture (source of truth)
The detailed 3-system design + security invariants already live in **`docs/plans/JARVIS_COMMAND_CENTER_PLAN.md`** — do NOT duplicate it; extend it. In short:
- **System A — the HUD** (`/dashboard/command-center`, `ArcReactor` canvas that pulses to audio). ✅ Phase-1 shell shipped (commit `88efd8d`).
- **System B — the brain:** `POST /api/command-center/assistant` (requireAuth, tenant-scoped), Claude with **tool-calling** over a curated, **read-only-first** tool set; every tool resolves the caller's `tenant_id` server-side and respects the caller's role. The model never sees raw SQL or another tenant.
- **System C — voice:** ElevenLabs TTS out (server-proxied, streamed, drives the HUD pulse) + speech-in (Web Speech on web; iOS v2 via `@capgo/capacitor-speech-recognition` + ElevenLabs STT REST API → build; v1 = type).

---

## Non-negotiable security invariants

1. **Tenant isolation per tool call** — the model cannot pass a tenantId; every tool filters by the caller's server-resolved tenant. Guardian-review this like the platform-write invariant.
2. **Never exceeds the asking user's permissions** — role-scoped tools (operator's Artifex can't read payroll/revenue).
3. **Read-only until Phase 4** — write/action tools come later, behind typed confirmation + rank check + audit.
4. **Cost ceiling + rate limit** server-enforced (Claude + ElevenLabs both cost per call; no runaway loop).
5. **Prompt-injection hardening** — ALL untrusted content (customer notes, job descriptions, free-text) is delivered to Claude ONLY inside `tool_result` blocks — never in the system prompt or plain user text. Least privilege so a successful injection does minimal damage.
6. **The agent is NEVER the gatekeeper (OWASP LLM06)** — authorization enforced downstream by Supabase RLS. Tool calls use a per-request Supabase client carrying the caller's JWT (`createServerClient` with user's `access_token`), NOT `supabaseAdmin`. The DB enforces tenant + role; a manual `tenant_id` filter in application code is defense-in-depth, not the primary gate.

---

## Verified architecture & security (deep-research — all primary-source verified Jun 20, 2026)

### AI provider & streaming (VERIFIED)
- **Vercel AI SDK `streamText`** with `tools` parameter is the exact pattern for streaming tool-use in a Next.js 15 App Router route handler. Events: `tool-call`, `tool-call-streaming-start`, `tool-call-delta`, `tool-result`, `text-stream`.
- **`maxSteps`** limits agentic loop iterations (default 1; set 3–5 for Artifex). Without it, `streamText` does ONE request only — tools execute but the loop doesn't repeat.
- **`onFinish` callback** receives `usage` (`inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`) — use this to log to `ai_usage` table.
- **Vercel AI Gateway:** import `gateway` from `@ai-sdk/vercel-ai-gateway`; model string `anthropic/claude-haiku-4-5-20251001`. Streams identically to direct Anthropic SDK. Gateway adds observability + fallbacks.
- **`experimental_prepareRequestBody` is REMOVED** in AI SDK v5.x. Do not use.

### Model selection (VERIFIED — cost-critical)
- Use **Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)** for Artifex interactive chat:
  - **80–120 tok/s** (4–5× faster than Sonnet — speed IS the UX differentiator for a live assistant)
  - **$1/M input · $5/M output** (vs Sonnet $3/$15 → 5× cheaper)
  - Tool-use quality is excellent for business logic
- Use Sonnet 4.6 only for deep analysis tasks where Haiku falls short (Phase 4+).
- **Estimated cost per 5-turn conversation with tool use:** ~$0.02 (Haiku) vs ~$0.10 (Sonnet) after prompt-cache warm.

### Prompt caching (VERIFIED — 90% savings on repeated calls)
- Set `cache_control: {"type": "ephemeral"}` on the system prompt block and tool definition block.
- **Cache read = 0.1× of base input price** (90% discount). Cache write = 1.25× (first request). Breakeven: 2–3 requests.
- Minimum cacheable prefix: 1,024 tokens (well within our system prompt + 6 tool definitions).
- Verify via `usage.cacheReadInputTokens > 0` in the `onFinish` callback.

### Tool design (VERIFIED)
- **Keep the tool set small and high-signal.** Tool-selection accuracy degrades noticeably past ~15 tools; keep v1 Artifex to 6–8 curated tools. No generic `execute_sql`.
- **`strict:true` JSON schemas** via Zod — structural validation only; still server-validate values/business rules.
- Allowlist the permitted table/function names in BOTH the system prompt and the backend tool implementations.
- **Parallel tool calls** are enabled by default — Claude may call multiple tools in one turn. Fine for read-only; disable for ordered writes: `tool_choice: {"disable_parallel_tool_use": true}`.

### Security — the load-bearing decision (VERIFIED, OWASP LLM06)
- **Do NOT build tools on `supabaseAdmin`** (service-role bypasses all RLS). Artifex tool calls run in the asking user's authorization context:
  ```ts
  // in every tool implementation:
  const supabase = createServerClient(url, anonKey, {
    auth: { persistSession: false }
  });
  await supabase.auth.setSession({ access_token: callerJwt, refresh_token: '' });
  // Now DB enforces tenant + role via RLS; tenant_id filter is defense-in-depth
  ```
- **Supabase footguns:** views bypass RLS unless `security_invoker=true`; never `auth.jwt() -> user_metadata` in RLS (user-writable — use SECURITY DEFINER helpers off `public.profiles`).
- **Prompt injection:** untrusted content in `tool_result` blocks is necessary but not sufficient. Also: scan input for injection patterns; delimit external data (`--- BEGIN DATA ---`); keep least privilege so a successful injection does minimal damage.
- **LLM09 (Misinformation):** system prompt must say "answer ONLY from tool results; if a tool doesn't return the fact, say 'I don't have that information' — never invent numbers, dates, or names."

### ElevenLabs voice pipeline (VERIFIED)
- **Use Turbo v2.5** for real-time chat: ~250–300ms to first byte, $0.05/1K chars (vs Multilingual v2: 800–1000ms, $0.10/1K — 3× slower, 2× more expensive).
- **Proxy TTS through `/api/command-center/speak`** — never expose the API key to the client bundle.
- **CRITICAL — buffer Claude's full response BEFORE sending to ElevenLabs TTS.** Streaming text mid-generation to ElevenLabs causes jarring mid-sentence audio pauses. Wait for `onFinish`, then send the complete text.
- **Audio-reactive HUD:** Play via Web Audio API, attach `AnalyserNode`, call `getByteFrequencyData()` on each `requestAnimationFrame` → pipe amplitude to `ArcReactor`'s `amplitude` prop (already wired in Phase 1).
- **ElevenLabs STT (Scribe v2)** can be used standalone — send audio bytes to `/v1/speech-to-text`, receive transcript, POST to our `/assistant` endpoint. No ElevenLabs LLM needed.
- **Barge-in** is supported in Conversational AI SDK but tuning is opaque; Phase 3 can enable it.

### iOS voice input (VERIFIED)
- **Web Speech API does NOT work** in iOS Capacitor WKWebView — confirmed; type-first on iOS v1 is the correct call.
- **iOS v2 voice input:** `@capgo/capacitor-speech-recognition` (NPM `@capgo/capacitor-speech-recognition`, v8.1.3, actively maintained Jun 2026 — prefer this over the community fork) → on-device transcription → POST text to `/assistant`. OR: capture audio → POST to ElevenLabs Scribe v2 STT → POST transcript.
- **Info.plist keys required:** `NSSpeechRecognitionUsageDescription` + `NSMicrophoneUsageDescription`.
- Both paths need a new App Store build (native plugin); defer to v1.0.5+.

### Per-tenant cost metering (VERIFIED)
- `ai_usage` table: `id, tenant_id, user_id, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd, created_at`.
- Capture in the Vercel AI SDK `onFinish` callback (usage is always available there, even with streaming).
- Vercel AI Gateway also tracks cost per-request in its dashboard (`GET /v1/generation`).
- Rate limit: per-user/min cap enforced in the route handler before calling Claude. A hardcoded `MAX_MESSAGES_PER_MINUTE = 10` is sufficient for v1.

### "Alive / proactive" feel — verified UX patterns
- **Streaming responses** (character-by-character, not batch) — single biggest perceived-quality improvement.
- **Tool execution feedback in UI:** show "🔍 Searching timecards…", "📋 Loading jobs…" while tools execute.
- **Sub-2s first-token latency** — Haiku + prompt caching makes this achievable.
- **Proactive insights (the "Jarvis anticipates you" pattern):** nightly cron job queries tenant data → Claude summarizes anomalies/highlights → stored in `ai_insights` table → fetched at chat init and injected into system context. User opens Artifex and it says "Good morning — 3 jobs are scheduled today and Adam clocked in late" without being asked.
- **Cross-session memory:** within-session = full message history in context window; cross-session = summary of prior turns stored in DB + retrieved at session start. Observational memory (summary) outperforms raw RAG for B2B SaaS context (84% vs 80% accuracy at 10× lower token cost per 2026 benchmarks).

### Vercel + Next.js gotchas (VERIFIED)
- **`export const dynamic = 'force-dynamic'`** required on the `/assistant` route (cache headers interfere with streaming).
- **Vercel Free/Pro: 10s function timeout.** A 5-step agentic loop with tool execution can approach this. Monitor; move to async queue (Vercel Workflow) if needed.
- **Cold starts add 200–500ms** — first request is noticeably slower. Pre-warm via a cron ping if needed.
- **`max_tokens` must be ≥ 2048** for tool-heavy tasks or responses truncate mid-stream. Monitor `stop_reason: "max_tokens"` in logs.

---

## Open decisions (from JARVIS plan §7 — founder calls)

- [x] Claude via Vercel AI Gateway — approved Jun 13.
- [x] ElevenLabs — approved Jun 13; founder provisions key.
- [x] iOS voice-in = type-first for v1 — approved Jun 13.
- [x] Centerpiece = canvas (shipped) — approved Jun 13.
- [ ] **Model tier for Phase 2:** Haiku 4.5 recommended (speed + cost); founder confirms.
- [ ] **Monthly $ ceiling** for Claude + ElevenLabs (enforce server-side). Founder sets number.
- [ ] **ElevenLabs voice ID** — founder picks a British male voice in the ElevenLabs library.
- [ ] **Cross-session memory in Phase 2?** Stateless (simpler) vs summary store (more Jarvis-like). Recommendation: stateless for Phase 2, add summary store in Phase 3.

---

## Phases (progress tracker — keep this current)

- [x] **Phase 1 — HUD shell** (route, ArcReactor, tabs, live right rail from real data; no AI/voice). Shipped `88efd8d`. Guardian PASS.
- [ ] **Phase 2 — The brain (text):** `POST /api/command-center/assistant` + read-only tenant-scoped tools + text chat in HUD. Haiku 4.5 + prompt caching + streaming. Guardian-hardened isolation. ← **next build**
- [ ] **Phase 3 — Voice:** ElevenLabs Turbo v2.5 TTS (server-proxied, buffered) + audio-reactive HUD + Web Speech on web. iOS voice = separate build (v1.0.5+).
- [ ] **Phase 4 — Actions:** carefully-gated write tools (approve time-off, create job, update status) behind typed confirmation + rank check + audit. Separate guardian review.
- [ ] **Phase 5 — "Alive" + productization:** proactive cron insights, cross-session memory, per-tenant usage metering + add-on billing toggle per tenant, model-tier/caching cost control.

Each phase: build → guardian-review → verify end-to-end → (hold push until founder says). No big-bang.

---

## Phase 2 — exact build spec

### Endpoint: `POST /api/command-center/assistant`
- Auth: `requireAuth` → role in `COMMAND_CENTER_ROLES`; tenant resolved server-side.
- Provider: `gateway('anthropic/claude-haiku-4-5-20251001')` from `@ai-sdk/vercel-ai-gateway`.
- `streamText({ model, system, messages, tools, maxSteps: 5, onFinish: logUsage })`.
- System prompt (cacheable): Artifex persona + British-butler tone + grounding rule + tenant context.
- Response: `result.toDataStreamResponse()` → client streams via Vercel AI SDK `useChat`.

### Tools v1 (read-only, RLS-enforced, role-scoped)
| Tool | Returns | Role required |
|---|---|---|
| `get_clocked_in_status` | who's clocked in now, count vs roster | any COMMAND_CENTER role |
| `get_todays_jobs` | job orders scheduled today w/ status | any |
| `get_pending_approvals` | pending time-off + completion requests | any |
| `get_team_roster` | active operator/apprentice list | any |
| `get_recent_activity` | last 10 timecard events | any |
| `get_revenue_snapshot` | MTD/YTD invoice totals | admin+ only |

Each tool: (1) receives caller `jwt` injected by the route handler, (2) creates RLS-enforced client, (3) queries within tenant, (4) returns minimal high-signal JSON (no raw SQL visible to model).

### Chat UI in HUD
- Add a chat panel to `app/dashboard/command-center/page.tsx` (or a dedicated drawer/tab).
- `useChat({ api: '/api/command-center/assistant' })` — handles streaming, tool-call feedback, multi-turn.
- Show tool execution states: "🔍 Checking timecards…" while `status === 'in_progress'`.
- Stream text character-by-character into the HUD.

### Database additions (additive migrations)
- `ai_usage` table (tenant_id, user_id, model, input/output/cache tokens, cost_usd, created_at) + RLS.
- Phase 2 = stateless (no `chat_messages` storage) — add in Phase 3/5 if cross-session memory needed.

---

## Progress log

- **Jun 21, 2026** — Artifex plan v1 created; deep-research round 1 launched (`wf_54908403-68e`, 113 agents): verified agentic architecture + security model. Executive onboarding brief for a dedicated builder agent written (`ARTIFEX_AGENT_BRIEF.md`). ElevenLabs setup: founder handling in their own Claude terminal.
- **Jun 20, 2026** — Deep-research round 2 (45+ primary sources): voice pipeline, cost metering, RAG, copilot teardowns all verified. Plan updated with full verified findings. ARTIFEX_AGENT_BRIEF.md rewritten as paste-ready builder brief. Phase 2 build spec finalized. Phase 2 not yet started.
