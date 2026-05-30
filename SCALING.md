# Scaling & Capacity Notes

**Last updated:** 2026-05-30
**Context:** Patriot Concrete Cutting going from pilot (~15 users) to full rollout (~25 users).
This documents real headroom, the one action that matters, and the watch-list as the platform grows.

---

## TL;DR

**25 users is trivial for this stack.** You have roughly 10–50× headroom before any layer needs
attention. The architecture (Next.js on Vercel + Supabase Postgres) auto-scales horizontally and
the database is tiny. The *only* action worth taking before full rollout is **upgrading Supabase
Free → Pro ($25/mo)** — not for capacity, but for **automated backups of payroll data**.

---

## Live numbers (measured 2026-05-30)

| Metric | Now | Free-tier ceiling | Projected at 25 users |
|---|---|---|---|
| Database size | **30 MB** | 500 MB | ~50–80 MB |
| Postgres connections in use | **13 / 60** | 60 | ~20–30 |
| Users / jobs / timecards | 15 / 7 / 14 | — | 25 / hundreds / thousands per yr |
| `tenant_id` indexes on hot tables | **✅ all present** | — | scales fine |

Concrete-cutting is not a high-concurrency workload: ~25 people on payroll usually means
**5–15 active at any one moment** (operators clock in, log work, leave; admins glance at the board).
That is a rounding error for serverless + Postgres.

---

## Why each layer holds

### Application — Vercel (Next.js serverless)
- Serverless functions auto-scale horizontally. They would handle **hundreds** of concurrent users
  with no config change.
- The only cost lever that scales with *us* is **build minutes** (see `DEPLOYMENT_COST.md`), not
  traffic. 25 users' worth of request volume is negligible.

### Data — Supabase Postgres
- 30 MB database. Verified that **every hot table has a `tenant_id` index** plus its foreign-key
  indexes (`job_orders`, `timecards`, `profiles`, `customers`, `equipment`, `daily_job_logs`,
  `work_items`, `notifications`, `equipment_checkouts`).
- High `seq_scan` counts on tiny tables (e.g. `profiles`) are **correct** Postgres behavior — it
  scans a 15-row table instead of using an index. This flips to index scans automatically as rows
  grow. Nothing to fix.

### Connections
- 13 of 60 in use. Even at 25 users we stay well under the ceiling.

---

## The one action that matters: upgrade Supabase Free → Pro ($25/mo)

This is about **production-readiness for a paying customer**, not capacity:

1. **Automated daily backups + 7-day point-in-time recovery.** The Free tier has *no* automated
   backups. We store **payroll and timecard data** — losing it is a business-ending event. This
   alone justifies the $25/mo.
2. **Dedicated compute** instead of Free's shared CPU — smoother under real daily load.
3. **No auto-pause.** Free projects sleep after inactivity; a production app must never sleep.
4. **More connection headroom** as we grow.
5. **Unlocks leaked-password protection** (the one security item we could not enable on Free).

> **Recommendation: do this before onboarding the 25.** $25/mo for backups on payroll data is a
> no-brainer.

---

## Watch-list as we grow *past* 25 (none urgent today)

| Item | Nature | When it matters | Fix |
|---|---|---|---|
| **Schedule board client weight** | Per-phone render cost (2,850-line component, lots of state) — **not** a server cost | Older operator phones feel sluggish | Split into `OperatorRow` / `JobCard` / `EditModal` / `DispatchModal` (already on backlog) |
| **Direct `pg` driver pooling** | If any route uses node-postgres directly (vs. the Supabase JS client) | A burst of serverless functions could exhaust the 60-conn limit | Point those routes at the **pooler URL (port 6543)**, not the direct connection (5432). Most code uses the JS client, which already pools — this is a checkpoint, not a known bug |
| **N+1 progress fetches** | `active-jobs` lazy-fetches progress per job | Many simultaneous admins on big job lists | Batch into one query if metrics ever show it |
| **Realtime channel limits** | Free-tier realtime caps | More tenants + heavy board usage | Covered by Pro upgrade |

---

## Cost scaling reality

Going from 1 → 25 Patriot users changes the bill by roughly:
- **+$25/mo** (Supabase Pro)
- **~$0** more on Vercel (traffic is negligible; builds are the cost, and that's unchanged)

Supabase compute scales **vertically** (one slider in the dashboard) the day it's ever needed —
we are nowhere near that point.

---

## Multi-tenant scaling (future)

Per-tenant growth (onboarding tenant #2, #3, …) is a **correctness** concern, not a capacity one —
tracked separately in [`MULTI_TENANT_READINESS.md`](MULTI_TENANT_READINESS.md). The data layer
handles many tenants on the same Postgres instance comfortably; the work is finishing tenant-scoping
on the few deferred items (payroll-settings functions, P&L views) before a second tenant goes live.
