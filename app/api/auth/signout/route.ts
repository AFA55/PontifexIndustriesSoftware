export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/auth/signout
 *
 * The canonical sign-out path is client-side:
 *   `supabase.auth.signOut()` followed by `router.push('/login')`
 * (see `logout()` in `lib/auth.ts` and `DashboardSidebar.handleSignOut`).
 *
 * This route exists as a defensive no-op so that stale callers — cached
 * service workers, browser extensions, or tooling probing for a logout
 * endpoint — receive a 200 instead of a 404. It does not attempt server-
 * side session revocation because token clearing happens client-side via
 * the Supabase client.
 */

import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ success: true });
}

export async function GET() {
  return NextResponse.json({ success: true });
}
