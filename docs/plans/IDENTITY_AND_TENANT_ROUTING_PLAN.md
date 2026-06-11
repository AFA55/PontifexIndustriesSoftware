# Multi-Tenant Identity & Tenant-Routing Upgrade — System Design Plan

> Status: **DESIGN ONLY.** No code, no migrations applied. Another agent implements; a guardian reviews.
> **Prime directive: do not break the LIVE login for existing single-tenant users (operators/clients).** Everything additive + reversible.
> Date: 2026-06-08. Author: System Architecture Designer. Grounded against live DB `klatddoyncxidgqtcjnu` and the real source files.
> Companion: **`PROFILE_SYSTEM_PLAN.md`** covers email/phone/username *credential resolution* + profile data hygiene. **This plan does NOT duplicate that** — it covers (a) multi-tenant **membership + routing**, and (b) making the **email field editable**. Cross-references are called out inline. Where the two plans both touch `/api/auth/login`, this plan's changes compose with the credential-resolution changes; see §2.4.

---

## 0. Verified ground truth (checked against live DB + source)

### Auth flow (verified — matches `PROFILE_SYSTEM_PLAN.md §0`)
1. **Company code → tenant.** `app/company-login/page.tsx:46-65` calls `supabase.rpc('lookup_tenant_by_code', { p_code })` directly from the browser, then routes to `/login?tenant_id=<uuid>`. RPC is `SECURITY DEFINER`, returns only `id, name, company_code` (verified `pg_get_functiondef`).
2. **`tenant_id` is decorative today.** `app/login/page.tsx:55` reads `tenant_id` from the URL but uses it **only for branding** (`:69`). The login POST (`:99-108`) sends `{ email, password }` — **no `tenant_id`**.
3. **Login route authenticates by EMAIL ONLY.** `app/api/auth/login/route.ts:64-67` `signInWithPassword({ email, password })`, then `route.ts:81-85` fetches the profile (`select id, email, full_name, role, active, tenant_id`), checks `active` (`:97`), returns `{ user, tenant, session }`. The user's world is decided solely by `profiles.tenant_id` (`:108-115, :137`).
4. **Client landing keys off ROLE only.** `app/login/page.tsx:142-148` routes management roles → `/dashboard/admin`, operators/apprentices → `/dashboard`. Then `app/dashboard/page.tsx:107-109`: **`if (role === 'super_admin') → /dashboard/platform`**. There is **no notion of an "active tenant"** anywhere in landing — only role.
5. **Anti-bleed contract (MUST preserve).** `lib/auth.ts:8-53` `getCurrentUser()` cross-validates `localStorage['supabase-user'].id` against every `sb-*-auth-token` session and **fails closed**. `logout()` (`:55-79`) clears `sb-*-auth-token`, `supabase-user`, `current-tenant`, branding caches. `lib/hooks/useAuthUser.ts` treats the Supabase session as ground truth.
6. **API guards** (`lib/api-auth.ts`) read Bearer token → `supabaseAdmin.auth.getUser(token)` → `profiles.role/tenant_id` (`resolveAuth` `:54-101`). Non-super-admins **must** have a tenant. `resolveTenantScope` (`:331-383`): non-super-admins get their own `tenantId`; **super_admin reads `?tenantId=` from the URL**, else falls back to their own `profiles.tenant_id`. The platform console already passes explicit `?tenantId` for cross-tenant reads.

### Data model (verified via `information_schema` / `pg_policies` / `pg_proc`)
- **`public.tenant_users`** EXISTS: `id uuid PK default gen_random_uuid()`, `tenant_id uuid NOT NULL`, `user_id uuid NOT NULL`, **`role text NOT NULL default 'member'`**, `invited_by uuid NULL`, `joined_at timestamptz NOT NULL default now()`.
  - ⚠️ **`tenant_users.role` stores a MEMBERSHIP RANK (`'member'`/`'owner'`), NOT the app role enum.** Verified: 23 rows = `'member'`, 1 row (founder) = `'owner'`. The app role (`operator`, `admin`, …) lives in `profiles.role`. **This plan treats `tenant_users` as the membership/access list and `profiles.role` as the app role.** (See §1.2 for the per-tenant-app-role decision.)
  - RLS (verified `pg_policies`): SELECT `Users can see own tenant memberships` = `user_id = auth.uid()`; ALL `Super admins can manage tenant users` = `EXISTS(profiles WHERE id=auth.uid() AND role='super_admin')`.
- **`tenant_users` is currently STALE / unreliable** (verified): **24 membership rows but every single one points to PATRIOT** (`ee3d8081…`). Apex and Pontifex tenants have **zero** memberships. 22 of 24 rows reference users with **no profile** (orphan `auth.users` — the same 22 orphans flagged in `PROFILE_SYSTEM_PLAN.md §0`). **The founder's only membership is `PATRIOT / owner` — he has NO membership in PONTIFEX**, which is his current `profiles.tenant_id`. ⇒ The backfill in §1.3 must be treated as a **first real backfill**, reconciled against `profiles`, not an incremental top-up.
- **`public.tenants`** (verified columns): `id, name, slug (unique), domain, company_code text (UNIQUE — `tenants_company_code_key`), plan, owner_id, features jsonb, …`. **There is NO `parent_tenant_id` column** (verified — `grep` of all migrations + `information_schema` both negative). Patriot/Apex are "clients under Pontifex" **conceptually only**; the platform Hub enumerates all tenants, it does not parent them. *This plan does not add parenting* (out of scope, not needed for routing).
- Tenants today: `PATRIOT` (`ee3d8081-cec2-47f3-ac23-bdc0bb2d142d`), `APEX` (`ade00000-0000-4000-8000-000000000000`), `PONTIFEX` (`b27d9ca5-1352-42f2-b7e1-25254c09fa6f`).
- Founder: `andres.altamirano1280@gmail.com` = profile `d50efe2d…`, `role=super_admin`, `profiles.tenant_id = PONTIFEX`.
- **25 profiles, all with non-null `tenant_id`** (verified `with_tenant=25, without_tenant=0`).

### The RLS reality that dictates the whole design (verified `pg_get_functiondef`)
- `current_user_tenant_id()` = `SELECT tenant_id FROM public.profiles WHERE id = auth.uid()` — **STABLE SECURITY DEFINER, reads `profiles.tenant_id`**.
- `current_user_role()` = `SELECT role FROM public.profiles WHERE id = auth.uid()`.
- **Every tenant-scoped RLS policy in the DB derives the tenant from `profiles.tenant_id` via this function.** ⇒ **A cookie alone cannot retarget RLS.** Any "act as a different tenant" mechanism must either (a) only affect code paths that use `supabaseAdmin` (which bypasses RLS) + explicit `tenant_id` filters, or (b) change what `current_user_tenant_id()` returns. This plan chooses **(a)** for safety and reversibility (see §3.4). This is the single most important constraint in the document.

### Profile read/write surfaces (verified)
- `app/dashboard/my-profile/page.tsx:253` renders email as a **read-only `<p>{profile.email}</p>`** (no input).
- `GET/PATCH /api/my-profile/route.ts:45-49` allow-list = `nickname, phone, phone_number, profile_picture_url, date_of_birth, emergency_contact_name/phone/relationship`. **`email` is NOT editable.**
- Email change requires updating **both** `auth.users.email` (Supabase admin) **and** `profiles.email` — they are independent stores (login authenticates against `auth.users`; the app reads `profiles.email`).

---

## 1. Membership model

### 1.1 Source of truth (decision)
- **`tenant_users` becomes the source of truth for "which tenants can this user access."** A user may have N rows (N tenants).
- **`profiles.tenant_id` stays as the user's DEFAULT / HOME tenant** (back-compat). It is **never removed** and continues to drive RLS for single-tenant users. For 99% of users (operators), `tenant_users` will hold exactly one row that equals `profiles.tenant_id` → behavior is identical to today.
- **`profiles.role` stays as the app role.** `tenant_users.role` (`member`/`owner`) is a coarse membership rank, retained as-is; it is NOT used for app authorization in phase 1.

### 1.2 Per-tenant app role — decision: DEFER, but reserve the column
The hard multi-tenant question is "can the same person be an `admin` in tenant A and an `operator` in tenant B?" Today the answer is no (role is global on `profiles`). For the founder's use case, his app role is `super_admin` everywhere, so we do **not** need per-tenant app roles in phase 1.
- **Phase 1:** the acting app role = `profiles.role` regardless of active tenant. (Founder is `super_admin` → works in every tenant.)
- **Reserve for later:** add a nullable `tenant_users.app_role text` column (nullable, default NULL). When NULL, fall back to `profiles.role` (today's behavior). This is a no-op until populated, so it is additive and reversible. Document it; do not wire it into guards in phase 1.

### 1.3 Migration: backfill `tenant_users` from `profiles` (idempotent + RLS)
**This is a first real backfill, not a top-up** (current table is PATRIOT-only + 22 orphans).
- For **every profile with a non-null `tenant_id`**, ensure a `tenant_users(user_id, tenant_id)` row exists. `tenant_users.role` ← `'owner'` if `profiles.role='super_admin'` else `'member'` (matches the founder's existing `owner` row; coarse only).
- Idempotency: add a **`UNIQUE (tenant_id, user_id)`** constraint first (verify none exists), then `INSERT … ON CONFLICT (tenant_id, user_id) DO NOTHING`. Re-runs are no-ops.
- **Leave the 22 orphan rows alone** (they reference users with no profile — out of scope, same as `PROFILE_SYSTEM_PLAN §9`). Do not delete them in this migration; flag for the separate orphan-cleanup task.
- **Founder special-case (the unblock):** explicitly upsert `tenant_users(user_id = d50efe2d…, tenant_id = PATRIOT, role='owner')` AND `(…, tenant_id = PONTIFEX, role='owner')`. After backfill his `profiles.tenant_id` stays `PONTIFEX` (home = Hub). His Patriot membership is what lets `PATRIOT` code work for his email. (His PATRIOT/owner row already exists; the PONTIFEX one is new.)
- RLS on `tenant_users` is already correct (own-select + super_admin-all). No policy change needed for phase 1. (If/when tenant admins manage their own members, add an INSERT/DELETE policy scoped to `current_user_has_role('admin','super_admin') AND tenant_id = current_user_tenant_id()` — deferred.)

### 1.4 Membership-lookup RPC (new, `SECURITY DEFINER`, anon-safe shape)
Add `public.user_has_tenant_membership(p_user_id uuid, p_tenant_id uuid) RETURNS boolean` — `SELECT EXISTS(SELECT 1 FROM tenant_users WHERE user_id=p_user_id AND tenant_id=p_tenant_id)`. `SECURITY DEFINER`, `SET search_path = public`. Called server-side from the login route (§2) and from `api-auth` (§3). Keep it minimal; do not expose membership lists to anon.

---

## 2. Login routing

The login route is the **single choke point** (same conclusion as `PROFILE_SYSTEM_PLAN`). All changes are server-side + additive.

### 2.1 Pass the company-code tenant to login (additive)
- `app/login/page.tsx` already has `tenant_id` from the URL. Change the POST body (`:104-107`) to include it: `{ email, password, tenant_id }`. If `tenant_id` is absent (someone hit `/login` directly — the page already `router.replace('/company-login')` at `:60-64`), the route falls back to today's behavior (profile tenant). **Backward compatible.**

### 2.2 `/api/auth/login` — verify membership, set active tenant, route
After the existing auth + profile + `active` checks (unchanged), insert one new block:
1. Read `requestedTenantId` from the body (the company-code tenant). If absent → **today's behavior** (active tenant = `profile.tenant_id`); skip to step 4.
2. **Resolve the acting tenant:**
   - If `role === 'super_admin'` → allowed into ANY existing tenant. Validate `requestedTenantId` exists in `tenants` (reuse the `resolveTenantScope` existence check pattern). Active tenant = `requestedTenantId`.
   - Else → call `user_has_tenant_membership(user.id, requestedTenantId)`. **Also accept the legacy match** `requestedTenantId === profile.tenant_id` (defensive: covers any user not yet backfilled into `tenant_users`, so a backfill gap can never lock a real user out). If neither → **reject** (see §2.3). Active tenant = `requestedTenantId`.
3. **No membership + not super_admin + `requestedTenantId !== profile.tenant_id`** → return `403 { error: "Your account doesn't have access to this company. Check the company code, or contact your administrator." }`. Log `failureReason: 'tenant_membership_denied'` to `login_attempts` (existing fire-and-forget). **Do not** sign them in to the wrong tenant.
4. **Set the active tenant for the session.** Add a `Set-Cookie` on the JSON response: `active_tenant=<tenantId>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<session>`. (Mechanism + security model in §3.) Active tenant defaults to `profile.tenant_id` when no company-code tenant was supplied — so single-tenant users get a cookie that equals their home tenant (harmless, and makes §3 uniform).
5. Return the existing payload, plus `active_tenant_id` in the `user` object so the client landing (§4) can branch without re-reading the cookie.

**Email/password auth is unchanged.** `signInWithPassword` still runs first; membership is a post-auth authorization gate.

### 2.3 Rejection UX
On a `403 tenant_membership_denied`, `app/login/page.tsx` already surfaces `result.error` in the red banner (`:112-117`). The message tells the user to recheck the code or contact their admin, and the "Change company" link (`login/page.tsx:206-209`) lets them re-enter a different code. No new UI required.

### 2.4 Composition with `PROFILE_SYSTEM_PLAN` (email-OR-phone-OR-username)
That plan also modifies `/api/auth/login` to resolve a credential → email **before** `signInWithPassword`, and proposes passing `tenant_id` to disambiguate phone/username across tenants. **These compose cleanly:** credential-resolution happens first (produces the email to authenticate with), then THIS plan's membership gate runs after auth succeeds. The `tenant_id` body field is shared — add it once. Implement whichever lands first; the second is a small insertion. Flag for the guardian to review the merged route as one unit.

---

## 3. Active-tenant propagation + security model

### 3.1 Mechanism: httpOnly `active_tenant` cookie (recommended)
- Set by `/api/auth/login` (§2.2 step 4). `HttpOnly` (JS can't read/spoof it), `Secure`, `SameSite=Lax`, `Path=/`.
- **Why a cookie, not localStorage:** server routes (`api-auth.ts`) need to read the active tenant, and it must be **un-spoofable by client JS**. localStorage is client-writable → a user could set `active_tenant` to a tenant they don't belong to. httpOnly cookie is set only by the trusted login route after the membership check.
- A **non-httpOnly mirror** (`active_tenant_id` in the `user` localStorage object, from §2.2 step 5) is fine for **display/landing only** — it is NEVER trusted for authorization. The httpOnly cookie + server-side re-validation (§3.3) is the security boundary.

### 3.2 How `api-auth.ts` resolves the acting tenant
Extend `resolveTenantScope(request, auth)` (`lib/api-auth.ts:331-383`) — the existing single point that decides query scope:
1. **Non-super-admins (today's path, hardened):**
   - Read `active_tenant` cookie. If present AND `user_has_tenant_membership(userId, cookieTenant)` is true → `tenantId = cookieTenant`.
   - Else → fall back to `auth.tenantId` (their `profiles.tenant_id`, as today).
   - **Never** trust the cookie without the membership re-check. A user who hand-crafts a cookie for a tenant they don't belong to fails the `tenant_users` check → falls back to their home tenant. **No spoofing possible.**
   - For the vast majority (single-tenant operators) the cookie == home tenant == `profiles.tenant_id` → identical to today.
2. **super_admin (today's path, preserved):** the existing `?tenantId=` query param **still wins** (the platform console passes it explicitly — do not break that). If no `?tenantId=`, read the `active_tenant` cookie (validated only by "tenant exists", since super_admin may act as any). If neither, fall back to `profiles.tenant_id` then the existing 400. Order: **`?tenantId=` query → `active_tenant` cookie → profile tenant → 400.**

This keeps `resolveTenantScope` the one chokepoint; routes that already call it inherit active-tenant behavior with zero per-route changes.

### 3.3 The RLS caveat (load-bearing — see §0)
`current_user_tenant_id()` reads `profiles.tenant_id`, so **RLS-enforced reads (via the anon/public client) are still scoped to the user's HOME tenant, regardless of the cookie.** This is acceptable and in fact safer because:
- All admin/data routes in this codebase use **`supabaseAdmin`** (RLS-bypassing) + an **explicit `.eq('tenant_id', tenantId)`** where `tenantId` comes from `resolveTenantScope`. So switching the cookie correctly retargets every `supabaseAdmin`-based route **without** touching RLS. (This matches how super_admin `?tenantId=` cross-tenant reads already work today.)
- Client-side public-client reads (rare in admin surfaces) remain pinned to the home tenant by RLS — they cannot leak another tenant's data even with a forged cookie. **Fail-safe.**
- **Phase-1 decision: do NOT make `current_user_tenant_id()` cookie-aware.** Reading a cookie inside a SECURITY DEFINER SQL function is fragile (requires GUC plumbing via `request.headers`), risks every existing RLS policy, and is hard to reverse. Keep RLS pinned to `profiles.tenant_id`. The cookie only influences `supabaseAdmin` + explicit-filter routes. (If a future phase needs RLS to follow the active tenant, that is a separate, guardian-gated change with its own rollback.)

### 3.4 `getCurrentUser()` + landing
- `getCurrentUser()` (`lib/auth.ts`) is unchanged in contract — still cross-validates id vs session, still fails closed. It MAY additionally expose `active_tenant_id` from the localStorage mirror for landing (display only; not authorization). The anti-bleed cross-check is untouched.
- `logout()` must **also clear the `active_tenant` cookie**. Since httpOnly cookies can't be cleared from JS, add a tiny `POST /api/auth/logout` (or extend an existing one) that sends `Set-Cookie: active_tenant=; Max-Age=0`. Call it from `logout()` alongside the existing `supabase.auth.signOut()` + localStorage purge. This prevents an active-tenant carrying into the next user on a shared device — **extends the existing anti-bleed contract**.

### 3.5 Security model (explicit)
| Actor | Cookie says | Membership check | Result |
|---|---|---|---|
| Operator (single-tenant) | their home tenant | ✓ | scoped to home (== today) |
| Operator forges cookie → another tenant | tenant X | ✗ (no `tenant_users` row) | **falls back to home tenant** — denied X |
| Multi-tenant user, valid 2nd tenant | tenant B | ✓ | scoped to B |
| super_admin | any tenant | exists-check only | acts as that tenant |
| Anyone, RLS-enforced client read | (any cookie) | n/a | RLS pins to `profiles.tenant_id` — cookie ignored |

**Invariant: a non-super-admin can never act as a tenant for which they lack a `tenant_users` row. super_admin can act as any existing tenant.** No `user_metadata` is consulted anywhere (compliant with the project's hard rule).

---

## 4. Landing

Decision logic after login, in priority order. The "active tenant" comes from §2.2 step 5 (`user.active_tenant_id`) / the cookie.

1. **super_admin + active tenant == PONTIFEX (the platform/home tenant)** → `/dashboard/platform` (Hub). *Today's behavior, now expressed as "active == platform tenant" instead of "role == super_admin".*
2. **super_admin + active tenant == a client tenant** (PATRIOT/APEX) → `/dashboard/admin`. The `active_tenant` cookie makes every `resolveTenantScope` call return that client → the existing admin pages/APIs render the client's data with **no per-page changes**.
3. **Normal management roles** (`admin`, `operations_manager`, `salesman`, `supervisor`, `shop_manager`, `shop_help`, `inventory_manager`) → `/dashboard/admin` (as today).
4. **Operators / apprentices** → `/dashboard` (as today).

Implementation: in `app/login/page.tsx:142-148`, branch on `result.user.active_tenant_id` for the super_admin case; otherwise keep the existing role switch verbatim. Also update `app/dashboard/page.tsx:107-109` so the `super_admin → /dashboard/platform` redirect only fires when the active tenant is the platform tenant (otherwise let them stay on `/dashboard/admin`). Identify "the platform tenant" by **company_code = 'PONTIFEX'** (or a `tenants.is_platform boolean` flag added in §6 to avoid hardcoding the code).

**Single-tenant users are entirely unaffected** — their active tenant always equals their home tenant; rules 3 & 4 are byte-for-byte today's behavior.

---

## 5. Editable email flow

Email is the login credential (against `auth.users.email`) AND a display field (`profiles.email`). They must stay in sync. The company-code login is unaffected — email still identifies the user within the resolved tenant.

### 5.1 UI (My Profile)
- `app/dashboard/my-profile/page.tsx:253` — replace the read-only `<p>{profile.email}</p>` with an **email field + "Change email" affordance** (edit button → input + "Send verification"). Keep it visually consistent with the existing Nickname/Phone inputs (`:263-279`).
- After submit: show "Check your new inbox to confirm." The email does **not** change until verified (prevents lockout / typo-lockout).

### 5.2 API: dual-write with verification
New `POST /api/my-profile/change-email` (do NOT fold into the generic PATCH — email needs verification, the allow-list at `/api/my-profile/route.ts:45-49` deliberately excludes it; keep that exclusion).
- Authn via Bearer (reuse `requireAuth`). Body `{ new_email }`. Normalize: `trim().toLowerCase()` (matches the case-bug lesson in `MEMORY.md → email-lookup-case-bug.md`).
- **Pre-checks:** reject if `new_email` already exists in `profiles` (case-insensitive `ilike` + `.maybeSingle()`) or in `auth.users` — one email = one account.
- **Verified change (recommended path):** call `supabaseAdmin.auth.admin.generateLink({ type: 'email_change_current'/'email_change_new', … })` **or** use Supabase's built-in `updateUser({ email })` flow which sends a confirmation to the new address and only flips `auth.users.email` after the user clicks. **`profiles.email` is updated to match only after `auth.users.email` confirms** — driven by either (a) an `auth` webhook / `on_auth_user_updated` trigger that mirrors `auth.users.email → profiles.email`, or (b) a confirmation-callback route that re-reads `auth.users` and writes `profiles.email`. **Prefer the trigger** (single source of truth, no drift window): `CREATE TRIGGER … AFTER UPDATE OF email ON auth.users … UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id`. SECURITY DEFINER, idempotent.
- **Audit:** fire-and-forget into the existing audit/`login_attempts` pattern (record old + new email, actor).
- **Sync invariant:** `auth.users.email` is the source of truth; `profiles.email` is a mirror kept current by the trigger. Never write `profiles.email` directly in the change flow — only via the trigger after `auth` confirms. This guarantees they can't diverge.

### 5.3 Interaction with company-code login
- After an email change, the user logs in with the **new** email + same password + same company code. Their `tenant_users` membership (keyed on `user_id`, not email) is unaffected → routing still works. No membership rewrite needed.
- Cross-reference `PROFILE_SYSTEM_PLAN`: if that plan's email-OR-phone-OR-username resolver is live, the new email immediately works as a login credential too (it resolves to the same `auth.users` row). The phone/username paths are unaffected.

---

## 6. Migration / rollout (phased, reversible, behavior-preserving)

Each phase is independently shippable and reversible. **No phase changes behavior for single-tenant users until phase 4, and even then it's a no-op for them.**

- **Phase 0 — schema (additive only).**
  - `UNIQUE (tenant_id, user_id)` on `tenant_users` (verify absent first; idempotent).
  - `tenant_users.app_role text NULL` (reserved, unused — §1.2).
  - `tenants.is_platform boolean NOT NULL DEFAULT false`; set `true` for PONTIFEX (avoids hardcoding the company_code in landing — §4).
  - RPC `user_has_tenant_membership` + the §5.2 `auth.users.email → profiles.email` trigger.
  - All `CREATE … IF NOT EXISTS` / `ON CONFLICT` / `EXCEPTION WHEN duplicate_object`. **Reversible:** drop the column/constraint/function/trigger.
- **Phase 1 — backfill `tenant_users`** from `profiles` (§1.3) + founder's PONTIFEX membership. Pure data; re-runnable; reversible by deleting only the rows this migration inserted (tag with a known `invited_by` sentinel or a migration marker if strict reversibility is required).
- **Phase 2 — login route** (§2): accept `tenant_id`, membership gate, set `active_tenant` cookie. **Guarded by the fallback** (`requestedTenantId === profile.tenant_id` always passes) → single-tenant users see no change even if their `tenant_users` row were somehow missing. `app/login/page.tsx` sends `tenant_id`. Reversible: stop reading the body field / stop setting the cookie.
- **Phase 3 — `api-auth.ts`** (§3.2): make `resolveTenantScope` cookie-aware (membership-validated). super_admin `?tenantId=` precedence preserved. Reversible: revert `resolveTenantScope`. **No route files change.**
- **Phase 4 — landing** (§4) + `logout` clears cookie (§3.4) + editable email UI/API (§5). Reversible per-piece.

**Validation gate before each push:** `npm run build` green; smoke-test all 8 demo roles still log in and land where they do today (operators → `/dashboard`, admin → `/dashboard/admin`); founder PONTIFEX→Hub, founder PATRIOT→`/dashboard/admin` showing Patriot data; a Patriot operator entering `APEX` is rejected with the friendly message.

### Founder unblock (immediate)
Phase 1 adds his PONTIFEX membership; his existing PATRIOT/owner row stays. Once Phases 2–4 land, `andres.altamirano1280@gmail.com` + `PONTIFEX` → Hub; same email + `PATRIOT` → Patriot's `/dashboard/admin`. **Before Phase 2 ships**, a stopgap that needs no code: he can already reach any tenant's data via the platform console's explicit `?tenantId=` (super_admin path, already live) — so he is not hard-blocked operationally in the interim.

---

## 7. Risks + guardian checklist

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Backfill gap locks a real user out** of their own tenant | Login membership gate **always also accepts `requestedTenantId === profile.tenant_id`** (§2.2 step 2). A missing `tenant_users` row can never deny a user their home tenant. |
| R2 | **Cookie spoofing** — user forges `active_tenant` for a tenant they don't belong to | `active_tenant` is **httpOnly** (set only by the trusted login route post-membership-check) AND `resolveTenantScope` **re-validates membership server-side** on every request (§3.2). Forged cookie → fails check → falls back to home tenant. |
| R3 | **RLS bypass** — cookie tricks RLS into exposing another tenant | RLS uses `current_user_tenant_id()` = `profiles.tenant_id`, **unchanged** (§3.3). The cookie only affects `supabaseAdmin` + explicit-`.eq('tenant_id')` routes. Client RLS reads stay pinned to home tenant — fail-safe. |
| R4 | **Anti-bleed regression** | `getCurrentUser()` id-vs-session cross-check untouched; `logout()` **extended** to also clear the `active_tenant` cookie via a server route (§3.4). Active tenant never survives a logout. |
| R5 | **super_admin cross-tenant break** | `?tenantId=` query **keeps precedence** over the cookie in `resolveTenantScope` (§3.2) — the existing platform console is untouched. |
| R6 | **Email change drift / lockout** | `auth.users.email` is the single source of truth; `profiles.email` mirrored by trigger **only after** confirmation; old email stays valid until the new one is verified (§5.2). Dup-email pre-check prevents collisions. |
| R7 | **`tenant_users.role` mistaken for app role** | Documented (§1.1): membership rank only; app authz stays on `profiles.role`. `app_role` column reserved but unused in phase 1. |
| R8 | **`user_metadata` authz** | None introduced. All checks read `tenant_users` / `profiles` / validated cookie. Compliant with the project's hard rule. |
| R9 | **22 orphan `tenant_users` rows** | Left untouched; flagged for the separate orphan-cleanup task (shared with `PROFILE_SYSTEM_PLAN §9`). They reference users with no profile → cannot log in anyway. |

### Guardian checklist (pre-merge)
- [ ] Anti-bleed preserved: `getCurrentUser()` cross-check unchanged; `logout()` clears `active_tenant` cookie + all `sb-*-auth-token`.
- [ ] No tenant spoofing: `active_tenant` is httpOnly; `resolveTenantScope` re-validates membership for non-super-admins on every call.
- [ ] RLS untouched: `current_user_tenant_id()` still reads `profiles.tenant_id`; no policy now trusts a cookie/`user_metadata`.
- [ ] Single-tenant users unaffected: demo-role smoke test lands identically to pre-change; login fallback (`requestedTenantId === profile.tenant_id`) verified.
- [ ] super_admin `?tenantId=` precedence intact (platform console regression test).
- [ ] Backfill idempotent (`ON CONFLICT DO NOTHING` + `UNIQUE (tenant_id, user_id)`); orphans untouched; founder PONTIFEX membership present.
- [ ] Email change: dual-write via trigger only-after-confirm; dup-email blocked; old email valid until verified; audited.
- [ ] `npm run build` green; migrations additive + reversible.
