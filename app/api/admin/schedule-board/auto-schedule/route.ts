export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/schedule-board/auto-schedule
 * AI Auto-Scheduling Engine
 *
 * Takes all unassigned jobs for a given date and optimally assigns them to operators.
 * Optimization criteria (priority order):
 *   1. Skill match — operator skill_level_numeric >= job difficulty_rating
 *   2. Workload balance — distribute jobs evenly across operators
 *   3. Travel optimization — minimize total travel distance (Google Maps Distance Matrix)
 *   4. Dispatcher preference learning — track historical assignments (future)
 *
 * Access: admin, operations_manager, super_admin
 *
 * Body: { date: 'YYYY-MM-DD', options?: { optimizeTravel?: boolean, maxJobsPerOperator?: number } }
 * Returns: { assignments: [{ jobId, jobNumber, operatorId, operatorName, reason }], skipped: [...] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit';

// ─── Types ──────────────────────────────────────────────────────────────

interface UnassignedJob {
  id: string;
  job_number: string;
  customer_name: string;
  job_type: string;
  address: string | null;
  location: string | null;
  difficulty_rating: number | null;
  arrival_time: string | null;
  estimated_hours: number | null;
  latitude: number | null;
  longitude: number | null;
}

interface Operator {
  id: string;
  full_name: string;
  skill_level_numeric: number | null;
  home_address: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  currentJobCount: number;
  currentJobs: { address: string | null; latitude: number | null; longitude: number | null }[];
  totalEstimatedHours: number;
}

interface Assignment {
  jobId: string;
  jobNumber: string;
  customerName: string;
  operatorId: string;
  operatorName: string;
  matchQuality: 'good' | 'stretch' | 'over';
  reason: string;
  travelDistance?: number | null;
}

interface SkippedJob {
  jobId: string;
  jobNumber: string;
  customerName: string;
  reason: string;
}

// ─── Geocode helper (Nominatim) ────────────────────────────────────────

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'PatriotConcreteCutting/1.0 (auto-scheduler)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

// ─── Distance calculation (Haversine — fast, no API cost) ──────────────

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── Skill match quality ───────────────────────────────────────────────

function getMatchQuality(
  operatorSkill: number,
  jobDifficulty: number
): 'good' | 'stretch' | 'over' {
  if (operatorSkill >= jobDifficulty) return 'good';
  if (operatorSkill >= jobDifficulty - 2) return 'stretch';
  return 'over';
}

// ─── Scoring function — higher is better ───────────────────────────────

function scoreAssignment(
  operator: Operator,
  job: UnassignedJob,
  maxJobsPerOperator: number,
  allOperators: Operator[]
): { score: number; reason: string; matchQuality: 'good' | 'stretch' | 'over'; travelDistance: number | null } {
  const opSkill = operator.skill_level_numeric || 5;
  const jobDiff = job.difficulty_rating || 5;
  const matchQuality = getMatchQuality(opSkill, jobDiff);

  let score = 0;
  const reasons: string[] = [];

  // 1. Skill match (0-40 points)
  if (matchQuality === 'good') {
    score += 40;
    // Prefer closest skill match (don't waste a 10-skill operator on a 2-difficulty job)
    const overQualification = opSkill - jobDiff;
    score -= overQualification * 2; // Slight penalty for being way over-qualified
    reasons.push(`Skill match: ${opSkill}/${jobDiff}`);
  } else if (matchQuality === 'stretch') {
    score += 20;
    reasons.push(`Stretch assignment: skill ${opSkill} vs difficulty ${jobDiff}`);
  } else {
    score += 0;
    reasons.push(`Under-skilled: ${opSkill} vs ${jobDiff}`);
  }

  // 2. Workload balance (0-30 points)
  // Prefer operators with fewer jobs
  const avgJobs = allOperators.reduce((sum, op) => sum + op.currentJobCount, 0) / allOperators.length;
  const jobsBelow = Math.max(0, avgJobs - operator.currentJobCount);
  score += Math.min(30, jobsBelow * 15); // Up to 30 points for being under average

  // Hard penalty if at or above max
  if (operator.currentJobCount >= maxJobsPerOperator) {
    score -= 100;
    reasons.push(`At capacity (${operator.currentJobCount}/${maxJobsPerOperator})`);
  } else {
    reasons.push(`Load: ${operator.currentJobCount} jobs`);
  }

  // 3. Travel distance (0-30 points)
  let travelDistance: number | null = null;
  if (job.latitude && job.longitude) {
    // Check distance from operator's last job or home
    let refLat: number | null = null;
    let refLon: number | null = null;

    // Use the last job's location as reference
    const lastJob = operator.currentJobs[operator.currentJobs.length - 1];
    if (lastJob?.latitude && lastJob?.longitude) {
      refLat = lastJob.latitude;
      refLon = lastJob.longitude;
    } else if (operator.home_latitude && operator.home_longitude) {
      refLat = operator.home_latitude;
      refLon = operator.home_longitude;
    }

    if (refLat && refLon) {
      travelDistance = haversineDistance(refLat, refLon, job.latitude, job.longitude);
      // Up to 30 points — closer is better
      // < 5 miles = 30 pts, 5-15 miles = 20 pts, 15-30 miles = 10 pts, > 30 miles = 0
      if (travelDistance < 5) {
        score += 30;
        reasons.push(`Close: ${travelDistance.toFixed(1)} mi`);
      } else if (travelDistance < 15) {
        score += 20;
        reasons.push(`Nearby: ${travelDistance.toFixed(1)} mi`);
      } else if (travelDistance < 30) {
        score += 10;
        reasons.push(`Moderate: ${travelDistance.toFixed(1)} mi`);
      } else {
        score += 0;
        reasons.push(`Far: ${travelDistance.toFixed(1)} mi`);
      }
    }
  }

  return {
    score,
    reason: reasons.join(' | '),
    matchQuality,
    travelDistance,
  };
}

// ─── Main handler ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { date, options } = body;

    if (!date) {
      return NextResponse.json({ error: 'Missing required field: date' }, { status: 400 });
    }

    const maxJobsPerOperator = options?.maxJobsPerOperator || 4;

    // ─── Step 1: Fetch unassigned jobs for this date ────────────────

    const { data: rawJobs, error: jobsError } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, job_type, address, location, difficulty_rating, arrival_time, estimated_hours')
      .eq('scheduled_date', date)
      .is('assigned_to', null)
      .neq('status', 'pending_approval')
      .neq('status', 'cancelled')
      .neq('status', 'completed')
      .eq('is_will_call', false)
      .order('arrival_time', { ascending: true, nullsFirst: false });

    if (jobsError) {
      console.error('Auto-schedule: Error fetching unassigned jobs:', jobsError);
      return NextResponse.json({ error: 'Failed to fetch unassigned jobs' }, { status: 500 });
    }

    const unassignedJobs: UnassignedJob[] = (rawJobs || []).map((j) => ({
      ...j,
      latitude: null as number | null,
      longitude: null as number | null,
    }));

    if (unassignedJobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No unassigned jobs to schedule',
        data: { assignments: [], skipped: [], totalAssigned: 0 },
      });
    }

    // ─── Step 2: Geocode job addresses (batch) ─────────────────────

    for (const job of unassignedJobs) {
      const addr = job.address || job.location;
      if (addr && !job.latitude) {
        const geo = await geocodeAddress(addr);
        if (geo) {
          job.latitude = geo.lat;
          job.longitude = geo.lon;
        }
      }
    }

    // ─── Step 3: Fetch all operators with skill levels ─────────────

    const { data: rawOperators, error: opError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, skill_level_numeric')
      .eq('role', 'operator')
      .order('full_name');

    if (opError || !rawOperators || rawOperators.length === 0) {
      return NextResponse.json({ error: 'No operators available' }, { status: 400 });
    }

    // ─── Step 4: Fetch time-off and current operator workload ─────

    // Exclude operators who have time-off on this date
    const { data: timeOffData } = await supabaseAdmin
      .from('operator_time_off')
      .select('operator_id')
      .eq('date', date);

    const timeOffOperatorIds = new Set((timeOffData || []).map((e: any) => e.operator_id));

    // Filter out operators on time-off
    const availableRawOperators = rawOperators.filter(op => !timeOffOperatorIds.has(op.id));

    if (availableRawOperators.length === 0) {
      return NextResponse.json({ error: 'No operators available (all on time-off)' }, { status: 400 });
    }

    const { data: existingAssignments } = await supabaseAdmin
      .from('job_orders')
      .select('id, assigned_to, address, location, estimated_hours')
      .eq('scheduled_date', date)
      .not('assigned_to', 'is', null)
      .neq('status', 'cancelled');

    // Build operator objects with current load
    const operators: Operator[] = availableRawOperators.map((op) => {
      const assignedJobs = (existingAssignments || []).filter(j => j.assigned_to === op.id);
      return {
        id: op.id,
        full_name: op.full_name,
        skill_level_numeric: op.skill_level_numeric,
        home_address: null,
        home_latitude: null,
        home_longitude: null,
        currentJobCount: assignedJobs.length,
        currentJobs: assignedJobs.map(j => ({
          address: j.address || j.location || null,
          latitude: null,
          longitude: null,
        })),
        totalEstimatedHours: assignedJobs.reduce((sum, j) => sum + (j.estimated_hours || 2), 0),
      };
    });

    // ─── Step 5: Run the scheduling algorithm ──────────────────────

    const assignments: Assignment[] = [];
    const skipped: SkippedJob[] = [];

    // Sort unassigned jobs by difficulty (hardest first — assign best operators to hardest jobs)
    const sortedJobs = [...unassignedJobs].sort((a, b) => {
      const da = a.difficulty_rating || 5;
      const db = b.difficulty_rating || 5;
      return db - da; // Descending — hardest first
    });

    for (const job of sortedJobs) {
      // Score each operator for this job
      const scored = operators
        .filter(op => op.currentJobCount < maxJobsPerOperator) // Skip full operators
        .map(op => ({
          operator: op,
          ...scoreAssignment(op, job, maxJobsPerOperator, operators),
        }))
        .sort((a, b) => b.score - a.score); // Best score first

      if (scored.length === 0 || scored[0].score <= -50) {
        skipped.push({
          jobId: job.id,
          jobNumber: job.job_number,
          customerName: job.customer_name,
          reason: operators.every(op => op.currentJobCount >= maxJobsPerOperator)
            ? 'All operators at capacity'
            : 'No suitable operator found (skill mismatch)',
        });
        continue;
      }

      const best = scored[0];
      const assignment: Assignment = {
        jobId: job.id,
        jobNumber: job.job_number,
        customerName: job.customer_name,
        operatorId: best.operator.id,
        operatorName: best.operator.full_name,
        matchQuality: best.matchQuality,
        reason: best.reason,
        travelDistance: best.travelDistance,
      };

      assignments.push(assignment);

      // Update operator's state for next iteration (simulate the assignment)
      best.operator.currentJobCount++;
      best.operator.totalEstimatedHours += job.estimated_hours || 2;
      best.operator.currentJobs.push({
        address: job.address || job.location || null,
        latitude: job.latitude,
        longitude: job.longitude,
      });
    }

    // ─── Step 6: Apply assignments to database ─────────────────────

    const now = new Date().toISOString();
    let successCount = 0;
    const errors: string[] = [];

    for (const assignment of assignments) {
      const { error: updateError } = await supabaseAdmin
        .from('job_orders')
        .update({
          assigned_to: assignment.operatorId,
          status: 'assigned',
          assigned_at: now,
          updated_at: now,
        })
        .eq('id', assignment.jobId);

      if (updateError) {
        console.error(`Auto-schedule: Failed to assign ${assignment.jobNumber}:`, updateError);
        errors.push(`${assignment.jobNumber}: ${updateError.message}`);
      } else {
        successCount++;
      }
    }

    // ─── Step 7: Audit log ─────────────────────────────────────────

    logAuditEvent({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userRole: auth.role,
      action: 'auto_schedule',
      resourceType: 'schedule_board',
      resourceId: date,
      details: {
        date,
        totalUnassigned: unassignedJobs.length,
        totalAssigned: successCount,
        totalSkipped: skipped.length,
        assignments: assignments.map(a => ({
          job: a.jobNumber,
          operator: a.operatorName,
          quality: a.matchQuality,
        })),
      },
      request,
    });

    return NextResponse.json({
      success: true,
      message: `Auto-scheduled ${successCount} of ${unassignedJobs.length} jobs`,
      data: {
        assignments,
        skipped,
        totalAssigned: successCount,
        totalUnassigned: unassignedJobs.length,
        totalSkipped: skipped.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error('Unexpected error in POST /api/admin/schedule-board/auto-schedule:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
