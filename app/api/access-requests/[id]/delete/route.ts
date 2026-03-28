/**
 * API Route: DELETE /api/access-requests/[id]/delete
 * Permanently deletes an access request from the database
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Security: only admins can delete access requests
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;
    const tenantId = await getTenantId(auth.userId);

    const { id: requestId } = await params;

    if (!requestId) {
      return NextResponse.json(
        { error: 'Request ID is required' },
        { status: 400 }
      );
    }

    console.log(`🗑️ Deleting access request: ${requestId}`);

    // First, get the access request to find the associated email (tenant-scoped)
    let delFetch = supabaseAdmin.from('access_requests').select('email, status').eq('id', requestId);
    if (tenantId) delFetch = delFetch.eq('tenant_id', tenantId);
    const { data: accessRequest, error: fetchError } = await delFetch.single();

    if (fetchError) {
      console.error('❌ Error fetching access request:', fetchError);
      return NextResponse.json(
        { error: 'Access request not found' },
        { status: 404 }
      );
    }

    // If the request was approved, we need to delete the user from profiles and auth
    if (accessRequest.status === 'approved') {
      console.log(`🧹 Request was approved, cleaning up user: ${accessRequest.email}`);

      // Delete from profiles table
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('email', accessRequest.email.toLowerCase());

      if (profileError) {
        console.warn('⚠️ Error deleting profile:', profileError);
        // Continue even if profile deletion fails
      } else {
        console.log('✅ Profile deleted successfully');
      }

      // Delete from Supabase Auth
      try {
        // Get the user ID from auth by email
        const { data: authUsers, error: authListError } = await supabaseAdmin.auth.admin.listUsers();

        if (!authListError && authUsers?.users) {
          const userToDelete = authUsers.users.find(
            u => u.email?.toLowerCase() === accessRequest.email.toLowerCase()
          );

          if (userToDelete) {
            const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(
              userToDelete.id
            );

            if (authDeleteError) {
              console.warn('⚠️ Error deleting auth user:', authDeleteError);
            } else {
              console.log('✅ Auth user deleted successfully');
            }
          }
        }
      } catch (authError) {
        console.warn('⚠️ Error during auth cleanup:', authError);
        // Continue even if auth deletion fails
      }
    }

    // Delete the access request from the database
    const { error: deleteError } = await supabaseAdmin
      .from('access_requests')
      .delete()
      .eq('id', requestId);

    if (deleteError) {
      console.error('❌ Error deleting request:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete request' },
        { status: 500 }
      );
    }

    console.log('✅ Access request and associated data deleted successfully');

    return NextResponse.json(
      {
        success: true,
        message: 'Access request deleted successfully',
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('💥 Unexpected error deleting request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
