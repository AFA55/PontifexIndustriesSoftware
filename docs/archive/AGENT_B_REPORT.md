# Agent B Report — Admin Pages 375px Audit

Branch: `worktree-agent-ab4f2989` (forked from `feature/schedule-board-v2`).
Build: PASSING (0 errors).

## Summary

Audited ~25 admin page groups at 375px width. Most already had responsive
patterns (grid-cols-1 at mobile, overflow-x-auto on tables, hidden sm:inline
on labels). Fixed the specific overflow/readability problems found.

## Fixes Applied

| Page path | Issue found at 375px | Fix applied |
|---|---|---|
| `/dashboard/admin/billing` | "Create Invoice" button in header shoves title off-screen | Swap button text to "New" on mobile; shrink button padding |
| `/dashboard/admin/billing` | Search + status filter inline on one row forces dropdown past viewport | Stack search/filter vertically below `sm` |
| `/dashboard/admin/billing` | Invoice detail modal has 24px padding × 2 + 16px margin × 2 (80px lost) at 375px | Reduce to 16px padding/8px margin on mobile |
| `/dashboard/admin/notifications` | "Send Clock-In Reminder" button wraps and collides with title | Truncate to "Remind" below `sm`; whitespace-nowrap |
| `/dashboard/admin/notifications` | 3 tab buttons (Send Notification / Auto Settings / Sent History) stack/wrap awkwardly | Add horizontal scroll with `overflow-x-auto`, `whitespace-nowrap flex-shrink-0` on tabs |
| `/dashboard/admin/upcoming-projects` | 7-day calendar grid (grid-cols-7) at 375px = ~52px per day cell, unusable | Wrap in `overflow-x-auto` + `min-w-[840px]` so it scrolls horizontally |
| `/dashboard/admin/upcoming-projects` | Header "Upcoming Projects Board" + 📅 emoji overlaps view-toggle buttons | Use shorter "Upcoming" on mobile, smaller text, hide subtitle below `sm` |
| `/dashboard/admin/upcoming-projects` | Project detail modal: grid-cols-2 for overview, grid-cols-3 for equipment, grid-cols-4 for actions | Stack single-col then grid-cols-2 on mobile for each |
| `/dashboard/admin/settings/timecard` | Header `px-6` eats 48px on a 375px viewport | Add `px-4 sm:px-6` |

## Pages Audited and Left Unchanged

Already had adequate responsive handling (mobile grids stack, tables use
`overflow-x-auto` or `min-w-[...]`, buttons use `hidden sm:inline`):

- `/dashboard/admin/customers` — stats grid already `grid-cols-1 sm:grid-cols-3`, card grid stacks.
- `/dashboard/admin/customers/[id]` — stats grid `grid-cols-2 sm:grid-cols-5`; table wrapped in `overflow-x-auto`.
- `/dashboard/admin/active-jobs` — stats grid `grid-cols-2 lg:grid-cols-4`, list is card-based.
- `/dashboard/admin/completed-jobs` — stats `grid-cols-1 md:grid-cols-4`, responsive.
- `/dashboard/admin/jobs/[id]` — two-column layout collapses (`grid-cols-1 lg:grid-cols-3`); Edit modal is `max-w-sm`.
- `/dashboard/admin/timecards` — weekly table uses `min-w-[900px]` inside `overflow-x-auto` (horizontal scroll). Header/filters already responsive.
- `/dashboard/admin/timecards/operator/[id]` — stats `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`, already responsive.
- `/dashboard/admin/facilities` — header, stats, tabs, search, add button all already mobile-friendly. 3-col city/state/zip in modal is tight but functional (short fields).
- `/dashboard/admin/team-profiles` — header + list + filters all responsive; already uses `hidden sm:inline`.
- `/dashboard/admin/team-management` — already responsive; Create User button collapses icon-only on mobile.
- `/dashboard/admin/nfc-management` — stats `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`; inner grid-cols-3 is for 3 short status cards (fits).
- `/dashboard/admin/ops-hub` — table has `overflow-x-auto`; grids all responsive.
- `/dashboard/admin/settings`, `/settings/branding`, `/settings/nfc-tags`, `/settings/backups`, `/settings/capacity` — already responsive.
- `/dashboard/admin/access-requests` — no table/fixed-width issues.
- `/dashboard/admin/schedule-form-history` — `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` cards.
- `/dashboard/admin/completed-job-tickets` + `[id]` — `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.
- `/dashboard/admin/analytics` — uses react-grid-layout with `xs: 2` cols at 480px breakpoint. Responsive library handles sub-375px.

## Pages Deliberately Skipped / Left for User

- `/dashboard/admin/schedule-board` — the task's own instructions said "be careful". This is a 2,700-line page with drag-drop, date picker, multi-mode views, side panels. It already has significant responsive handling (`grid-cols-1 md:grid-cols-5 divide-x ... min-w-[800px]` weekly view, `hidden sm:inline` labels). Any further mobile-specific redesign risks breaking complex interactions. Leaving as is.
- `/dashboard/admin/schedule-form` (3,900+ lines) — multi-step schedule form. Contains many grid-cols-3/4 layouts intentionally sized for desktop data entry. Mobile users are not the expected persona here. Not a list/dashboard page — a power-user form. Left for user to decide if mobile polish is worth a redesign.
- `/dashboard/admin/create-estimate` and `/create-job` — similar power-user data entry forms, desktop-first by design. Grids already use `grid-cols-2 md:grid-cols-N` on most rows. Adequate at 375px.
- `/dashboard/admin/form-builder` — drag-drop admin tool; desktop-first.
- `/dashboard/admin/tenant-management`, `/subscription`, `/system-health`, `/debug/*` — super-admin-only low-traffic pages; already use `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` patterns.
- `/dashboard/admin/feature-permissions` and `/dashboard/admin/capacity` — no top-level page.tsx; feature lives at `/dashboard/admin/settings/capacity/page.tsx` which is already responsive.

## Files Modified

- `app/dashboard/admin/billing/page.tsx`
  - Header button (lines ~335-345)
  - Search/filter row (lines ~454-477)
  - Detail modal margin/padding (lines ~676, 717)
- `app/dashboard/admin/notifications/page.tsx`
  - Clock-in reminder button (lines ~345-352)
  - Tabs (lines ~356, 364-373)
- `app/dashboard/admin/upcoming-projects/page.tsx`
  - Header (lines ~257-276)
  - 7-day calendar wrapper (lines ~355-356)
  - Project modal grids (lines ~527, ~628, ~649)
- `app/dashboard/admin/settings/timecard/page.tsx`
  - Header padding (line ~224)

## Verification

1. Start dev server: `npm run dev`
2. Open Chrome DevTools → toggle device toolbar → set width to 375px.
3. Visit each of these pages and confirm no horizontal overflow on main content:
   - `/dashboard/admin/billing` (tabs, invoice list, open an invoice modal)
   - `/dashboard/admin/notifications` (switch between Send/Auto Settings/Sent History tabs)
   - `/dashboard/admin/upcoming-projects` (calendar view should scroll horizontally; open a project modal)
   - `/dashboard/admin/settings/timecard`
4. Build check: `npm run build` — passes with 0 errors.

## Commits

- `98600fc1` — fix(mobile): 375px responsive fixes for billing, notifications, upcoming-projects
- (pending) — settings/timecard header padding
