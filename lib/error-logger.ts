/**
 * API Error Logger
 * Logs API errors to the error_logs table for diagnostics monitoring.
 * All calls are fire-and-forget (non-blocking).
 */

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface ErrorLogParams {
  endpoint: string;
  method: string;          // 'GET', 'POST', 'PATCH', 'DELETE'
  statusCode?: number;
  error: Error | string;
  userId?: string;
  userRole?: string;
  request?: NextRequest;
}

/**
 * Log an API error. Non-blocking — errors are silently caught.
 */
export function logApiError(params: ErrorLogParams): void {
  const {
    endpoint,
    method,
    statusCode,
    error,
    userId,
    userRole,
    request,
  } = params;

  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorStack = typeof error === 'string' ? undefined : error.stack;

  const ipAddress = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request?.headers.get('x-real-ip')
    || null;

  // Fire-and-forget insert (wrapped in Promise.resolve for .catch() support)
  Promise.resolve(
    supabaseAdmin
      .from('error_logs')
      .insert({
        endpoint,
        method,
        status_code: statusCode || 500,
        error_message: errorMessage,
        error_stack: errorStack?.substring(0, 2000) || null, // limit stack trace size
        user_id: userId || null,
        user_role: userRole || null,
        ip_address: ipAddress,
      })
  )
    .then(({ error: dbError }) => {
      if (dbError) {
        console.error('[error-logger] Failed to log error:', dbError.message);
      }
    })
    .catch((err) => {
      console.error('[error-logger] Unexpected error logging:', err);
    });
}
