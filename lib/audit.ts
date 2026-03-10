/**
 * Audit Event Logger
 * Logs admin actions to the audit_logs table for security monitoring.
 * All calls are fire-and-forget (non-blocking).
 */

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface AuditEventParams {
  userId: string;
  userEmail: string;
  userRole: string;
  action: string;         // 'create', 'update', 'delete', 'approve', 'reject', 'assign', 'login', 'logout'
  resourceType: string;   // 'job_order', 'profile', 'timecard', 'change_request', etc.
  resourceId?: string;
  details?: Record<string, unknown>;
  request?: NextRequest;
}

/**
 * Log an audit event. Non-blocking — errors are silently caught.
 */
export function logAuditEvent(params: AuditEventParams): void {
  const {
    userId,
    userEmail,
    userRole,
    action,
    resourceType,
    resourceId,
    details,
    request,
  } = params;

  const ipAddress = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request?.headers.get('x-real-ip')
    || null;
  const userAgent = request?.headers.get('user-agent') || null;

  // Fire-and-forget insert (wrapped in Promise.resolve for .catch() support)
  Promise.resolve(
    supabaseAdmin
      .from('audit_logs')
      .insert({
        user_id: userId,
        user_email: userEmail,
        user_role: userRole,
        action,
        resource_type: resourceType,
        resource_id: resourceId || null,
        details: details || {},
        ip_address: ipAddress,
        user_agent: userAgent,
      })
  )
    .then(({ error }) => {
      if (error) {
        console.error('[audit] Failed to log audit event:', error.message);
      }
    })
    .catch((err) => {
      console.error('[audit] Unexpected error logging audit event:', err);
    });
}
