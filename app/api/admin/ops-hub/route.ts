/**
 * API Route: GET /api/admin/ops-hub
 * Operations Hub diagnostics endpoint.
 * Returns: API health, recent errors, login audit trail, DB stats, role overview.
 * Access: super_admin, operations_manager only
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOpsManager } from '@/lib/api-auth';

// Health check endpoints to ping
const HEALTH_ENDPOINTS = [
  { name: 'Schedule Board', path: '/api/admin/schedule-board' },
  { name: 'Job Orders', path: '/api/admin/job-orders' },
  { name: 'Profiles', path: '/api/admin/profiles' },
  { name: 'Daily Notes', path: '/api/admin/daily-notes' },
];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOpsManager(request);
    if (!auth.authorized) return auth.response;

    // Run all diagnostics queries in parallel
    const [
      errorLogsResult,
      loginAttemptsResult,
      dbStatsResult,
      roleOverviewResult,
      jobCountResult,
      profileCountResult,
      migrationsResult,
    ] = await Promise.all([
      // 1. Recent error logs (last 24 hours, limit 50)
      supabaseAdmin
        .from('error_logs')
        .select('id, endpoint, method, status_code, error_message, user_role, ip_address, created_at')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(50),

      // 2. Login attempts (last 24 hours)
      supabaseAdmin
        .from('login_attempts')
        .select('id, email, success, ip_address, user_agent, failure_reason, created_at')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(100),

      // 3. Database table stats via RPC (gracefully handles missing function)
      supabaseAdmin.rpc('get_database_stats').then(
        (res) => res,
        () => ({ data: null, error: 'RPC not available' })
      ),

      // 4. Role overview — count profiles by role
      supabaseAdmin
        .from('profiles')
        .select('role, active'),

      // 5. Total job count
      supabaseAdmin
        .from('job_orders')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null),

      // 6. Total profile count
      supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true }),

      // 7. Last migration (may not exist — handle gracefully)
      supabaseAdmin
        .from('schema_migrations' as any)
        .select('version')
        .order('version', { ascending: false })
        .limit(1)
        .then(
          (res: any) => res,
          () => ({ data: null })
        ),
    ]);

    // Process role overview
    const roleMap: Record<string, { total: number; active: number }> = {};
    if (roleOverviewResult.data) {
      for (const p of roleOverviewResult.data) {
        if (!roleMap[p.role]) roleMap[p.role] = { total: 0, active: 0 };
        roleMap[p.role].total++;
        if (p.active !== false) roleMap[p.role].active++;
      }
    }

    // Process database stats (fallback if RPC not available)
    let databaseStats: Array<{ table_name: string; row_count: number; total_size: string }> = [];
    if (dbStatsResult && typeof dbStatsResult === 'object' && 'data' in dbStatsResult && dbStatsResult.data) {
      databaseStats = dbStatsResult.data as any[];
    }

    // API health checks — internal health pings
    const apiHealth = await Promise.all(
      HEALTH_ENDPOINTS.map(async (ep) => {
        const start = Date.now();
        try {
          // Build absolute URL from the request
          const url = new URL(ep.path, request.url);
          const token = request.headers.get('authorization')?.replace('Bearer ', '');
          const res = await fetch(url.toString(), {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            signal: AbortSignal.timeout(5000),
          });
          return {
            endpoint: ep.name,
            path: ep.path,
            status: res.ok ? 'ok' : 'error',
            statusCode: res.status,
            responseTimeMs: Date.now() - start,
          };
        } catch {
          return {
            endpoint: ep.name,
            path: ep.path,
            status: 'error',
            statusCode: 0,
            responseTimeMs: Date.now() - start,
          };
        }
      })
    );

    // Login stats summary
    const loginAttempts = loginAttemptsResult.data || [];
    const successfulLogins = loginAttempts.filter((l: any) => l.success).length;
    const failedLogins = loginAttempts.filter((l: any) => !l.success).length;

    return NextResponse.json({
      success: true,
      data: {
        apiHealth,
        recentErrors: errorLogsResult.data || [],
        loginAudit: {
          attempts: loginAttempts,
          summary: {
            total: loginAttempts.length,
            successful: successfulLogins,
            failed: failedLogins,
          },
        },
        databaseStats,
        roleOverview: roleMap,
        systemStatus: {
          databaseConnected: true,
          totalJobs: jobCountResult.count || 0,
          totalProfiles: profileCountResult.count || 0,
          lastChecked: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/ops-hub:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
