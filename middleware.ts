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

// Rate limiting lives in lib/rate-limit.ts — it uses a SHARED store (Upstash
// Redis REST) when UPSTASH_REDIS_REST_URL/TOKEN are set, and falls back to the
// original per-instance in-memory Map when they aren't (security audit F2).
import { isRateLimited } from '@/lib/rate-limit';

// Public API endpoints that should be rate-limited
const RATE_LIMITED_PATHS = [
  '/api/demo-request',
  '/api/access-requests',
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/public/tenant-by-code',   // unauthenticated tenant lookup (login page)
  '/api/auth/lookup-company',      // unauthenticated company code lookup
  '/api/sms-opt-in',               // unauthenticated SMS opt-in endpoint
  // Token-guessing surfaces (security audit M4, Jul 23). Tokens are 256-bit
  // CSPRNG so guessing is infeasible, but throttling probes is free defense.
  '/api/setup-account/validate',
  '/api/public/portal',            // prefix-matches /api/public/portal/[token]/*
  '/api/public/signature',
  '/api/public/contract',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limit public API endpoints
  if (RATE_LIMITED_PATHS.some(path => pathname.startsWith(path))) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const key = `${ip}:${pathname}`;

    if (await isRateLimited(key)) {
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
      // Google Maps JS (address autocomplete) injects an external <script> from
      // maps.googleapis.com — it MUST be allowed here or the browser blocks it
      // client-side (blocked:csp) and autocomplete silently falls back to manual entry.
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com"  // hot reload needs unsafe-eval in dev
        : "script-src 'self' 'unsafe-inline' https://maps.googleapis.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // maps.gstatic.com serves Maps loader sub-resources; *.googleapis.com covers
      // Places (New) autocomplete XHRs in addition to the Supabase/Stripe endpoints.
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.googleapis.com https://maps.gstatic.com https://api.stripe.com",
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
