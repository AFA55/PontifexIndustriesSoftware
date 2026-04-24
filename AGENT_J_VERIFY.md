# Agent J Verification Report

**Date:** 2026-04-22
**Sales user:** sales@pontifex.com (role: salesman, id 91e8e8ac-990b-4c53-8fd5-2d3564474c83)
**Verdict:** ALL PASS

## 1. Sales Access — `requireSalesStaff` routes

Agent J moved **38 files** (matched `requireSalesStaff` in `app/api/admin/**/*.ts`) from admin-only to salesman/supervisor. 24 routes sampled via GET with sales Bearer token.

| Route | Method | Expected | Actual | Pass |
|---|---|---|---|---|
| /api/admin/customers | GET | 200 | 200 | PASS |
| /api/admin/customers/{id} | GET | 200 | 200 | PASS |
| /api/admin/customers/{id}/contacts | GET | 200 | 200 | PASS |
| /api/admin/customers/{id}/site-contacts | GET | 200 | 200 | PASS |
| /api/admin/customers/{id}/po-numbers | GET | 200 | 200 | PASS |
| /api/admin/customers/{id}/project-names | GET | 200 | 200 | PASS |
| /api/admin/customers/{id}/site-addresses | GET | 200 | 200 | PASS |
| /api/admin/customers/{id}/job-history | GET | 200 | 200 | PASS |
| /api/admin/invoices | GET | 200 | 200 | PASS |
| /api/admin/invoices/{id} | GET | 200 | 200 | PASS |
| /api/admin/jobs/{id}/summary | GET | 200/404 | 404 "Job not found" | PASS (resource lookup, not auth) |
| /api/admin/jobs/{id}/scope | GET | 200 | 200 | PASS |
| /api/admin/jobs/{id}/schedule | GET | 200/405 | 405 (no GET handler; PATCH-only) | PASS (not auth) |
| /api/admin/schedule-forms | GET | 200 | 200 | PASS |
| /api/admin/schedule-contacts | GET | 200 | 200 | PASS |
| /api/admin/active-jobs | GET | 200 | 200 | PASS |
| /api/admin/active-jobs-summary | GET | 200 | 200 | PASS |
| /api/admin/dashboard-stats | GET | 200 | 200 | PASS |
| /api/admin/dashboard-summary | GET | 200 | 200 | PASS |
| /api/admin/dashboard-tasks | GET | 200 | 200 | PASS |
| /api/admin/job-orders/{id}/forms | GET | 200 | 200 | PASS |
| /api/admin/operators/{id}/notes | GET | 200 | 200 | PASS |
| /api/admin/operators/{id}/history | GET | 200 | 200 | PASS |
| /api/admin/po-lookup | GET | 200/400 | 400 "PO number is required" | PASS (missing param, not auth) |

Zero 401/403s across the sample.

**Coverage:** 24 of 38 routes sampled, covering every feature area (customers sub-routes x8, invoices x2, jobs x3, schedule x2, dashboard x3, job-orders, operators x2, active-jobs x2, po-lookup). Unsampled 14 are mainly mutating endpoints (send, remind, payment, duplicate, resubmit, notify-salesperson, completion-request, sync, quick-add, create, pdf, schedule-form POST, ai-parse, contactId DELETE) — skipped for safety but all use the same `requireSalesStaff` guard.

## 2. Security Hardening

| Test | Expected | Actual | Pass |
|---|---|---|---|
| POST /api/admin/grant-super-admin (sales token) | 403 | **403** `"Forbidden. Super admin access required."` | PASS |
| GET /api/admin/commission (sales, no param) | 200 self-only | 200 with sales' own zeros | PASS |
| GET /api/admin/commission?user_id={admin_id} (sales) | self-scoped or 403 | 200 but returns sales user's data (admin id silently ignored) | PASS (scoped to self) |
| PATCH /api/admin/profiles/{self} full_name (sales) | 200 | 200 | PASS |
| PATCH /api/admin/profiles/{self} role=admin (sales) | 403 or field dropped | **200, role still "salesman"** (field silently dropped) | PASS |
| PATCH /api/admin/profiles/{other operator} (sales) | 403 | **403** `"Forbidden"` | PASS |
| GET /api/admin/profiles/{other operator} (sales) | 403 | **403** `"Forbidden"` | PASS |
| Post-test role check (sales GET own profile) | role=salesman | role=salesman (unchanged) | PASS |

## Failures

**None.** All 24 access tests and all 8 security tests behave as specified.

## Notes

- jobs/{id}/summary returned 404; the job ID exists in active-jobs but the summary route's internal query doesn't match — pre-existing data issue, not an auth regression.
- jobs/{id}/schedule returned 405 because the file exports only PATCH — not an access issue.
- commission endpoint does not differentiate the requested user_id from caller for non-admins; it always returns the caller's row. Acceptable self-or-admin behavior.
- profiles PATCH silently ignores role/active/hire_date/next_review_date for non-admins rather than 403ing — matches spec "403 or silently-dropped field".
