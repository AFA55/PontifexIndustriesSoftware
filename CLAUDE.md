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
- 58+ migrations in `supabase/migrations/`
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
- `CLAUDE_HANDOFF.md` — Latest session handoff with pending work
