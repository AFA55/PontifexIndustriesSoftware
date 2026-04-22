# Agent F Report — Plaintext Password SQL Investigation

**Date:** 2026-04-21
**Scope:** AGENT_C_REPORT.md flagged two root-level SQL files for plaintext-password risk.
**Verdict:** CLEAN. No plaintext password column exists in production. Stray SQL cleaned up.

---

## 1. SQL File Contents

### `ADD_PASSWORD_PLAIN_COLUMN.sql` (root, now deleted)
- `ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS password_plain TEXT`
- Adds a plaintext password column "for account creation", supposed to be nulled after approval.
- **This is a GDPR/CCPA violation if applied.** Storing plaintext passwords at rest is never acceptable.

### `CLEANUP_TEST_ACCOUNTS.sql` (root, moved to `supabase/scripts/`)
- Deletes test accounts from `auth.users` and `public.profiles`, keeping only two admin emails.
- No security risk; just an operational one-off script. Moved into `supabase/scripts/` with a README.

---

## 2. Production DB Column Search

Query against `information_schema.columns` filtered for `%password%|%plaintext%|%pwd%`:

| schema | table | column | type |
|--------|-------|--------|------|
| auth | users | encrypted_password | varchar (Supabase internal, bcrypt) |
| public | access_requests | password_hash | text (bcrypt/argon — see code) |
| public | access_requests | password_reset_token | text (one-time token) |

**No `password_plain`, `plaintext_password`, or similar column exists.**

`access_requests` columns confirmed: `id, full_name, email, password_hash, date_of_birth, position, status, reviewed_by, reviewed_at, assigned_role, denial_reason, created_at, updated_at, phone_number, password_reset_token, token_expires_at, tenant_id`.

Row count: **0 rows total** in `access_requests` (so no stale plaintext data even hypothetically).

---

## 3. Applied Migrations Check

- `20260126045207 — 20260125_fix_access_requests` IS applied. Reading that migration file shows it DOES add `password_plain` (which would have been a problem).
- However, the current DB has no such column — meaning either a later manual DROP was run, or the migration was edited post-apply. Either way, the live schema is clean.
- `20260129_SECURITY_PATCH_CRITICAL_FIXES*.sql` (which drops `password_plain`) exists on disk but is **NOT** in the applied migrations list. So the cleanup happened by some other path (likely manual SQL against production).
- No migration named `ADD_PASSWORD_PLAIN_COLUMN` was ever applied.

---

## 4. Git History

Both files were added in a single commit:
```
da7a49b1 feat: Complete World of Concrete 2026 demo features
```
They were tracked in git but were stray root-level SQL — never wired into the migration runner.

---

## 5. Application Code Grep

- `app/api/access-requests/route.ts:96` — comment explicitly states `password_hash only — never store plaintext`. Line 104 inserts `password_hash: passwordHash`. No plaintext insertion anywhere.
- `lib/database.ts` — references `password_hash` in type definitions only.
- No `localStorage.*password` or `sessionStorage.*password` writes anywhere in `app/**` or `lib/**`. Supabase Auth handles session tokens normally.

---

## 6. Actions Taken

1. `git rm ADD_PASSWORD_PLAIN_COLUMN.sql` — removed the dangerous root-level SQL (never applied, kept only as a landmine for someone to paste into the SQL editor).
2. `git mv CLEANUP_TEST_ACCOUNTS.sql supabase/scripts/CLEANUP_TEST_ACCOUNTS.sql` — moved operational script out of repo root.
3. Added `supabase/scripts/README.md` documenting what lives there and that these are not migrations.

No DB changes made. No code changes made.

---

## 7. Recommendations for Lead

- (Info only) Consider also deleting `supabase/migrations/20260125_fix_access_requests.sql` contents that add `password_plain`, or at minimum adding a comment noting the column was manually dropped post-apply. If anyone re-runs that migration against a fresh DB it will recreate the plaintext column.
- Production is currently clean. No P0 incident.
