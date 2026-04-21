export const dynamic = 'force-dynamic';

/**
 * API Route: GET /api/admin/operators/[id]/history
 * Returns comprehensive operator history for the profile detail page.
 * Includes stats, job history, timecard summary, certifications, skills,
 * pay history, status changes, and monthly performance.
 *
 * Query params:
 *   ?range=all|year|quarter|month
 *
 * Access: admin, super_admin, operations_manager, salesman, supervisor
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSalesStaff } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: operatorId } = await params;

    // Parse date range filter
    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || 'all';

    let dateFilter: string | null = null;
    const now = new Date();
    switch (range) {
      case 'month':
        dateFilter = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        break;
      case 'quarter':
        dateFilter = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().split('T')[0];
        break;
      case 'year':
        dateFilter = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
        break;
      default:
        dateFilter = null;
    }

    const callerTenantId = await getTenantId(auth.userId);
    if (!callerTenantId) {
      return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    }

    // P0-3: Fetch profile and verify operator belongs to caller's tenant
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', operatorId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Operator not found' },
        { status: 404 }
      );
    }
    if (profile.tenant_id !== callerTenantId) {
      return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
    }

    // 12-months-ago date for timecard/monthly queries
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const twelveMonthsAgoStr = twelveMonthsAgo.toISOString().split('T')[0];

    // This month start
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstOfMonthStr = firstOfMonth.toISOString().split('T')[0];

    // Helper to safely query a table that may not exist yet
    const safeQuery = async (queryFn: () => PromiseLike<{ data: any; error: any }>): Promise<{ data: any; error: any }> => {
      try {
        const result = await queryFn();
        if (result.error && isTableNotFoundError(result.error)) {
          return { data: null, error: null };
        }
        return result;
      } catch (err) {
        return { data: null, error: err };
      }
    };

    // Build all parallel queries
    const [
      jobHistoryResult,
      timecardResult,
      payHistoryResult,
      statusChangesResult,
      ratingsResult,
      monthlyTimecardsResult,
      thisMonthTimecardsResult,
    ] = await Promise.all([
      // 1. Job history: last 100 jobs (includes helper jobs)
      safeQuery(() => {
        let q = supabaseAdmin
          .from('job_orders')
          .select('id, job_number, customer_name, job_type, status, scheduled_date, estimated_hours, estimated_cost, total_time, customer_overall_rating, total_revenue, jobsite_address')
          .or(`assigned_to.eq.${operatorId},helper_assigned_to.eq.${operatorId}`)
          .is('deleted_at', null)
          .order('scheduled_date', { ascending: false })
          .limit(100);
        if (dateFilter) q = q.gte('scheduled_date', dateFilter);
        return q;
      }),

      // 2. Timecard data for monthly summary (last 12 months)
      safeQuery(() =>
        supabaseAdmin
          .from('timecards')
          .select('id, date, total_hours, hour_type, clock_in_time, clock_out_time')
          .eq('user_id', operatorId)
          .gte('date', twelveMonthsAgoStr)
          .order('date', { ascending: false })
      ),

      // 3. Pay history from operator_pay_rates
      safeQuery(() =>
        supabaseAdmin
          .from('operator_pay_rates')
          .select('id, effective_date, end_date, regular_rate, overtime_rate, double_time_rate, rate_type, reason, approved_by, notes, created_at')
          .eq('operator_id', operatorId)
          .order('effective_date', { ascending: false })
          .limit(50)
      ),

      // 4. Status changes: last 50 from operator_status_history
      safeQuery(() =>
        supabaseAdmin
          .from('operator_status_history')
          .select('id, status, created_at, job_order_id')
          .eq('operator_id', operatorId)
          .order('created_at', { ascending: false })
          .limit(50)
      ),

      // 5. Ratings from completed_jobs_archive
      safeQuery(() => {
        let q = supabaseAdmin
          .from('completed_jobs_archive')
          .select('customer_feedback_rating, on_time_arrival, work_completed_at')
          .eq('operator_id', operatorId);
        if (dateFilter) q = q.gte('work_completed_at', dateFilter);
        return q;
      }),

      // 6. Monthly timecard aggregation (last 12 months)
      safeQuery(() =>
        supabaseAdmin
          .from('timecards')
          .select('id, date, total_hours, hour_type')
          .eq('user_id', operatorId)
          .gte('date', twelveMonthsAgoStr)
      ),

      // 7. This month timecard hours
      safeQuery(() =>
        supabaseAdmin
          .from('timecards')
          .select('total_hours')
          .eq('user_id', operatorId)
          .gte('date', firstOfMonthStr)
      ),
    ]);

    // ---- Process job data ----
    const allJobs: any[] = jobHistoryResult.data || [];
    const completedStatuses = ['completed', 'invoiced', 'paid'];
    const completedJobs = allJobs.filter((j: any) => completedStatuses.includes(j.status));

    // Stats from jobs
    const totalJobs = completedJobs.length;
    const totalRevenue = completedJobs.reduce(
      (sum, j) => sum + (parseFloat(j.estimated_cost) || parseFloat(j.total_revenue) || 0), 0
    );

    // Format job history for response
    const jobHistory = allJobs.map((job: any) => ({
      id: job.id,
      job_number: job.job_number,
      customer_name: job.customer_name,
      job_type: job.job_type,
      status: job.status,
      scheduled_date: job.scheduled_date,
      location: job.jobsite_address || null,
      hours_worked: job.total_time
        ? Math.round((job.total_time / 60) * 100) / 100
        : job.estimated_hours || null,
      estimated_cost: parseFloat(job.estimated_cost) || null,
      customer_rating: job.customer_overall_rating || null,
    }));

    // ---- Process timecard monthly summary ----
    const timecardMonths = processTimecardSummary(timecardResult.data || []);

    // ---- Process ratings from completed_jobs_archive ----
    const ratingsData = (!ratingsResult.error && ratingsResult.data) ? ratingsResult.data : [];
    const ratedJobs = ratingsData.filter((r: any) => r.customer_feedback_rating != null);
    const totalRatings = ratedJobs.length;
    const avgRating = totalRatings > 0
      ? Math.round(
          (ratedJobs.reduce((sum: number, r: any) => sum + r.customer_feedback_rating, 0) / totalRatings) * 10
        ) / 10
      : (profile.overall_rating_avg ? parseFloat(profile.overall_rating_avg) : 0);

    // On-time rate
    const onTimeJobs = ratingsData.filter((r: any) => r.on_time_arrival === true).length;
    const onTimeRate = ratingsData.length > 0
      ? Math.round((onTimeJobs / ratingsData.length) * 100)
      : 0;

    // ---- Total hours from timecards (last 12 months) ----
    const totalHours = (timecardResult.data || []).reduce(
      (sum: number, tc: any) => sum + (parseFloat(tc.total_hours) || 0), 0
    );

    // ---- This month stats ----
    const jobsThisMonth = allJobs.filter(j =>
      completedStatuses.includes(j.status) &&
      j.scheduled_date &&
      j.scheduled_date >= firstOfMonthStr
    ).length;

    const hoursThisMonth = (thisMonthTimecardsResult.data || []).reduce(
      (sum: number, tc: any) => sum + (parseFloat(tc.total_hours) || 0), 0
    );

    // ---- Parse certifications from profile JSONB ----
    const certifications = parseCertifications(profile.certifications);

    // ---- Parse skills from profile JSONB ----
    const skills = parseSkills(profile.skill_levels);

    // ---- Process pay history ----
    const payHistory = (!payHistoryResult.error && payHistoryResult.data)
      ? payHistoryResult.data.map((pay: any) => ({
          effective_date: pay.effective_date,
          hourly_rate: parseFloat(pay.regular_rate) || null,
          overtime_rate: parseFloat(pay.overtime_rate) || null,
          double_time_rate: parseFloat(pay.double_time_rate) || null,
          rate_type: pay.rate_type,
          reason: pay.reason,
          set_by: pay.approved_by,
          notes: pay.notes,
        }))
      : [];

    // ---- Process status changes ----
    const statusChanges = (!statusChangesResult.error && statusChangesResult.data)
      ? statusChangesResult.data.map((sc: any) => ({
          status: sc.status,
          timestamp: sc.created_at,
          job_order_id: sc.job_order_id,
        }))
      : [];

    // ---- Build monthly performance (last 12 months) ----
    const monthlyPerformance = buildMonthlyPerformance(
      allJobs.filter(j => completedStatuses.includes(j.status)),
      monthlyTimecardsResult.data || []
    );

    // ---- Compose stats object ----
    const stats = {
      total_jobs: totalJobs,
      total_hours: Math.round(totalHours * 100) / 100,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      avg_rating: avgRating,
      total_ratings: totalRatings || (profile.total_ratings_received ? parseInt(profile.total_ratings_received) : 0),
      on_time_rate: onTimeRate,
      jobs_this_month: jobsThisMonth,
      hours_this_month: Math.round(hoursThisMonth * 100) / 100,
    };

    // ---- Sanitize profile for response ----
    const safeProfile = {
      id: profile.id,
      full_name: profile.full_name,
      nickname: profile.nickname,
      email: profile.email,
      phone: profile.phone || profile.phone_number,
      date_of_birth: profile.date_of_birth,
      role: profile.role,
      active: profile.active,
      profile_picture_url: profile.profile_picture_url,
      hire_date: profile.hire_date,
      years_experience: profile.years_experience,
      skill_level: profile.skill_level,
      hourly_rate: profile.hourly_rate ? parseFloat(profile.hourly_rate) : null,
      emergency_contact_name: profile.emergency_contact_name,
      emergency_contact_phone: profile.emergency_contact_phone,
      emergency_contact_relationship: profile.emergency_contact_relationship,
      tasks_qualified_for: profile.tasks_qualified_for,
      equipment_qualified_for: profile.equipment_qualified_for,
      notes: profile.notes,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      overall_rating_avg: profile.overall_rating_avg ? parseFloat(profile.overall_rating_avg) : null,
      total_ratings_received: profile.total_ratings_received,
    };

    return NextResponse.json({
      success: true,
      data: {
        profile: safeProfile,
        stats,
        job_history: jobHistory,
        timecard_summary: {
          months: timecardMonths,
        },
        certifications,
        skills,
        pay_history: payHistory,
        status_changes: statusChanges,
        monthly_performance: monthlyPerformance,
      },
    });
  } catch (error: any) {
    console.error('Error fetching operator history:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---- Helper: Process timecards into monthly summary ----

function processTimecardSummary(timecards: any[]): any[] {
  const monthMap = new Map<string, {
    total_hours: number;
    regular_hours: number;
    overtime_hours: number;
    days: Set<string>;
  }>();

  for (const tc of timecards) {
    if (!tc.date) continue;
    const monthKey = tc.date.substring(0, 7); // "2026-03"
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, {
        total_hours: 0,
        regular_hours: 0,
        overtime_hours: 0,
        days: new Set(),
      });
    }
    const m = monthMap.get(monthKey)!;
    const hours = parseFloat(tc.total_hours) || 0;
    m.total_hours += hours;
    if (tc.hour_type === 'overtime') {
      m.overtime_hours += hours;
    } else {
      m.regular_hours += hours;
    }
    m.days.add(tc.date);
  }

  return Array.from(monthMap.entries())
    .map(([month, data]) => ({
      month,
      total_hours: Math.round(data.total_hours * 100) / 100,
      regular_hours: Math.round(data.regular_hours * 100) / 100,
      overtime_hours: Math.round(data.overtime_hours * 100) / 100,
      days_worked: data.days.size,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

// ---- Helper: Parse certifications from profile JSONB ----

function parseCertifications(certs: any): any[] {
  if (!certs) return [];
  const nowDate = new Date();

  if (Array.isArray(certs)) {
    return certs.map((cert: any) => ({
      name: cert.name || cert.certification || 'Unknown',
      issuing_authority: cert.issuing_authority || cert.authority || null,
      issue_date: cert.issue_date || cert.issued || null,
      expiry_date: cert.expiry_date || cert.expires || null,
      is_expired: cert.expiry_date
        ? new Date(cert.expiry_date) < nowDate
        : false,
    }));
  }

  if (typeof certs === 'object') {
    return Object.entries(certs).map(([name, value]: [string, any]) => ({
      name,
      issuing_authority: value?.issuing_authority || null,
      issue_date: value?.issue_date || null,
      expiry_date: value?.expiry_date || null,
      is_expired: value?.expiry_date
        ? new Date(value.expiry_date) < nowDate
        : false,
    }));
  }

  return [];
}

// ---- Helper: Parse skills from profile JSONB ----

function parseSkills(skillLevels: any): any[] {
  if (!skillLevels) return [];

  if (Array.isArray(skillLevels)) {
    return skillLevels.map((skill: any) => ({
      task: skill.task || skill.name || skill.skill || 'Unknown',
      proficiency: skill.proficiency || skill.level || 'intermediate',
      since: skill.since || null,
    }));
  }

  if (typeof skillLevels === 'object') {
    return Object.entries(skillLevels).map(([task, value]: [string, any]) => ({
      task,
      proficiency: typeof value === 'string'
        ? value
        : value?.level || value?.proficiency || 'intermediate',
      since: typeof value === 'object' ? value?.since || null : null,
    }));
  }

  return [];
}

// ---- Helper: Build monthly performance from jobs + timecards ----

function buildMonthlyPerformance(completedJobs: any[], timecards: any[]): any[] {
  const monthMap = new Map<string, {
    jobs_completed: number;
    hours_worked: number;
    revenue: number;
    ratings: number[];
  }>();

  // Aggregate completed jobs by month
  for (const job of completedJobs) {
    if (!job.scheduled_date) continue;
    const monthKey = job.scheduled_date.substring(0, 7);
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { jobs_completed: 0, hours_worked: 0, revenue: 0, ratings: [] });
    }
    const m = monthMap.get(monthKey)!;
    m.jobs_completed++;
    m.revenue += parseFloat(job.estimated_cost) || parseFloat(job.total_revenue) || 0;
    if (job.customer_overall_rating != null) {
      m.ratings.push(job.customer_overall_rating);
    }
  }

  // Aggregate timecard hours by month
  for (const tc of timecards) {
    if (!tc.date) continue;
    const monthKey = tc.date.substring(0, 7);
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { jobs_completed: 0, hours_worked: 0, revenue: 0, ratings: [] });
    }
    monthMap.get(monthKey)!.hours_worked += parseFloat(tc.total_hours) || 0;
  }

  return Array.from(monthMap.entries())
    .map(([month, data]) => ({
      month,
      jobs_completed: data.jobs_completed,
      hours_worked: Math.round(data.hours_worked * 100) / 100,
      revenue: Math.round(data.revenue * 100) / 100,
      avg_rating: data.ratings.length > 0
        ? Math.round((data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length) * 10) / 10
        : null,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}
