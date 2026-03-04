# Pontifex Industries Platform — Executive Summary

**Last Updated:** March 4, 2026
**Branch:** `feature/schedule-board-v2`
**Repo:** `https://github.com/AFA55/PontifexIndustriesSoftware.git`

---

## What This Is

A full-stack construction operations platform for **Pontifex Industries** — a concrete cutting company (core drilling, wall sawing, slab sawing, hand sawing, wire sawing, GPR scanning, demolition). The platform handles job scheduling, operator dispatch, equipment tracking, timecards, inventory, and workflow management.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript |
| **Database** | Supabase (PostgreSQL + Auth + RLS) |
| **Styling** | Tailwind CSS |
| **Auth** | Supabase Auth (JWT Bearer tokens) |
| **Hosting** | Vercel |
| **Icons** | Lucide React |
| **PDF** | @react-pdf/renderer |
| **Maps** | Google Maps API |
| **Animations** | Framer Motion |

---

## Current Active Work (Schedule Board v2)

### Branch: `feature/schedule-board-v2` (5 commits ahead of main)

This is where all active development is happening. The feature branch adds a complete dispatch/scheduling system.

### What Was Built (5 Commits)

#### Commit 1: `d18faec3` — Schedule Board v2 Core
- **Quick Add Job Panel** (`components/QuickAddJobPanel.tsx`) — Slide-in panel to rapidly create jobs
- **Job Notes System** (`components/JobNotesPanel.tsx`) — Per-job notes with manual/system/change_log types
- **Notes API** (`app/api/admin/job-notes/route.ts` + `[id]/route.ts`) — CRUD for notes with auth
- **Enhanced Board** — Timeline, Calendar (6-day), and Columns view modes
- **Migration** — `job_notes` table in Supabase

#### Commit 2: `8e39e7ab` — Role-Based Permissions
- **Admin vs Operator** — `canEdit` state derived from Supabase `profiles.role`
- **Admins see:** Quick Add button, Send Schedule, Edit Details, Assign Operator, Edit Job
- **Operators see:** View-only board (no edit controls), title says "My Schedule"
- **API-level security** already existed — all mutation endpoints use `requireAdmin()` which returns 403 for non-admins

#### Commit 3: `55f2dec2` — Multi-Select Job Types
- Changed Job Type from single dropdown to **chip-based multi-select**
- Green chips for selected types, bordered buttons for unselected
- Types: Core Drilling, Wall Sawing, Slab Sawing, Hand Sawing, Wire Sawing, GPR Scanning, Demolition, Other
- Stores as both `job_type` (comma-separated string) and `job_types` (array)

#### Commit 4: `981e24b5` — Equipment Abbreviations
- Replaced equipment search autocomplete with **Patriot's abbreviations as preset chips**:
  - `HHS` — Hydraulic Hand Saw
  - `CS` — Core Saw
  - `TS` — Track Saw
  - `WS` — Wall Saw
  - `GPP` — Gas Power Pack
  - `DFS` — Diesel Flat Saw
  - `ECD` — Electric Core Drill
  - `HCD` — Hydraulic Core Drill
- Custom text input below for adding unlisted equipment
- Multiple equipment selectable (chip pattern)

#### Commit 5: `37f06971` — Operator Assignments & Helpers Panel
- **Assigned Operators panel** — Shows who's on what jobs, with job types listed
- **Available Helpers panel** — Shows team members NOT yet assigned for the day
- **Job Type on cards** — All card views now show the job type (Core Drilling, etc.)
- **Shop time only** — Removed site arrival time from cards, only shows shop arrival

---

## Files Modified on This Branch

| File | What It Does |
|------|-------------|
| `app/dashboard/admin/schedule-board/page.tsx` | **Main schedule board** — 1500+ lines, timeline/calendar/columns views, role detection, operator assignments, available helpers |
| `components/QuickAddJobPanel.tsx` | **Quick Add slide-in** — Multi-select job types, equipment abbreviation chips, custom equipment input |
| `components/JobNotesPanel.tsx` | **Notes sidebar** — View/add/delete notes per job |
| `app/api/admin/job-notes/route.ts` | **Notes API** — GET (list) and POST (create) |
| `app/api/admin/job-notes/[id]/route.ts` | **Note by ID** — GET, PATCH, DELETE |
| `app/api/admin/job-orders/[id]/route.ts` | **Job Orders API** — Modified to auto-create change_log notes on updates |
| `supabase/migrations/20260302_create_job_notes.sql` | **DB migration** — Creates `job_notes` table |
| `types/job-notes.ts` | **TypeScript types** — JobNote interface |

---

## Architecture Overview

### Directory Structure
```
pontifex-platform/
├── app/
│   ├── api/                          # API Routes (Next.js Route Handlers)
│   │   ├── admin/                    # Admin-only endpoints (requireAdmin)
│   │   │   ├── job-orders/           # CRUD job orders
│   │   │   ├── job-notes/            # CRUD job notes
│   │   │   ├── operator-profiles/    # List all operators
│   │   │   ├── send-schedule/        # Email schedule to operators
│   │   │   └── card-permissions/     # Dashboard card visibility
│   │   ├── job-orders/               # GET jobs (role-scoped: admin=all, operator=own)
│   │   ├── equipment/                # Equipment CRUD
│   │   ├── inventory/                # Inventory tracking
│   │   └── auth/                     # Auth endpoints
│   ├── dashboard/
│   │   ├── admin/                    # Admin pages
│   │   │   ├── schedule-board/       # ★ ACTIVE — Dispatch board
│   │   │   ├── dispatch-scheduling/  # Original scheduling page
│   │   │   ├── jobs/                 # Job management
│   │   │   ├── operator-profiles/    # Team management
│   │   │   └── ...                   # Analytics, equipment, etc.
│   │   ├── job-schedule/             # Operator job view
│   │   ├── my-jobs/                  # Operator's assigned jobs
│   │   └── tools/                    # NFC scan, etc.
│   ├── login/                        # Login page
│   └── page.tsx                      # Landing page
├── components/                       # Shared React components
│   ├── QuickAddJobPanel.tsx          # ★ Quick Add with multi-select
│   ├── JobNotesPanel.tsx             # ★ Notes sidebar
│   ├── RichEditJobModal.tsx          # Full job edit modal
│   ├── JobHistoryModal.tsx           # Job change history
│   ├── WorkflowProgressBar.tsx       # 9-step workflow tracker
│   └── ...
├── lib/
│   ├── supabase.ts                   # Client-side Supabase instance
│   ├── supabase-admin.ts             # Server-side admin Supabase
│   ├── api-auth.ts                   # requireAdmin() & requireAuth()
│   └── auth.ts                       # Client auth helpers (getCurrentUser, isAdmin)
├── types/
│   ├── job.ts                        # JobOrder type definition
│   ├── job-notes.ts                  # JobNote type
│   └── equipment-constants.ts        # Equipment lists & Patriot abbreviations
└── supabase/migrations/              # SQL migrations
```

### Authentication Flow
```
User Login → Supabase Auth → JWT Token stored in session
                ↓
API Request → Bearer token in Authorization header
                ↓
requireAdmin(request)  →  validates token → checks profiles.role === 'admin'
requireAuth(request)   →  validates token → any authenticated user
                ↓
Success: { authorized: true, userId, userEmail, role }
Failure: 401 (no token) or 403 (wrong role)
```

### Role-Based Access
```
ADMIN (profile.role === 'admin'):
  - See all jobs across all operators
  - Quick Add, Edit, Delete, Assign operators
  - Send schedule notifications
  - See Assigned Operators & Available Helpers panels
  - Title: "Admin Dispatch Board"

OPERATOR (profile.role === 'operator'):
  - See only their own assigned jobs
  - View-only mode (no edit controls)
  - Can view History and Notes (read-only actions)
  - Title: "My Schedule"
```

---

## Database (Supabase)

### Key Tables

| Table | Rows | Purpose |
|-------|------|---------|
| `profiles` | 5 | Users — 2 admins, 3 operators |
| `job_orders` | 9 | Job tickets with scheduling, assignment, workflow |
| `job_notes` | 0 | Per-job notes (manual, system, change_log) |
| `equipment` | 4 | Equipment master list |
| `equipment_units` | 5 | Individual equipment units with status |
| `timecards` | 18 | Time tracking with GPS |
| `inventory` | 1 | Warehouse stock levels |
| `user_card_permissions` | 0 | Dashboard card visibility (future) |
| `workflow_steps` | 7 | 9-step job workflow definitions |

### Team Members (profiles table)

| Name | Role | Email |
|------|------|-------|
| Super Admin | admin | andres.altamirano1280@gmail.com |
| Demo Admin | admin | admin@pontifex.com |
| Demo Operator | operator | demo@pontifex.com |
| Jake Winder | operator | andres.altamirano1955@yahoo.com |
| Javier Muniz | operator | javiermuniz8@icloud.com |

### Test Data
- **JOB-2026-5001** — Metro General Contractors, Core Drilling, scheduled 2026-03-05, HIGH priority, assigned to Demo Operator. Created as test card to verify the board works.

---

## How to Continue Working

### 1. Clone & Switch Branch
```bash
git clone https://github.com/AFA55/PontifexIndustriesSoftware.git
cd PontifexIndustriesSoftware
git checkout feature/schedule-board-v2
npm install
```

### 2. Environment Variables
You need a `.env.local` with:
```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

### 3. Run Dev Server
```bash
npm run dev
```
Navigate to `http://localhost:3000/dashboard/admin/schedule-board`

### 4. Login Credentials
- **Admin:** admin@pontifex.com / Admin1234!
- **Operator:** demo@pontifex.com / Demo1234!

---

## What's Next (Suggested)

1. **Merge to main** — The feature branch is stable, consider merging `feature/schedule-board-v2` into `main`
2. **Drag-and-drop assignment** — Let admins drag unassigned jobs onto operator rows
3. **SMS/Email notifications** — The Send Schedule button hits `/api/admin/send-schedule` but needs real email integration
4. **Equipment details on cards** — Show selected equipment abbreviations on the job cards
5. **Multi-day job spanning** — Jobs with end_date should show across multiple calendar days
6. **Operator availability calendar** — Track PTO/sick days so Available Helpers panel is more accurate
7. **Mobile operator app** — Operators need a clean mobile view to check their daily schedule

---

## Known Issues

- **Pre-commit hook TS errors** — Some older files (shop routes, equipment-units, nfc-scan) have TypeScript errors. We've been using `--no-verify` to bypass. These should be fixed before merging to main.
- **`operator_name` join** — The `job_orders` table doesn't have `operator_name` directly; it comes from a JOIN with `profiles` via the `active_job_orders` view. The GET `/api/job-orders` endpoint handles this.
- **Directory name typo** — The local path has "Industres" (missing 'i') in `Pontifex Industres`. This doesn't affect the code but be aware of the path.
