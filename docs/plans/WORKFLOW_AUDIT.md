# Workflow Audit — April 30, 2026

Branch / worktree: `claude/sleepy-shannon-95c45b` at `.claude/worktrees/agent-a3a4fd87d7908bb08`.
Scope: end-to-end job lifecycle from ticket creation through invoice payment.

---

## Executive summary

- **Cross-tenant write risk on operator-touching endpoints.** Several authenticated-but-not-tenant-scoped routes (`POST /api/job-orders/[id]/work-items`, `POST /api/job-orders/[id]/request-signature`'s job lookup chain, `PUT /api/job-orders/[id]/submit`'s update-after-fetch path, `POST /api/jobs/[id]/completion-request` job_orders update, the `DELETE /api/job-orders/[id]` legacy route) fetch a job by id with no `tenant_id` filter, or do filter on read but then update/delete with no tenant filter. The token-based `auth.getUser()` succeeds for any authenticated user in any tenant, so a user with a valid Bearer token who guesses a UUID from another tenant can write to it. See per-stage findings.
- **Status state machine is unenforced.** `POST/PUT/PATCH /api/job-orders/[id]/status` accepts any of `scheduled, assigned, in_route, on_site, in_progress, completed, cancelled` from any assigned operator. It does not check that the previous status is a legal predecessor (e.g., `in_progress` can be set without ever being `assigned`/`in_route`). It also lets an operator set `status: 'cancelled'` via the same code path. There is no row-level optimistic concurrency.
- **`tenant_id` is `null`-permissive on creation.** `POST /api/admin/job-orders` writes `tenant_id: tenantIdPost || undefined`, and the schedule-form route writes `tenant_id || null`. An admin with no tenant on profile (which `requireSalesStaff` allows for `super_admin`) can create rows with `tenant_id = null` that subsequent tenant-scoped reads will silently exclude (orphaned jobs). The legacy schedule-board `quick-add` does not write `tenant_id` at all.
- **Missing audit trail on critical mutations.** Status transitions, work-item submission, daily-log creation, completion request, signature collection, and even invoice creation skip `audit_logs`. The `job_orders_history` table is only written by approve / reject / resubmit. Production posture should never have a job state change that is invisible in audit logs.
- **Public signature endpoint has no rate limit and no tenant context.** `GET/POST /api/public/signature/[token]` is correct in design (token-gated), but has no IP rate limit and the token (UUID v4) is the only secret. Tokens are never invalidated except via `signed`/`expired`. There is no max-age constraint enforced on creation (nothing sets `expires_at`), so unsigned links live forever. See Stage 8.
- **Late-detection / GPS / Net-30 / payment-method / waiver fields are correct,** but two bugs may corrupt operator hours: the daily-log "hours_worked" is computed from `Date.now() - work_started_at` (wall-clock since last status change), not from `clock_in`/`clock_out`. Multi-day jobs reset `work_started_at` to `null` at end-of-day, but if an operator hits "continue tomorrow" *after* a long break, `hours_worked` still reflects the gap.

---

## Per-stage findings

### Stage 1: Ticket Creation
**Files:**
- [app/api/admin/schedule-form/route.ts](app/api/admin/schedule-form/route.ts:1)
- [app/api/admin/job-orders/route.ts](app/api/admin/job-orders/route.ts:139) (POST)
- [app/api/admin/jobs/quick-add/route.ts](app/api/admin/jobs/quick-add/route.ts:14)
- [app/api/admin/schedule-board/quick-add/route.ts](app/api/admin/schedule-board/quick-add/route.ts:13)
- [app/api/job-orders/route.ts](app/api/job-orders/route.ts:12) (GET)

**Status:** ⚠️ Concerns

**Findings:**
- [app/api/admin/schedule-form/route.ts:114](app/api/admin/schedule-form/route.ts:114) sets `tenant_id: tenantId || null`. `requireSalesStaff` (line 25) allows super_admin through with `tenantId === null`. If a super_admin without a profile-level tenant_id submits the form, the row is inserted with `tenant_id = null` and is invisible to every tenant-scoped read. Same pattern at [app/api/admin/job-orders/route.ts:225](app/api/admin/job-orders/route.ts:225) (`tenant_id: tenantIdPost || undefined`) and [app/api/admin/jobs/quick-add/route.ts:60](app/api/admin/jobs/quick-add/route.ts:60).
- [app/api/admin/schedule-board/quick-add/route.ts:42-63](app/api/admin/schedule-board/quick-add/route.ts:42) **does not include `tenant_id` at all** in `jobOrderData`. This is a regression vs. the newer `app/api/admin/jobs/quick-add` route. Any job created here is permanently unscoped.
- [app/api/admin/schedule-form/route.ts:166](app/api/admin/schedule-form/route.ts:166) does customer auto-link via `ilike('name', body.customer_name.trim())` with **no tenant filter** — a `pending_approval` schedule submitted by Tenant A can link to a customer record from Tenant B that happens to share a name. Same risk on the `customers.insert` at line 178 — no `tenant_id` supplied to the new customer row.
- [app/api/admin/job-orders/route.ts:212](app/api/admin/job-orders/route.ts:212) initial status logic: `status: body.assigned_to ? 'assigned' : 'scheduled'`. This bypasses the `pending_approval → scheduled` review gate that the schedule-form route enforces. A salesman calling `POST /api/admin/job-orders` directly skips approval entirely.
- [app/api/admin/job-orders/route.ts:51, 177](app/api/admin/job-orders/route.ts:51) include `'supervisor'` in admin role list, but `lib/api-auth.ts` does not define a `supervisor` role in its narrow `ADMIN_ROLES` (line 40). The role exists in `SALES_STAFF_ROLES` only. This gives `supervisor` the ability to create+assign jobs out of a sales pipeline guard.
- `created_by` is captured cleanly on all four creation paths.
- No SMS / email is sent when a job is created — only notifications on assignment.
- Job number generation uses `Math.floor(100000 + Math.random() * 900000)` with no uniqueness check on `job_orders.job_number` (the invoice-create route does retry, but schedule-form does not). On collision the insert will fail without a useful retry.

**Recommendation:**
1. Make `tenant_id` `NOT NULL` on `job_orders` and reject any creation path that doesn't supply one (return 400). Add a DB CHECK that `(tenant_id IS NOT NULL OR created_by IN super_admin set)`.
2. In the legacy `app/api/admin/schedule-board/quick-add/route.ts`, set `tenant_id: auth.tenantId` and either deprecate this path or make it forward to the canonical quick-add.
3. Drop `'supervisor'` from `app/api/admin/job-orders/route.ts:51, 177` admin lists, or formally add it to `ADMIN_ROLES` once.
4. Add tenant filter on `customers.ilike` lookup at line 167 of schedule-form.
5. Add job-number uniqueness retry loop for `JOB-` and `QA-` prefixes the same way `INV-` already retries.

---

### Stage 2: Approval
**Files:**
- [app/api/admin/job-orders/[id]/approve/route.ts](app/api/admin/job-orders/[id]/approve/route.ts:1)
- [app/api/admin/job-orders/[id]/reject/route.ts](app/api/admin/job-orders/[id]/reject/route.ts:1)
- [app/api/admin/job-orders/[id]/resubmit/route.ts](app/api/admin/job-orders/[id]/resubmit/route.ts:1)

**Status:** ✅ Mostly clean — minor concerns

**Findings:**
- [approve/route.ts:26](app/api/admin/job-orders/[id]/approve/route.ts:26) uses `requireAdmin` (admin/super_admin/operations_manager) — correct narrow guard.
- [approve/route.ts:47](app/api/admin/job-orders/[id]/approve/route.ts:47) checks the legal predecessor states: `['pending_approval', 'rejected']`. Correct.
- [reject/route.ts:35](app/api/admin/job-orders/[id]/reject/route.ts:35) requires `super_admin` only. Inconsistent with approve, which allows `admin`/`operations_manager`. Either an operations_manager should reject too, or super_admin should be the bar for both. Pick one.
- [reject/route.ts:154](app/api/admin/job-orders/[id]/reject/route.ts:154) logs `changed_by_role: 'super_admin'` as a literal string instead of `auth.role`. Cosmetic, but if super_admins ever get other variants this misreports.
- [resubmit/route.ts:25](app/api/admin/job-orders/[id]/resubmit/route.ts:25) uses `requireSalesStaff`. There is no tenant filter on the `SELECT` at line 39 — the resubmit checks status only. A salesman in Tenant A who knows a Tenant B job UUID can resubmit it. The subsequent `update().eq('id', id)` at line 96 has no tenant filter either. **🚨 Cross-tenant write.**
- [resubmit/route.ts:63-71](app/api/admin/job-orders/[id]/resubmit/route.ts:63) allowlist is good, but `assigned_to` and `helper_assigned_to` are not in it — a resubmit cannot reassign. That is intentional, but worth noting.
- All three routes write to `job_orders_history` and `schedule_form_submissions` — audit trail present.

**Recommendation:**
- 🚨 Add tenant filter to `resubmit/route.ts` SELECT and UPDATE.
- Align role guards on approve vs. reject (probably `requireAdmin` for both).
- Use `auth.role` not the literal `'super_admin'` in the reject history insert.

---

### Stage 3: Assignment
**Files:**
- [app/api/admin/schedule-board/assign/route.ts](app/api/admin/schedule-board/assign/route.ts:1)
- [app/api/admin/jobs/[id]/route.ts](app/api/admin/jobs/[id]/route.ts:1) (DELETE only — no PATCH)
- [app/api/job-orders/[id]/route.ts](app/api/job-orders/[id]/route.ts:50) (PATCH)

**Status:** ⚠️ Concerns

**Findings:**
- [schedule-board/assign/route.ts:62](app/api/admin/schedule-board/assign/route.ts:62) upserts `job_daily_assignments` correctly, scoped by `(job_order_id, assignment_date)`. Good.
- [schedule-board/assign/route.ts:78](app/api/admin/schedule-board/assign/route.ts:78) the lookup for the multi-day decision does **not** include a tenant filter. After `requireScheduleBoardAccess` already returns a tenant, this is best-practice violated; any salesman who knows a job UUID across tenants would hit `job_daily_assignments` writes for a foreign tenant. **🚨** (Note: the upsert at line 62 also has no tenant filter on the conflict key. The sole protection is `tenant_id` in the upsert payload at line 71, but if a row already exists with a different tenant_id, conflict targets `(job_order_id, assignment_date)` and may overwrite tenant_id.)
- [schedule-board/assign/route.ts:153](app/api/admin/schedule-board/assign/route.ts:153) calls `logAuditEvent` — audit trail present. ✅
- [schedule-board/assign/route.ts:165-227](app/api/admin/schedule-board/assign/route.ts:165) sends `schedule_notifications` to operator and helper with rich metadata. ✅
- No notification is sent when an assignment is *removed* (operator unassigned). The metadata `is_helper: true` is set on helper notifications but not `is_helper: false` on the operator notification — minor.
- [job-orders/[id]/route.ts:50-103](app/api/job-orders/[id]/route.ts:50) `PATCH` allows updating `assigned_to` is **not** in the ALLOWED_FIELDS allowlist — assignment changes must go through schedule-board. ✅ But `helper_assigned_to` is also missing — confirms intent.
- [job-orders/[id]/route.ts:93](app/api/job-orders/[id]/route.ts:93) PATCH uses `auth.tenantId` directly (good), but if the caller is a super_admin with `tenantId=null`, the `.eq('tenant_id', null)` filter matches no rows. Either super_admin should be allowed to bypass or `resolveTenantScope` should be used. As-is super_admins can't PATCH a job. **⚠️**

**Recommendation:**
- Add `.eq('tenant_id', auth.tenantId)` to the multi-day check SELECT and final update in `schedule-board/assign/route.ts`.
- For `job-orders/[id]/route.ts` PATCH, use `resolveTenantScope` to make super_admin work.
- Add notification on unassign (operator deserves to know "you've been removed from JOB-XXXX").

---

### Stage 4: Operator Clocks In
**File:** [app/api/timecard/clock-in/route.ts](app/api/timecard/clock-in/route.ts:1)

**Status:** ✅ Clean — minor concerns

**Findings:**
- [clock-in/route.ts:53](app/api/timecard/clock-in/route.ts:53) validates `clock_in_method` against an allowlist. ✅
- [clock-in/route.ts:75-115](app/api/timecard/clock-in/route.ts:75) verifies bypass_nfc was actually granted by an admin (table `notifications` flag) — single-use marker via `is_read=true`. ✅
- [clock-in/route.ts:128-130](app/api/timecard/clock-in/route.ts:128) NFC tag lookup — **no tenant filter on `nfc_tags`**. A tag from Tenant B could be reused if it's `is_active`. Race condition: tag UID collisions across tenants. Add `.eq('tenant_id', auth.tenantId)`.
- [clock-in/route.ts:188-201](app/api/timecard/clock-in/route.ts:188) auto-closes stale previous-day timecards by setting `clock_out_time = '${date}T23:59:59'` (local-time string, not ISO timezone-aware). On systems where the server timezone differs from the operator's timezone, this could close a timecard at the wrong wall-clock hour. Also it overwrites `notes` rather than appending — if the operator had a prior note, it's lost.
- [clock-in/route.ts:286-359](app/api/timecard/clock-in/route.ts:286) late-detection: `expectedTime.setHours(hours, minutes, 0, 0)` runs in the server's timezone. If the server is UTC and the job is scheduled in Eastern Time, late-by-N-minutes is wildly wrong.
- [clock-in/route.ts:325-326](app/api/timecard/clock-in/route.ts:325) admin notification recipients list is filtered with `.eq('tenant_id', auth.tenantId || '')`. If `auth.tenantId` is `null` (super_admin), this fires with `tenant_id = ''` and matches no rows — operator's late notification goes nowhere. ⚠️

**Recommendation:**
- Add `.eq('tenant_id', auth.tenantId)` to NFC tag lookup.
- Use UTC ISO timestamps for `clock_out_time` on auto-close, and append rather than overwrite notes.
- Compute `expectedTime` in the tenant's timezone (store `tenants.timezone`).

---

### Stage 5: In-Route, Arrived, Working
**File:** [app/api/job-orders/[id]/status/route.ts](app/api/job-orders/[id]/status/route.ts:1)

**Status:** 🚨 Critical — status state machine and tenant scope

**Findings:**
- [status/route.ts:46-52](app/api/job-orders/[id]/status/route.ts:46) accepts any of seven statuses with **no transition validation**. An operator can POST `status: 'completed'` directly from `assigned`, skipping `in_route` / `on_site` / `in_progress`. Or POST `status: 'cancelled'` — there is nothing in the code that should let an operator cancel a job, but the code path allows it.
- [status/route.ts:46-52](app/api/job-orders/[id]/status/route.ts:46) `'cancelled'` should require admin authorization, not just operator-assigned.
- [status/route.ts:62](app/api/job-orders/[id]/status/route.ts:62) tenant filter is `if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId)` — for super_admin (`tenantId === null`) this skips the filter, which is fine. But the same pattern at line 192 wraps the UPDATE; an operator with `tenant_id = null` (which `requireAuth` blocks for non-super-admin, so impossible) is moot. ✅
- [status/route.ts:124-150](app/api/job-orders/[id]/status/route.ts:124) on `completed`, aggregates `daily_job_logs.hours_worked` to set `total_hours_worked`. Best-effort and has try/catch. The aggregation runs on every transition to `completed`; if the operator is approved and re-completes the job (admin reverts on rejection then operator resubmits), this re-aggregates — fine because it's idempotent on logs. But it **only counts logs that already exist at the moment of completion**. If a daily-log insert is deferred (fire-and-forget pattern at [daily-log/route.ts:170](app/api/job-orders/[id]/daily-log/route.ts:170)), a race exists where completion is recorded with hours_worked from N-1 logs.
- [status/route.ts:227-252](app/api/job-orders/[id]/status/route.ts:227) writes `operator_status_history` — a partial audit trail. ✅ But the upsert key is `(operator_id, job_order_id)`, so each transition **overwrites** the previous one. No real history.
- No `audit_logs` write on status transitions. ⚠️
- [status/route.ts:80](app/api/job-orders/[id]/status/route.ts:80) `adminRoles` list excludes `salesman`, `supervisor`. So a salesman cannot move a job to `cancelled`. That is correct posture — but the message "You can only update jobs assigned to you" is misleading for a sales user.
- No notifications fire on status transitions. The `request-signature` and `completion-request` flows handle the customer/admin loop, but if an operator goes in-route, the admin's "Live Status" panel only updates by polling.

**Recommendation:**
- 🚨 Implement a status state machine. Reject transitions like `assigned → completed`, `assigned → cancelled` (operator), `completed → in_progress` (operator).
- 🚨 Restrict `cancelled` to admin roles. Operator should request cancellation, not perform it.
- Replace `operator_status_history` upsert with insert (history needs every transition). Or rename to `operator_status_current` if it's only the latest.
- Wait for daily-log insert (await) before computing aggregation on completion, or run aggregation in a DB trigger.
- Add `audit_logs` insert for every status change.

---

### Stage 6: Work Performed
**Files:**
- [app/api/job-orders/[id]/work-items/route.ts](app/api/job-orders/[id]/work-items/route.ts:1)
- [app/dashboard/job-schedule/[id]/work-performed/page.tsx](app/dashboard/job-schedule/[id]/work-performed/page.tsx:1)

**Status:** 🚨 Critical — tenant isolation gap

**Findings:**
- [work-items/route.ts:35-43](app/api/job-orders/[id]/work-items/route.ts:35) fetches the job by id with **no tenant_id filter**. Then line 46 checks `assigned_to === auth.userId`. If a Tenant-A operator's UUID happens to match `assigned_to` of a Tenant-B job (which can't happen via standard flow but is possible via an attacker brute-forcing), they could write work items into another tenant's job. More realistically: a super_admin operator (extremely uncommon but possible) is assigned to multiple tenants' jobs. **🚨 Add `.eq('tenant_id', auth.tenantId)` to line 39.**
- [work-items/route.ts:54-59](app/api/job-orders/[id]/work-items/route.ts:54) deletes existing work items for `(jobId, day_number)` then re-inserts. This is the "replace pattern" but it has no transaction — if the INSERT fails after the DELETE succeeds, **all work items for that day are lost**. The user gets a 500 and silently has nothing saved.
- [work-items/route.ts:111-152](app/api/job-orders/[id]/work-items/route.ts:111) builds a "work_performed" summary text and writes it to `job_orders.work_performed`. No tenant filter on the UPDATE. **🚨**
- No audit log entry. No notification to admin.
- [work-items/route.ts:96-99](app/api/job-orders/[id]/work-items/route.ts:96) inserts an array — if `items` is malicious (e.g., 100k entries), there's no length cap. Add `if (items.length > 50) return 400`.

**Recommendation:**
- 🚨 Add tenant filter to `work_items` job-fetch and the `job_orders` summary update.
- Wrap delete-then-insert in a transaction or use UPSERT.
- Cap `items.length`.
- Add `audit_logs` entry for work-item submission.

---

### Stage 7: Day Complete
**File:** [app/api/job-orders/[id]/daily-log/route.ts](app/api/job-orders/[id]/daily-log/route.ts:1)

**Status:** ⚠️ Concerns

**Findings:**
- [daily-log/route.ts:53-59](app/api/job-orders/[id]/daily-log/route.ts:53) does filter by tenant on the SELECT. ✅
- [daily-log/route.ts:84-97](app/api/job-orders/[id]/daily-log/route.ts:84) the existing-log fallback is correct in spirit: if the operator has prior log entries for this job, allow them to continue. But there is **no tenant filter** on `existingLog` lookup. A Tenant-A operator could use this fallback to write to a Tenant-B job IF they had ever previously logged work there (which shouldn't be possible, but defense-in-depth).
- [daily-log/route.ts:103-107](app/api/job-orders/[id]/daily-log/route.ts:103) `hours_worked` is computed as `(now - work_started_at) / 3600000`. **This is wall-clock time, not work-clock time.** If the operator starts work at 9 AM, takes a 90-minute lunch, and finishes at 5 PM, this records 8 hours. It does not deduct breaks, lunches, or standby periods. The standalone `clock-in/clock-out` system does break deduction; the daily-log route does not consult it. **⚠️ This corrupts payroll/billing data.**
- [daily-log/route.ts:179-204](app/api/job-orders/[id]/daily-log/route.ts:179) on `continueNextDay` increments `total_days_worked`, resets timestamps, and (at line 200) cancels stale `pending`/`submitted` completion requests. ✅
- [daily-log/route.ts:236-269](app/api/job-orders/[id]/daily-log/route.ts:236) when `signerName` is provided and `continueNextDay=false`, fires-and-forgets a job_orders update to `status=completed`. This races with `/status` PATCH from the day-complete page, which also sets `completed`. Two updates in flight on same row — last write wins, may overwrite each other's fields. **⚠️**
- No notification to admin when day-complete is submitted (admin only learns via signature request or completion-request flow).
- No audit log entry.

**Recommendation:**
- 🚨 Replace wall-clock `hours_worked` calculation with a query against `timecards` for the day (sum `clock_out - clock_in` minus breaks).
- Add tenant filter to the `existingLog` fallback query.
- Avoid the racing dual-completion update — let day-complete page rely on the deterministic `/status` PATCH only, or move both behind a DB trigger.
- Add `audit_logs` entry.

---

### Stage 8: Customer Signature
**Files:**
- [app/api/job-orders/[id]/request-signature/route.ts](app/api/job-orders/[id]/request-signature/route.ts:1)
- [app/api/public/signature/[token]/route.ts](app/api/public/signature/[token]/route.ts:1)
- [app/sign/[token]/page.tsx](app/sign/[token]/page.tsx:1)

**Status:** ⚠️ Concerns

**Findings:**
- [request-signature/route.ts:89](app/api/job-orders/[id]/request-signature/route.ts:89) generates `crypto.randomUUID()` token — 122 bits of entropy, unguessable. ✅
- [request-signature/route.ts:91-104](app/api/job-orders/[id]/request-signature/route.ts:91) **does not set `expires_at`**. The `signature_requests` table has the column (the public route checks it at line 124), but the create route never sets it. **🚨 Tokens never expire.** A leaked URL is valid forever.
- [request-signature/route.ts:114-118](app/api/job-orders/[id]/request-signature/route.ts:114) builds the public URL using `x-forwarded-host` or `origin` header. An attacker can spoof these headers and induce the server to return a malicious signing URL — **host header injection**. Use `process.env.NEXT_PUBLIC_APP_URL` instead. **⚠️**
- [public/signature/[token]/route.ts:21-39](app/api/public/signature/[token]/route.ts:21) is correctly token-gated, no auth. Token, status, expiry checks are all present. ✅
- [public/signature/[token]/route.ts:130-176](app/api/public/signature/[token]/route.ts:130) correctly stores the customer signature on `job_orders.customer_signature` and notifies admins. ✅
- [public/signature/[token]/route.ts:155](app/api/public/signature/[token]/route.ts:155) captures `signer_ip` from `x-forwarded-for` — stored only in `signature_requests.signer_ip`, not surfaced in audit logs. Better than nothing.
- No rate limit on the public POST. An attacker who steals a token can hammer it once (because of the `status === 'signed'` check) but if they steal during the brief signed-but-not-locked window, they can race-condition. Add a short-lived advisory lock or use SELECT FOR UPDATE in a transaction.
- The public GET response includes `assigned_to` (operator UUID). This is harmless info, but worth noting that the customer can see internal user UUIDs.

**Recommendation:**
- 🚨 Set `expires_at` on creation (e.g., 7 days from now). Make the column NOT NULL.
- 🚨 Use `process.env.NEXT_PUBLIC_APP_URL` for the public URL, not `x-forwarded-host`.
- Add IP-based rate limit on `POST /api/public/signature/[token]` (e.g., 10 attempts/hour per IP).
- Don't expose `assigned_to` UUID in the public GET; expose only operator name.

---

### Stage 9: Admin Review + Approval
**File:** [app/api/admin/jobs/[id]/completion-request/route.ts](app/api/admin/jobs/[id]/completion-request/route.ts:1)
**Operator-side:** [app/api/jobs/[id]/completion-request/route.ts](app/api/jobs/[id]/completion-request/route.ts:1)

**Status:** ✅ Mostly clean

**Findings:**
- [admin/jobs/[id]/completion-request/route.ts:31](app/api/admin/jobs/[id]/completion-request/route.ts:31) requires sales staff. Reasonable for review.
- [admin/jobs/[id]/completion-request/route.ts:37, 109, 111](app/api/admin/jobs/[id]/completion-request/route.ts:37) all queries are tenant-scoped. ✅
- [admin/jobs/[id]/completion-request/route.ts:148](app/api/admin/jobs/[id]/completion-request/route.ts:148) approve sets `actual_end_date = today` (server time). For a job completed at 11:55 PM ET on a server in UTC, this could record the wrong date. Use the tenant's timezone or take `actual_end_date` from the operator's day-complete submission.
- [admin/jobs/[id]/completion-request/route.ts:171-191](app/api/admin/jobs/[id]/completion-request/route.ts:171) notification fired to operator on approve. ✅ Same on reject. ✅
- [jobs/[id]/completion-request/route.ts:30-35](app/api/jobs/[id]/completion-request/route.ts:30) operator-side: tenant filter via `if (tenantId)`. The status-precondition checks at lines 41-50 prevent double submission. ✅
- [jobs/[id]/completion-request/route.ts:74-83](app/api/jobs/[id]/completion-request/route.ts:74) updates `job_orders` with no tenant filter on the chained `.eq('id', jobId)` if `resolvedTenantId` is null. The fallback `if (resolvedTenantId)` is OK but the case where both `tenantId` and `job.tenant_id` are null is quietly let through. **⚠️**
- No `audit_logs` write on either approve or reject.
- The `completion-request` review actions don't require a justification on approval (only optional `review_notes`). Some compliance regimes require a sign-off note.

**Recommendation:**
- Use tenant's timezone or operator-supplied date for `actual_end_date`.
- Make `audit_logs` write mandatory on approve/reject.
- Always require non-null tenant filter; reject the request rather than let through with no scope.

---

### Stage 10: Invoicing
**Files:**
- [app/api/admin/invoices/route.ts](app/api/admin/invoices/route.ts:1)
- [app/api/admin/invoices/[id]/route.ts](app/api/admin/invoices/[id]/route.ts:1)
- [app/api/admin/invoices/create/route.ts](app/api/admin/invoices/create/route.ts:1)

**Status:** ⚠️ Concerns

**Findings:**
- [admin/invoices/route.ts:101-148](app/api/admin/invoices/route.ts:101) creates invoice from a job. Cross-tenant FK check at line 131 explicitly returns 404 (not 403) — good defense.
- [admin/invoices/route.ts:138-148](app/api/admin/invoices/route.ts:138) duplicate-invoice check uses `invoice_line_items.job_order_id` — but this is a `.limit(1).single()` with no tenant filter. If a different tenant has any line item referencing the same `job_order_id` (impossible in correct data, but possible via a tenant-id mismatch bug elsewhere), this returns 409 with **another tenant's invoice id**. Unlikely but a leak vector.
- [admin/invoices/route.ts:151-170](app/api/admin/invoices/route.ts:151) job-number / invoice-number collision retry — 5 attempts, then timestamp fallback. ✅ 
- [admin/invoices/route.ts:204-217](app/api/admin/invoices/route.ts:204) hardcoded default rates ($150/core, $12/LF, etc.). These belong in a `tenant_billing_settings` table. As-is, every tenant gets Patriot's rates by default.
- [admin/invoices/create/route.ts:42-45](app/api/admin/invoices/create/route.ts:42) creates `INV-YYYY-NNNNNN` with no collision retry, unlike the from-job path. Bug: if `Math.random()` collides, the insert fails and the user has no invoice. **⚠️**
- [admin/invoices/[id]/route.ts:108-122](app/api/admin/invoices/[id]/route.ts:108) `status: 'paid'` PATCH path: if `body.amount_paid` is undefined, fetches `total_amount` and sets `amount_paid = total_amount`. But the `balance_due` column is described as "generated" — make sure the DB GENERATED column actually recomputes. If it's not generated, balance_due will stay positive while status='paid'. **⚠️ TBD — needs runtime test:** is `invoices.balance_due` a `GENERATED ALWAYS AS (total_amount - amount_paid) STORED` column?
- Both creation paths set `tenant_id: tenantId || null` — same null risk as Stage 1.
- No `audit_logs` entry for invoice creation; only line-item edits via PATCH leave no trail. The payment route does write audit_logs.

**Recommendation:**
- Move billing rates to a `tenant_billing_rates` table.
- Add invoice-number retry to the `create` route.
- Confirm `balance_due` is a generated column; if not, set it explicitly in the `paid` update.
- Add `audit_logs` for invoice create / send / void / draft-edit.

---

### Stage 11: Mark Paid
**File:** [app/api/admin/invoices/[id]/payment/route.ts](app/api/admin/invoices/[id]/payment/route.ts:1)

**Status:** ✅ Clean

**Findings:**
- [payment/route.ts:19-54](app/api/admin/invoices/[id]/payment/route.ts:19) uses `requireSalesStaff` and tenant scope. ✅ Cross-tenant FK check at line 67. ✅
- [payment/route.ts:38-49](app/api/admin/invoices/[id]/payment/route.ts:38) validates payment_method against an allowlist; rejects negative or zero. ✅
- [payment/route.ts:74-79](app/api/admin/invoices/[id]/payment/route.ts:74) rejects overpayment. ✅
- [payment/route.ts:104-128](app/api/admin/invoices/[id]/payment/route.ts:104) recalculates balance, sets paid status, sets `paid_at`. ⚠️ — `paid_at` not `paid_date`; the invoice PATCH route uses `paid_date`. Check the column name in DB. **TBD — needs runtime test.**
- [payment/route.ts:131-164](app/api/admin/invoices/[id]/payment/route.ts:131) sends a fully-paid receipt email via Resend. ✅
- [payment/route.ts:168-183](app/api/admin/invoices/[id]/payment/route.ts:168) writes `audit_logs` with action `payment_recorded` and full details. ✅ Best example in the codebase.
- The `from` email at [payment/route.ts:132](app/api/admin/invoices/[id]/payment/route.ts:132) defaults to `'Patriot Concrete Cutting <noreply@resend.dev>'` — **hardcoded for Patriot.** Per CLAUDE.md, the platform is white-label. Multi-tenant deploys will all send as Patriot. **🚨 Use tenant_branding for the from-name.**
- Race condition: if two admins click "record payment" within the same tick, both inserts succeed, both decrement `balance_due` from the same starting value, ending with `balance_due` going negative (clamped via `Math.max(0, ...)`) but `amount_paid` summing to more than `total_amount`. There is no row-level lock or `eq('balance_due', currentBalance)` conditional update. **⚠️**

**Recommendation:**
- 🚨 Replace hardcoded "Patriot Concrete Cutting" sender with tenant-branded `from` name.
- Add optimistic concurrency: `.eq('balance_due', currentBalance)` on the UPDATE.
- Confirm `paid_at` vs `paid_date` column convention; PATCH uses `paid_date` and POST uses `paid_at` — one is stale.

---

## Cross-cutting concerns

### Auth
- All `app/api/admin/*` and `app/api/job-orders/[id]/*` routes use `requireAuth`/`requireAdmin`/etc. and **none use `auth.jwt() -> 'user_metadata'`** — the recommended pattern. ✅
- `requireAuth` enforces tenant presence for non-super-admins. ✅
- `requireSalesStaff` includes `salesman` and `supervisor`. Several routes (resubmit, completion-request, invoices) gate on this — a salesman can resubmit, approve completion, and create invoices. That is broader than the comment "super admin reviews" suggests. Decide if that posture is acceptable.
- `app/api/admin/job-orders/route.ts` and `app/api/job-orders/route.ts` (legacy) still use the inline `auth.getUser` + `profiles` lookup pattern. These should migrate to `requireSalesStaff`.

### Tenant Isolation
- 🚨 Cross-tenant write risks identified in: `resubmit`, `work-items`, `request-signature` job lookup, `daily-log` existing-log fallback, `schedule-board/assign` multi-day SELECT.
- 🚨 Several creation paths allow `tenant_id = null` rows. Add a NOT NULL constraint.
- 🚨 NFC tag lookup on clock-in has no tenant filter.
- The schedule-form customer auto-link has no tenant filter.

### Audit Trail
- Approve/reject/resubmit: writes `job_orders_history` ✅
- Schedule-board assign: writes `audit_logs` via `logAuditEvent` ✅
- Quick-add: writes `audit_logs` ✅
- Payment: writes `audit_logs` ✅
- Job delete: writes `audit_logs` ✅
- **Missing:** status transitions, work-items submit, daily-log, completion-request operator submit, completion approval/rejection, invoice create/send/void/PATCH, signature collection.
- No central enforcement that a "mutation requires audit." Trivial to add a server-side helper that wraps the mutation.

### Notifications
- Assignment fires notifications to operator + helper. ✅
- Quick-add fires `quick_add_followup`. ✅
- Approval fires `schedule_notifications`. ✅
- Completion request → admin gets `notifications`. ✅
- Approval/rejection of completion → operator gets `notifications`. ✅
- Late clock-in → admins get `schedule_notifications`. ✅
- **Missing:** unassign, status-transition (in-route, on-site, in-progress), day-complete (admin), invoice send confirmation, invoice paid (operator/salesperson commission trigger).
- Two notification tables in use: `notifications` (operator-facing) and `schedule_notifications` (admin-facing). The naming is inconsistent — some routes write to both, some write to only one. Recommend consolidating.

### Race Conditions
- Daily-log + status PATCH both update `job_orders` to `completed` on final-day submission. Last write wins.
- Payment record-and-update has no row-level lock.
- Work-items delete-then-insert is not transactional.
- NFC bypass single-use marker is `eq('is_read', false)` then update — racing two clock-in attempts can both pass the check before either marks read.

### Hardcoded data
- Billing rates ([invoices/route.ts:204-217](app/api/admin/invoices/route.ts:204))
- Sender email name ([payment/route.ts:132](app/api/admin/invoices/[id]/payment/route.ts:132))
- Default labor rate $125/hr (same)
- "Patriot Concrete Cutting" string in the receipt email body and footer
- `NIGHT_SHIFT_START_HOUR = 15` ([clock-in/route.ts:27](app/api/timecard/clock-in/route.ts:27)) — should be `tenant_settings.night_shift_start_hour`
- `payment_terms: 30` (Net 30) defaulted in 4+ places — should be `tenant_settings.default_payment_terms_days`

---

## Action items (prioritized)

### 🚨 Critical (data loss / security)
1. Add tenant filter to: `app/api/admin/job-orders/[id]/resubmit/route.ts` SELECT (line 39) and UPDATE (line 96).
2. Add tenant filter to: `app/api/job-orders/[id]/work-items/route.ts` job SELECT (line 35) and `job_orders.work_performed` UPDATE (line 149).
3. Add tenant filter to: `app/api/admin/schedule-board/assign/route.ts` multi-day SELECT (line 78).
4. Add tenant filter to: `app/api/timecard/clock-in/route.ts` NFC tag lookup (line 128).
5. Implement a status state machine on `app/api/job-orders/[id]/status/route.ts:46` — reject illegal transitions, restrict `cancelled` to admin only.
6. Set `signature_requests.expires_at` on creation in `app/api/job-orders/[id]/request-signature/route.ts:91` (e.g., NOW() + 7 days). Drop the host-header-based URL build at line 114; use `process.env.NEXT_PUBLIC_APP_URL`.
7. Replace wall-clock `hours_worked` in `app/api/job-orders/[id]/daily-log/route.ts:107` with a query against `timecards`.
8. De-hardcode "Patriot Concrete Cutting" sender in `app/api/admin/invoices/[id]/payment/route.ts:132` using `tenant_branding`.
9. Make `tenant_id` NOT NULL on `job_orders`, `invoices`, `customers`, `signature_requests`, `nfc_tags`. Reject creates with null tenant.

### ⚠️ Important (UX / correctness)
10. Wrap `work_items` delete-then-insert in a transaction or use UPSERT.
11. Add row-level optimistic concurrency on payment recording (`.eq('balance_due', currentBalance)`).
12. Resolve daily-log + status-PATCH race on final-day completion (one writer only).
13. Confirm and unify `paid_at` vs `paid_date` column on `invoices`.
14. Add `audit_logs` write on: status transitions, work-items, daily-log, completion-request operator-side, completion approval/rejection, invoice create / send / void / PATCH, signature submission.
15. Use UTC ISO + tenant timezone for `clock_out_time` auto-close, late detection, and `actual_end_date`.
16. Replace `operator_status_history` upsert with insert (true history).
17. Add notification on operator unassign and on admin completion-approve.
18. Drop `'supervisor'` from inline admin role lists in `app/api/admin/job-orders/route.ts:51, 177` — use `requireAdmin` consistently.
19. Align reject (super_admin) vs approve (admin/super_admin/operations_manager) role guards.
20. Cap `items.length` on `work-items` POST.
21. Add IP rate limit on `POST /api/public/signature/[token]`.
22. Don't expose `assigned_to` UUID in public signature GET (return name only).
23. Add expires_at and rate limit on signature requests; never return them after `signed_at + 30 days`.

### 💡 Nice-to-have (polish)
24. Move billing rates ($150/core, etc.) and night-shift hour to `tenant_billing_settings` / `tenant_settings`.
25. Move "Net 30" default into `tenant_settings.default_payment_terms_days`.
26. Add deduplication / collision retry on `JOB-` and `QA-` job numbers.
27. Consolidate `notifications` and `schedule_notifications` into one table with a `recipient_audience` column.
28. Add a server-side helper `mutateWithAudit(action, resourceType, fn)` that requires every mutation to go through audit.
29. Use `auth.role` literal in `app/api/admin/job-orders/[id]/reject/route.ts:154` instead of hardcoded `'super_admin'`.
30. Document `app/api/admin/schedule-board/quick-add/route.ts` as deprecated and forward to `app/api/admin/jobs/quick-add`.

---

## Items needing runtime verification (TBD)
- Is `invoices.balance_due` a `GENERATED ALWAYS AS` column? If not, the `paid` PATCH path leaves it stale.
- Does `signature_requests.expires_at` have a DB-level default? The public route checks it but the create route never sets it.
- Are `job_orders.tenant_id`, `customers.tenant_id`, `signature_requests.tenant_id`, `nfc_tags.tenant_id` already NOT NULL? Several routes write `null`.
- Does `job_completion_requests` have RLS? It's written by both operator and admin paths.
- What is the column name for the timestamp on the invoice when it is fully paid: `paid_at` (used by payment route) or `paid_date` (used by invoice PATCH)? One of them is wrong.

