# Shop Tickets + Crew (Multi-Helper) + Helper Visibility — Architecture

> Founder-directed, Jul 14 2026 (evening). Written for the NEXT session (Opus) to build from.
> Read CLAUDE_HANDOFF.md first for platform state. Follow the loop: build → guardian-review →
> live-verify in preview → gate (build+tsc+jest) → commit → push once per batch.

## The three asks (founder's words, decoded)

1. **Shop tickets**: create tickets for SHOP work (maintenance, blade prep, loading, cleanup),
   assign operators AND helpers, workers log what they did at the end of the shop day, an
   ADMIN signs off (signature).
2. **Helper visibility (live bug Jul 14)**: a helper assigned today couldn't see the ticket.
   Requirement: a helper must see scope of work, WHO they're crewed with, and equipment —
   and the LOCATION becomes visible once the operator taps In Route (staged reveal).
3. **Multiple helpers per job**: `job_orders.helper_assigned_to` is a single column; crews
   sometimes need 2+ helpers.

## Live-bug diagnostic state (do this FIRST — it's a today-bug on a real crew)

- Job: QA-2026-105647 (Scout Mech), scheduled 2026-07-14, status in_progress,
  dispatched 15:36 UTC Jul 14. Operator: Conrade Richardson (invited same day —
  verify his account setup completed). Helper: Michael (role apprentice, profile exists).
- Verified NOT the cause: job exists/dispatched; helper profile exists; `active_job_orders`
  view has no status filter (only `deleted_at IS NULL`); the `?id=` API branch allows
  `helper_assigned_to === user.id`; my-jobs list passes `include_helper_jobs=true` and
  apprentices bypass the primary-only filter.
- Remaining suspects, in order:
  1. Michael looked BEFORE the 11:36 AM dispatch/approval (ticket was pending_approval —
     does the my-jobs today list show pending jobs to helpers? check `includeCompleted`/status
     handling in `/api/job-orders` list branch).
  2. **Adjacent real bug regardless**: `app/dashboard/my-jobs/page.tsx` (~line 129) keys helper
     visibility on `role === 'apprentice'` — an OPERATOR-role person assigned as helper is
     filtered OUT of their own my-jobs list. Operators helper for each other; fix to key on
     the job's helper slot, not the person's role.
  3. Session/tenant mismatch on Michael's device (older login without tenant_id blob).
- Get the repro from the founder: what screen did Michael see (empty list? 403? bounce)?

## Architecture

### A. `job_crew` junction (multi-helper, forward-compatible)

```sql
CREATE TABLE IF NOT EXISTS public.job_crew (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_order_id uuid NOT NULL REFERENCES job_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  crew_role text NOT NULL CHECK (crew_role IN ('operator','helper')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_order_id, user_id)
);
-- + tenant-scoped RLS via SECURITY DEFINER helpers (see dev-decisions §3/§4)
-- + index (user_id, job_order_id), (tenant_id, job_order_id)
```

- **Compatibility strategy (CRITICAL — don't break the live crew workflow):**
  `assigned_to` stays THE operator; `helper_assigned_to` stays "helper #1" (mirrored into
  job_crew by trigger or write-through in the assign API). job_crew adds helpers #2+.
  Every read that does `.or(assigned_to.eq.X,helper_assigned_to.eq.X)` gains
  `OR EXISTS (job_crew where user_id = X)` — touch points:
  - `/api/job-orders` list + `?id=` access check
  - `lib/tools/operator-artifex-tools.ts` myJobsQuery
  - dispatch route (notify ALL crew members)
  - my-jobs page isHelper logic (key off job_crew membership OR helper slot, NOT role)
  - daily-log route assignment check (helpers already log; keep per-person day logs)
- Assign UI: AssignOperatorModal grows "+ Add helper" (multi-select, rank-free);
  board card shows `operator +N`.

### B. Helper ticket view (staged reveal)

Helper opens the ticket and ALWAYS sees: customer, scope, equipment list, crew
("You're with Conrade R. (operator), Javi (helper)"), arrival time, date.
**Address/directions render ONLY when the job has `in_route_at` set** (operator started
route) — the founder wants location released at in-route time. Implementation: the job
detail page already computes `isHelper`; gate the address/directions block on
`(job.in_route_at || !isHelper)`. Server-side too: the `?id=` response can null out
address fields for helpers pre-route (defense in depth, cheap).

### C. Shop tickets

New ticket type rather than a new table — `job_orders.ticket_kind text DEFAULT 'field'
CHECK (ticket_kind IN ('field','shop'))`:
- Reuses: assignment/crew, dispatch/notifications, my-jobs list, daily logs, timecards
  (shop hours already exist via is_shop_hours), the board (own "Shop" lane or filter).
- Shop ticket skips: GPS arrival, en-route customer SMS (no customer!), signature-by-customer,
  survey. `customer_name` = 'Shop', no address gating.
- **End-of-day flow**: worker fills "what I did at the shop" (reuse work_performed/daily log
  with a shop-item vocabulary: maintenance, blade change, loading, cleaning, repairs, other +
  free text) → submits → status pending_admin_signoff.
- **Admin sign-off**: admin opens the shop ticket → reviews entries → SIGNS (reuse the
  existing signature pad component; store `admin_signoff_by`, `admin_signoff_signature`,
  `admin_signoff_at` on the ticket) → status completed. Timecards unaffected (clock-in/out
  independent).
- Creation: Quick Add gains "Shop ticket" toggle (hides customer/address, defaults
  customer 'Shop'); Artifex create tool can follow later (NOT in v1).

### D. Rollout order (each step shippable + verifiable alone)

1. **Fix helper visibility** (bug + role-vs-slot fix + staged location reveal) — small diff,
   founder's crew is blocked TODAY.
2. **job_crew + multi-helper assign** (migration additive; write-through keeps old columns
   true; update the 5 read paths listed above; dispatch notifies all crew).
3. **Shop tickets** (ticket_kind + quick-add toggle + end-of-day form + admin sign-off).
4. Artifex awareness (crew in get_my_job_details "you're with…"; shop tickets in tools) — last.

### Verification per step (non-negotiable)

- Step 1: log in AS a helper (Michael/demo helper) in preview; see ticket pre-route without
  address; operator taps In Route (or SQL-stamp in_route_at); helper refresh → address appears.
- Step 2: assign 2 helpers on preview job; all three see it in my-jobs; dispatch notifies 3;
  guardian-review the read-path changes (supabaseAdmin filters ARE the security boundary).
- Step 3: full shop-day E2E: create → assign → worker submits shop log → admin signs →
  completed; verify timecards/shop-hours unaffected; rls-policy-auditor on the migration.
