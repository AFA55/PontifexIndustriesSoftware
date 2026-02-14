import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for route protection.
 *
 * NOTE: The Supabase JS client stores sessions in localStorage (not cookies),
 * so middleware cannot verify auth state for page routes. Page-level protection
 * is handled by client-side AuthGuard components.
 *
 * API-level protection is handled by requireAdmin/requireAuth in each route handler.
 * This middleware passes all requests through — the real security is at the API layer.
 */
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|public).*)',
  ],
};
