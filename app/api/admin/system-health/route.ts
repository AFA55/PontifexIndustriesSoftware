import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/admin/system-health — Comprehensive system health data for the admin dashboard.
 * Requires super_admin access. Returns real-time metrics on all system components.
 */
export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Run all checks in parallel
  const [
    dbHealth,
    authHealth,
    storageHealth,
    userStats,
    jobStats,
    errorStats,
    activeUsers,
    recentLogins,
    storageUsage,
  ] = await Promise.all([
    // 1. Database latency check
    checkDatabase(),
    // 2. Auth service check
    checkAuth(),
    // 3. Storage check
    checkStorage(),
    // 4. User statistics
    getUserStats(),
    // 5. Job statistics
    getJobStats(today, last7d),
    // 6. Error statistics
    getErrorStats(last24h, last7d),
    // 7. Active users (logged in last 24h)
    getActiveUsers(last24h),
    // 8. Recent logins
    getRecentLogins(),
    // 9. Storage usage
    getStorageUsage(),
  ]);

  // Compute overall status
  const services = [dbHealth, authHealth, storageHealth];
  const anyDown = services.some(s => s.status === 'down');
  const anyDegraded = services.some(s => s.status === 'degraded');
  const overallStatus = anyDown ? 'critical' : anyDegraded ? 'degraded' : 'healthy';

  return NextResponse.json({
    success: true,
    data: {
      overall_status: overallStatus,
      timestamp: now.toISOString(),
      services: {
        database: dbHealth,
        authentication: authHealth,
        storage: storageHealth,
      },
      users: userStats,
      jobs: jobStats,
      errors: errorStats,
      active_users: activeUsers,
      recent_logins: recentLogins,
      storage: storageUsage,
    },
  });
}

async function checkDatabase() {
  try {
    const start = Date.now();
    const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
    const latency = Date.now() - start;
    return {
      status: error ? 'down' : latency > 2000 ? 'degraded' : 'ok' as string,
      latency_ms: latency,
      error: error?.message || null,
    };
  } catch (err: any) {
    return { status: 'down', latency_ms: 0, error: err.message };
  }
}

async function checkAuth() {
  try {
    const start = Date.now();
    const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    const latency = Date.now() - start;
    return {
      status: error ? 'down' : latency > 2000 ? 'degraded' : 'ok' as string,
      latency_ms: latency,
      error: error?.message || null,
    };
  } catch (err: any) {
    return { status: 'down', latency_ms: 0, error: err.message };
  }
}

async function checkStorage() {
  try {
    const start = Date.now();
    const { error } = await supabaseAdmin.storage.listBuckets();
    const latency = Date.now() - start;
    return {
      status: error ? 'down' : latency > 3000 ? 'degraded' : 'ok' as string,
      latency_ms: latency,
      error: error?.message || null,
    };
  } catch (err: any) {
    return { status: 'down', latency_ms: 0, error: err.message };
  }
}

async function getUserStats() {
  try {
    const { count: totalUsers } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    const { data: roleCounts } = await supabaseAdmin
      .from('profiles')
      .select('role');

    const byRole: Record<string, number> = {};
    (roleCounts || []).forEach((p: any) => {
      byRole[p.role] = (byRole[p.role] || 0) + 1;
    });

    return {
      total: totalUsers || 0,
      by_role: byRole,
    };
  } catch {
    return { total: 0, by_role: {} };
  }
}

async function getJobStats(today: string, last7d: string) {
  try {
    const [
      { count: totalJobs },
      { count: todayJobs },
      { count: weekJobs },
      { data: statusCounts },
    ] = await Promise.all([
      supabaseAdmin.from('job_orders').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('job_orders').select('*', { count: 'exact', head: true }).eq('scheduled_date', today),
      supabaseAdmin.from('job_orders').select('*', { count: 'exact', head: true }).gte('created_at', last7d),
      supabaseAdmin.from('job_orders').select('status'),
    ]);

    const byStatus: Record<string, number> = {};
    (statusCounts || []).forEach((j: any) => {
      byStatus[j.status] = (byStatus[j.status] || 0) + 1;
    });

    return {
      total: totalJobs || 0,
      today: todayJobs || 0,
      this_week: weekJobs || 0,
      by_status: byStatus,
    };
  } catch {
    return { total: 0, today: 0, this_week: 0, by_status: {} };
  }
}

async function getErrorStats(last24h: string, last7d: string) {
  try {
    const [
      { count: errors24h },
      { count: errors7d },
    ] = await Promise.all([
      supabaseAdmin.from('error_logs').select('*', { count: 'exact', head: true }).gte('created_at', last24h),
      supabaseAdmin.from('error_logs').select('*', { count: 'exact', head: true }).gte('created_at', last7d),
    ]);

    // Get recent errors
    const { data: recentErrors } = await supabaseAdmin
      .from('error_logs')
      .select('type, error_message, url, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    return {
      last_24h: errors24h || 0,
      last_7d: errors7d || 0,
      recent: recentErrors || [],
    };
  } catch {
    // error_logs table might not exist yet
    return { last_24h: 0, last_7d: 0, recent: [] };
  }
}

async function getActiveUsers(last24h: string) {
  try {
    const { data } = await supabaseAdmin
      .from('audit_logs')
      .select('user_id')
      .gte('created_at', last24h);

    const uniqueUsers = new Set((data || []).map((d: any) => d.user_id));
    return { count: uniqueUsers.size };
  } catch {
    return { count: 0 };
  }
}

async function getRecentLogins() {
  try {
    const { data } = await supabaseAdmin
      .from('audit_logs')
      .select('user_id, user_email, action, created_at')
      .eq('action', 'login')
      .order('created_at', { ascending: false })
      .limit(10);

    return data || [];
  } catch {
    return [];
  }
}

async function getStorageUsage() {
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    return {
      buckets: (buckets || []).map(b => ({
        name: b.name,
        id: b.id,
        public: b.public,
        created_at: b.created_at,
      })),
    };
  } catch {
    return { buckets: [] };
  }
}
