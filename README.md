# Pontifex Industries Platform

Multi-tenant SaaS for concrete-cutting & construction-services operations — scheduling, dispatch,
field execution, timecards/payroll, invoicing, equipment & shop management.

**Production:** https://www.pontifexindustries.com · **iOS:** App Store (Capacitor webview)
**Tenant #1:** Patriot Concrete Cutting (live trial customer)

## Quick start

```bash
npm install
cp .env.local.example .env.local   # or get .env.local from the founder — points at prod Supabase
npm run dev                        # http://localhost:3000
npm run build                      # must pass with 0 errors before any push
npx jest                           # unit tests
```

⚠️ Local dev talks to the **production** Supabase project. Treat data with respect.

## Start here

| If you want to… | Read |
|---|---|
| Understand the system | [ARCHITECTURE.md](ARCHITECTURE.md) — diagrams of everything |
| Know what to work on | [BACKLOG.md](BACKLOG.md) — prioritized, single source of truth |
| Build the right way | [docs/DEVELOPMENT_PLAYBOOK.md](docs/DEVELOPMENT_PLAYBOOK.md) |
| AI-assistant conventions | [CLAUDE.md](CLAUDE.md) |
| Pick up the last session | [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) |
| Push to prod | [DEPLOYMENT_COST.md](DEPLOYMENT_COST.md) — **read first, builds cost money** |

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Supabase (Postgres + Auth + Storage +
Realtime, RLS everywhere) · Vercel · Capacitor (iOS) · Stripe · Resend · APNs

## House rules

1. **Never push `main` without a green `npm run build`** and founder confirmation (each push = a billed Vercel build).
2. **Every table is tenant-scoped** (`tenant_id` + RLS via SECURITY DEFINER helpers — never `user_metadata`).
3. **Migrations are additive + idempotent.** Risky ones go through a Supabase branch DB first.
4. **Mobile-first.** Operators are on phones — 44px tap targets, no overflow at 375px.
5. **Dates through `lib/dates.ts`.** Email through `lib/email.ts`. No exceptions — both encode hard-won bug fixes.
