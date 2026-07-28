export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/pending-jobs/[id]/suggest-dates — office/admin (requireSalesStaff)
 * Recommends the next available dates to reschedule a job, based on PEOPLE
 * (operators not already booked that day) and TALENT (operator
 * skill_level_numeric >= the job's difficulty_rating). Returns the earliest few
 * weekdays with at least one qualified, free operator.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';

const HORIZON_DAYS = 21;   // look ~3 weeks out
const MAX_SUGGESTIONS = 4;
const ACTIVE_STATUSES = ['scheduled', 'assigned', 'in_route', 'on_site', 'in_progress', 'pending_completion'];

// Local YYYY-MM-DD for a Date (avoid the UTC off-by-one — use local components).
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    // Job difficulty drives the required skill.
    let jobQuery = supabaseAdmin.from('job_orders').select('id, difficulty_rating, tenant_id').eq('id', id);
    if (auth.tenantId) jobQuery = jobQuery.eq('tenant_id', auth.tenantId);
    const { data: job } = await jobQuery.single();
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    const difficulty = Number(job.difficulty_rating) || 1;

    // Field operators (with a skill level) who can take this job.
    let opQuery = supabaseAdmin
      .from('profiles')
      .select('id, full_name, skill_level_numeric, role')
      .in('role', ['operator', 'apprentice']);
    if (auth.tenantId) opQuery = opQuery.eq('tenant_id', auth.tenantId);
    const { data: ops } = await opQuery;
    const operators = (ops || []).filter((o: any) => (o.full_name || '').trim());
    // Talent filter: skill >= difficulty (operators with no skill set are treated as skill 5).
    const qualified = operators.filter((o: any) => (o.skill_level_numeric ?? 5) >= difficulty);

    if (qualified.length === 0) {
      return NextResponse.json({ success: true, data: [], note: 'No operator currently meets this job’s difficulty.' });
    }

    // Build the candidate weekday window (tomorrow → +HORIZON_DAYS), skip weekends.
    const today = new Date();
    const candidates: string[] = [];
    for (let i = 1; i <= HORIZON_DAYS; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue; // skip Sun/Sat
      candidates.push(ymd(d));
    }
    if (candidates.length === 0) return NextResponse.json({ success: true, data: [] });

    // Existing bookings for these operators across the window.
    const opIds = qualified.map((o: any) => o.id);
    const { data: bookings } = await supabaseAdmin
      .from('job_orders')
      .select('assigned_to, scheduled_date, status')
      .in('assigned_to', opIds)
      .gte('scheduled_date', candidates[0])
      .lte('scheduled_date', candidates[candidates.length - 1])
      .in('status', ACTIVE_STATUSES);

    // date -> set of booked operator ids
    const bookedByDate: Record<string, Set<string>> = {};
    for (const b of bookings || []) {
      const dt = b.scheduled_date as string;
      if (!dt) continue;
      (bookedByDate[dt] ??= new Set()).add(b.assigned_to as string);
    }

    // For each candidate date, list qualified operators who are free.
    const suggestions: { date: string; free_operators: string[] }[] = [];
    for (const date of candidates) {
      const booked = bookedByDate[date] || new Set();
      const free = qualified.filter((o: any) => !booked.has(o.id));
      if (free.length > 0) {
        suggestions.push({
          date,
          free_operators: free
            .sort((a: any, b: any) => (a.skill_level_numeric ?? 5) - (b.skill_level_numeric ?? 5)) // closest skill first
            .slice(0, 3)
            .map((o: any) => o.full_name),
        });
      }
      if (suggestions.length >= MAX_SUGGESTIONS) break;
    }

    return NextResponse.json({ success: true, data: suggestions });
  } catch (error) {
    console.error('Unexpected error in GET /suggest-dates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
