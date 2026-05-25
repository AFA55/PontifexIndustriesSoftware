import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for security headers and basic route protection.
 *
 * NOTE: The Supabase JS client stores sessions in localStorage (not cookies),
 * so middleware cannot verify auth state for page routes. Page-level protection
 * is handled by client-side AuthGuard components.
 *
 * API-level protection is handled by requireAdmin/requireAuth in each route handler.
 *
 * This middleware adds security headers and rate-limit protection for public endpoints.
 */

// Simple in-memory rate limiter for public API endpoints
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // max requests per window for public endpoints

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  // Lazy cleanup: remove expired entries every 100 checks (no setInterval needed for Edge)
  if (rateLimitMap.size > 50) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
  }

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return true;
  }
  return false;
}

// Public API endpoints that should be rate-limited
const RATE_LIMITED_PATHS = [
  '/api/demo-request',
  '/api/access-requests',
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/public/tenant-by-code',   // unauthenticated tenant lookup (login page)
  '/api/auth/lookup-company',      // unauthenticated company code lookup
  '/api/sms-opt-in',               // unauthenticated SMS opt-in endpoint
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limit public API endpoints
  if (RATE_LIMITED_PATHS.some(path => pathname.startsWith(path))) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const key = `${ip}:${pathname}`;

    if (isRateLimited(key)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }
  }

  const response = NextResponse.next();

  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(self), geolocation=(self), payment=()'
  );
  // Content-Security-Policy: restrict where scripts/frames/connections can originate.
  // 'unsafe-inline' required for Next.js inline scripts; nonce-based CSP is a future upgrade.
  // 'unsafe-eval' is only included in development (Next.js hot reload requires it).
  const isDev = process.env.NODE_ENV !== 'production';
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"  // hot reload needs unsafe-eval in dev
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );

  // Prevent caching of API responses with sensitive data
  if (pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
  }

  return response;
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
