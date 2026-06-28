# Customer Portal — remaining gaps (build spec)

> The customer portal is ~70% built (magic-link `/portal/[token]`, doc signing `/sign/[token]`,
> survey, portal-access email, signature/liability flows). Audited Jun 28. This is the spec for the
> remaining gaps. Model = **magic-link** (no passwords) per founder decision. White-label, multi-tenant.

## ✅ DONE this session
- **Customer status notifications** (`acc52b38`+ uncommitted → committed): en-route + job-complete emails
  with the portal magic-link, hooked into `app/api/job-orders/[id]/status/route.ts` (fires once per
  transition, fire-and-forget, no-customer guard, white-label). SMS wired but dormant until Twilio
  toll-free verification. Files: `emails/CustomerEnRouteEmail.tsx`, `emails/CustomerJobCompleteEmail.tsx`,
  `lib/portal-tokens.ts` (reusable token helper), `lib/notify-customer.ts`. Guardian PASS.

## 🔨 FEATURE A — Customer comments → notify management (2-way comms)
A customer leaves a comment from the portal → notifies admin + operations_manager + super_admin + the
job's `created_by` (salesperson/PM). Read-only portal otherwise.
- **Table `customer_comments`** (new migration, RLS): `id, tenant_id→tenants, job_order_id→job_orders,
  portal_token_id→customer_portal_tokens, author_kind ('customer'|'staff'), author_user_id (staff only),
  author_name, body (1..2000 CHECK), created_ip inet (never returned), is_hidden, created_at`. RLS:
  staff read/insert(staff reply)/hide tenant-scoped via `current_user_has_role(...)` +
  `current_user_tenant_id()`; **customers never use RLS — public endpoint uses supabaseAdmin**.
- **Endpoints:** `POST/GET /api/public/portal/[token]/comments` (token gate copied verbatim from
  `…/portal/[token]/job/[jobId]/route.ts` = `isPinnedJob||emailMatch||nameMatch` + tenant scope;
  rate-limit ≤3/min ≤20/hr per token via row-count window; store body raw, escape on render);
  `GET/POST /api/job-orders/[id]/comments(/reply)` (staff, `requireScheduleBoardAccess`).
- **UI:** portal per-job page `app/portal/[token]/job/[jobId]/page.tsx` (NEW, shared with Feature B) +
  `components/portal/CommentThread.tsx`; admin `app/dashboard/admin/jobs/[id]/_components/CustomerCommentsPanel.tsx`
  + unread badge. Render all customer text via React text nodes (auto-escape) — never dangerouslySetInnerHTML.
- **Notify fan-out:** clone `app/api/job-orders/[id]/notes/route.ts` lines ~90-131 (notifications bulk
  insert + best-effort email via `generateNotificationEmail` + `escapeHtml`).
- **Risks:** stored XSS (escape on render + email), spam (rate limit + CHECK + is_hidden), cross-tenant
  (token gate + tenant scope), header injection (server-constant subjects).

## 🔨 FEATURE B — Live "In Route" location tracker (DoorDash-style)
> NOTE: net-new — today GPS is a SINGLE snapshot at in_route (`route_start_latitude/longitude`), not a
> live feed. Needs the operator device to broadcast periodically while in_route.
- **Table `operator_location_pings`** (append-only, RLS): `id, tenant_id, job_order_id, operator_id→auth.users,
  latitude, longitude, accuracy, recorded_at`. RLS: operator inserts own (`operator_id=auth.uid()` +
  tenant), staff read tenant-scoped; **customers never use RLS**. 24h retention purge (cron, optional v1).
- **Endpoints:** `POST /api/operator/location` (Bearer, must be assigned operator + job `status='in_route'`
  + tenant match; 204 no-op otherwise so client stops). `GET /api/public/portal/[token]/location?jobId=`
  (token gate; **returns `{active:false}` unless status='in_route'**; else last-known coords + timestamp +
  `stale` flag + operator FIRST name + destination only — strict whitelist, never `select('*')`).
- **Operator capture:** `hooks/useLocationBroadcast.ts` — `navigator.geolocation.watchPosition` → throttled
  POST every ~30-60s while in_route; stop on arrival/complete/unmount. Wire into the operator in_route screen.
- **Customer view:** `components/portal/LiveRouteTracker.tsx` on the portal per-job page, shown only when
  `active:true`. **v1 = lightweight** (no map dep): "technician on the way" + operator first name +
  last-updated + haversine distance/crude ETA. **v2 (optional) = Google map** — must mount its own
  GoogleMapsProvider in the portal route + `importLibrary('maps','marker')` (legacy `<GoogleMap>` is gone,
  `@react-google-maps/api` banned); degrade to v1 on loadError (localhost referrer block). Poll every
  20-30s while visible; stop on `active:false`. (Realtime is overkill + a security risk — polling is correct.)
- **Privacy/security:** location exposed ONLY while in_route, ONLY for the token's job, ONLY coords+time+
  first name; hard cutoff at arrival; token expiry; operator broadcasts only their own assigned in_route job;
  document "location shared with customer while en route" in the operator UI.

## Sequencing / parallelization
- Shared NEW file `app/portal/[token]/job/[jobId]/page.tsx` hosts BOTH A's thread + B's tracker — one
  builder or sequence to avoid conflict.
- Each feature: migration FIRST (supabase-migration-author → rls-policy-auditor) → then API ∥ portal UI ∥
  admin/operator UI in parallel → guardian-review. **rls-auditor must confirm**: tenant scope on every
  policy, SECURITY DEFINER helpers (no user_metadata), public reads via supabaseAdmin with field whitelists.
- Recommended order: **A (comments) next** (self-contained, high comms value), then **B v1** (lightweight
  tracker), then **B v2 map** if wanted. Then the branding/Settings design pass.

## Then: branding + Settings design pass (separate)
- 1-line fix: `/api/admin/branding` PATCH + upload are `requireSuperAdmin` but founder wants **admin too** →
  change to `requireAdmin` (UI already lets admin in). Clean hardcoded Patriot defaults in
  `lib/branding-context.tsx` (`support_email`, cache key `patriot-branding`) + `/patriot#pricing` link.
- Design pass: extract a focused **Color Palette** editor (presets, contrast check), cleaner Settings nav.
  Editor is ~95% built (8 colors, picker, live preview, logo upload, saves to `tenant_branding`, applies
  CSS vars app-wide). White-label-correct except the defaults above.
