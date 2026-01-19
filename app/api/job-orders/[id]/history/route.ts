/**
 * API Route: GET /api/job-orders/[id]/history
 * Get change history for a specific job order
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params as required by Next.js 15+
    const { id } = await params;

    // Get user from Supabase session
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Check if user is admin or assigned to this job
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';

    // Verify user has access to this job
    if (!isAdmin) {
      const { data: job } = await supabaseAdmin
        .from('job_orders')
        .select('assigned_to')
        .eq('id', id)
        .single();

      if (!job || job.assigned_to !== user.id) {
        return NextResponse.json(
          { error: 'You do not have access to view this job history' },
          { status: 403 }
        );
      }
    }

    // Fetch history for this job order
    const { data: history, error: historyError } = await supabaseAdmin
      .from('job_orders_history')
      .select('*')
      .eq('job_order_id', id)
      .order('changed_at', { ascending: false });

    if (historyError) {
      console.error('Error fetching job history:', historyError);
      return NextResponse.json(
        { error: 'Failed to fetch job history', details: historyError.message },
        { status: 500 }
      );
    }

    // Format the history for better readability
    const formattedHistory = (history || []).map(entry => ({
      id: entry.id,
      timestamp: entry.changed_at,
      changedBy: entry.changed_by_name,
      role: entry.changed_by_role,
      changeType: entry.change_type,
      changes: entry.changes,
      changeSummary: formatChangeSummary(entry.changes),
      notes: entry.notes,
    }));

    return NextResponse.json(
      {
        success: true,
        jobOrderId: id,
        historyCount: formattedHistory.length,
        history: formattedHistory,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in job history route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// Helper function to format changes into human-readable text
function formatChangeSummary(changes: any): string[] {
  if (!changes || typeof changes !== 'object') return [];

  return Object.entries(changes).map(([field, values]: [string, any]) => {
    const fieldName = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const oldValue = formatValue(values.old);
    const newValue = formatValue(values.new);
    return `${fieldName}: "${oldValue}" → "${newValue}"`;
  });
}

// Helper function to format values for display
function formatValue(value: any): string {
  if (value === null || value === undefined) return 'Not set';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
