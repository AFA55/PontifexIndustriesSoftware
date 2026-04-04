# CLAUDE CODE AGENT HANDOFF DOCUMENT
**Date:** April 4, 2026 | **Branch:** `feature/schedule-board-v2` | **Build Status:** PASSING ✅ (0 errors)

---

## CURRENT STATE

### Git Status
- **Branch:** `feature/schedule-board-v2`
- **Last commit:** `e47bbfe3` — "fix: add tenant_id + approval_status to timecards_with_users view"
- **Pushed to origin** ✅
- **Merged to `main`** ✅ (production live at pontifexindustries.com)
- **Build:** PASSING (0 errors)

### Recent Commits (This Session)
```
e47bbfe3 fix: add tenant_id + approval_status to timecards_with_users view
173b45a4 feat: editable hire date + updated feature permission presets on team profiles
ffbeb277 feat: replace schedule-form New Customer modal with CustomerForm + add multi-contact support
18f2eba5 fix: z-index sidebar overlay on all 26 dashboard pages
d5c290f3 fix: lazy Stripe init in create-offer-checkout to fix Vercel build
f752450a fix: lazy Resend init in invite route to fix Vercel build
5f6291e2 feat: complete light theme conversion + sidebar overlay fix
```

---

## WHAT WAS DONE (This Session — April 4, 2026)

### 1. Light Theme Conversion
- All 26+ admin and operator dashboard pages converted from dark to light theme
- `bg-gray-50` page backgrounds, `bg-white` cards, `border-gray-200` borders, `text-gray-900` headings
- Sidebar intentionally stays dark (`bg-slate-900`) — by design

### 2. Sidebar Z-Index Fix (26 pages)
- Bulk replaced `sticky top-0 z-50` → `sticky top-0 z-10` across all dashboard pages
- Mobile sidebar is `fixed z-50` — was being overlapped by sticky page headers

### 3. Schedule Form — New Customer Modal Upgrade
- Replaced 110-line inline blue-gradient modal with `<CustomerForm>` component
- Now uses the same full modal as Customers page: Company Info / Main Contact / Billing Contact / Payment & Billing / Address sections
- `+ New Customer` button updated to `bg-purple-600 hover:bg-purple-700 rounded-xl font-bold` to match Customers page
- Pre-fills company name when clicking "Create X as new customer" from search dropdown
- `handleCreateCustomer` accepts `data: Record<string, any>` to match CustomerForm's `onSubmit` signature

### 4. Customers Page — Multi-Contact Support
- `CustomerForm.tsx`: Added `AdditionalContact` interface + state array
- UI section: "+ Add a Contact" button, contact rows with Name + Phone + type pill (On-Site / Billing / Other) + remove X
- `app/api/admin/customers/route.ts`: POST handler reads `additional_contacts[]`, bulk-inserts into `customer_contacts` table (fire-and-forget)

### 5. Team Profiles — Editable Hire Date
- "Member Since" renamed to "Hire Date" throughout
- New `EditableDateRow` component: hover to reveal pencil → inline date picker → Save/Cancel
- Saves via `PATCH /api/admin/profiles/[id]` with `{ hire_date: isoDate }`
- "Saved ✓" confirmation shown for 2 seconds after save
- Optimistically updates both `selectedMember` and `members` list in state

### 6. Feature Permissions Panel Overhaul
- `components/FeatureFlagsPanel.tsx`:
  - Removed all emojis from preset buttons and section headers
  - Renamed presets: **Sales Admin**, **Operations Admin**, **Admin**, **Operator**, **Team Member**
  - Sales Admin: `can_view_all_jobs: false` by default (sees only assigned jobs)
  - Operator preset: active jobs, timecard, personal hours/metrics only
  - Team Member preset: most restricted — my-jobs and hours only
  - Job Visibility section shows contextual note ("can view all jobs" vs "only assigned")

### 7. Facilities Modal Field Visibility Fix
- `app/dashboard/admin/facilities/page.tsx`: Added `bg-white text-gray-900 placeholder-gray-400` to all 20 inputs/textareas/selects in AddFacilityModal, EditFacilityModal, AddBadgeModal

### 8. Timecards Internal Server Error Fix (Production Bug)
- **Root cause:** `timecards_with_users` view was missing `tenant_id` and `approval_status` columns from the underlying `timecards` table
- Every call to `/api/admin/timecards` was 500-ing because PostgREST couldn't filter by `tenant_id`
- **Fix:** Dropped and recreated the view to include `t.tenant_id` and `t.approval_status`
- Migration applied live + saved as `20260404001004_fix_timecards_with_users_view.sql`
- Timecards page now returns 200 ✅

### 9. Stale Process / Cache Troubleshooting
- Vercel CDN cache was served stale — user purged via Cloudflare "Purge Everything"
- `.next/` cache deleted and dev server restarted multiple times due to stale process on port 3000
- **Lesson:** If user reports changes not reflecting — kill port 3000 (`lsof -ti:3000 | xargs kill -9`), delete `.next/`, restart preview server

---

## FEATURE STATUS

### Complete ✅
| Feature | Status | Notes |
|---------|--------|-------|
| Multi-tenant architecture | ✅ | Company code login, tenant_id on all tables |
| White-label branding | ✅ | Tenant branding context, debranded defaults |
| Light theme | ✅ | All admin/operator pages light, sidebar stays dark |
| Schedule Board | ✅ | All operators view, time-off, editing, crew grid, notifications |
| Schedule Form | ✅ | Customer-first flow, New Customer = full CustomerForm modal |
| Team Profiles | ✅ | Editable hire date, role-specific cards |
| Feature Permissions | ✅ | No emojis, 5 clean presets, job visibility toggle |
| Customer Management | ✅ | Multi-contact support, Google Maps autocomplete |
| Facilities | ✅ | CRUD, badge tracking, visible modal inputs |
| Timecards | ✅ | Full clock in/out, NFC, GPS, segments, approval, 500 bug fixed |
| Operator Skills | ✅ | 9 predefined + custom, 1-10 ratings, visual bars |
| Capacity Settings | ✅ | Per-skill limits, difficulty threshold, crew size rules |
| Active Jobs | ✅ | All admins see all jobs, "Coming Up" tab |
| Notification System | ✅ | In-app + email, auto-reminders |
| Analytics Dashboard | ✅ | 20 widgets, charts, commission tracking |
| Billing & Invoicing | ✅ | Create, send, remind, QuickBooks CSV |
| Security Audit | ✅ | NFC bypass, XSS, tenant isolation |
| NFC Clock-In (Web API) | ✅ | NDEFReader, iOS PIN fallback, GPS remote mode |

### Remaining — Final Sprint
- [ ] End-to-end workflow testing (schedule → dispatch → execute → complete → invoice)
- [ ] Mobile responsive audit on all operator pages
- [ ] Patriot-specific visual assets (logos, custom colors in tenant_branding)
- [ ] Production deployment prep (env vars, custom domain, SSL)
- [ ] Final build verification & merge to main

---

## NEXT SESSION PRIORITIES
1. **E2E workflow test**: schedule → dispatch → execute → complete → invoice
2. **Mobile responsive audit**: operator pages, NFCClockIn on small screens
3. **Patriot branding**: logo upload, custom colors in tenant_branding settings
4. **Production prep**: Vercel env vars, custom domain DNS

---

## KNOWN ISSUES / WATCH LIST
- If changes don't appear on localhost: kill port 3000 with `lsof -ti:3000 | xargs kill -9`, delete `.next/`, restart preview server
- If Vercel production seems stale: go to Cloudflare → Caching → Purge Everything
- Worktrees do NOT inherit `.env.local` — copy from main repo when using parallel agents

---

## INFRASTRUCTURE

### Vercel
- **Auto-deploy**: pushes to `feature/schedule-board-v2` trigger preview deploys
- **Merges to `main`** trigger production at pontifexindustries.com
- **Env vars required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

### Supabase
- **Project ID**: `klatddoyncxidgqtcjnu`
- **95+ tables**, all RLS enabled, JWT metadata for tenant isolation
- **Views fixed this session**: `timecards_with_users` — now includes `tenant_id` and `approval_status`
- **New migration**: `20260404001004_fix_timecards_with_users_view.sql`

### Dev Server
- Preview server managed via `preview_start` / `preview_stop` MCP tools
- Config in `.claude/launch.json`
- Commits require `export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"` prefix
