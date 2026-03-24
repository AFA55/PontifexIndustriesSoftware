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

// Clean up old entries periodically (avoid memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, 60_000);

// Stricter limits for communication endpoints (per IP)
const COMM_RATE_LIMIT_WINDOW = 60_000; // 1 minute
const SMS_RATE_LIMIT_MAX = 5;   // 5 SMS per minute per IP
const EMAIL_RATE_LIMIT_MAX = 10; // 10 emails per minute per IP
const commRateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isCommRateLimited(key: string, max: number): boolean {
  const now = Date.now();
  const entry = commRateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    commRateLimitMap.set(key, { count: 1, resetAt: now + COMM_RATE_LIMIT_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > max;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of commRateLimitMap.entries()) {
    if (now > entry.resetAt) commRateLimitMap.delete(key);
  }
}, 60_000);

// Public API endpoints that should be rate-limited
const RATE_LIMITED_PATHS = [
  '/api/demo-request',
  '/api/access-requests',
  '/api/auth/login',
  '/api/auth/forgot-password',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             'unknown';

  // Rate limit public API endpoints
  if (RATE_LIMITED_PATHS.some(path => pathname.startsWith(path))) {
    if (isRateLimited(`${ip}:${pathname}`)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }
  }

  // Stricter rate limiting for communication endpoints
  if (pathname.startsWith('/api/send-sms') || pathname.startsWith('/api/sms/')) {
    if (isCommRateLimited(`sms:${ip}`, SMS_RATE_LIMIT_MAX)) {
      return NextResponse.json(
        { error: 'SMS rate limit exceeded. Maximum 5 messages per minute.' },
        { status: 429 }
      );
    }
  }
  if (pathname.startsWith('/api/send-email')) {
    if (isCommRateLimited(`email:${ip}`, EMAIL_RATE_LIMIT_MAX)) {
      return NextResponse.json(
        { error: 'Email rate limit exceeded. Maximum 10 emails per minute.' },
        { status: 429 }
      );
    }
  }

  const response = NextResponse.next();

  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=()'
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
