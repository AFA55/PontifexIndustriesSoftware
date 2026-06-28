# How We Build (the Pontifex working model)

> The founder + Claude operating model, distilled from the Jun 27–28 2026 sessions (the IG-videos →
> deep-research → engine cleanup → brand sweep → customer-portal build arc). This is BOTH a guide for the
> founder on how to prompt, AND a reference for future agents on how work happens here. Read with
> `dev-decisions`, `guardian-review`, `prod-deploy`, and `docs/playbooks/PARALLEL_BURNDOWN.md`.

## The mindset: director, not typist
Describe the **outcome** you want; the machine finds → fixes → verifies → reports. Don't dictate files or
line numbers. Proven this arc: "fix the palette leak" found a root cause across ~305 files; "test it live"
caught + fixed a prod 500; "build the portal" discovered it was 70% built and filled the gaps. The founder
never named a file.

## The 3 layers (+ speed) that make it work
1. **Context** — the files Claude reads first: `CLAUDE.md` (the rules), `BACKLOG.md` (single source of
   truth), `CLAUDE_HANDOFF.md` (where we are), `.claude/skills/*`, auto-memory. This is our "folder system"
   — and it's why every build respects white-label + tenant isolation + cost discipline automatically.
2. **The loop** — build → **review** (guardian-review, an independent skeptic agent) → **verify** (build/tsc
   + browser) → **fix** → repeat until clean. This is what makes "done" actually mean done. It has caught,
   this arc: an invisible comment thread (wrong data shape), blue-on-red contrast, and a prod 500 whose
   first fix didn't work (the loop kept going to 200). "It compiled" would have missed all three.
3. **Browser eyes (Playwright / preview / Chrome MCP)** — Claude opens the *real running app*, clicks, and
   reads what actually rendered, instead of guessing. Used this arc to find the office-documents 500 and
   confirm the fix returned 200 live. Flavors: Playwright/preview (fresh automated browser, CI), Chrome MCP
   (drives the founder's logged-in browser), preview tools (dev server). All = "verify by looking."
4. **Parallel agents** — many loops at once (the `parallel-burndown` engine). Batch independent work →
   concurrent builders → guardian each → diffs back. ~5 fixes in the time 2 used to take.

## Prompt patterns that get the most out of this setup
1. **Batch, don't drip.** Dump all findings in one message → triggers parallel-burndown.
   `"Tested for an hour, here's everything: 1)… 2)… 3)… burn these down."`
2. **Outcome + acceptance criteria, not steps.**
   `"When an operator clocks in late, the admin should get a bell notification AND it shows on the late page. Make that true."`
3. **Ask Claude to close the loop.** `"Fix it and prove it works live."` → Claude verifies in the browser.
4. **Front-load context once, then step back.** Full picture in one message; don't feed it line by line.
5. **For decisions, ask for the honest table.** `"What are my options for X — tradeoffs?"` → `dev-decisions`
   (real options w/ cost, time, reversibility + a recommendation; never one hand-wavy route).

## Magic phrases (they flip the machine on)
| Say | Triggers |
|---|---|
| "burn these down" / "in parallel" | parallel agents, batched |
| "test it live and prove it" | the Playwright/preview verify-loop |
| "what are my options" | dev-decisions honest table |
| "pick up the next backlog item" | works `BACKLOG.md` top-down |
| "guardian-review this" | the adversarial review gate |
| "push it" | authorizes a deploy (the ONE cost word — Claude holds all other deploys) |

## How to report bugs/findings (fastest format)
Per item: **what you did → what you expected → what happened → which screen.** Batch many in one message.
> "On the schedule board I duplicated a job; expected the copy unassigned, but it kept the operator. — schedule board, EditJobPanel."

## Session rhythm
- **Start:** "read the handoff, what's next?" → Claude resumes exactly where we left off.
- **During:** work `BACKLOG.md` top-down (P0 first) unless reprioritized; each feature → build → guardian →
  verify → check off.
- **End:** Claude updates `CLAUDE_HANDOFF.md` + BACKLOG so the next session is warm; push once if authorized.

## Why this is the right way to *customize* the software
Because the **context layer enforces white-label + tenant-scoped RLS**, every feature is built for ANY
company code out of the box (their brand colors via the `brand` tokens, their data via `tenant_id` + RLS) —
not hardcoded for Patriot. The process bakes customization in: onboard the next company and it just works
with their brand. See the brand-token system (`tailwind.config.js` `brand`/`brand-secondary`/`brand-accent`
← `tenant_branding`) and the SECURITY DEFINER RLS helpers.

## Non-negotiables the process always honors
- **Revenue-first focus** — finish the thing closest to money (currently: ship Patriot) before new scope.
  New ideas → `BACKLOG.md` / strategy doc, not new projects. (`docs/plans/PONTIFEX_STRATEGY_AND_ROADMAP.md`)
- **Cost discipline** — every push to `main` is a billed Vercel build; batch commits, push once per session,
  only after the verify gate, only on "push it."
- **Security on customer-facing / new tables** — `rls-policy-auditor` + `guardian-review`; tenant scope via
  SECURITY DEFINER helpers, never `auth.jwt()->user_metadata`; public reads via `supabaseAdmin` with field
  whitelists; untrusted text rendered escaped.
- **Nothing autonomous touches prod unsupervised** (the agent-safety line; why ruflo was removed).

## What this replaced
We deleted the dormant ruflo/claude-flow "swarm" (a second orchestration framework that was never invoked)
in favor of native Claude Code: Workflow + worktree subagents + skills + this loop. One orchestrator, one
indexer, one date lib — see `docs/TOOLING_EVALUATION.md` (incl. the Hermes/Fugu/IG-tool verdicts).
