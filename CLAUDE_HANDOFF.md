# CLAUDE CODE AGENT HANDOFF DOCUMENT
**Date:** April 2, 2026 | **Branch:** `feature/schedule-board-v2` | **Build Status:** PASSING ✅ (189 pages)

---

## CURRENT STATE

### Git Status
- **Branch:** `feature/schedule-board-v2`
- **Last commit:** `6398ad3f` — "feat: account invitation + onboarding setup flow + avatar uploads"
- **Pushed to origin** ✅
- **Build:** PASSING (0 errors, 189 static pages)

### Recent Commits
```
6398ad3f feat: account invitation + onboarding setup flow + avatar uploads
98580d7d feat: Team Profiles page with feature toggle panels and invite flow
f42c19f7 feat: Active Jobs page — personal job metrics, pending requests, attention flags
9235c996 feat: user feature flags system, job change requests, super admin grant flow
42b2a622 feat: hide scope/progress from operators, lock submitted day entries, simplify tour
63f0e9c0 chore: update handoff doc — session complete, all critical bugs fixed
8d44898a fix: resolve notification table mismatch and my-jobs job fetch bug
fd19133e fix: eliminate stacking server-issues toasts and false-positive banner
f52be035 fix: lazy Stripe init + force-dynamic on billing routes
```

---

## WHAT WAS DONE (This Session)

### 1. Database Cleanup — Fresh Slate
- Deleted all 22 test jobs, 11 test customers, 5 timecards, 6 daily logs, 2 invoices, all notifications
- Removed 18 fake demo operator profiles (auth records remain but 403 on login)
- **Kept 4 accounts:** Super Admin, Demo Admin, Demo Operator, Demo Team Member
- Preserved all tenant config, NFC tags, RLS policies, settings

### 2. User Feature Flags System (FORGE)
**New DB tables:**
- `user_feature_flags` — 19 boolean toggles per user (schedule, jobs, people, tools, admin)
- `user_invitations` — email invite tokens with pre-set flags, 7-day expiry
- Extended `profiles` with: `setup_completed`, `waiver_signed_at`, `waiver_ip`, `notification_consent`
- Extended `schedule_change_requests` with: `current_value`, `requested_value`, `reason`

**New API routes:**
- `GET/PUT /api/admin/user-flags/[userId]` — read/write feature flags per user
- `POST /api/admin/grant-super-admin` — elevate user to super_admin (super_admin only)
- `GET/POST /api/admin/job-change-requests` — list/create schedule change requests
- `PUT /api/admin/job-change-requests/[id]` — approve/reject (super_admin only, auto-applies date extensions)

**`lib/feature-flags.ts`** — `useFeatureFlags(userId, role)` hook, short-circuits for super_admin

### 3. Account Invitation + Setup Flow (ONBOARD)
**New API routes:**
- `POST /api/admin/invite` — sends branded Resend invitation email with 7-day token
- `GET /api/setup-account/validate` — validates token (public)
- `POST /api/setup-account/complete` — creates/updates user, applies flags, marks waiver (public)
- `POST /api/upload/avatar` — upserts to Supabase Storage `avatars` bucket (public, used during setup)
- `POST /api/profile/avatar` — authenticated avatar upload for profile settings

**New page `/setup-account`** — 3-step onboarding for invited users:
1. Profile photo upload + password creation
2. Liability waiver scroll + checkbox (records IP + timestamp)
3. Email/SMS notification consent

**Avatar display** added to:
- Admin layout header (top-right user bubble)
- Dashboard sidebar user chip
- Operator dashboard nav
- My Profile page (camera button → immediate upload)

### 4. Active Jobs Page (ACTIVE)
**New page `/dashboard/admin/active-jobs`:**
- Stats: Total Active, Today, In Progress, Needs Attention (each clickable filter)
- Filter tabs: All / Today / In Progress / Needs Attention
- Job cards: number, status, change request warnings, completion approval flags
- Super admins: toggle between "My Jobs Only" / "All Company Jobs"
- Added to admin sidebar under OPERATIONS

**New API route `GET /api/admin/active-jobs`:**
- `?mine=true` scopes to jobs where user is creator/assignee/salesperson
- Returns pending change request count and completion approval flag per job

### 5. Team Profiles — Permission Management (PIXEL)
**New components:**
- `components/FeatureFlagsPanel.tsx` — 19 toggle switches in 6 groups, 4 one-click presets:
  - 💼 Sales Admin (schedule + customers)
  - ⚙️ Ops Admin (full ops access)
  - 💰 Finance Admin (billing + timecards)
  - 🏗️ Field Admin (jobs + schedule only)
- `components/InviteMemberModal.tsx` — name/email/role/type → sends invite email

**Redesigned `app/dashboard/admin/team-profiles/page.tsx`:**
- Stats row: total staff, active, super admins, roles in use
- Searchable + role-filtered member list with avatars
- Sliding detail panel: "Profile Info" tab + "Feature Permissions" tab
- Grant Super Admin button with confirmation (super_admin only)
- Invite Member button in header (super_admin only)

### 6. Operator Experience Simplification
- Removed progress dots (green/amber/red) from all operator job cards
- Removed scope checklist from work-performed page
- Lock submitted day entries — banner shown if day already submitted
- Simplified onboarding tour to remove all progress/scope language

---

## FEATURE STATUS

### Complete ✅
| Feature | Notes |
|---------|-------|
| Multi-tenant architecture | Company code login, tenant_id on all tables |
| White-label branding | Tenant branding context, debranded defaults |
| Schedule Board | View, time-off, editing, crew grid, notifications |
| Schedule Form | Customer-first flow, facility compliance |
| Quick Add Job | Start/end date pickers, 12-type multi-select |
| Personalized Dashboards | Personal/team scope per role |
| Job Scope Tracking | Admin defines, operators log (admin-side only) |
| Job Completion Workflow | Submit → notify → approve/reject |
| Progress Visibility | Admin-only, hidden from operators |
| Timecard System | Clock in/out, NFC, GPS, segments, approval |
| Notification System | In-app + email, completion requests working |
| Billing & Invoicing | Create, send, remind, QuickBooks CSV |
| Stripe Billing Pages | Pricing page, subscription dashboard |
| Customer Management | COD, contacts, billing dashboard |
| Operator Workflow | My jobs → work → complete (simplified) |
| Facilities & Badges | CRUD, badge tracking, auto-expiration |
| Analytics Dashboard | 20 widgets, drag-and-drop |
| **User Feature Flags** | ✅ NEW — per-user feature toggles, 4 presets |
| **Account Invitation Flow** | ✅ NEW — email invite, waiver signing, avatar |
| **Setup Account Page** | ✅ NEW — /setup-account onboarding flow |
| **Avatar Uploads** | ✅ NEW — all users, Supabase Storage |
| **Active Jobs Page** | ✅ NEW — personal job view, change request flags |
| **Team Profiles Overhaul** | ✅ NEW — toggle panel, invite modal, grant super admin |
| **Job Change Requests** | ✅ NEW — restricted admins request changes, super admin approves |
| **Database Cleanup** | ✅ NEW — fresh slate, 4 accounts retained |

### Remaining — Final Sprint
- [ ] **Schedule board "Request Change" button** for restricted admins (read-only users see button instead of edit)
- [ ] **Apply feature flags to sidebar nav** — hide nav items based on `can_view_*` flags
- [ ] **E2E live browser walkthrough** — create job → assign → complete → approve
- [ ] Mobile responsive audit on operator pages
- [ ] Patriot visual branding (logos, custom colors)
- [ ] Connect Stripe live keys (add STRIPE_SECRET_KEY to Vercel)
- [ ] Production deployment — Vercel env vars, custom domain, SSL
- [ ] Merge to main + final release

---

## KEY ARCHITECTURE

### Feature Flag System
- Table: `user_feature_flags` (user_id, tenant_id, 19 boolean flags)
- Super admins / ops_managers bypass all flags — always get full access
- Hook: `useFeatureFlags(userId, role)` in `lib/feature-flags.ts`
- UI: `FeatureFlagsPanel` in Team Profiles → "Feature Permissions" tab
- 4 presets: sales_admin, ops_admin, finance_admin, field_admin

### Account Creation Flow
1. Super admin → Team Profiles → "Invite Member"
2. Fill name, email, role, admin type (sets default flags)
3. System sends Resend email with 7-day setup link
4. New user → `/setup-account?token=xxx`
5. Step 1: photo + password | Step 2: waiver signing | Step 3: email/SMS consent
6. Account created, flags applied, ready to log in

### Notification Flow
- Completion requests → `notifications` table → admin bell ✅
- Change requests → `notifications` table → super admin bell
- Invite emails → Resend → `/setup-account`

### Database Tables (95+)
New: `user_feature_flags`, `user_invitations`
Extended: `profiles` (avatar, setup, waiver), `schedule_change_requests` (reason, values)

---

## ACCOUNTS (Fresh DB)
| Account | Role | Email |
|---------|------|-------|
| Super Admin | super_admin | andres.altamirano1280@gmail.com |
| Demo Admin | admin | admin@pontifex.com |
| Demo Operator | operator | demo@pontifex.com |
| Demo Team Member | apprentice | team@pontifex.com |

---

## NEXT SESSION PRIORITIES
1. **Apply feature flags to sidebar** — hide nav items based on user's flags (TODAY)
2. **Schedule board "Request Change" button** — restricted admins see this instead of edit controls
3. **E2E browser test** — full job creation → operator completion → admin approval walkthrough
4. **Mobile responsive audit** — operator pages
5. **Patriot branding** — logo, custom colors
6. **Stripe live keys + deploy** → production
