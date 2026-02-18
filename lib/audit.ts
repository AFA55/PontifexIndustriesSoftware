/**
 * Pontifex Industries - Audit Trail System
 *
 * Logs every significant action to the audit_log table.
 * Use this in API routes after any create, update, or delete operation.
 *
 * Usage:
 *   await logAudit({
 *     userId: auth.userId,
 *     userEmail: auth.userEmail,
 *     userRole: auth.role,
 *     action: 'create',
 *     entityType: 'job_order',
 *     entityId: jobOrder.id,
 *     description: 'Created job order #PI-0042',
 *     changes: { status: { from: null, to: 'scheduled' } },
 *   });
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'assign'
  | 'unassign'
  | 'approve'
  | 'deny'
  | 'complete'
  | 'cancel'
  | 'clock_in'
  | 'clock_out'
  | 'invoice'
  | 'payment'
  | 'login'
  | 'logout'
  | 'status_change';

export type AuditEntityType =
  | 'job_order'
  | 'profile'
  | 'equipment'
  | 'timecard'
  | 'blade'
  | 'crew_assignment'
  | 'access_request'
  | 'invoice'
  | 'payment'
  | 'inventory'
  | 'system';

export interface AuditEntry {
  userId: string;
  userEmail: string;
  userRole: string;
  action: AuditAction | string;
  entityType: AuditEntityType | string;
  entityId?: string;
  description?: string;
  changes?: Record<string, { from?: any; to?: any }> | any;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an action to the audit trail.
 * This is fire-and-forget — it won't throw if logging fails
 * (we never want audit logging to break the actual operation).
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await supabaseAdmin.from('audit_log').insert({
      user_id: entry.userId,
      user_email: entry.userEmail,
      user_role: entry.userRole,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId || null,
      description: entry.description || null,
      changes: entry.changes || null,
      metadata: entry.metadata || null,
      ip_address: entry.ipAddress || null,
      user_agent: entry.userAgent || null,
    });
  } catch (error) {
    // Never let audit logging break the main operation
    console.error('Audit log failed (non-blocking):', error);
  }
}

/**
 * Extract IP and User-Agent from a NextRequest for audit logging.
 */
export function getRequestContext(request: Request): { ipAddress: string; userAgent: string } {
  return {
    ipAddress: (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown').split(',')[0].trim(),
    userAgent: request.headers.get('user-agent') || 'unknown',
  };
}
