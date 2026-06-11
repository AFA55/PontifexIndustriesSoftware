# Dashboard Redesign Plan — Professional Operations Dashboard
**Created by:** Claude (Opus) — Senior Software Architect
**Priority:** HIGH — This is the first thing admins see. Must look world-class.

---

## Research Summary

Analyzed 7 top dispatch/field-service platforms: ServiceTitan, Jobber, Housecall Pro, FieldPulse, BuildOps, Monday.com, and modern SaaS dashboard trends.

**Universal pattern:** Collapsible Left Sidebar + Top Header + KPI Row + Two-Column Content

**Current problem:** Our dashboard is a "card dump" — all cards equal size, no hierarchy, no sidebar, cards scattered without grouping, analytics tab is a separate view instead of embedded context.

---

## Target Architecture

```
+--sidebar (240px)--+----header bar (sticky)-------------------------+
|  [Patriot Logo]   | [Search...]  [+ New Job v] [Bell 3] [Avatar]  |
|                   |                                                 |
|  OPERATIONS       |  +-- KPI Row (4 gradient cards) --------------+|
|  > Dashboard      |  | Jobs Today | Revenue MTD | Open Items | %  ||
|  > Schedule Board |  +--------------------------------------------+|
|  > Schedule Form  |                                                 |
|  > Dispatch       |  +-- Two Column (60/40) ----------------------+|
|                   |  |                      |                      ||
|  MANAGEMENT       |  | TODAY'S SCHEDULE     | ACTION REQUIRED      ||
|  > Timecards      |  | 7:00 JOB-2026-0042 | > 3 pending timecards||
|  > Team Profiles  |  |   Mike R. - On Site | > 1 unsigned estimate||
|  > Customers      |  | 8:30 JOB-2026-0043 | > 2 overdue invoices ||
|  > Invoicing      |  |   Dave S. - En Route|                      ||
|  > Completed Jobs |  | 10:00 JOB-2026-0044| TEAM STATUS           ||
|                   |  |   [unassigned]      | Mike: On Job (green)  ||
|  TOOLS            |  |                     | Dave: En Route (blue) ||
|  > Facilities     |  | [View Full Board ->]| Tom: Idle (gray)     ||
|  > NFC Tags       |  |                     | Sam: Break (yellow)  ||
|  > Form Builder   |  | NOTIFICATIONS       |                      ||
|                   |  | (recent 5)          | QUICK ACTIONS         ||
|  ADMIN            |  | > Clock-in reminder | [+ New Job]          ||
|  > Settings       |  | > Invoice #402 paid | [+ New Estimate]     ||
|  > Notifications  |  | > Job completed     | [+ New Invoice]      ||
|  > Analytics      |  |                     | [Send Schedule]      ||
|                   |  +--------------------------------------------+|
|  [User Avatar]    |                                                 |
|  Andres A.        |  +-- RECENT ACTIVITY (full width) ------------+|
|  Super Admin      |  | 2m ago Job-042 completed by Mike R.        ||
|  [Sign Out]       |  | 15m ago Invoice #402 paid — $2,400         ||
+-------------------+  | 1h ago New estimate req — ABC Corp          ||
                       +---------------------------------------------+
```

---

## Implementation Plan

### Phase 1: Sidebar Navigation Component

**Agent: PIXEL (UI)**

Create `components/DashboardSidebar.tsx`:

```
Sections:
  OPERATIONS (blue accent)
    - Dashboard (LayoutDashboard icon) — /dashboard/admin
    - Schedule Board (Calendar icon) — /dashboard/admin/schedule-board
    - Schedule Form (FileEdit icon) — /dashboard/admin/schedule-form

  MANAGEMENT (purple accent)
    - Timecards (Clock icon) — /dashboard/admin/timecards [badge: pending count]
    - Team Profiles (Users icon) — /dashboard/admin/operator-profiles
    - Customers (UserCircle icon) — /dashboard/admin/customers
    - Invoicing (CreditCard icon) — /dashboard/admin/billing
    - Completed Jobs (CheckCircle icon) — /dashboard/admin/completed-jobs

  TOOLS (green accent)
    - Facilities (Building icon) — /dashboard/admin/facilities
    - NFC Tags (Wifi icon) — /dashboard/admin/settings/nfc-tags
    - Form Builder (Layout icon) — /dashboard/admin/form-builder

  ADMIN (red accent)
    - Settings (Settings icon) — /dashboard/admin/settings
    - Notifications (Bell icon) — /dashboard/admin/notifications [badge: unread count]
    - Analytics (BarChart icon) — /dashboard/admin/analytics
```

Features:
- Collapsible (icon-only mode) — remembers preference in localStorage
- Active page highlight (left border accent + bg tint)
- Badge counts on Timecards and Notifications
- User profile at bottom with role badge and sign-out
- Mobile: slide-over drawer triggered by hamburger in header
- Smooth transitions (width: 240px expanded, 64px collapsed)

### Phase 2: Dashboard Layout Wrapper

**Agent: FORGE (Integration)**

Create `app/dashboard/admin/layout.tsx` (if not exists, or update):
- Wraps all admin pages with sidebar + header
- Header: Search bar, "+ New Job" dropdown, NotificationBell, User avatar
- Main content area scrolls independently from sidebar
- Responsive: sidebar collapses to icons at < 1024px, becomes drawer at < 768px

### Phase 3: Dashboard Home Redesign

**Agent: PIXEL (UI) + FORGE (Logic)**

Rebuild `app/dashboard/admin/page.tsx`:

**Remove:**
- The current card grid (ADMIN_CARDS, card permissions, card rendering)
- The analytics tab toggle
- The view toggle (modules/analytics)

**Add:**

1. **KPI Row (4 cards, top)**
   - Jobs Today (count + vs yesterday %)
   - Revenue This Month ($ + trend)
   - Open Items (pending approvals, unsigned estimates, overdue invoices)
   - Crew Utilization (% of team currently on jobs)
   - Design: gradient cards (blue, green, amber, purple), large number, small label + trend

2. **Today's Schedule (left column, 60%)**
   - Compact list of today's jobs sorted by time
   - Each row: Time | Job # | Customer | Operator name | Status pill
   - Status colors: blue=scheduled, amber=in-route, green=on-site, emerald=complete, red=overdue
   - Click row → opens job detail
   - "View Full Schedule Board →" link at bottom
   - If no jobs today: "No jobs scheduled. [Create Job]"

3. **Action Required (right column, 40%)**
   - Grouped by type with counts:
     - Pending Timecards (count) → link to /admin/timecards
     - Unsigned Estimates (count) → link
     - Overdue Invoices (count) → link to /admin/billing
     - Unassigned Jobs (count) → link to schedule board
   - Each item is clickable
   - Red/amber urgency indicators

4. **Team Status (right column, below actions)**
   - List of all operators with real-time status
   - Green dot = on job, Blue dot = en route, Gray dot = idle, Yellow dot = break
   - Show current job name if on a job
   - Click → opens operator profile

5. **Notifications (left column, below schedule)**
   - Last 5 notifications, compact list
   - Unread highlighted
   - "View All →" link

6. **Quick Actions (right column)**
   - 4 buttons: New Job, New Estimate, New Invoice, Send Schedule
   - Each is a gradient icon button

7. **Recent Activity (full width, bottom)**
   - Chronological feed: job completions, payments received, new bookings
   - Timestamp + icon + description
   - Click → navigates to source

### Phase 4: API Support

**Agent: ATLAS (Backend)**

Create/update APIs needed:
1. `GET /api/admin/dashboard-summary` — Returns:
   - jobs_today (count + list with time, job#, customer, operator, status)
   - revenue_mtd (total + % change vs last month)
   - open_items (pending_timecards, unsigned_estimates, overdue_invoices, unassigned_jobs)
   - crew_utilization (active_operators / total_operators %)
   - team_status (list of operators with current status + current job)
   - recent_activity (last 10 events)

2. Update notification bell to use existing `/api/notifications` endpoint

### Phase 5: Testing

**Agent: SENTINEL (QA)**
1. Verify sidebar navigation works on all pages
2. Verify dashboard data loads correctly
3. Verify mobile responsive (sidebar collapses)
4. Verify all links navigate correctly
5. Verify KPI numbers match actual data
6. Verify real-time team status updates

---

## Design Rules

### Typography Scale
- KPI numbers: `text-4xl font-bold` (36-48px)
- Section headers: `text-lg font-semibold` (18px)
- Card titles: `text-base font-medium` (16px)
- Labels: `text-sm text-gray-500` (14px)
- Body: `text-sm text-gray-600` (14px)
- Timestamps: `text-xs text-gray-400` (12px)

### Color System
- Page bg: `bg-gray-50` or `bg-slate-50` (clean, not gradient heavy)
- Cards: `bg-white rounded-xl shadow-sm border border-gray-100`
- Sidebar: `bg-slate-900` or `bg-white` (dark sidebar is acceptable — it's navigation, not content)
- Header: `bg-white border-b border-gray-200` (clean, not gradient)
- Status: green=active/complete, blue=scheduled/en-route, amber=warning/pending, red=overdue/alert
- Accent: `blue-600` for primary actions, `purple-600` for secondary

### Spacing
- Section gaps: `gap-6` (24px)
- Card padding: `p-6` (24px)
- Between KPI cards: `gap-4` (16px)
- Sidebar item padding: `px-4 py-3`

### The 40-30-20-10 Rule
- 40% → Today's Schedule (primary operational view)
- 30% → KPIs + Action Required (what needs attention)
- 20% → Team Status + Quick Actions (context)
- 10% → Navigation + chrome

---

## Execution Order for Sonnet

1. **Round 1 (Parallel):**
   - PIXEL: Build DashboardSidebar component
   - ATLAS: Build /api/admin/dashboard-summary endpoint

2. **Round 2 (Sequential):**
   - FORGE: Update admin layout.tsx with sidebar + header wrapper

3. **Round 3 (Parallel):**
   - PIXEL: Rebuild dashboard home (KPIs, schedule, actions, team, activity)
   - FORGE: Wire dashboard to new API

4. **Round 4:**
   - SENTINEL: Full test pass
   - All: Build verify + commit + push

---

## What Gets Removed
- `ADMIN_CARDS` array rendering on dashboard (cards move to sidebar nav)
- Analytics tab toggle on dashboard (analytics is its own page via sidebar)
- `activeView` state ('modules' | 'analytics') toggle
- Card permission checking on dashboard home (sidebar handles nav, dashboard shows data)
- The "card dump" layout entirely

## What Gets Preserved
- RBAC system (sidebar items show/hide based on role permissions)
- Branding context (logo, colors)
- NotificationBell component (moves to header)
- All existing pages (they just get accessed via sidebar instead of cards)
