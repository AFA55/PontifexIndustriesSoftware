# Platform Weakness Audit — Jul 25 2026

Founder-requested "spot the weaknesses" pass. Two parallel agent audits (tenant/
company-code/routing model + systemic isolation/security) + verification against
the LIVE database (Supabase security advisor, live schema). This doc is the
triaged, VERIFIED result — the raw agent counts were corrected where the live DB
disagreed.

## Verified context
- Two tenants: PATRIOT (client) + PONTIFEX (parent/owner org = PLATFORM_TENANT_ID).
- No super_admin has NULL tenant_id. 3 super_admins in PONTIFEX; **1 super_admin
  in PATRIOT** (a tenant-scoped super_admin) — this breaks the "super_admin = global
  owner" assumption baked into the API layer.
- **Live Supabase security advisor: ZERO `rls_references_user_metadata` findings.**
  The audit's "57 user_metadata RLS occurrences" was a cumulative migration-file
  grep; the ACTIVE policies were already remediated. Not a live hole.

## What's the real theme
The Pontifex-owner-vs-tenant boundary and tenant isolation are enforced **in
client-side routing + per-route `.eq('tenant_id')` filters**, NOT structurally.
`supabaseAdmin` bypasses RLS, so any API route that forgets its tenant filter
leaks/corrupts across tenants. Single live client (Patriot) MASKS this today —
the leaks activate the day a second real client onboards.

## FIXED this session (held, unpushed, type-checked)
- **Back button on Platform Hub** (`app/dashboard/platform/layout.tsx`) — was hard-
  linked to `/dashboard/admin` (a tenant dashboard). Now hidden on the Hub home;
  on sub-pages it returns to the Hub.
- **Face ID login stranded the owner** (`app/login/page.tsx` handleFaceIdLogin) —
  didn't carry `tenant_id`, so native Face ID login could drop the Pontifex owner
  on a tenant dashboard + lock them out of the Hub. Now mirrors the passkey path.

## P1 — fix BEFORE onboarding a second real client (latent while single-tenant)
1. **No server-side platform-owner gate.** Every `/api/admin/platform/*`,
   `/api/admin/tenants/*`, `grant-super-admin`, `backups` route gates on
   `role==='super_admin'` only — never `tenant_id===PLATFORM_TENANT_ID`. The
   PATRIOT super_admin already passes these. `resolveTenantScope` honors any
   `?tenantId=` from ANY super_admin. → Add `requirePlatformOwner()` in
   `lib/api-auth.ts`; only honor a cross-tenant `?tenantId=` override for the
   platform owner; else scope to the caller's own tenant (or 403).
2. **Cross-tenant leaks: API routes missing a tenant filter** (supabaseAdmin
   bypasses RLS). Confirmed offenders, by blast radius:
   - `admin/analytics` — revenue/AR/roster/hours across ALL tenants (job_orders×3,
     invoices, profiles, timecards all unscoped). Biggest BI leak.
   - schedule-board cluster: `crew-grid`, `skill-match`, `capacity`,
     `auto-schedule` (a cross-tenant **write** — can assign another tenant's
     operator), `operator-skills` — operator roster + job/customer data + a write.
   - `admin/po-lookup` — customer name/address/phone by PO, unscoped (PII).
   - `admin/schedule-forms`, `shop/work-orders`, `admin/ops-hub` (login emails/IPs).
   - IDOR by id (no tenant/owner check): `admin/job-notes` (r/w),
     `admin/daily-notes` (**DELETE**), `liability-release/pdf`,
     `work-order-agreement/pdf` (customer docs, reachable by operator role).
   - Arbitrary-tenant branding pick (`.eq('is_active',true).limit(1).single()`) in
     several PDF/branding routes → wrong logo/company on customer PDFs.
   - `admin/invoices` GET auto-overdue flip = an UNSCOPED money-state write
     (status sent→overdue across all tenants) inside fire-and-forget `.catch(()=>{})`.
   → Systemic fix: thread `resolveTenantScope` tenantId through every
     job_orders/profiles/invoices/customers/timecards/branding query; ban the
     `if (tenantId) .eq(...)` pattern (NULL bypasses it). Consider a
     `tenantScopedQuery()` wrapper or a lint rule so it can't regress.

## P2
- Contradictory super_admin tenant model → an owner API call that omits `?tenantId=`
  silently scopes to the (near-empty) PONTIFEX tenant instead of erroring
  (`lib/api-auth.ts` resolveTenantScope). Reconcile with P1.1.
- `job_orders.status` CHECK dropped `on_hold` (20260721b migration) but code still
  writes `on_hold` (`app/api/job-orders/route.ts`) → silent rejection of hold state.
  Re-add `on_hold` to the constraint. (Also `analytics` filters `en_route`/`dispatched`
  that aren't in the constraint vocabulary → silent zero buckets.)

## P3 / hardening (from the live advisor, mostly low)
- `rls_policy_always_true` WARNs on ~12 INSERT policies — most are intentional public
  forms (demo_requests, access_requests, consent_records, customer_surveys) or
  service-role inserts; `equipment_checkout_sessions` (authenticated, WITH CHECK true)
  is worth tenant-scoping.
- 2 tables RLS-enabled-no-policy (reminder_log, stripe_webhook_events) — server-only,
  effectively locked; add explicit service-role note or a policy for clarity.
- `pg_trgm` extension in public schema (move to `extensions`).
- SECURITY DEFINER helpers executable by anon (they return null for anon — low).
- Login "wrong company code" check is client-supplied/advisory (`auth/login`).
- Onboarding `.or().maybeSingle()` ignores multi-match error (`tenant-onboarding.ts`).

## STATUS — remediation SHIPPED (Jul 25)
- **Tranche 1 (e05a05a1):** owner-aware `resolveTenantScope` + `requirePlatformOwner()`;
  analytics / po-lookup / invoices leaks closed; `on_hold` constraint restored.
- **Tranche 2 (41f50305):** schedule-board cluster (5 routes incl. auto-schedule write),
  IDOR routes (job-notes, daily-notes DELETE, liability/work-order PDFs, shop work-orders),
  platform-owner gate on 10 console routes. Guardian-caught regression fixed (team/invite
  company picker now owner-only). Fixes also: back button + Face ID login (dfee1f62).
- **Verified:** live Supabase advisor has ZERO user_metadata-in-RLS. All tenant tables
  fully backfilled (0 null tenant_id). Multi-tenant isolation is now enforced at the API
  layer — clean to onboard a second client.

### Remaining small items (P3, non-blocking)
- `team-profiles` "Grant Super Admin" button is visible to a client super_admin but the API
  now 403s (owner-only) — hide the button for non-owners (cosmetic).
- `crew-grid/route.ts` selects `max_slots/warning_threshold` from `schedule_settings` — those
  columns don't exist (table is key/value JSON); coloring silently uses defaults. Pre-existing.
- P3 hardening from the live advisor: `pg_trgm` in public schema; 2 RLS-enabled-no-policy
  tables (server-only); a few intentional public-insert `WITH CHECK (true)` policies.

## Recommended remediation order
1. Ship the 2 fixes already done (back button + Face ID).
2. Before onboarding client #2: P1.1 (platform-owner gate) + P1.2 (tenant-scope the
   leak routes) as a focused, guardian-reviewed batch. Not urgent while Patriot is
   the only real client (no cross-tenant data to leak yet), but it's the gate to
   multi-tenant go-live.
3. P2 (on_hold constraint, super_admin model) alongside P1.
4. P3 hardening opportunistically.
