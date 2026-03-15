# CLAUDE CODE AGENT HANDOFF DOCUMENT
**Date:** March 10, 2026 | **Branch:** `feature/schedule-board-v2` | **Build Status:** PASSING (143 pages, 0 errors)

---

## WHAT IS THIS PROJECT?

Pontifex Industries is a **concrete cutting management platform** built with **Next.js 15 (App Router) + TypeScript + Supabase (PostgreSQL)**. It manages daily field operations: scheduling crews, tracking timecards, managing equipment, and handling job orders for concrete cutting teams.

**Users:** ~10 operators, ~10 helpers, ~6 admins, 1 super_admin, 1 operations_manager. Used daily in production.

**Supabase Project:** `klatddoyncxidgqtcjnu` (URL: `https://klatddoyncxidgqtcjnu.supabase.co`)

---

## CRITICAL: WHAT NEEDS TO BE DONE IMMEDIATELY

### 1. APPLY THE DATABASE MIGRATION (BLOCKING)

The migration file `supabase/migrations/20260310_security_audit_infrastructure.sql` has been written but **NOT YET APPLIED** to the Supabase database. The Supabase MCP had persistent `net::ERR_FAILED` network errors throughout the session.

**How to apply:**
- **Option A (Preferred):** Use the Supabase MCP `apply_migration` or `execute_sql` tool if connectivity is restored
- **Option B:** Go to Supabase Dashboard > SQL Editor > paste the full contents of `supabase/migrations/20260310_security_audit_infrastructure.sql` > Run
- **Option C:** Use `npx supabase db push` (requires `supabase login` first with a personal access token)
- **Option D:** Use `pg` npm package (already installed) with the database password: `DB_PASSWORD=<password> node /tmp/apply-migration-pg.mjs`

**What the migration creates:**
1. `audit_logs` table - tracks all admin actions (assignments, approvals, role changes)
2. `login_attempts` table - tracks every login success/failure with IP
3. `error_logs` table - tracks API errors with stack traces
4. Updates `profiles.role` CHECK constraint to include `'operations_manager'`
5. Creates `sync_role_to_auth_metadata()` trigger - keeps `profiles.role` synced to `auth.users.raw_user_meta_data.role`
6. Backfills all existing users' auth metadata with their role
7. Creates 5 performance indexes on `job_orders` (date+status, assigned+date, helper+date, pending, will-call)
8. Replaces `schedule_board_view` with optimized LEFT JOIN version (eliminates correlated subqueries)
9. Creates `get_database_stats()` RPC function for the Operations Hub

**Until this migration is applied:** The audit/error/login logging code will silently fail (by design - fire-and-forget pattern). The Operations Hub will show empty data. The `operations_manager` role won't be insertable into profiles. Performance indexes won't exist.

### 2. VERIFY THE OPS HUB PAGE WORKS

After migration is applied, navigate to `/dashboard/admin/ops-hub` as a `super_admin` user and verify:
- System Status Banner shows green
- API Health cards show response times
- Login Audit Trail populates after a login
- Error Logs section shows any recent errors
- Database Stats shows table sizes
- Role/Permission Matrix shows all user roles

---

## WHAT WAS COMPLETED IN THIS SESSION

### Phase 1: Security Hardening

| Task | Status | Files |
|------|--------|-------|
| Fix `requireAuth()` silent 'operator' default | DONE | `lib/api-auth.ts` |
| Create audit_logs, login_attempts, error_logs tables | SQL WRITTEN, NOT APPLIED | `supabase/migrations/20260310_security_audit_infrastructure.sql` |
| Create `logAuditEvent()` utility | DONE | `lib/audit.ts` (NEW) |
| Create `logApiError()` utility | DONE | `lib/error-logger.ts` (NEW) |
| Add login attempt tracking | DONE | `app/api/auth/login/route.ts` |
| Add audit logging to assign route | DONE | `app/api/admin/schedule-board/assign/route.ts` |
| Add audit logging to profiles route | DONE | `app/api/admin/profiles/route.ts` |
| Role sync trigger (profiles -> auth.users) | SQL WRITTEN, NOT APPLIED | migration file |
| Performance indexes (5 on job_orders) | SQL WRITTEN, NOT APPLIED | migration file |
| Optimized schedule_board_view | SQL WRITTEN, NOT APPLIED | migration file |

### Phase 2: Operations Manager Role

| Task | Status | Files |
|------|--------|-------|
| Add `requireOpsManager()` auth guard | DONE | `lib/api-auth.ts` |
| Update `requireAdmin()` to include ops_manager | DONE | `lib/api-auth.ts` |
| Update `requireScheduleBoardAccess()` | DONE | `lib/api-auth.ts` |
| Add `isOpsManager()` client-side helper | DONE | `lib/auth.ts` |
| Update `isAdmin()` to include ops_manager | DONE | `lib/auth.ts` |
| Update login redirect for ops_manager | DONE | `app/login/page.tsx` |
| Add Operations Hub card to admin dashboard | DONE | `app/dashboard/admin/page.tsx` |
| Update ALL 11 admin page guards | DONE | See list below |
| Update role CHECK constraint | SQL WRITTEN, NOT APPLIED | migration file |

### Phase 3: Diagnostics Hub

| Task | Status | Files |
|------|--------|-------|
| Create ops-hub API endpoint | DONE | `app/api/admin/ops-hub/route.ts` (NEW) |
| Create ops-hub dashboard page | DONE | `app/dashboard/admin/ops-hub/page.tsx` (NEW) |
| Create `get_database_stats()` RPC | SQL WRITTEN, NOT APPLIED | migration file |

---

## ROLE-BASED ACCESS CONTROL (RBAC)

### All Roles
| Role | Dashboard Access | Admin Cards | Ops Hub |
|------|-----------------|-------------|---------|
| `operator` | /dashboard only | NONE | NO |
| `apprentice` | /dashboard only | NONE | NO |
| `admin` | /dashboard/admin | 3 core cards* | NO |
| `salesman` | /dashboard/admin | Schedule Board only | NO |
| `super_admin` | /dashboard/admin | ALL cards | YES |
| `operations_manager` | /dashboard/admin | ALL cards | YES |
| `inventory_manager` | /dashboard/admin | Inventory only | NO |

*3 core cards for admin: Timecard Management, Schedule Form, Schedule Board

### Auth Guard Functions (lib/api-auth.ts)
- `requireAuth(request)` - any authenticated user with a profile. Returns 403 if no profile found (NOT a silent default).
- `requireAdmin(request)` - admin, super_admin, operations_manager
- `requireSuperAdmin(request)` - super_admin only
- `requireScheduleBoardAccess(request)` - admin, super_admin, salesman, operations_manager
- `requireOpsManager(request)` - super_admin, operations_manager
- `requireShopUser(request)` - any authenticated user (stub)
- `requireShopManager(request)` - delegates to requireAdmin (stub)

### Client-Side Helpers (lib/auth.ts)
- `getCurrentUser()` - reads from localStorage (`supabase-user` or `pontifex-user`)
- `isAdmin()` - admin, super_admin, operations_manager
- `isSuperAdmin()` - super_admin only
- `isOpsManager()` - operations_manager only
- `isSalesman()` - salesman only
- `isOperator()` - operator only

### Page Guard Pattern (applied to all admin pages)
```typescript
if (!['admin', 'super_admin', 'salesman', 'operations_manager'].includes(currentUser.role)) {
  router.push('/dashboard');
  return;
}
```

Exception: `/dashboard/admin/ops-hub/page.tsx` restricts to `['super_admin', 'operations_manager']` only.

---

## FILES MODIFIED IN THIS SESSION (complete list)

### New Files Created
```
lib/audit.ts                                    - Fire-and-forget audit event logger
lib/error-logger.ts                             - Fire-and-forget API error logger
app/api/admin/ops-hub/route.ts                  - Diagnostics API endpoint (GET)
app/dashboard/admin/ops-hub/page.tsx            - Diagnostics dashboard UI
supabase/migrations/20260310_security_audit_infrastructure.sql - DB migration (NOT APPLIED)
```

### Modified Files
```
lib/api-auth.ts                                 - Fixed requireAuth(), added requireOpsManager(), updated role arrays
lib/auth.ts                                     - Added isOpsManager(), isSuperAdmin(), updated isAdmin()
app/login/page.tsx                              - Added operations_manager to admin redirect
app/api/auth/login/route.ts                     - Added logLoginAttempt() + audit logging on login
app/api/admin/schedule-board/assign/route.ts    - Added audit + error logging (untracked - in ?? dir)
app/api/admin/profiles/route.ts                 - Added audit + error logging (untracked - in ?? dir)
app/dashboard/admin/page.tsx                    - Added ops_manager role check + Operations Hub card
app/dashboard/admin/schedule-board/page.tsx     - Added operations_manager to role guard
app/dashboard/admin/analytics/page.tsx          - Updated role guard from !== 'admin' to includes array
app/dashboard/admin/equipment-performance/page.tsx - Updated role guard
app/dashboard/admin/completed-job-tickets/page.tsx - Updated role guard
app/dashboard/admin/completed-job-tickets/[id]/page.tsx - Updated role guard
app/dashboard/admin/completed-jobs/page.tsx     - Updated role guard
app/dashboard/admin/operators/page.tsx          - Updated role guard
app/dashboard/admin/jobs/[id]/page.tsx          - Updated role guard
app/dashboard/admin/debug/active-jobs/page.tsx  - Updated role guard
app/dashboard/admin/operator-profiles/page.tsx  - Updated role guard from 2-role array to 4-role array
app/dashboard/admin/operator-profiles/[id]/equipment/page.tsx - Updated role guard
app/dashboard/admin/all-equipment/page.tsx      - Updated role guard + UI visibility checks for manage/add buttons
```

---

## SUPABASE DATABASE ARCHITECTURE

### Existing Tables (before migration)
- `profiles` - user profiles with role, full_name, email, phone, active
- `job_orders` - job tickets with scheduling, assignments, status
- `job_notes` - notes attached to jobs (excludes change_log type in queries)
- `schedule_change_requests` - operator-initiated schedule changes
- `schedule_notifications` - push notifications for schedule updates
- `equipment_units` - tracked equipment with NFC pairing
- `timecards` - clock-in/clock-out records

### New Tables (from pending migration)
- `audit_logs` - admin action audit trail (RLS: super_admin + ops_manager read)
- `login_attempts` - login success/failure tracking (RLS: super_admin + ops_manager read)
- `error_logs` - API error tracking (RLS: super_admin + ops_manager read)

### Key Views
- `schedule_board_view` - denormalized view joining job_orders with profiles, equipment, note counts, change request counts (being optimized in migration)

### Key RLS Pattern
The project uses TWO RLS approaches:
1. **Older tables:** Check `profiles.role` via subquery (has recursion risk)
2. **Newer tables (audit_logs, etc.):** Check `auth.jwt() -> 'user_metadata' ->> 'role'` (preferred, no recursion)

The migration adds a trigger to keep these in sync: when `profiles.role` changes, `auth.users.raw_user_meta_data.role` is automatically updated.

---

## SUPABASE CLIENT SETUP

Two Supabase clients exist:

**Public client** (`lib/supabase.ts`): Uses anon key, respects RLS, used for client-side operations.

**Admin/Service client** (`lib/supabase-admin.ts`): Uses service role key, BYPASSES ALL RLS. Used server-side only for:
- Auth verification (`supabaseAdmin.auth.getUser(token)`)
- Profile lookups in API guards
- Fire-and-forget audit/error/login logging
- Admin data operations

---

## IMPORTANT PATTERNS

### Fire-and-Forget Logging
All logging functions use `Promise.resolve()` wrapper to get `.catch()` support on Supabase's PromiseLike builders:
```typescript
Promise.resolve(
  supabaseAdmin.from('audit_logs').insert({...})
)
  .then(({ error }) => { if (error) console.error(...) })
  .catch(() => { /* silent */ });
```
This was necessary because Supabase JS v2 builders return `PromiseLike` (has `.then()` but NOT `.catch()`).

### API Route Auth Pattern
```typescript
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;
    // auth.userId, auth.userEmail, auth.role available
    // ... route logic ...
  } catch (error) {
    logApiError({ endpoint: '/api/admin/...', method: 'GET', error, ... });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### Client-Side Page Guard Pattern
```typescript
useEffect(() => {
  const currentUser = getCurrentUser();
  if (!currentUser) { router.push('/login'); return; }
  if (!['admin', 'super_admin', 'salesman', 'operations_manager'].includes(currentUser.role)) {
    router.push('/dashboard');
  }
}, []);
```

---

## ENV VARIABLES (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://klatddoyncxidgqtcjnu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...(anon key)
SUPABASE_SERVICE_ROLE_KEY=eyJ...(service role key)
RESEND_API_KEY=re_...(email service)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...(maps)
TWILIO_ACCOUNT_SID=AC12...(SMS)
TWILIO_AUTH_TOKEN=0560...(SMS)
TWILIO_PHONE_NUMBER=+18336954288
NEXT_PUBLIC_BYPASS_LOCATION_CHECK=true (TEMP - remove for prod)
```

---

## GIT STATE

**Branch:** `feature/schedule-board-v2`
**Last commit:** `d5cbc0ad feat: Operator/helper dropdowns with conflict detection`
**Uncommitted changes:** ~33 modified files + ~22 untracked files (all the security/ops work from this session)
**Nothing has been committed from this session yet.** All changes are in the working tree.

---

## WHAT TO DO NEXT (PRIORITY ORDER)

1. **Apply the migration** - This is blocking. Use whichever method works (Supabase MCP, dashboard, CLI, or pg client). The file is at `supabase/migrations/20260310_security_audit_infrastructure.sql`.

2. **Test the Operations Hub** - Log in as super_admin, navigate to `/dashboard/admin/ops-hub`, verify all sections populate.

3. **Create an operations_manager test account** - After migration is applied, insert a profile with `role: 'operations_manager'` and verify they can access the admin dashboard and ops hub.

4. **Add audit logging to remaining API routes** (not yet done):
   - `app/api/admin/job-orders/[id]/route.ts` - PATCH and DELETE operations
   - `app/api/admin/change-requests/[id]/route.ts` - approve/reject operations
   - Any other critical admin write operations

5. **Commit all changes** - Stage and commit all the security + ops manager + diagnostics work.

6. **Test security** - Verify operators/helpers CANNOT access `/dashboard/admin` or any admin API endpoints.

---

## TESTING CHECKLIST
- [ ] Migration applied successfully (3 tables + indexes + trigger + view + RPC)
- [ ] Login as operator -> cannot access /dashboard/admin (redirects to /dashboard)
- [ ] Login as admin -> sees 3 core cards, no Ops Hub
- [ ] Login as super_admin -> sees all cards including Ops Hub
- [ ] Login as operations_manager -> sees all cards including Ops Hub
- [ ] Ops Hub shows API health checks with green/red status
- [ ] Ops Hub shows login audit trail after logging in
- [ ] Ops Hub shows role/permission matrix with correct counts
- [ ] Ops Hub shows database stats with table sizes
- [ ] Schedule board loads in <1s with many jobs (indexes working)
- [ ] Audit logs table gets entries after admin actions
- [ ] Error logs table gets entries when API errors occur
