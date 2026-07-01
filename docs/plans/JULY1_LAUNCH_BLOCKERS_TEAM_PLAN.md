# Jul 1, 2026 — Launch-Blockers Team Plan

Standing plan for burning down the real, live issues surfaced by the Jun 30 director-level audit
(6 parallel agents: docs/positioning, codebase architecture, DB/RLS, backlog hygiene, test/CI,
mobile) plus the two founder-reported external blockers (Twilio, Google Play). Executed as a team
of worktree-isolated builders + a dedicated implementation-fidelity reviewer, per the founder's
explicit "create the team, work in parallel, have someone review implementation" directive.

## The team

| Role | Agent type | Job |
|---|---|---|
| **Builder — Positioning Scrub** | general-purpose, `isolation: worktree` | Remove "concrete cutting" from the LIVE website + Stripe checkout (the store-listing fix didn't reach these — see [[pontifex-positioning-noncompete]]) |
| **Builder — Hooks Bug Fix** | general-purpose, `isolation: worktree` | Fix the conditional React-hooks violation in `app/dashboard/admin/settings/page.tsx` (live production bug) |
| **Builder — CI Health** | general-purpose, `isolation: worktree` | Get GitHub Actions CI green again (currently red on lint for 30+ pushes, build never runs) |
| **Builder — Storage RLS Lockdown** | supabase-migration-author | Deny anonymous file-LISTING on the 5 public buckets (`avatars`, `job-photos`, `jobsite-area-docs`, `scope-photos`, `site-compliance-docs`) without breaking legitimate signed-URL fetches |
| **Implementation Reviewer** | general-purpose (guardian-review checklist + outcome-fidelity check) | Runs AFTER each builder, on the diff. Two questions, not one: (a) guardian-review's standard safety checklist, AND (b) did this ACTUALLY fix the described problem end-to-end, not just produce safe-looking code? |
| **Director (me)** | — | Merges worktrees back to `main` per repo convention, runs build+tsc, commits, reports; holds the push for founder confirmation per budget discipline |

Each builder works in an isolated git worktree so they can run concurrently without file collisions
even though most of these touch disjoint files. Reviewed one at a time as they land; merged
sequentially into `main` locally (not pushed until the founder confirms, per `DEPLOYMENT_COST.md`).

## Work streams (this session)

1. **Positioning scrub** — `app/page.tsx`, `app/pricing/page.tsx`, `app/request-demo/page.tsx`,
   the Stripe checkout product-name string. Replace with the agnostic "bridge to digital
   infrastructure" copy already established in `docs/reference/PLAY_STORE_LISTING.md`. Keep
   Patriot as the operational tenant name where it's factually describing THIS specific customer
   relationship (e.g. internal tenant references), but strip the vertical descriptor language.
2. **Hooks bug** — `app/dashboard/admin/settings/page.tsx` lines ~73-77: hooks called
   conditionally. Fix so all hooks run unconditionally every render; verify with `npx eslint` +
   `tsc` + a manual settings-page load.
3. **CI health** — `npx eslint .` currently fails with 4 real errors (only 1 confirmed by name so
   far: the hooks bug above). Builder enumerates and fixes the rest, or downgrades genuinely
   inapplicable rules with justification — the goal is CI going green AND meaning something again,
   not silencing it.
4. **Storage bucket lockdown** — new idempotent migration tightening the SELECT policy on the 5
   buckets so anonymous `list()` is denied while a known-path `getPublicUrl()`/download still
   works for legitimate signed/shared links. Apply via Supabase MCP to prod (additive, safe).
5. **Twilio (founder action, not a builder)** — toll-free verification rejected, error 30530
   "Entity Misclassification." Root cause: `BusinessType` must be `PRIVATE_PROFIT` (LLC), not
   `SOLE_PROPRIETOR`; legal business name must exactly match the EIN/CP-575 record. Deadline to
   resubmit into the priority queue: **Jul 9, 2026**. Claude cannot log into Twilio (hard line);
   founder edits + resubmits, Claude available to review the form live once logged in.
6. **Google Play (informational, no action available)** — submission #4 confirmed still
   genuinely "In review" since Jun 22 (9 days), zero policy issues, developer verification
   complete. Nothing missing on our end; only lever left is contacting Play support for a status
   check — draft-and-hold, not sent without founder confirmation.

## Sequencing note

Items 1-4 are independent (different files/systems) — dispatched in parallel. Item 5 is blocked on
founder login. Item 6 has no further automatable action.

## Backlog + next-tier items (from the Jun 30 audit, not urgent-today)

Logged to `BACKLOG.md` for normal top-down pickup — near-zero regression coverage beyond isolated
lib functions, unverified Supabase PITR/restore drill, 47 API routes hand-rolling auth instead of
`requireAuth()`, dead ruflo/claude-flow scaffolding + 5 orphaned npm deps, doc-hygiene drift
(BACKLOG/CLAUDE_HANDOFF/APP_CHANGES all behind `main`), Jarvis/Artifex pre-built ahead of its
funding gate.
