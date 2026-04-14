# Pontifex Industries Platform — Claude Instructions

## Project
Concrete cutting operations platform for Patriot Concrete Cutting (white-label as Pontifex Industries).
Next.js 15 (App Router) + React 19 + TypeScript + Supabase (PostgreSQL) + Tailwind CSS.

## Autonomous Mode
- Make all code changes directly — do not ask for confirmation on edits, file creation, or refactors
- Apply database migrations via Supabase MCP when ready
- Run `npm run build` after significant changes to verify no errors
- Commit work in logical chunks with descriptive messages
- Push to feature branch when commits are ready
- When starting a new session, read CLAUDE_HANDOFF.md first to resume context
- At the END of every session, update CLAUDE_HANDOFF.md with what was done and what's next

## Session Workflow
1. **Start of session:** Read CLAUDE_HANDOFF.md → pick up where last session left off
2. **During session:** Work through sprint backlog top-to-bottom unless user reprioritizes
3. **After each feature:** Run `npm run build` to verify, commit with descriptive message
4. **End of session:** Update CLAUDE_HANDOFF.md + push to branch
5. **If user says "pick up next task":** Read the sprint backlog and start the next unchecked item

## Parallel Work
- User can request multiple features built simultaneously using parallel agents
- Each agent works in an isolated worktree to avoid conflicts
- Batch by layer when possible: all backend API routes → all UI pages → all migrations
- **CRITICAL**: Worktree branches MUST be merged back to `feature/schedule-board-v2` before session ends. User's localhost runs from the main repo, not worktrees.
- **CRITICAL**: Worktrees do NOT inherit `.env.local` — copy it from the main repo or Supabase calls will fail.
- If `.next/` cache causes "routes-manifest.json" errors, delete `.next/` and restart the dev server.

## Key Conventions
- API routes use `requireAuth()`, `requireAdmin()`, `requireSuperAdmin()`, or `requireScheduleBoardAccess()` from `lib/api-auth.ts`
- Client pages use `getCurrentUser()` from `lib/auth.ts` with role array checks in useEffect
- Supabase admin client (`lib/supabase-admin.ts`) for all server-side DB operations (bypasses RLS)
- Supabase public client (`lib/supabase.ts`) for client-side
- API response format: `{ success: true, data: {...} }` or `{ error: 'message' }` with HTTP status
- All logging is fire-and-forget via `Promise.resolve(supabaseAdmin.from(...).insert(...)).then(...).catch(() => {})`
- Job numbers: `JOB-{year}-{6 digits}` (schedule form) or `QA-{year}-{6 digits}` (quick add)
- Purple/dark theme aesthetic with Tailwind
- Use lucide-react icons throughout
- Mobile-first responsive design

## Database
- Supabase project: `klatddoyncxidgqtcjnu`
- 70+ migrations in `supabase/migrations/`
- 90+ tables in production
- All tables have RLS enabled
- New tables should use JWT metadata for RLS: `auth.jwt() -> 'user_metadata' ->> 'role'`

## Roles (priority order)
super_admin > operations_manager > admin > salesman > shop_manager > inventory_manager > operator > apprentice

## Branch
Working branch: `feature/schedule-board-v2` (main is production)

## Build & Test
```bash
npm run dev        # Dev server on port 3000
npm run build      # Production build check (must pass with 0 errors)
```

## Context Files
- `CLAUDE_CONTEXT.md` — Full project architecture reference
- `CLAUDE_SESSION_CONTEXT.md` — Detailed schema, patterns, business rules
- `CLAUDE_HANDOFF.md` — Latest session handoff with pending work (ALWAYS update at end of session)

---

## Sprint Backlog (Target: April 2, 2026)

### Week 1 — Core Feature Completion (March 19–25) ✅ COMPLETE
- [x] Finish dispatch ticket PDF generation
- [x] Apply permit fields migration to Supabase
- [x] Customer signature capture in job completion flow
- [x] Photo upload during job execution
- [x] PDF invoice generation (using @react-pdf/renderer)
- [x] QuickBooks CSV export from billing page

### Sessions 4-6 — Major Features (March 25-26) ✅ COMPLETE
- [x] Schedule board: all operators view, time-off, skill warnings, realtime colors, inline editing
- [x] Schedule form redesign: customer-first flow, project name, smart contact dropdown, facility compliance
- [x] Timecard + NFC system: weekly view, per-operator breakdown, NFC management
- [x] Facilities & badging: facility CRUD, badge tracking, auto-expiration
- [x] Approval workflow: reject/approve/resubmit, form history
- [x] Customer portal: public signature page, form builder, surveys
- [x] Work-performed gate: block completion without logging work

### Sessions 7-8 — Multi-Tenant & Landing (March 28-29) ✅ COMPLETE
- [x] Multi-tenant architecture (tenant_id on all tables, company code login)
- [x] White-label branding system (tenant_branding, BrandingProvider)
- [x] Debranded all hardcoded Pontifex references
- [x] Landing page rebuild as product showcase
- [x] Request Demo funnel (3-step with API)

### Session 9 — Timecard System & Security (March 31) ✅ COMPLETE
- [x] Timecard system overhaul (DB, API, UI, NFC, GPS, segments)
- [x] Configurable break deduction (auto-deduct, paid/unpaid, threshold)
- [x] Operator timecard detail view (segments, GPS, coworkers, notes)
- [x] Team payroll overview (Mon-Sun grid, batch approve, export)
- [x] Notification system (in-app + email, auto-reminders, NFC bypass)
- [x] NotificationBell on admin + operator dashboards
- [x] Comprehensive security audit (NFC bypass, XSS, tenant isolation)
- [x] Database audit (indexes, RLS, seeded defaults)
- [x] Restored all 230+ files from unmerged worktree branches
- [x] Fixed login (all 8 roles), RBAC (admin full access), dashboard branding

### Week 2 — Final Polish & Launch (April 1-2)
- [ ] End-to-end workflow testing (schedule → dispatch → execute → complete → invoice)
- [ ] Mobile responsive audit on all operator pages
- [ ] Loading states & error handling audit across remaining pages
- [ ] Patriot-specific visual assets (logos, custom colors)
- [ ] Production deployment prep (env vars, custom domain, SSL)
- [ ] Final build verification & merge to main

### Session 10 — Schedule Board & Customer UX (April 14) ✅ COMPLETE
- [x] Delete job cascade: operator notification + FK cleanup + hard delete
- [x] Change orders system: scope additions on existing jobs (ChangeOrdersSection)
- [x] New scope / continuation jobs: pre-filled child jobs (RelatedJobsSection)
- [x] Schedule board delete modal: reschedule vs delete-permanently flow
- [x] Customer project history: grouped by project name with collapsible folders
- [x] Job detail panel: click job row → slide-in panel with tabs (Overview, Scope, Hours, Notes)
- [x] API GET /api/admin/jobs/[id]/detail — full job aggregation endpoint
- [x] Bug fix: customer detail showing 0 jobs / $0 (wrong column name contact_name → customer_contact)

### Ongoing / As-Needed
- [ ] End-to-end workflow test (schedule → dispatch → operator → complete → invoice)
- [ ] Mobile responsive audit on all operator pages
- [ ] Loading states & error handling audit
- [ ] Patriot logo + brand colors in tenant_branding
- [ ] Reschedule notification to operator when job date changes
- [ ] SMS integration for signature request delivery
- [ ] Production deployment prep (Vercel, custom domain, SSL)
- [ ] Merge feature/schedule-board-v2 → main
