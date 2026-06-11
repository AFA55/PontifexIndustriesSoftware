# Pontifex Industries - Security Audit Report
**Date:** February 15, 2026
**Scope:** Full backend security audit — API routes, Supabase RLS, authentication, middleware
**Prepared for:** Production readiness with 20+ operators and sensitive construction data

---

## Executive Summary

The platform has a solid foundation with `requireAdmin()` / `requireAuth()` helpers and bcrypt password hashing. However, **several critical vulnerabilities** were found that must be fixed before scaling to 20+ operators. The most urgent issues are **unauthenticated API routes** that allow anyone on the internet to send emails/SMS through your accounts, and **wide-open RLS policies** that let any logged-in user access or delete any other user's data.

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 3 | Fixing now |
| HIGH     | 4 | Fixing now |
| MEDIUM   | 5 | Fixing now |
| LOW      | 3 | Noted |

---

## CRITICAL Findings

### C1. `/api/send-email` — No Authentication (OPEN EMAIL RELAY)
**File:** `app/api/send-email/route.ts`
**Risk:** Anyone on the internet can send emails through your Resend account by POSTing to this endpoint. An attacker could use it for phishing, spam, or exhaust your email quota. Also accepts arbitrary `pdfUrl` parameter, creating a Server-Side Request Forgery (SSRF) risk — the server will fetch any URL an attacker provides.
**Fix:** Add `requireAuth()` check. Validate `pdfUrl` against allowed domains.

### C2. `/api/sms/test` — No Authentication (OPEN SMS GATEWAY)
**File:** `app/api/sms/test/route.ts`
**Risk:** Anyone can send SMS messages through your Telnyx account. Could be used for spam, harassment, or to rack up charges on your SMS provider.
**Fix:** Add `requireAdmin()` check (this is a test endpoint, only admins should use it).

### C3. `job_orders` RLS — Any User Can Delete Any Job
**Table:** `job_orders`
**Policies:** `authenticated_delete_jobs` uses `qual: "true"` — any authenticated user can DELETE any job order in the entire system. Same for INSERT, UPDATE, SELECT.
**Risk:** A disgruntled operator or compromised account could delete all job orders. Any operator can view/modify any other operator's jobs.
**Fix:** Restrict DELETE/UPDATE to admins, and SELECT to own jobs + admin access.

---

## HIGH Findings

### H1. Four Tables Have RLS Completely Disabled
**Tables:** `operator_job_history`, `operator_performance_metrics`, `operator_skills`, `pdf_documents`
**Risk:** With RLS disabled, the anon key can read/write these tables directly from the browser. Any signed-in user (or even the anon key in some configs) has full access.
**Fix:** Enable RLS and add proper policies.

### H2. `password_plain` Still in Application Code
**File:** `app/api/access-requests/route.ts` (line 105)
**Status:** The database column has been dropped (confirmed), but the application code still tries to INSERT `password_plain`. This means:
- If someone re-adds the column, plaintext passwords get stored again
- The insert may silently fail or throw errors depending on Supabase strict mode
**Fix:** Remove `password_plain` from all application code. Refactor approval flow to use Supabase Auth admin API directly (no need for plaintext storage).

### H3. Error Message Leakage (47 API Routes)
**Files:** 47 API route files return `details: error.message` in responses
**Risk:** Internal error details can reveal database schema, table names, column names, and Supabase internals to attackers. This is an information disclosure vulnerability.
**Fix:** Remove `details: error.message` from all error responses. Log the details server-side only.

### H4. Demo Request Email — Unsanitized HTML Injection
**File:** `app/api/demo-request/route.ts`
**Risk:** User input (`name`, `company`, `tradeType`, etc.) is directly interpolated into HTML email body without sanitization. An attacker could inject malicious HTML/JavaScript into the notification email sent to `pontifexindustries@gmail.com`.
**Fix:** Sanitize all user input before inserting into HTML, or use a text-only email format.

---

## MEDIUM Findings

### M1. No Rate Limiting on Any Routes
**Risk:** All API routes (including public ones like `/api/demo-request` and `/api/access-requests`) have zero rate limiting. An attacker could:
- Flood your email inbox with demo requests
- Brute-force the login endpoint
- DDoS your Supabase database with repeated requests
**Fix:** Add rate limiting via Vercel Edge middleware or Next.js middleware.

### M2. `silica_plans` RLS — Any User Can Modify All Records
**Table:** `silica_plans`
**Policies:** INSERT and UPDATE use `with_check: "true"` / `qual: "true"` — any authenticated user can modify any silica plan.
**Risk:** Operators could tamper with OSHA compliance documents belonging to other operators.
**Fix:** Restrict to own records (by `operator_id` or `created_by`) + admin access.

### M3. `blade_assignments` RLS — Any User Can Modify All Records
**Table:** `blade_assignments`
**Policies:** INSERT and UPDATE use `with_check: "true"` / `qual: "true"`.
**Risk:** Any operator can modify blade assignments for any job/operator.
**Fix:** Restrict INSERT/UPDATE to admins only, keep SELECT open for authenticated users.

### M4. `profiles` Table — 14 Overlapping RLS Policies
**Table:** `profiles`
**Policies:** 14 policies with significant overlap (multiple SELECT, UPDATE policies doing the same thing).
**Risk:** Not a direct vulnerability, but makes security auditing difficult and increases chance of unintended access as policies interact in complex ways. The policy `"Enable read for all users"` with `qual: "true"` makes all other SELECT policies redundant — any authenticated user can read ALL profiles.
**Fix:** Consolidate to 4-5 clean policies.

### M5. Middleware Provides Zero Protection
**File:** `middleware.ts`
**Current behavior:** Passes ALL requests through with `NextResponse.next()`
**Risk:** No server-side route protection for `/dashboard/*`, `/admin/*` pages. Relies entirely on client-side auth checks (which can be bypassed).
**Fix:** Add route-level protection in middleware for protected paths.

---

## LOW Findings

### L1. `/api/geocode` and `/api/google-maps/distance` — No Auth
**Risk:** Low — these are proxy endpoints for public mapping services. Main risk is abuse to exhaust Google Maps API quota.
**Fix:** Add basic auth check to prevent anonymous abuse.

### L2. Hardcoded Fallback Keys
**Files:** `lib/supabase.ts`, `lib/supabase-admin.ts`
**Issue:** Contains placeholder strings like `'placeholder-url-for-build'` that get used if env vars are missing.
**Risk:** Low — build won't function without real keys, but could mask configuration errors.

### L3. `listUsers()` in Approval Route
**File:** `app/api/access-requests/[id]/approve/route.ts` (line 73)
**Issue:** Calls `supabaseAdmin.auth.admin.listUsers()` without pagination — lists ALL users to find one email.
**Risk:** Performance issue at scale (20+ users is fine, but 1000+ would be slow).
**Fix:** Use `getUserByEmail()` or filter in the query.

---

## Fix Plan (Ordered by Priority)

1. **Add auth to `/api/send-email`** — requireAuth()
2. **Add auth to `/api/sms/test`** — requireAdmin()
3. **Lock down `job_orders` RLS** — admin full access, operators see own jobs
4. **Enable RLS on 4 unprotected tables** — with proper policies
5. **Remove `password_plain` from code** — clean up dead code paths
6. **Sanitize HTML in demo-request email**
7. **Remove `error.message` from API responses** (47 files)
8. **Tighten `silica_plans` + `blade_assignments` RLS**
9. **Consolidate `profiles` RLS policies**
10. **Add middleware route protection**

---

*This report was generated as part of a comprehensive backend security audit. All findings should be addressed before scaling to production with multiple operators.*
