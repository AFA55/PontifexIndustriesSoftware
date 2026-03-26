/**
 * GET /api/admin/schedule-board/skill-match?jobId=X
 * Fetches the job's difficulty_rating, then returns all operators sorted by match quality.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const jobId = request.nextUrl.searchParams.get('jobId');
    if (!jobId) {
      return NextResponse.json({ error: 'Missing required query param: jobId' }, { status: 400 });
    }

    // Fetch job difficulty and job_type
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('id, difficulty_rating, job_type')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const difficulty = job.difficulty_rating || 5; // default to 5 if not set
    const jobTypes = (job.job_type || '').split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean);

    // Fetch all operators with skill levels and tasks_qualified_for
    const { data: operators, error: opError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, skill_level_numeric, tasks_qualified_for')
      .eq('role', 'operator')
      .order('full_name');

    if (opError) {
      console.error('Error fetching operators for skill match:', opError);
      return NextResponse.json({ error: 'Failed to fetch operators' }, { status: 500 });
    }

    let qualifiedCount = 0;
    const totalOperators = (operators || []).length;

    // Calculate match quality for each operator
    const results = (operators || []).map((op) => {
      const skill = op.skill_level_numeric || 5; // default to 5 if not set
      let match_quality: 'good' | 'stretch' | 'over';

      if (skill >= difficulty) {
        match_quality = 'good';
      } else if (skill >= difficulty - 2) {
        match_quality = 'stretch';
      } else {
        match_quality = 'over';
      }

      // Check task qualification
      const qualifiedFor: string[] = Array.isArray(op.tasks_qualified_for) ? op.tasks_qualified_for : [];
      const qualifiedLower = qualifiedFor.map((t: string) => t.toLowerCase());
      const isQualified = jobTypes.length === 0 || jobTypes.some((jt: string) => qualifiedLower.includes(jt));

      if (isQualified) qualifiedCount++;

      return {
        id: op.id,
        full_name: op.full_name,
        skill_level_numeric: op.skill_level_numeric,
        match_quality,
        is_qualified: isQualified,
        tasks_qualified_for: qualifiedFor,
      };
    });

    // Sort: good first, then stretch, then over
    const order = { good: 0, stretch: 1, over: 2 };
    results.sort((a, b) => order[a.match_quality] - order[b.match_quality]);

    return NextResponse.json({
      success: true,
      data: {
        job_difficulty: difficulty,
        job_types: jobTypes,
        qualified_count: qualifiedCount,
        total_operators: totalOperators,
        operators: results,
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/schedule-board/skill-match:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
