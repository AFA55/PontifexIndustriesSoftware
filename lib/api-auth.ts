/**
 * Shared API route authentication helpers.
 * Reusable functions to verify Bearer tokens and check user roles.
 * Pattern based on /app/api/admin/users/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

interface AuthSuccess {
  authorized: true;
  userId: string;
  userEmail: string;
  role: string;
}

interface AuthFailure {
  authorized: false;
  response: NextResponse;
}

type AuthResult = AuthSuccess | AuthFailure;

/**
 * Require the request to have a valid Bearer token belonging to an admin user.
 * Returns 401 if no/invalid token, 403 if not admin.
 */
export async function requireAdmin(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      ),
    };
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized. Invalid or expired session.' },
        { status: 401 }
      ),
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.role !== 'admin') {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden. Admin access required.' },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId: user.id,
    userEmail: user.email || '',
    role: profile.role,
  };
}

/**
 * Require the request to have a valid Bearer token for any authenticated user.
 * Returns 401 if no/invalid token.
 */
/**
 * Check if a Supabase/PostgREST error indicates a missing table.
 * Handles all known error code formats:
 * - PostgreSQL 42P01 (undefined_table)
 * - PostgREST PGRST204/PGRST205 (table not found variants)
 * - Message-based detection as fallback
 */
export function isTableNotFoundError(error: any): boolean {
  if (!error) return false;
  const code = (error.code || '').toString();
  const message = (error.message || '').toLowerCase();
  const details = (error.details || '').toLowerCase();
  const hint = (error.hint || '').toLowerCase();
  const statusCode = error.status || error.statusCode || 0;
  // Stringify the entire error object as a last-resort catch
  const errorStr = (() => {
    try { return JSON.stringify(error).toLowerCase(); } catch { return ''; }
  })();
  return (
    // PostgreSQL: undefined_table
    code === '42P01' ||
    // PostgREST: table/view not found
    code === 'PGRST204' || code === 'PGRST205' ||
    // PostgREST: relation does not exist (may come as different codes)
    code === 'PGRST301' || code === 'PGRST302' ||
    // HTTP 404 from PostgREST when table doesn't exist
    statusCode === 404 ||
    // Message-based detection
    message.includes('does not exist') ||
    message.includes('not found') ||
    (message.includes('relation') && message.includes('not exist')) ||
    message.includes('undefined table') ||
    message.includes('could not find') ||
    // Details/hint-based detection
    details.includes('does not exist') ||
    details.includes('not found') ||
    hint.includes('does not exist') ||
    // Full error string fallback for edge cases
    (errorStr.includes('relation') && errorStr.includes('does not exist'))
  );
}

export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      ),
    };
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unauthorized. Invalid or expired session.' },
        { status: 401 }
      ),
    };
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return {
    authorized: true,
    userId: user.id,
    userEmail: user.email || '',
    role: profile?.role || 'operator',
  };
}
