# Playbook — Parallel Burndown (the "10x" engine)

> Stop fixing 2–3 bugs serially. Fan out **independent** backlog items to parallel agents, each
> guardian-reviewed and verified, then approve the diffs and push **once**. This is the native
> Claude Code parallelism Boris Cherny (CC's creator) calls "the single biggest productivity unlock."

## When to use it
- You have **3–6 independent** items (bugs/chores) that touch **non-overlapping files**.
- Each can be described well enough for a builder to do cold (clear acceptance criteria).
- NOT for: deeply coupled changes, one big feature, or anything needing tight back-and-forth — do those interactively.

## The two ways to run it

### A. Direct parallel subagents (default for ≤5 small, independent, different-file items)
Dispatch N `Agent` builders in **one message** (so they run concurrently), each scoped to its own
files, editing the **main working tree** directly (safe because files don't overlap — and localhost
runs from the main repo, per CLAUDE.md). Then run `guardian-review` on the combined diff and
`npm run build` + `tsc` once. Cheapest reliable path; changes land where you can see them.

### B. The `parallel-burndown` Workflow (for bigger batches or risky/overlapping edits)
`Workflow({ scriptPath: ".claude/workflows/parallel-burndown.js", args: [ {id,title,prompt,files}, ... ] })`
Each item runs **worktree-isolated** (no collisions even on shared files) through Build → guardian
Review → production-validator Verify, and the workflow returns a per-item report (status, files,
PASS/BLOCKING, ship-ready). Worktree changes must then be merged back to `main` before they reach
localhost (CLAUDE.md rule) — and `.claude/worktrees/` cleaned up after (it filled the disk once).

## The loop (either way)
1. **Pick** the top N independent items from BACKLOG.md (P0/P1 first). Confirm files don't overlap.
2. **Fan out** builders (A or B).
3. **Review** — guardian-review every change; BLOCKING findings get fixed + re-reviewed. RLS/security
   changes also get `rls-policy-auditor`; new migrations get `supabase-migration-author`.
4. **Verify** — `npm run build` green + `tsc` 0 errors + relevant tests; Playwright MCP for any
   UI/flow change; `mobile-responsive-auditor` for operator-page changes.
5. **Approve** — founder eyeballs the diffs.
6. **Push ONCE** — via the `prod-deploy` gate. Every push to `main` is a billed Vercel build (~$1–2),
   so batch all N into a single push.

## Guardrails (the honest failure modes from the research)
- **Token cost:** multi-agent loops burn ~15× a chat. Keep batches bounded (≤6), subagents return
  *summaries* not file dumps, no unbounded "keep looping until perfect."
- **Hallucinated/runaway tools:** one logged case = a broken tool called 400× in 5 min. Builders get
  scoped tool access + clear stop criteria; the workflow has no infinite loop.
- **Frontend visual correctness still needs human eyes** — Playwright MCP verifies elements/flows
  exist and work (accessibility tree), NOT that a design *looks* right. You approve visuals.
- **Review bandwidth is the new bottleneck** — that's intended: the machine does first-pass review
  (guardian + validator + Playwright), you do final diff approval. Don't skip the approval.

## Budgets — keep them separate
- 🟣 **Vercel build credits** — only spent on `push to main`. Parallel agents do NOT touch this.
- 🔵 **Claude usage** — what parallel sessions/loops burn. This is the cost of "10x"; bound the batch.
