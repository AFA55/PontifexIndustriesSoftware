# Feedback & Monitoring Plan

Two additive "issue surfaces" for the Pontifex platform:

1. **Operator/Helper feedback** — operators AND apprentices (helpers) flag a bug / request a change / suggest an idea; admin/ops triage & respond. Mirrors the proven **maintenance-request** pattern.
2. **Super-admin Bug & Security portal** — a new page in the Platform Console (`/dashboard/platform/*`, super_admin only) surfacing prod errors (Sentry + app `error_logs`) and Supabase **security advisor** findings.

> **Scope:** Analysis + design only. Another agent implements; a guardian reviews. **Strictly additive — never break live behavior.** All DDL idempotent; all new tables get `tenant_id` + tenant-scoped RLS via the SECURITY DEFINER helpers.

---

## 0. Verified ground truth (file:line + real schema)

**The maintenance pattern (this is what we mirror — do NOT reinvent):**
- Submit: `app/api/maintenance-requests/route.ts` — `POST`, `requireAuth`, inserts via `supabaseAdmin` with `tenant_id: auth.tenantId`, `submitted_by: auth.userId`; then **fire-and-forget** fans out `notifications` rows + `sendPushToUser` to managers (`route.ts:55-97`). Returns `{ success: true, data }` / `{ error }` (`route.ts:99,52`).
- Triage list: `app/api/admin/maintenance-requests/route.ts` — `GET`, `requireAuth` + role gate `SHOP_ROLES = ['shop_manager','admin','super_admin','operations_manager']` (`:13,19`); tenant-scoped query with `super_admin` bypass (`:44-46`); status filter incl. `closed → ['done','cancelled']` (`:49-53`); paginated `{ count: 'exact' }`.
- Update: `app/api/admin/maintenance-requests/[id]/route.ts` (PATCH — resolve/notes).
- Operator entry UI: `app/dashboard/maintenance/new/page.tsx` — multi-step mobile-first form, `getCurrentUser()` guard, `ALLOWED_ROLES` includes `operator`, `apprentice`, `supervisor`, `shop_help`, etc. (`:33,63-68`); photo upload to a Supabase bucket with 30-day signed URL (`:101-112`); `min-h-[44px]` tap targets.
- Admin inbox UI lives at route `/dashboard/admin/maintenance` (referenced as `action_url` in `route.ts:84`).

**`maintenance_requests` columns (verified):** `id, tenant_id (NOT NULL), equipment_id, equipment_name, submitted_by (NOT NULL), description, priority, status, voice_note_url, photo_urls (array), resolved_by, resolved_at, resolution_notes, supervisor_visit_id, created_at, updated_at, request_type (NOT NULL)`.
RLS policies (verified): `mr_insert` (INSERT), `mr_read_tenant` (SELECT), `mr_manager_update` (UPDATE).

**`notifications` columns (verified, reuse as-is):** `id, user_id, type, title, message, read, job_id, created_at, notification_type, delivery_method, action_url, action_type, priority, metadata, related_entity_type, related_entity_id, tenant_id, sender_id, is_read, ...`.

**Error logging (verified — has a real bug, see §7):**
- `app/api/log-error/route.ts` — public `POST`, no auth, fire-and-forget insert into `error_logs`, always returns 200.
- `error_logs` columns (verified): `id, endpoint (NOT NULL), method (NOT NULL), status_code, error_message (NOT NULL), error_stack, user_id, user_role, ip_address, created_at, type, stack_trace, component_stack, url, user_agent, metadata, tenant_id`.
- RLS (verified): INSERT `Anyone can insert error logs` / `error_logs_insert_policy`; SELECT `Super admins can read error logs` / `error_logs_read_policy`. **Super-admin read access already exists.**
- **BUG:** the route inserts `error_message, stack_trace, component_stack, url, user_agent, metadata, type, created_at` but NEVER sets `endpoint` or `method`, which are `NOT NULL`. Every client error insert currently fails its NOT-NULL constraint and is swallowed by `.catch(() => {})` (`route.ts:39`). `error_logs` is effectively empty. **Fix is a prerequisite for the bug portal to show app errors.**

**Sentry (verified — wired, gated):**
- `instrumentation.ts` + `instrumentation-client.ts`, `@sentry/nextjs`. Fully no-op unless `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` set AND `NODE_ENV=production` (`instrumentation.ts:13-26`). Founder action: set DSN in Vercel.

**Platform Console (verified — super_admin only):**
- `app/dashboard/platform/layout.tsx` — `getCurrentUser()` guard, hard `u.role !== 'super_admin' → /dashboard` (`:26-29`); distinct slate + amber/crown shell (`:42-77`); `max-w-7xl` main. Single guard surface for the whole `/dashboard/platform/*` area.
- Existing pages: `tenants/`, `backups/`. Components: `components/platform/{ModuleSwitchboard,TenantUsersTab,shared}.tsx`.
- Entry point listed in `components/DashboardSidebar.tsx`.

**RLS helpers (verified in `pg_proc`):** `current_user_tenant_id()`, `current_user_role()`, `current_user_has_role(VARIADIC text[])`, `is_admin()`.

**api-auth (verified):** `requireAuth` (`:108`), `requireAdmin` (`:139`), `requireSuperAdmin` (`:174`). `auth` result exposes `authorized`, `response`, `role`, `tenantId`, `userId`, `userEmail`.

**Supabase advisor API (verified live — 108 findings):** `get_advisors({type:'security'|'performance'})`. Each finding object: `{ name, title, level ('INFO'|'WARN'|'ERROR'), facing, categories[], description, detail, remediation, metadata, cache_key }`. Current security advisors include `rls_policy_always_true` (×12), `rls_enabled_no_policy` (×2), `function_search_path_mutable` (×15), `public_bucket_allows_listing` (×5), `auth_leaked_password_protection`, etc. **This is real, actionable data the portal can render today.**

---

## 1. Operator/Helper feedback — data model

New table `feedback_submissions`. Mirrors `maintenance_requests` shape & naming.

```sql
-- Migration: supabase/migrations/20260606_feedback_submissions.sql  (ADDITIVE, idempotent)

CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reporter_id     uuid NOT NULL,                 -- auth.users id (== auth.userId)
  reporter_role   text NOT NULL,                 -- snapshot of role at submit time
  type            text NOT NULL DEFAULT 'bug'    -- 'bug' | 'change_request' | 'idea'
                    CHECK (type IN ('bug','change_request','idea')),
  title           text NOT NULL,
  body            text NOT NULL DEFAULT '',
  page_url        text,                          -- auto-captured current route
  context         jsonb DEFAULT '{}'::jsonb,     -- userAgent, viewport, app version, screenshot ref
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_review','planned','done','declined')),
  admin_response  text,
  responded_by    uuid,                          -- auth.users id of triager
  responded_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_tenant_status
  ON public.feedback_submissions (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_reporter
  ON public.feedback_submissions (reporter_id, created_at DESC);

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

-- INSERT: any authenticated user may file feedback for their own tenant as themselves.
DO $$ BEGIN
  CREATE POLICY fb_insert ON public.feedback_submissions
    FOR INSERT TO authenticated
    WITH CHECK (
      tenant_id = public.current_user_tenant_id()
      AND reporter_id = auth.uid()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SELECT: reporter sees own; admin/ops/super see their tenant's; super sees ALL.
DO $$ BEGIN
  CREATE POLICY fb_read ON public.feedback_submissions
    FOR SELECT TO authenticated
    USING (
      reporter_id = auth.uid()
      OR (
        public.current_user_has_role('admin','operations_manager','super_admin')
        AND tenant_id = public.current_user_tenant_id()
      )
      OR public.current_user_role() = 'super_admin'   -- cross-tenant (see §5)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- UPDATE: only admin/ops/super (triage + respond). Tenant-scoped; super cross-tenant.
DO $$ BEGIN
  CREATE POLICY fb_manager_update ON public.feedback_submissions
    FOR UPDATE TO authenticated
    USING (
      (public.current_user_has_role('admin','operations_manager')
        AND tenant_id = public.current_user_tenant_id())
      OR public.current_user_role() = 'super_admin'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

Notes:
- All server writes go through `supabaseAdmin` (bypasses RLS) — RLS above is defense-in-depth + correctness for any future client-side reads. No `auth.jwt() -> 'user_metadata'` anywhere.
- `reporter_role` is a snapshot (so a later role change doesn't rewrite history); set server-side from `auth.role`.
- `context` jsonb holds non-PII diagnostics; never store tokens.

---

## 2. Operator/Helper UI — "Report an issue / suggest a change"

Mirror `app/dashboard/maintenance/new` UX, but lighter (no equipment step).

**Global entry point (preferred):** a small floating button + a sidebar link.
- Add a `<FeedbackButton />` to the shared dashboard chrome so it's reachable from operator AND helper dashboards on every page. Cheapest insertion: render it inside the existing topbar/sidebar component used across `/dashboard/*` (the same component that hosts `NotificationBell`). It opens a bottom-sheet modal (mobile-first), not a route change, so operators don't lose their place mid-task.
- The modal auto-captures `page_url = window.location.pathname` and `context = { userAgent, viewport, appVersion }`.

**Form (one screen, ≤2 taps to submit):**
1. **Type chips** (one tap): 🐞 Bug · ✏️ Change · 💡 Idea (maps to `type`). Default Bug.
2. **Title** (short text, required) + **Details** (textarea, optional). Inputs use the mobile 16px floor (avoid iOS zoom — see CLAUDE.md mobile gotchas).
3. **Submit** → `POST /api/feedback` → success card ("Thanks — the team will review this"), mirroring the maintenance submitted state.

**Standalone route (optional, for deep-links / a "View my reports" history):** `app/dashboard/feedback/page.tsx` lists the reporter's own submissions with status badges. Reuse the maintenance status-chip styling. Helpful so operators see that `done`/`planned` responses landed.

Tap targets ≥44px; no horizontal overflow at 375px; dark-mode classes like the maintenance page. Run `mobile-responsive-auditor` before merge.

---

## 3. Management triage UI

**Where:** new admin page `app/dashboard/admin/feedback/page.tsx` (a sibling to `/dashboard/admin/maintenance`). A dedicated page, not a tab — feedback and maintenance are different queues with different audiences (ops vs shop_manager).

**UI (reuse maintenance-inbox patterns):**
- Status tabs: Open · In Review · Planned · Done · Declined (mirrors maintenance `status` filter incl. a "closed" grouping if desired).
- Cards: type icon, title, reporter name + role chip, page_url, relative time, body preview.
- Detail/drawer: full body + context, status dropdown, `admin_response` textarea, Save → PATCH.
- Pagination via `{ count: 'exact' }` like `admin/maintenance-requests/route.ts:39`.

**Badge / counts:** add an open-feedback count. Two low-cost options:
- Reuse the `notifications` fan-out (see §2 API) so admins get a `NotificationBell` ping per submission (exactly like maintenance, `notification_type: 'feedback_submission'`, `action_url: '/dashboard/admin/feedback'`).
- Optional numeric badge on the sidebar link via a tiny `GET /api/admin/feedback?status=open&countOnly=1`.

**APIs:**
- `POST /api/feedback` — `requireAuth`; insert with `tenant_id: auth.tenantId, reporter_id: auth.userId, reporter_role: auth.role`; fire-and-forget notify admin/ops (copy `maintenance-requests/route.ts:55-97` verbatim, swap entity type + action_url). Returns `{ success: true, data: { id } }`.
- `GET /api/admin/feedback` — `requireAuth` + role gate `['admin','operations_manager','super_admin']`; tenant-scoped with `super_admin` bypass (copy `admin/maintenance-requests/route.ts:44-46`); status filter + pagination.
- `PATCH /api/admin/feedback/[id]` — same role gate; set `status`, `admin_response`, `responded_by = auth.userId`, `responded_at = now()`, `updated_at`; optional fire-and-forget notify the reporter ("Your report was updated"). Returns `{ success: true }`.

---

## 4. Super-admin Bug & Security portal (Platform Console)

New page: **`app/dashboard/platform/monitoring/page.tsx`** (inherits the super_admin guard from `platform/layout.tsx` — no extra guard needed). Add a "Monitoring" tile/link in the platform nav and in `components/DashboardSidebar.tsx`.

Two sections.

### 4a. Bugs / Errors
Surface prod errors from two sources, clearly labeled by availability:

- **Sentry (primary, when DSN set):**
  - **Now (zero-config):** a prominent "Open Sentry Dashboard" link-out (env-driven `NEXT_PUBLIC_SENTRY_ORG_URL`). When `SENTRY_DSN` is unset, render a muted "Sentry not yet enabled — set `SENTRY_DSN` in Vercel" card instead of a dead link.
  - **Later (in-app summary):** a `GET /api/platform/sentry-summary` that calls the Sentry REST API (`/projects/{org}/{project}/issues/`) with a server-only `SENTRY_AUTH_TOKEN` and returns top unresolved issues (title, count, last seen, level, permalink). Render as a compact table. Gated/no-op until the token exists. **Defer** — link-out is enough for launch.
- **App `error_logs` (works today once §7 fix lands):**
  - `GET /api/platform/error-logs` — `requireSuperAdmin`; reads `error_logs` newest-first, paginated, optional `?type=` and `?tenant_id=` filters (cross-tenant: super sees all; `error_logs` SELECT RLS already restricts to super_admin). Group/count by `error_message` for a "top errors" view.
  - Render: top-N errors with occurrence count + last-seen, expandable stack/url/tenant. Each row from a real tenant gets a tenant chip (join `tenants.name`).

### 4b. Security Alerts
Surface Supabase security advisor findings.

- `GET /api/platform/security-advisors` — `requireSuperAdmin`; server-side calls the Supabase advisors endpoint (`type=security`) and returns the `lints[]` array. Because the management API needs a Supabase access/management token, store it server-only (`SUPABASE_ACCESS_TOKEN`) and call `https://api.supabase.com/v1/projects/{ref}/advisors/security` (ref = `klatddoyncxidgqtcjnu`). No-op/empty with a "configure access token" notice if unset.
- **Render** (each lint has verified fields `name, title, level, categories, description, detail, remediation`):
  - Group by `level` → ERROR (rose) · WARN (amber) · INFO (slate); badge counts at top.
  - Card per finding: title, level chip, affected object (from `detail`/`metadata`), plain-English `description`, and a "Fix" link (the `remediation` URL).
  - **Acknowledge:** a new tiny table `security_advisor_acks` lets the super-admin mark a finding handled/snoozed so the list stays actionable run-over-run.

```sql
-- Migration: supabase/migrations/20260606_security_advisor_acks.sql (ADDITIVE, idempotent)
CREATE TABLE IF NOT EXISTS public.security_advisor_acks (
  cache_key     text PRIMARY KEY,        -- advisor finding's stable cache_key
  name          text NOT NULL,           -- lint name (e.g. rls_policy_always_true)
  status        text NOT NULL DEFAULT 'acknowledged'
                  CHECK (status IN ('acknowledged','snoozed','resolved')),
  note          text,
  acked_by      uuid NOT NULL,
  acked_at      timestamptz NOT NULL DEFAULT now(),
  snooze_until  timestamptz
);
ALTER TABLE public.security_advisor_acks ENABLE ROW LEVEL SECURITY;
-- Platform-owner-only data (no tenant_id by design — it's about the whole project).
DO $$ BEGIN
  CREATE POLICY saa_super_all ON public.security_advisor_acks
    FOR ALL TO authenticated
    USING (public.current_user_role() = 'super_admin')
    WITH CHECK (public.current_user_role() = 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```
The advisors GET joins `cache_key` against `security_advisor_acks` to dim/hide acknowledged findings; `PATCH /api/platform/security-advisors/ack` upserts an ack.

### Feasible now vs later
| Capability | Now | Later |
|---|---|---|
| Security advisors list + acknowledge | ✅ API live; needs `SUPABASE_ACCESS_TOKEN` env | refresh-on-schedule / email digest |
| App error_logs viewer | ✅ after §7 NOT-NULL fix | top-error rollups, trend chart |
| Sentry | link-out card (env URL) | in-app issue summary via Sentry REST API |

---

## 5. Cross-tenant feedback for super-admin

**Recommend: yes, read-only, in the Platform Console.** The `fb_read` policy in §1 already grants `super_admin` cross-tenant SELECT, and the triage `GET /api/admin/feedback` already bypasses the tenant filter for `super_admin` (mirroring maintenance). Add a thin **`app/dashboard/platform/feedback/page.tsx`** that calls `GET /api/admin/feedback?allTenants=1` and shows a **tenant column** (join `tenants.name`) plus a tenant filter. This gives the platform owner a single cross-tenant view of every customer's bug/feature signal — high product value, zero new write surface (read-only; respond stays per-tenant in the admin page, or allow super to respond via the existing PATCH which already permits super_admin).

---

## 6. File-by-file change list

**Migrations (additive, idempotent; apply via MCP `apply_migration`):**
- `supabase/migrations/20260606_feedback_submissions.sql` — §1.
- `supabase/migrations/20260606_security_advisor_acks.sql` — §4b.

**New API routes:**
- `app/api/feedback/route.ts` — POST (operator/helper submit).
- `app/api/admin/feedback/route.ts` — GET (triage list, tenant-scoped, super bypass, `allTenants`/`countOnly` flags).
- `app/api/admin/feedback/[id]/route.ts` — PATCH (status + admin_response).
- `app/api/platform/error-logs/route.ts` — GET (super_admin; reads `error_logs`).
- `app/api/platform/security-advisors/route.ts` — GET (super_admin; Supabase advisors API + ack join).
- `app/api/platform/security-advisors/ack/route.ts` — PATCH/POST (upsert ack).
- *(Deferred)* `app/api/platform/sentry-summary/route.ts` — GET (Sentry REST, when token set).

**New UI:**
- `components/FeedbackButton.tsx` — global floating button + bottom-sheet modal.
- `app/dashboard/feedback/page.tsx` — operator "my reports" history (optional).
- `app/dashboard/admin/feedback/page.tsx` — management triage inbox.
- `app/dashboard/platform/monitoring/page.tsx` — bug + security portal.
- `app/dashboard/platform/feedback/page.tsx` — cross-tenant feedback (read-only).
- `components/platform/SecurityAdvisorList.tsx`, `components/platform/ErrorLogTable.tsx` — section components (match `components/platform/shared.tsx` styling).

**Edits to existing files:**
- `components/DashboardSidebar.tsx` — add admin "Feedback" link (admin/ops) + platform "Monitoring" and "Feedback" links (super_admin); mount `<FeedbackButton />` in shared chrome (alongside `NotificationBell`).
- `app/api/log-error/route.ts` — **§7 bug fix** (set `endpoint`/`method`). Standalone-safe; do regardless.
- `lib/rbac.ts` — if dashboard cards are RBAC-gated, add a `feedback` card (admin/ops read) so it appears for the right roles.

**Env (founder action, Vercel):** `SUPABASE_ACCESS_TOKEN` (advisors), `NEXT_PUBLIC_SENTRY_ORG_URL` (Sentry link), later `SENTRY_DSN` + `SENTRY_AUTH_TOKEN`.

---

## 7. Prerequisite bug fix — `error_logs` NOT-NULL mismatch

`app/api/log-error/route.ts` never sets `endpoint` / `method`, both `NOT NULL` on `error_logs` → **every client-error insert silently fails** (swallowed at `route.ts:39`). The error portal would show nothing until fixed.

Fix (additive, no behavior change to callers): in the insert object add
`endpoint: (body.url || 'client').slice(0,500)` and `method: 'CLIENT'` (sentinel for browser-origin errors), and set `tenant_id`/`user_id` when derivable. Alternatively, a migration making `endpoint`/`method` nullable with a default — but the route fix is simpler and keeps server-side `error_logs` rows (which legitimately have endpoint/method) intact.

> Recommend spinning this off as its own small task — it's a real latent bug independent of the feature.

---

## 8. Open questions
1. **Feedback notification volume** — fan out to every admin/ops (like maintenance) or to a single designated triager per tenant? Maintenance fans out to all; default to that for consistency.
2. **Screenshot capture** — auto-attach a screenshot to bug reports (e.g. `html2canvas` → the existing photo bucket)? Higher value for bugs, more weight on mobile. Defer to v2; `context.page_url` covers most triage.
3. **Operator visibility of responses** — push a notification to the reporter on status change, or just show it in "My reports"? Recommend a lightweight notification on `done`/`declined`.
4. **Sentry timing** — confirm the founder will set `SENTRY_DSN`; until then the portal's Bug section leans on `error_logs`. Link-out card covers the gap.
5. **Advisor refresh cadence** — on-demand (button) is fine for launch; a daily cron writing a snapshot is a later nicety. Avoid auto-refresh on every page load (the advisors call is heavy — 108 findings).
6. **`apprentice` role label** — surface "Helper" vs "Apprentice" in the triage reporter chip? Cosmetic; confirm preferred term.

---

## 9. Guardian checklist
- [ ] Both new tables have `tenant_id` + tenant-scoped RLS (`security_advisor_acks` is intentionally platform-global/super-only — documented).
- [ ] RLS uses `current_user_*` SECURITY DEFINER helpers; **no `auth.jwt() -> 'user_metadata'`** anywhere.
- [ ] All DDL idempotent (`CREATE ... IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object`).
- [ ] Purely additive — no existing table/column/route/policy altered (except the standalone `log-error` bug fix, which only *adds* fields).
- [ ] Server writes via `supabaseAdmin`; reads/role-gates via `requireAuth`/`requireAdmin`/`requireSuperAdmin`.
- [ ] Notifications + push reuse the verified maintenance fan-out (fire-and-forget, `.catch(() => {})`).
- [ ] Response shape `{ success: true, data }` / `{ error }` with HTTP status.
- [ ] Mobile-first: ≥44px tap targets, 16px input floor, no overflow at 375px; run `mobile-responsive-auditor` on operator/helper surfaces.
- [ ] Platform pages live under `/dashboard/platform/*` so they inherit the super_admin layout guard — no destructive cross-tenant action outside the slate/amber shell.
- [ ] Secrets (`SUPABASE_ACCESS_TOKEN`, `SENTRY_AUTH_TOKEN`) are server-only env, never `NEXT_PUBLIC_*`.
- [ ] No new push to `main` without `npm run build` green (Vercel cost discipline).
