# Next Session Prompt — Copy/Paste This Into New Chat

---

## PROMPT START

You are resuming work on the Pontifex Platform — a white-label SaaS for concrete cutting operations. Read these files FIRST before doing anything:

1. `CLAUDE.md` — Project conventions and sprint backlog
2. `CLAUDE_HANDOFF.md` — What was done last session and current state
3. `DASHBOARD_REDESIGN_PLAN.md` — The #1 priority task: professional dashboard with sidebar
4. `NEXT_SESSION_GAMEPLAN.md` — All tasks with agent assignments

## Your Role
You are the Senior Software Developer managing a team of 4 specialized agents. Deploy them in parallel for maximum speed:

- **ATLAS** — Backend & Database (APIs, migrations, Supabase)
- **PIXEL** — UI/UX Frontend (React, Tailwind, components, light theme ONLY)
- **FORGE** — Integration & Logic (connecting frontend to backend, state, business rules)
- **SENTINEL** — Security & QA (testing, audits, bug fixing — runs LAST after builds)

## Execution Order

### Round 1 — Dashboard Redesign (HIGHEST PRIORITY)
Deploy in parallel:
1. **PIXEL**: Build `components/DashboardSidebar.tsx` — collapsible sidebar with 4 grouped sections (Operations, Management, Tools, Admin), icons, active state, badge counts, mobile drawer. Follow the exact spec in DASHBOARD_REDESIGN_PLAN.md.
2. **ATLAS**: Build `GET /api/admin/dashboard-summary` API — jobs today (list + count), revenue MTD, open items (pending timecards, overdue invoices, unassigned jobs), crew utilization %, team status (each operator's current state), recent activity feed.

### Round 2 — Dashboard Assembly
Deploy sequentially:
1. **FORGE**: Update `app/dashboard/admin/layout.tsx` to wrap all admin pages with sidebar + header (search, "+ New Job" dropdown, NotificationBell, user avatar)
2. **PIXEL**: Rebuild `app/dashboard/admin/page.tsx` — KPI row, Today's Schedule list, Action Required panel, Team Status, Quick Actions, Recent Activity. Remove the card dump and analytics tab toggle. Follow DASHBOARD_REDESIGN_PLAN.md exactly.

### Round 3 — Schedule Form + Customer Profiles (Parallel)
Deploy in parallel:
1. **ATLAS**: Build APIs for smart customer dropdowns — GET /api/admin/customers/[id]/po-numbers, GET /api/admin/customers/[id]/site-contacts
2. **FORGE**: Wire schedule form to use customer history dropdowns (PO numbers, site contacts from previous jobs)
3. **PIXEL**: Build combobox components for PO numbers and site contacts, ensure customer profiles pages are light theme

### Round 4 — QA
Deploy:
1. **SENTINEL**: Full test pass on dashboard, sidebar nav, schedule form, timecard, all admin pages. Fix any bugs found.

## Critical Rules
- **LIGHT THEME ONLY** on all dashboard pages (bg-slate-50/blue-50, white cards, gray text). The dark sidebar is OK for nav.
- Run `npm run build` after every round
- Commit after each round with descriptive messages
- Push to `feature/schedule-board-v2` when done
- Use `requireAuth()`/`requireAdmin()` on all API routes
- Filter by `tenant_id` on all queries
- Update `CLAUDE_HANDOFF.md` at the end of the session

## Context
- Branch: `feature/schedule-board-v2`
- Supabase project: `klatddoyncxidgqtcjnu`
- Patriot tenant ID: `ee3d8081-cec2-47f3-ac23-bdc0bb2d142d`
- Company code: `PATRIOT`
- Build must pass with 0 errors
- 90+ database tables, 70+ migrations

Start by reading the files listed above, then execute Round 1.

## PROMPT END
