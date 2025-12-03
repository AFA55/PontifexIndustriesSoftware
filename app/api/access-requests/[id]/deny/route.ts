/**
 * API Route: POST /api/access-requests/[id]/deny
 * Deny an access request with a reason
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { denialReason, reviewedBy } = body;

    // Validation
    if (!denialReason || denialReason.trim() === '') {
      return NextResponse.json(
        { error: 'Denial reason is required' },
        { status: 400 }
      );
    }

    if (!reviewedBy) {
      return NextResponse.json(
        { error: 'reviewedBy (admin user ID) is required' },
        { status: 400 }
      );
    }

    // Fetch the access request
    const { data: accessRequest, error: fetchError } = await supabaseAdmin
      .from('access_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !accessRequest) {
      return NextResponse.json(
        { error: 'Access request not found' },
        { status: 404 }
      );
    }

    // Check if already processed
    if (accessRequest.status !== 'pending') {
      return NextResponse.json(
        { error: `This request has already been ${accessRequest.status}` },
        { status: 400 }
      );
    }

    // Update access request to denied
    const { error: updateError } = await supabaseAdmin
      .from('access_requests')
      .update({
        status: 'denied',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        denial_reason: denialReason,
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating access request:', updateError);
      return NextResponse.json(
        { error: 'Failed to deny access request' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `Access request denied for ${accessRequest.full_name}`,
        data: {
          id: accessRequest.id,
          email: accessRequest.email,
          status: 'denied',
          denialReason: denialReason,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in deny route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
