/**
 * API Route: GET/POST /api/admin/profiles
 * List all operator/helper profiles and create new accounts.
 * Access: admin, super_admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit';
import { logApiError } from '@/lib/error-logger';
import { getTenantId } from '@/lib/get-tenant-id';

// GET: List all operator/helper profiles (simple fields)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    let query = supabaseAdmin
      .from('profiles')
      .select('id, full_name, nickname, email, phone, phone_number, date_of_birth, hire_date, next_review_date, role, active, profile_picture_url, created_at')
      .in('role', ['operator', 'apprentice'])
      .order('full_name');

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data: profiles, error } = await query;

    if (error) {
      console.error('Error fetching profiles:', error);
      return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: profiles || [] });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/profiles:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Create a new operator/helper account
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { fullName, email, role, dateOfBirth, hireDate, nextReviewDate, nickname } = body;

    if (!fullName || !email || !role) {
      return NextResponse.json(
        { error: 'Missing required fields: fullName, email, role' },
        { status: 400 }
      );
    }

    if (!['operator', 'apprentice'].includes(role)) {
      return NextResponse.json(
        { error: 'Role must be operator or apprentice' },
        { status: 400 }
      );
    }

    // Create auth user
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: 'Patriot2026!', // Default password — user should change on first login
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      if (authError.message?.includes('already been registered')) {
        return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create user account' }, { status: 500 });
    }

    const tenantId = await getTenantId(auth.userId);

    // Create profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authUser.user.id,
        email,
        full_name: fullName,
        role,
        active: true,
        date_of_birth: dateOfBirth || null,
        hire_date: hireDate || null,
        next_review_date: nextReviewDate || null,
        nickname: nickname || null,
        tenant_id: tenantId || null,
      })
      .select()
      .single();

    if (profileError) {
      console.error('Error creating profile:', profileError);
      // Clean up auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
    }

    // Audit log: account creation
    logAuditEvent({
      userId: auth.userId,
      userEmail: auth.userEmail,
      userRole: auth.role,
      action: 'create',
      resourceType: 'profile',
      resourceId: profile?.id,
      details: { createdEmail: email, createdRole: role, fullName },
      request,
    });

    return NextResponse.json(
      { success: true, message: 'Account created', data: profile },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/admin/profiles:', error);
    logApiError({ endpoint: '/api/admin/profiles', method: 'POST', error: error as Error, request });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
