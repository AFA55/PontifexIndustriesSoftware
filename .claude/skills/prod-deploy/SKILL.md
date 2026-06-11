---
name: prod-deploy
description: The full Pontifex production deploy gate — verification, cost confirmation, push to main, deploy watch, post-deploy checks. Use before/while pushing anything to production. Every push to main is a billed Vercel build (~$1-2), so this runs ONCE per session.
---

# Production Deploy Playbook

## Hard rules

1. **Pushing `main` costs real money** (~$1–2/build; builds are ~86% of the Vercel bill). Batch all
   commits; push ONCE per session. **Confirm with the founder before pushing** unless told "push it".
2. Never push docs-only changes alone — ride along with the next code push.
3. The trial customer uses prod — never push unverified.

## Pre-push gate (all must pass)

```bash
# 1. Stop the dev server (shares .next), clear cache
rm -rf .next
# 2. Build must be green
npm run build          # expect full route table, no "Failed to compile"
# 3. Types + tests
npx tsc --noEmit       # exit 0 (pre-commit hook enforces too)
npx jest               # all suites pass
```

For UI changes: push a non-main branch first → Vercel auto-creates a free preview URL → eyeball it.

## Push + watch

```bash
git push origin main
```

Then watch the deploy via Vercel MCP (project `prj_vubQAdrHfAlSq9msk0sfedlBq5zJ`,
team `team_9PEEftgbKgEZCHzklblcjKKa`):
- `list_deployments` → newest deployment id (state BUILDING)
- `get_deployment` until `state: READY` and alias includes `www.pontifexindustries.com` (~60–120s)
- If ERROR: `get_deployment_build_logs` → fix → the next push is another billed build, so fix carefully

## Post-deploy

- Exercise the changed surface on prod (or check `get_runtime_logs` for new errors — note it
  truncates long messages; filter by `statusCode` or `query`).
- iOS app picks the change up automatically (webview) — no App Store action.
- Update `BACKLOG.md` (move shipped items) + `CLAUDE_HANDOFF.md` top section.

## Schema changes (independent of code pushes — free)

- **Additive** (new table/column/index): Supabase MCP `apply_migration` straight to prod;
  idempotent DDL (`IF NOT EXISTS`, `EXCEPTION WHEN duplicate_object`).
- **Risky** (drops, alters hot tables, backfills): `create_branch` → test on the branch DB → merge.
- Every new table: `tenant_id` + RLS via SECURITY DEFINER helpers (`public.is_admin()`,
  `current_user_tenant_id()`, ...) — **never** `auth.jwt() -> 'user_metadata'`.
