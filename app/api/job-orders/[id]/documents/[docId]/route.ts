export const dynamic = 'force-dynamic';

/**
 * API Route: DELETE /api/job-orders/[id]/documents/[docId]
 * Delete a document attachment from a job order
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId, docId } = await params;

    // Fetch the document to verify ownership
    const { data: doc, error: docError } = await supabaseAdmin
      .from('job_documents')
      .select('id, job_order_id, uploaded_by')
      .eq('id', docId)
      .eq('job_order_id', jobId)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const adminRoles = ['admin', 'super_admin', 'operations_manager'];
    const isAdmin = adminRoles.includes(auth.role || '');

    // Only uploader or admin can delete
    if (!isAdmin && doc.uploaded_by !== auth.userId) {
      return NextResponse.json({ error: 'You can only delete your own documents' }, { status: 403 });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('job_documents')
      .delete()
      .eq('id', docId);

    if (deleteError) {
      console.error('Error deleting job document:', deleteError);
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Unexpected error in DELETE document:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
