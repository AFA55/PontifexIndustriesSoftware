# Professional Profile & Login Overhaul — System Design Plan

> Status: **DESIGN ONLY.** No code, no migrations applied. Another agent implements; a guardian reviews.
> Prime directive: **do not break the LIVE login for Patriot/Apex users.** Everything additive + reversible.
> Date: 2026-06-06. Author: System Architecture Designer (analysis grounded against live DB `klatddoyncxidgqtcjnu`).

---

## 0. Verified ground truth (what is actually true today)

All claims below were checked against the live DB and the real source files.

### Auth flow (verified)
1. **Company code → tenant.** `app/company-login/page.tsx:46-65` calls `supabase.rpc('lookup_tenant_by_code', { p_code })` directly from the browser (no Lambda hop — this was the May-21 outage fix). The RPC is `SECURITY DEFINER`, returns only `id, name, company_code`, matches `WHERE company_code = upper(trim(p_code))` (verified `pg_get_functiondef`). On success it routes to `/login?tenant_id=<uuid>`.
2. **Login is a CUSTOM API route, NOT direct `signInWithPassword` from the client.** `app/login/page.tsx:99-108` POSTs `{ email, password }` to `/api/auth/login`. The page does **not** send `tenant_id` to the login route — `tenant_id` is only used for branding (`app/login/page.tsx:55,69`). Credentials are email-only today.
3. **`/api/auth/login/route.ts:64-67`** calls `supabase.auth.signInWithPassword({ email, password })` server-side (anon client), then fetches the profile with the **admin** client (`route.ts:81-85`, selects `id, email, full_name, role, active, tenant_id`), checks `active`, returns `{ success, user, tenant, session }`.
4. Client then `supabase.auth.setSession(...)` (`app/login/page.tsx:124`) and writes `localStorage['supabase-user']` (`:131-136`).
5. **Anti-bleed contract (must preserve).** `lib/auth.ts:8-53` `getCurrentUser()` cross-validates `localStorage['supabase-user'].id` against every `sb-*-auth-token` session and **fails closed** (removes cache, returns null) on mismatch or parse error. `logout()` (`lib/auth.ts:55-79`) clears `sb-*-auth-token`, `supabase-user`, branding caches. `lib/hooks/useAuthUser.ts:24-59` treats the Supabase session as ground truth and re-fetches the profile when the cached id ≠ session id.
6. **API guards** (`lib/api-auth.ts`) read Bearer token → `supabaseAdmin.auth.getUser(token)` → `profiles.role/tenant_id`. Role/tenant authority is **profiles**, never `user_metadata`. Non-super-admins must have a tenant.

### Data model (verified via `information_schema`)
- `public.profiles` columns relevant here: `id uuid PK`, `email text NOT NULL`, `full_name text NOT NULL`, `role text NOT NULL`, **`phone text NULL`**, **`phone_number text NULL`** (BOTH exist — redundant), `nickname text NULL`, `tenant_id uuid NULL`, `active boolean DEFAULT true`. **NO `username` column.**
- `public.tenants`: has `company_code text` with **`UNIQUE (company_code)`** constraint (`tenants_company_code_key`), plus unique `slug`, `domain`.
- `auth.users`: has native `email` and `phone` columns. **47 auth.users, 25 profiles → 22 auth users with NO profile row** (`auth_without_profile = 22`). 0 of 47 auth.users have a `phone`. All 47 have `email_confirmed_at`.
- **7 profiles use `@pontifex.com`** fake emails; 0 null emails; 25 distinct emails; **0 duplicate emails** in profiles.
- `phone` populated on 2 profiles, `phone_number` on 3 profiles — the dual column is actively causing split data.
- `profiles` RLS (verified `pg_policy`):
  - SELECT `profiles_select_all_authenticated`: `id = auth.uid() OR current_user_role()='super_admin' OR tenant_id = current_user_tenant_id()`
  - UPDATE `profiles_update_own_or_admin`: `id = auth.uid() OR is_admin()` (USING only, **no WITH CHECK** — a self-update could currently change `role`/`tenant_id` at the RLS layer; mitigated today only because writes go through `supabaseAdmin` server routes with field allow-lists).
  - INSERT own-or-admin; DELETE admin-only.

### Profile read/write surfaces (verified)
- Self-service read/write: `GET/PATCH /api/my-profile/route.ts`. PATCH allow-list (`:45-49`): `nickname, phone, phone_number, profile_picture_url, date_of_birth, emergency_contact_name/phone/relationship`. **`email` is NOT editable. No `username`.** Note it accepts both `phone` and `phone_number`.
- Manage Profile UI: `app/dashboard/my-profile/page.tsx`. Reads `phone_number || phone` (`:108`), saves only `phone_number` (`:173`). Already has the "Used for SMS job notifications" hint (`:276-279`).
- Management list: `GET /api/admin/users/route.ts:68` selects `phone_number, phone, ... nickname` (no username, no email-verified, no last-login). Team detail page `app/dashboard/admin/team-profiles/page.tsx` (**2801 lines** — large, edit surgically).
- Twilio SMS connected (per CLAUDE.md); Resend wired for password-reset email (`app/api/auth/forgot-password/route.ts`).

### Implications this design must absorb
- **The login route is the single choke point.** Adding email-OR-phone-OR-username resolution there is contained and reversible — the client form and the rest of the app are unaffected if the resolver falls through to email.
- **`tenant_id` is NOT currently passed to `/api/auth/login`.** To make phone/username unambiguous across tenants we must start sending the already-known `tenant_id` (from the company-code step) to the login route. This is additive.
- **Duplicate `phone`/`phone_number` must be consolidated** or every feature keeps guessing. We standardize on **`phone`** and backfill.
- The 22 orphan auth.users (no profile) are out of scope but flagged (see §9 open questions) — they cannot log in (login route 404s on missing profile, `route.ts:87-94`).

---

## 1. Goals / Non-goals / Constraints

### Goals
- Operators set a **real email** and a **phone** in Manage Profile → unblocks real password resets.
- Login accepts **email OR phone OR username** + password (company code already scopes the tenant).
- Operators can pick a **username** (professional handle).
- Management dashboard sees **email / phone / username / status / last login** per team member.

### Non-goals (this phase)
- No Supabase native phone-OTP auth (no passwordless). Password stays the credential.
- No SSO / magic links / social login.
- No fix for the 22 orphan auth.users (separate cleanup task).
- No multi-tenant-membership-per-user (one email = one tenant stays).
- No change to role/tenant authority model (stays in `profiles`).

### Constraints
- **Live login must never break.** All steps additive + reversible; existing email login keeps working unchanged at every phase.
- Multi-tenant: phone/username are **unique per tenant**, not global (company code disambiguates — two tenants may legitimately have a "jsmith").
- App Store: any change is web/webview only → live instantly, **no resubmission** (per CLAUDE.md deploy discipline). No new native plugin.
- Vercel cost: batch, push **once**.
- Conventions: SECURITY DEFINER RPCs for cross-tenant lookups (never `user_metadata` for authz); idempotent DDL; `{ success, data }` API shape; mobile-first ≥44px; toast (not `alert`).

---

## 2. Data model

### 2.1 Decisions
- **Consolidate phone → single `profiles.phone`.** Backfill `phone = COALESCE(NULLIF(phone,''), phone_number)`. Keep `phone_number` as a **deprecated shadow** (kept in sync by trigger) for one release so nothing reading the old column breaks, then drop it in a later cleanup migration. (Reversible: dropping the trigger + leaving both columns restores status quo.)
- **Add `profiles.username text NULL`.**
- **Username uniqueness: PER TENANT, case-insensitive.** Partial unique index on `(tenant_id, lower(username)) WHERE username IS NOT NULL AND deleted_at IS NULL`. Global uniqueness would block tenant B from "jsmith" if tenant A took it — wrong for multi-tenant.
- **Phone uniqueness: PER TENANT, normalized (E.164), where present.** Needed because phone is a login identifier — a duplicate phone in one tenant makes resolution ambiguous. Partial unique index on `(tenant_id, phone) WHERE phone IS NOT NULL AND phone <> '' AND deleted_at IS NULL`.
- **`auth.users.email`** remains the credential of record. `auth.users.phone` stays empty (we do NOT use Supabase phone auth). `profiles.phone` / `profiles.username` are **app-level identifiers** resolved to the email before `signInWithPassword`.
- Username validation: `^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$` (3–30 chars, lowercase-normalized on save, no leading/trailing punctuation), reserved-word blocklist (`admin`, `support`, `root`, `api`, `null`, etc.).
- Phone validation: normalize to **E.164** (`+1XXXXXXXXXX` for US default) before store + compare; reject non-numeric.

### 2.2 Idempotent migration DDL (additive, tenant-safe)

```sql
-- Migration: 20260606_profile_identity.sql  (ADDITIVE, IDEMPOTENT, REVERSIBLE)

-- 1) username column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

-- 2) consolidate phone (backfill, do not drop phone_number yet)
UPDATE public.profiles
   SET phone = COALESCE(NULLIF(phone, ''), NULLIF(phone_number, ''))
 WHERE (phone IS NULL OR phone = '') AND phone_number IS NOT NULL AND phone_number <> '';

-- keep phone_number in sync during the transition (one-way mirror of phone)
CREATE OR REPLACE FUNCTION public.sync_profile_phone_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.phone_number := NEW.phone;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_profile_phone_number ON public.profiles;
CREATE TRIGGER trg_sync_profile_phone_number
  BEFORE INSERT OR UPDATE OF phone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_phone_number();

-- 3) per-tenant uniqueness (partial, case-insensitive). Will fail if dup data exists;
--    a pre-check query (see §9) MUST be run first and conflicts resolved.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_tenant_uniq
  ON public.profiles (tenant_id, lower(username))
  WHERE username IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_tenant_uniq
  ON public.profiles (tenant_id, phone)
  WHERE phone IS NOT NULL AND phone <> '' AND deleted_at IS NULL;
```

> No RLS change is strictly required (existing policies cover SELECT/UPDATE of own row). **Recommended hardening (separate, gated):** add a `WITH CHECK` to `profiles_update_own_or_admin` so a self-update cannot mutate `role`/`tenant_id`/`active` — but this is a behavior change to a live policy, so it ships in its own reviewed migration, NOT bundled here (see §8).

**Rollback:** drop the two indexes + the trigger/function; `username` column can stay (harmless) or be dropped. No data loss.

---

## 3. The hard part — login with email OR phone OR username

### 3.1 Options evaluated

**(a) Resolve-to-email server-side, keep `signInWithPassword`.** Login form accepts any identifier; the server resolves it to the account email within the tenant, then calls `signInWithPassword({ email: resolved, password })`. **No Supabase identity migration. No native plugin. Fully reversible** (resolver falls through to treating the input as an email = today's behavior).

**(b) Supabase native phone auth (OTP via Twilio).** Requires enabling phone provider, writing `auth.users.phone`, a separate OTP UX, SMS cost per login, and a second identity to keep in sync with email. Large change, new failure modes on the live login path, App-Store SMS-consent considerations. **Rejected** for this phase.

### 3.2 RECOMMENDATION: Option (a)

**Flow (additive, choke-pointed at `/api/auth/login`):**

1. Company-login step unchanged: company code → `lookup_tenant_by_code` → `/login?tenant_id=<uuid>` (`app/company-login/page.tsx`).
2. `app/login/page.tsx`: relabel the first field "Email, phone, or username", relax the Zod schema from `z.string().email()` to `z.string().min(3)`, and **add `tenant_id` to the POST body** (it already has `tenant_id` from `searchParams`, `:55`).
3. `/api/auth/login/route.ts`: before `signInWithPassword`, resolve the identifier:
   - If it looks like an email (`includes('@')`) → use as-is (today's path; zero behavior change for existing users).
   - Else call a new SECURITY DEFINER RPC **`resolve_login_email(p_tenant_id uuid, p_identifier text)`** that returns the matching `profiles.email` scoped to that tenant (matching `lower(username)` OR normalized `phone`, `active = true`, `deleted_at IS NULL`). Returns at most one row.
   - If resolved → `signInWithPassword({ email: resolved, password })`. If not resolved → proceed with the raw input as the email so the existing "Invalid email or password" path fires (no enumeration signal — see §8).
4. Everything after step 3 (profile fetch, active check, session, localStorage, anti-bleed) is **unchanged**.

**Why this composes with company-code + anti-bleed:**
- `tenant_id` from the company-code step makes phone/username unambiguous across tenants — exactly what disambiguates a non-unique handle.
- The session/localStorage/anti-bleed logic (`lib/auth.ts`, `useAuthUser.ts`) operates on the resolved Supabase session — it is identical regardless of which identifier the user typed. **No anti-bleed code changes.**

### 3.3 The resolver RPC (mirror of `lookup_tenant_by_code`)

```sql
-- Migration: 20260606_resolve_login_email.sql
CREATE OR REPLACE FUNCTION public.resolve_login_email(p_tenant_id uuid, p_identifier text)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.email
  FROM public.profiles p
  WHERE p.tenant_id = p_tenant_id
    AND p.active = true
    AND p.deleted_at IS NULL
    AND (
      lower(p.username) = lower(trim(p_identifier))
      OR regexp_replace(p.phone, '\D', '', 'g') = regexp_replace(p_identifier, '\D', '', 'g')
    )
  LIMIT 1;
$$;
-- GRANT EXECUTE TO anon, authenticated  (same posture as lookup_tenant_by_code)
```

- Returns only an email string (no roster dump). Phone compared digit-normalized so `(555) 123-4567` matches `+15551234567`.
- **`tenant_id` is mandatory** → cross-tenant resolution impossible; a handle in tenant A can never resolve into tenant B.
- Called from the server route (preferred) using `supabaseAdmin`, so anon grant is optional; keeping it anon-safe matches the existing convention and keeps the door open to a future no-Lambda path.

### 3.4 Non-unique handle across tenants — resolved
Company code is entered first and pins `tenant_id`. The RPC requires that `tenant_id`. Two tenants can both have username `jsmith` or the same phone; resolution is always scoped, never ambiguous.

---

## 4. Email change flow (the genuinely tricky part)

Changing a real email must update **both** `auth.users.email` (Supabase identity) **and** `profiles.email` (app reads/branding/reset-lookup). These can drift; design must keep them consistent.

### 4.1 Two paths

**Self-serve (operator), with verification — RECOMMENDED default:**
1. New endpoint `POST /api/my-profile/change-email` (Bearer-authed). Validates the new email (format + not already used in tenant).
2. Server uses `supabaseAdmin.auth.admin.updateUserById(userId, { email, email_confirm: false })` → Supabase sends a confirm-email to the **new** address (re-verification). `profiles.email` is **NOT** updated yet.
3. A pending record (`profiles.pending_email` column, additive) holds the requested address. On confirmation (Supabase `auth` event / a `/api/auth/email-confirmed` callback or a reconcile job), copy `pending_email → profiles.email`, clear pending.
4. Until confirmed, the user keeps logging in with the **old** email. **Reversible + safe** — no lockout.

**Admin-assisted (management) — for operators who can't self-serve:**
- Extend the team-profile detail to let an admin set a member's email. Same `updateUserById` mechanism; admin can optionally set `email_confirm: true` (trusted set, skips the email round-trip) and write `profiles.email` in the same transaction. Audited via `logAuditEvent`.

### 4.2 Migration path for the 7 fake `@pontifex.com` operators
- **Preferred:** operator self-updates in Manage Profile (the self-serve flow above) → real email → real password reset becomes possible.
- **Fallback:** admin sets the real email from team-profiles (admin-assisted, `email_confirm: true`), then the operator runs Forgot Password (already hardened, `forgot-password/route.ts`).
- This is **opt-in and incremental** — no forced migration, no big-bang. Fake-email accounts keep working until updated.

> Note: `forgot-password/route.ts` looks up `profiles.email` (`:53-57`) then mints the recovery link against that email. Once `profiles.email` = real email AND `auth.users.email` matches, reset works end-to-end. The email-change flow MUST keep these two in sync — that is its whole reason for existing.

---

## 5. Manage Profile UI (`app/dashboard/my-profile/page.tsx`)

Add to the existing "Personal Info" card (mobile-first, ≥44px, reuse existing input classes, toast on save):

- **Username** — text input, lowercase-normalized on blur, inline availability check (debounced `GET /api/my-profile/username-available?u=`), validation hint. Optional field.
- **Phone** — keep existing field but standardize state→`phone` (stop writing `phone_number` directly; the trigger mirrors it). Format-as-you-type to `(XXX) XXX-XXXX`, store E.164. Keep the existing SMS hint.
- **Email** — currently read-only display (`:253`). Add an **"Change email"** affordance → opens a small modal → calls `/api/my-profile/change-email` → shows "Check your new inbox to confirm" (the self-serve flow). Old email stays active until confirmed.
- Save flow: extend the PATCH allow-list in `/api/my-profile/route.ts:45-49` to include `username` (with server-side validation + per-tenant uniqueness handling — catch unique-violation → friendly "That username is taken"). **Do NOT** add `email` to the plain PATCH allow-list; email changes go through the dedicated verified endpoint only.

---

## 6. Management dashboard visibility

- `GET /api/admin/users/route.ts:68` — add `username` to the select (and `email` is already there). Consider adding `pending_email`.
- **Last login:** the data already exists — `login_attempts` table (written by `/api/auth/login/route.ts:30-45`). Add a lightweight `GET /api/admin/users/last-login` (or a join) returning `max(created_at) WHERE success = true` per user. No new tracking infra needed.
- Team detail page `app/dashboard/admin/team-profiles/page.tsx` (2801 lines): surface email / phone / username / status (`active`) / last-login in the member panel; add the admin-assisted "Set email" + "Set username" controls (admin write path via a new `PATCH /api/admin/team-profiles/[id]` or extend existing per-field routes). Edit surgically — this file is large.
- Status = `profiles.active` (already shown in some places). No new column needed.

---

## 7. Migration / rollout (phased, behavior-preserving)

| Phase | Ships | Risk | Reversible? |
|---|---|---|---|
| **0** | DB pre-check (dup phone/username), then `20260606_profile_identity.sql` (username col, phone backfill+trigger, partial unique indexes) | Low (additive) | Yes — drop indexes/trigger |
| **1** | `resolve_login_email` RPC + `/api/auth/login` resolver branch + form relabel + send `tenant_id`. Email path untouched. | Low (falls through to email) | Yes — remove resolver branch |
| **2** | Manage Profile: username + phone-standardize + availability check; `/api/my-profile` PATCH adds `username` | Low | Yes |
| **3** | Email-change: `pending_email` column, `/api/my-profile/change-email`, confirm reconcile, admin-assisted set | Medium (touches auth.users) | Yes — feature-flag the endpoint |
| **4** | Management visibility: username + last-login in `/api/admin/users` + team-profiles panel | Low | Yes |
| **5** (later) | RLS `WITH CHECK` hardening on `profiles_update_own_or_admin`; drop deprecated `phone_number` + sync trigger | Medium | Yes (separate migrations) |

**Existing users keep logging in by email throughout.** Phone/username are additive opt-ins; nobody is forced to set them.

---

## 8. Security

- **No `user_metadata` for authz.** Role/tenant stay in `profiles`; resolver RPC returns only an email. Unchanged authority model.
- **Username/phone enumeration:** `resolve_login_email` returns an email string only when password also matches downstream — on no-resolve, fall through to the standard "Invalid email or password" (`/api/auth/login/route.ts:73`). The availability-check endpoint (`username-available`) leaks taken/free by design (acceptable, same as every signup form) but **must be tenant-scoped + rate-limited** and never returns the owning user. Do NOT expose a phone-availability endpoint (phone is PII).
- **Phone verification:** for SMS-relevant flows, optionally send a Twilio OTP to confirm ownership before phone becomes a login identifier (prevents claiming someone else's number to receive their texts). Minimum viable: admin-verified; OTP is a fast-follow given Twilio is connected.
- **Email change re-verification:** mandatory Supabase confirm-email on self-serve (`email_confirm: false`); old email valid until confirmed → no lockout, no hijack via typo.
- **Rate limits:** `/api/auth/login`, `change-email`, `username-available` need throttling. CLAUDE.md backlog already flags Supabase Auth rate limits (HIGH-2) — enable in Dashboard.
- **RLS:** add `WITH CHECK` to the profiles UPDATE policy (Phase 5) so even a direct PostgREST self-update cannot escalate `role`/`tenant_id`/`active`. Today this is only enforced by server-route allow-lists.
- **Anti-bleed preserved:** zero changes to `getCurrentUser`/`useAuthUser`/`logout` session-validation logic — the resolved session is indistinguishable from a today-session.
- Partial unique indexes scoped to `deleted_at IS NULL` so soft-deleted rows don't block reuse.

---

## 9. File-by-file change list + migrations + open questions

### Migrations (apply via Supabase MCP, idempotent)
- `supabase/migrations/20260606_profile_identity.sql` — username col, phone backfill, sync trigger, two partial unique indexes (§2.2). **Pre-check first:** `SELECT tenant_id, lower(username), count(*) ... HAVING count(*)>1` and same for phone; resolve any conflicts before the index creation line.
- `supabase/migrations/20260606_resolve_login_email.sql` — resolver RPC + grants (§3.3).
- `supabase/migrations/20260607_pending_email.sql` — `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pending_email text` (Phase 3).
- `supabase/migrations/20260610_profiles_update_check.sql` — RLS `WITH CHECK` hardening (Phase 5, separate review).
- `supabase/migrations/20260610_drop_phone_number.sql` — drop deprecated column + trigger (Phase 5, after one release).

### Code
- `app/login/page.tsx` — schema `email`→`identifier` (`min(3)`), relabel field, include `tenant_id` in POST body (~`:14-18`, `:99-108`, `:221-233`).
- `app/api/auth/login/route.ts` — accept `tenant_id`; resolve non-email identifier via `resolve_login_email` before `signInWithPassword` (~`:50-67`).
- `app/api/my-profile/route.ts` — add `username` to PATCH allow-list (`:45-49`) + select (`:21,:62`); unique-violation → friendly error; standardize on `phone`.
- `app/api/my-profile/change-email/route.ts` — NEW (self-serve verified email change, §4.1).
- `app/api/my-profile/username-available/route.ts` — NEW (debounced availability, tenant-scoped, rate-limited).
- `app/dashboard/my-profile/page.tsx` — username field, phone-standardize, "Change email" modal (§5).
- `app/api/admin/users/route.ts` — add `username` (+ optional `pending_email`) to select (`:68`); last-login.
- `app/api/admin/users/last-login/route.ts` (or join) — NEW, from `login_attempts`.
- `app/dashboard/admin/team-profiles/page.tsx` — surface email/phone/username/status/last-login + admin-assisted set controls (large file — surgical edits).
- `app/api/admin/team-profiles/[id]/route.ts` — NEW or extend: admin set email (via `updateUserById`)/username, audited.

### Open questions for the founder
1. **22 orphan auth.users with no profile** — abandoned signups? Should they be deleted, or get profiles created? (They cannot log in today.) Out of scope but needs a decision.
2. **Phone verification depth:** ship admin-verified phone now and Twilio-OTP self-verification as a fast-follow, or require OTP from day one before phone can be a login identifier?
3. **Username required or optional?** Recommend optional (email/phone always work). Confirm.
4. **Self-serve email change for operators, or admin-only?** Recommend self-serve with confirmation as default + admin-assisted fallback. Confirm.
5. **Drop `phone_number` timing** — OK to remove after one release once all readers move to `phone`?

---

## 10. Guardian compliance checklist

- [ ] All DDL idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`); pre-check for dup phone/username **run before** unique-index creation.
- [ ] Every change additive + reversible; live email login works at every phase (resolver falls through to email).
- [ ] `tenant_id` enforced in `resolve_login_email` (no cross-tenant resolution); RPC returns only an email, no roster.
- [ ] No `auth.jwt() -> 'user_metadata'` for authz; role/tenant stay in `profiles`.
- [ ] Anti-bleed logic (`getCurrentUser`/`useAuthUser`/`logout`) untouched; resolved session identical to today's.
- [ ] New self-write paths use server-route field allow-lists (no `role`/`tenant_id`/`active` self-mutation); RLS `WITH CHECK` hardening tracked (Phase 5).
- [ ] Email change updates BOTH `auth.users` + `profiles.email`, with re-verification; old email valid until confirmed (no lockout).
- [ ] Per-tenant unique (case-insensitive username, normalized phone), partial on `deleted_at IS NULL`.
- [ ] No username/phone enumeration on login; availability endpoint tenant-scoped + rate-limited; no phone-availability endpoint.
- [ ] Mobile-first (≥44px, 375px no-overflow), toasts not `alert()`, lucide icons, `{ success, data }` API shape, dates parsed local.
- [ ] One batched push (Vercel cost); web change → no App Store resubmission.
- [ ] `phone_number`/`phone` consolidated; no feature left guessing which column.
