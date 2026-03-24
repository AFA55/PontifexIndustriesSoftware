/**
 * API Route: GET /api/silica-plan/check?jobId=xxx
 * Check if a silica plan exists for a given job order
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
    }

    // Check if silica plan exists — table may not exist yet
    const { data, error } = await supabaseAdmin
      .from('silica_plans')
      .select('id')
      .eq('job_order_id', jobId)
      .maybeSingle();

    if (error) {
      // Table may not exist — that means no plan exists
      console.log('Silica plans table check failed (may not exist):', error.message || error.code);
      return NextResponse.json({ success: true, exists: false }, { status: 200 });
    }

    return NextResponse.json({
      success: true,
      exists: !!data,
    }, { status: 200 });
  } catch (error: any) {
    // If anything fails, assume no plan exists — don't block the form
    console.log('Silica plan check error (non-blocking):', error.message || 'unknown');
    return NextResponse.json({ success: true, exists: false }, { status: 200 });
  }
}
