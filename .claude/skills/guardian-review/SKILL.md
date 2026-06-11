---
name: guardian-review
description: Run the Pontifex architecture-guardian review on a diff or feature before it ships. Use after every builder/subagent finishes, before committing significant changes, or when the user says "guardian", "review this", "check behind the builder". Produces a PASS / BLOCKING verdict.
---

# Architecture Guardian Review

Spawn a `reviewer` subagent (or perform directly for small diffs) with this exact mandate.
The guardian's job is **adversarial**: assume the builder made the classic mistakes and look for them.

## Scope the review

1. `git diff` (or the builder's reported file list) — read every changed file fully.
2. Any new/changed migration in `supabase/migrations/`.
3. The API routes + pages touching the changed tables.

## The checklist (each item gets a verdict)

| # | Check | What failure looks like |
|---|---|---|
| 1 | **Tenant isolation** | Query missing `tenant_id` scope; cross-tenant write using caller's tenant instead of explicit target; RLS policy without tenant check |
| 2 | **Authz source** | ANY `auth.jwt() -> 'user_metadata'` in SQL/policies (client-writable = self-promotion). Use SECURITY DEFINER helpers from profiles |
| 3 | **Migration safety** | Non-idempotent DDL; destructive change without a branch-DB test; missing `tenant_id`/RLS/updated_at on new tables |
| 4 | **Role/rank guards** | Endpoint lets a user act on a peer/superior rank; invite/role-change reading role from request body instead of server state |
| 5 | **React hooks** | Conditional hooks; early return before hooks; hook order varies between renders |
| 6 | **Web/SSR safety** | `window`/`localStorage` at module scope; native plugin calls not behind `isNativeApp()` |
| 7 | **Mobile** | Tap targets <44px; horizontal overflow at 375px; input font <16px on mobile (iOS zoom) |
| 8 | **Date handling** | `new Date('YYYY-MM-DD')` raw; `toISOString().split('T')[0]` for local dates — must use `lib/dates.ts` |
| 9 | **Email** | Raw `process.env.RESEND_API_KEY` / `RESEND_FROM_EMAIL` reads — must use `lib/email.ts` helpers |
| 10 | **Error surfaces** | API failures swallowed silently (fire-and-forget is ONLY for logging); user gets fake success |
| 11 | **Secrets/PII** | Keys logged; customer data in screenshots/fixtures; tokens in URLs that get logged |

## Verdict format

```
VERDICT: PASS | BLOCKING (n findings)

BLOCKING:
- [file:line] finding + why it breaks + the fix

NITS (non-blocking, note for backlog):
- ...
```

**Blocking findings get fixed and re-reviewed before the work is considered done** — no exceptions.
Track record: guardians have caught cross-tenant account takeover, a tenant-DELETE guard bypass,
a 42703 column-select that nulled settings reads, and a hook-order bug across 17 pages.
