import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // For now, allow all routes through
  // Client-side auth guards will handle protection
  // This allows login flow to work smoothly

  // NOTE: Middleware auth is temporarily disabled to allow proper login flow
  // Dashboard routes are protected by client-side AuthGuard components

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
