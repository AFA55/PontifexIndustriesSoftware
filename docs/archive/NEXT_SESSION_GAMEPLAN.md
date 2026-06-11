# Next Session Gameplan — April 2026
**Created by:** Claude (Opus) — Senior Software Developer / Architect
**Execution model:** Opus plans, Sonnet executes in parallel agents

---

## Dream Team — Agent Profiles

### Agent 1: "ATLAS" — Backend & Database Engineer
**Role:** API routes, database schema, migrations, data integrity
**Strengths:** Supabase, PostgreSQL, RLS policies, tenant isolation, query optimization
**Tools:** Supabase MCP, API route files, migration SQL
**When to deploy:** Any task involving database changes, new API endpoints, data flow

### Agent 2: "PIXEL" — UI/UX Frontend Engineer
**Role:** Page design, component building, responsive layout, theme consistency
**Strengths:** React 19, Tailwind CSS, Next.js App Router, animations, mobile-first
**Rules:** MUST use the light theme (slate-50/blue-50 bg, white cards, gray text). NEVER dark theme on dashboard pages.
**When to deploy:** Any visual change, new pages, redesigns, theme fixes

### Agent 3: "SENTINEL" — Security & QA Engineer
**Role:** Testing, security audits, bug hunting, auth verification
**Strengths:** Auth testing, tenant isolation, XSS/injection checks, E2E flow verification
**When to deploy:** After every feature build. Runs last to catch issues.

### Agent 4: "FORGE" — Integration & Logic Engineer
**Role:** Connecting frontend to backend, state management, complex business logic
**Strengths:** API integration, form logic, smart dropdowns, data relationships
**When to deploy:** Features requiring multi-system coordination (schedule form + customers + contacts)

---

## Task 1: Schedule Form — Smart Customer Flow

### Problem
The schedule form needs to be smarter about customer data:
- When selecting an existing customer, it should populate their known data
- PO numbers from previous jobs should be in a dropdown (with option to add new)
- Site contacts from previous jobs should be in a dropdown (with option to add new)
- The "Quick Add" and "New Customer" flows need to be distinct

### Gameplan

**ATLAS (Backend):**
1. Create/verify API: `GET /api/admin/customers/[id]/po-numbers` — returns all unique PO numbers used by this customer across job_orders
2. Create/verify API: `GET /api/admin/customers/[id]/site-contacts` — returns all unique site contacts from previous jobs for this customer
3. Create/verify API: `GET /api/admin/customers/[id]/job-history` — returns past jobs with locations, PO numbers, contacts (for smart suggestions)
4. Ensure `customer_contacts` table has site contact data properly linked
5. Add `po_numbers` JSONB column to customers table if not exists (to store recurring POs)

**FORGE (Logic):**
1. Read `app/dashboard/admin/schedule-form/page.tsx` — understand current customer selection flow
2. When user selects "Existing Customer":
   - Fetch customer profile → auto-fill company name, address, primary contact
   - Fetch PO number history → populate combobox dropdown (type to search + add new)
   - Fetch site contacts → populate combobox dropdown (type to search + add new)
   - Fetch previous job locations → suggest in location field
3. When user selects "New Customer":
   - Show the new customer modal (already exists)
   - After creation, auto-select the new customer and continue form
4. When user selects "Quick Add":
   - Minimal fields only (customer name, date, operator, description)
   - Auto-generates QA- job number

**PIXEL (UI):**
1. Build smart combobox component for PO numbers:
   - Dropdown shows previous POs with job reference
   - Type to filter
   - "Add New PO" option at bottom
   - Selected PO shows as pill/chip
2. Build smart combobox for site contacts:
   - Dropdown shows previous contacts with name + phone
   - Type to filter
   - "Add New Contact" option opens inline form
3. Ensure schedule form matches light theme throughout
4. Add visual indicator when customer is selected (green checkmark, customer card preview)

**SENTINEL (QA):**
1. Test: select existing customer → verify PO dropdown populates
2. Test: add new PO → verify it saves and appears in future dropdowns
3. Test: select site contact → verify phone/email auto-fill
4. Test: Quick Add flow end-to-end
5. Test: New Customer creation → auto-selection in form

---

## Task 2: Customer Profiles Card — UI Redesign

### Problem
The customer profiles / extended customer card is using dark theme. Needs to match the light platform design.

### Gameplan

**PIXEL (UI):**
1. Read `app/dashboard/admin/customers/page.tsx` and `app/dashboard/admin/customers/[id]/page.tsx`
2. Convert ALL dark classes to light theme:
   - Page bg: `bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50`
   - Cards: `bg-white rounded-2xl shadow-lg border border-gray-100`
   - Text: `text-gray-900` headings, `text-gray-600` body
   - Tables: white bg, gray-200 borders
3. Customer detail page should show:
   - Customer info header (name, company, contact info)
   - Job history table (previous jobs with dates, POs, status)
   - Site contacts list
   - Invoices/billing summary
   - Notes section
4. Verify all components under `_components/CustomerCard.tsx` are also light theme

**SENTINEL (QA):**
1. Verify all customer pages render correctly
2. Check mobile responsiveness
3. Verify links from schedule form → customer profile work

---

## Task 3: Timecard System — Testing & Polish

### Problem
Timecard was just built. Need thorough E2E testing and bug fixing.

### Gameplan

**SENTINEL (QA):**
1. Test operator clock-in flow:
   - Navigate to /dashboard/timecard
   - Click Clock In → verify GPS capture
   - Verify entry appears in "today's entries"
   - Click Clock Out → verify hours calculated
   - Verify break auto-deduction if > 6 hours
2. Test admin approval flow:
   - Navigate to /dashboard/admin/timecards
   - Verify team table shows all operators
   - Click operator row → verify detail page loads
   - Approve/reject entries → verify status updates
   - Export PDF → verify download works
3. Test NFC flow:
   - Verify /nfc-clock page loads
   - Verify NFC tag assignment from admin settings
4. Test notifications:
   - Send clock-in reminder from admin
   - Verify operator receives notification
   - Verify NFC bypass link works
5. Test settings:
   - Change OT threshold → verify it affects calculations
   - Toggle auto-break deduction → verify behavior changes
   - Toggle NFC requirement → verify clock-in flow changes

---

## Task 4: Remaining Dark Theme Pages

### Problem
Several pages still have dark theme that should be light.

### Gameplan

**PIXEL (UI):**
Pages to convert (from QA_TEST_RESULTS.md):
1. `app/dashboard/admin/ops-hub/page.tsx` — inner elements still dark
2. `app/dashboard/admin/form-builder/page.tsx` — inner elements still dark
3. `app/dashboard/admin/customers/[id]/page.tsx` — some dark elements remain
4. Any other pages found during testing

---

## Task 5: Error Boundaries & Polish

### Gameplan

**FORGE (Logic):**
1. Create `app/dashboard/error.tsx` — catches unhandled errors in dashboard
2. Create `app/error.tsx` — global error boundary
3. Add loading.tsx files to key routes for better loading UX

---

## Execution Order

1. **Round 1 (Parallel):**
   - ATLAS: Schedule form backend APIs (PO numbers, site contacts, job history)
   - PIXEL: Customer profiles UI redesign + remaining dark theme fixes
   - SENTINEL: Full timecard E2E testing

2. **Round 2 (Parallel):**
   - FORGE: Schedule form smart customer integration (dropdowns, auto-fill)
   - PIXEL: Schedule form UI (combobox components)
   - SENTINEL: Customer profiles + schedule form testing

3. **Round 3:**
   - FORGE: Error boundaries
   - SENTINEL: Final comprehensive test pass
   - All: Build verification + commit + push

---

## Key Rules for Sonnet Execution
- ALWAYS use light theme (slate-50/blue-50 bg, white cards)
- ALWAYS run `npm run build` after changes
- ALWAYS use requireAuth()/requireAdmin() on API routes
- ALWAYS filter by tenant_id
- ALWAYS commit with descriptive messages
- NEVER change logic when fixing theme (CSS only)
- NEVER skip the QA pass
