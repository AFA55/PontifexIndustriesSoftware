# Patriot Concrete Cutting — Master Workflow & System Architecture
**Last Updated:** April 17, 2026 | **Lead:** Senior Dev (Claude)

---

## The Complete Business Workflow

```
[Customer calls / Sales inquiry]
         ↓
[Salesperson creates job]
  → Schedule Form (8 steps) — full details upfront
  → Quick Add — placeholder, sends notification to salesperson to complete form later
         ↓
[Admin approves job] ← pending_approval status
  → Approve & Schedule → status: scheduled
  → Edit dates, scope, assign operator
         ↓
[Operator assigned] ← status: assigned
  → Operator gets in-app + push notification
  → Sees job on their schedule board
         ↓
[Day of job — Operator workflow]
  → Clock in (NFC / GPS / PIN)
  → Navigate to job (in_route status)
  → Arrive on site (on_site status)
  → Begin work (in_progress status)
  → Log work performed (cores drilled, LF cut, depth, equipment)
  → Day complete OR job complete
         ↓
[Job completion]
  → Final photos + signature
  → Customer feedback (rating 1-10, cleanliness, communication)
  → Legal docs (liability release, silica form, work order agreement)
  → status: completed
  → Salesperson notified: "Job complete — ready for billing"
         ↓
[Billing workflow]
  → Salesperson views completion summary (all work performed, hours, crew)
  → Creates invoice (auto-fills from work_items + daily_logs)
  → Invoice PDF: customer, PO, sales rep, location, dates, line items, total
  → Submits to admin queue
         ↓
[Admin invoice processing]
  → Reviews submitted invoice
  → Approves → status: sent
  → Customer pays → status: paid
         ↓
[Payroll]
  → Operator timecards for the job
  → Regular / OT / Night Shift Premium hours
  → Admin approves timecard
  → Export payroll CSV/PDF
```

---

## Cycle Billing (Large Projects)

```
Job created with expected scope: 1000 LF wall sawing
Billing milestones configured: 50% = $X, 100% = $Y

Operator logs 500 LF wall sawing
  ↓
Backend detects: 500/1000 = 50% scope complete
  ↓
Billing milestone triggered → notify salesperson + admin
  ↓
Salesperson creates interim invoice for 50% billing amount
  ↓
Work continues → hits 100% → final invoice
```

---

## Agent Team Assignments

| Agent | Focus Area | Priority Tasks |
|-------|-----------|----------------|
| **ALEX** (Backend) | APIs, business logic | Cycle billing detection, completion notification API, invoice PDF endpoint |
| **SAM** (Frontend) | UI, pages, components | Completion summary page, cycle billing UI, invoice submission flow |
| **DANA** (Database) | Schema, migrations | billing_milestones table, notification_recipients, expected_scope on job_orders |
| **RILEY** (Reviewer) | Quality, security | Review after each feature, TypeScript check, security audit |
| **MORGAN** (Tester) | E2E testing, UX | Test after build, find gaps, suggest improvements |

---

## Current Sprint Status (April 17, 2026)

### ✅ Complete
- Multi-tenant architecture
- Schedule board (full edit, approve, assign, crew grid)
- Schedule form (8-step, all job types)
- Quick Add (topbar, placeholder job, salesperson notification)
- Operator workflow (clock in/out, work performed, day complete)
- Timecard system (NFC, GPS, segments, approval)
- Night shift premium + 40hr OT override + editable pay types
- Invoice creation (basic — from completed job)
- Billing page (ready to bill, mark paid)
- Customer management
- Facilities
- Analytics dashboard

### 🔨 In Progress
- Professional job completion summary page
- Cycle billing milestone system
- Enhanced invoice PDF (customer, PO, sales rep, all line items)
- Admin invoice processing queue
- Configurable notification recipients

### 📋 Backlog
- SMS invoice delivery to customer
- Mobile operator app polish (photos, GPS accuracy)
- Schedule board performance optimization
- QuickBooks live sync (currently CSV export only)
- Customer portal (public signature page)

---

## Key Architecture Decisions

1. **Scope tracking source of truth**: `work_items` table — operators log work here via work-performed page. `daily_job_logs.work_performed` JSONB is the raw input; `work_items` rows are the normalized output.

2. **Cycle billing % calculation**: Compare SUM of `work_items.linear_feet_cut` (or core_quantity, etc.) against `job_orders.expected_scope` JSONB field. Per work type.

3. **Notification recipients**: Per-job config stored in `notification_recipients` table. Falls back to tenant-wide defaults in `tenant_settings`.

4. **Invoice PDF**: Generated via `@react-pdf/renderer` on the server. Endpoint: `GET /api/admin/invoices/[id]/pdf`. Returns PDF buffer.

5. **Admin invoice queue**: Status-based: `draft` → `submitted` (by salesperson) → `approved` (by admin) → `sent` (to customer) → `paid`.
