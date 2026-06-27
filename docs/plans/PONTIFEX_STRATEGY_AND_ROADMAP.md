# Pontifex Industries — Founder Strategy & Roadmap

> Captured Jun 27, 2026 from the founder's vision brain-dump. This is the goals + long-term ideas +
> recommended course of action. It is the **focus document** — when a new idea appears, it goes in the
> "Idea Backlog" here; it does NOT interrupt the current phase. Revisit at the start of each phase.

## North Star (the one thing)
**Get to revenue.** Months of build + monthly spend (Vercel deploys, Claude, Supabase) with $0 in.
The single fastest, most certain path to the first dollar is: **finish Patriot Concrete Cutting →
they pay for the custom solution → make the LinkedIn proof video → recognition → more clients.**
Everything else is measured against "does this get Patriot paying sooner?" If not, it waits.

## The honest read (why focus beats more ideas)
The founder has many strong ideas (below). The risk is not lack of ideas — it's **scope creep**
starving the one idea that's closest to money. Pattern this session: lots of new tools/ideas
(Fugu, Hermes, ruflo, clip-agents, website-builders) — most are real, few fit the current goal.
**Discipline = finish Patriot first.** Building Patriot well also produces the reusable foundation
every other app needs, so focus is not a detour — it's the on-ramp to all the other ideas.

## Critical architecture clarity (fixes a costly misconception)
"Different app = different company code" is **NOT** how it works, and believing it will cause pain.
- **Company code = a TENANT of ONE app.** Patriot, and future construction companies, are tenants
  of the **construction-ops SaaS** (one codebase, multi-tenant by `tenant_id`).
- **A math tutor / clip creator / website generator are DIFFERENT PRODUCTS**, not tenants. They are
  separate apps with their own data models and markets.
- **The right model — Pontifex Industries = a software STUDIO with a shared foundation:**
  - *Shared foundation* ("the platform kit"): auth, multi-tenancy, billing, the brand-token system,
    RLS helpers, the CLAUDE.md/docs/skills context spine, the parallel build engine. Build once, reuse.
  - *Product #1*: construction-ops SaaS (Patriot = tenant #1; future construction cos = more tenants).
  - *Product #2..N*: separate apps (job-post generator, clip creator, website builder, math tutor) —
    each built FAST because they inherit the shared foundation, NOT crammed into one codebase.

## Phased roadmap (revenue-first, each phase unlocks the next)

### Phase 1 — SHIP PATRIOT (now → first revenue) ★ the only current priority
Definition of done = Patriot runs start-to-finish for real daily use and they'll pay.
- Finish time management (the "simple" one that grew) + fix the **schedule board** (known remaining work).
- Resolve the remaining broken/rough flows so the core loop works end-to-end (clock in/out → schedule →
  jobs → timecards → payroll-ready).
- Verify on real Patriot usage; tighten anything that breaks.
- **Outcome:** Patriot live → invoice Patriot → LinkedIn launch video ("custom AI-built software for a
  real construction company").

### Phase 2 — Artifex in Patriot + harden the foundation (right after launch)
- Integrate **Artifex** (the in-app "Jarvis" assistant) into Patriot — both for Patriot's value AND as
  the showcase: "smart agents for service businesses, proprietary data, custom solutions." Needs the
  founder's AI-Gateway greenlight + budget (already planned in ARTIFEX_PLAN.md).
- Extract the **reusable Pontifex starter template** from the Patriot codebase (the shared foundation
  above) so the next app/tenant starts ~60–70% done. This is the real "faster way to deploy a company
  dashboard" the founder wants.

### Phase 3 — Second customer or second product (revenue compounding)
- Either: onboard a 2nd construction tenant (fastest — same product, new company code), OR
- Build the first SEPARATE product that has a clear buyer (see Idea Backlog) on the starter template.
- Decide based on which has a paying customer lined up.

### Phase 4 — The app studio (the big vision, earned later)
- Pontifex builds tailored apps + AI automations for businesses (matches the landing-page positioning).
- A "mission control" surface to launch/monitor builds (see Tooling). Only after the foundation +
  1–2 paying products prove the model.

## Idea Backlog (captured so nothing is lost — PARKED until its phase)
Honest note on each: real ≠ now. Recorded; not started until Patriot ships + a clear buyer exists.
- **Job-post generator** (like "Hireline" — founder pays for it; it asks questions → auto-creates hiring
  ads, likely agent-automated). Offer as a service. *Good Phase 3 candidate — clear B2B value, founder
  has a reference product to study.* (TODO: analyze Hireline via the founder's logged-in browser.)
- **Website generator** (input company pics + idea → full multi-section site). Crowded market (many
  AI site builders exist) — differentiate or skip. Phase 3+.
- **Viral clip creator agent** (auto-clips videos, learns what goes viral, posts, reads performance,
  improves). Revenue via pay-per-view pages. *This is the ONE idea where an autonomous always-on agent
  like Hermes genuinely fits* — see Tooling. Personal/side, not the studio.
- **Kids' math + writing tutor app** (for his daughter). Lovely, low-stakes; a fun "learn the stack on
  a fresh app" project — NOT a revenue priority. Could be the first test of the starter template.
- **Cable-management service business** (non-software; "no one's doing it"). Honest: this competes
  directly with dev time and is the furthest from the software flywheel. **Park it** unless it becomes
  a deliberate separate bet — don't let it bleed dev hours during Phase 1.

## Tooling verdicts (for development + the vision)
- **Claude Code + the parallel engine** = the build stack. Don't replace. (Details: TOOLING_EVALUATION.md.)
- **Perplexity** (founder just subscribed) = a **research/answer copilot**, NOT a build/deploy tool. Best
  use: the founder runs market research + specs + competitor digging (e.g. "what does Hireline do") in
  Perplexity *while Claude builds* — killing the "dead time" bottleneck. Has a Sonar API if ever wanted
  as a product feature. Complements; doesn't replace Claude Code.
- **Hermes** (Nous Research, self-hosted autonomous agent) = NOT for building Patriot or any product's
  core (Claude Code wins). Genuinely good for **autonomous, always-on, personal automation** — which is
  exactly the **viral-clip-agent** idea (clip → post → learn → repeat) and personal ops (deploy-watch,
  daily summaries via Telegram). **Keep it OFF the production repo/DB.** Be "ahead of it" by understanding
  it; adopt only as a personal/side automation engine, never in the critical path or near prod data.
- **Conductor** = off-the-shelf GUI to run parallel Claude Code agents (the "dashboard instead of
  terminal" feel). Try before building any custom build-dashboard.

## The "no more dead time" working model (the founder's biggest bottleneck)
Dead time = founder waiting on one Claude task, unable to develop. Fix:
1. **Batch + parallelize:** founder hands a batch of well-specified independent tasks; Claude runs them
   concurrently via `parallel-burndown` (4 builders at once) → founder reviews diffs in bulk, not 1-by-1.
2. **Two tracks:** while Claude builds, the founder uses **Perplexity** (or a 2nd Claude session) to
   research/spec the NEXT batch, validate an idea, or review — so his time is never idle.
3. **Director, not typist:** founder describes outcomes + approves; the engine does labor + first-pass QA.

## Operating rules (guardrails against the failure mode)
1. **One product to revenue before starting the next.** Finish Patriot before any new app.
2. **New idea → Idea Backlog here, not a new project.** Capture, don't chase.
3. **Tenants ≠ apps.** Company codes are tenants of one product; new products are separate, on the
   shared foundation.
4. **Cost discipline holds** (one push/session; watch Claude + Vercel + Supabase spend) — revenue is the
   point, so don't burn the runway on parallel experiments before Patriot pays.
5. **Nothing autonomous touches prod** (the Hermes/agent safety line).

## Open questions for the founder (shape Phase 1)
- What is the exact remaining checklist to call Patriot "live + paying"? (schedule board fix, time-mgmt
  finish, anything else broken). Let's lock the launch definition.
- Is there an actual agreement/expectation that Patriot pays on delivery, and a target date? That date
  drives everything.
