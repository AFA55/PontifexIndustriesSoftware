import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/admin/tenants/[id] — Get tenant details with users
 * PATCH /api/admin/tenants/[id] — Update tenant
 * DELETE /api/admin/tenants/[id] — Delete tenant (soft: sets status to 'cancelled')
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  try {
    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Get tenant users with profile info
    const { data: users } = await supabaseAdmin
      .from('tenant_users')
      .select('*, profiles:user_id(full_name, email, role, avatar_url)')
      .eq('tenant_id', id);

    return NextResponse.json({
      success: true,
      data: { ...tenant, users: users || [] },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  try {
    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields = [
      'name', 'domain', 'logo_url', 'primary_color', 'status', 'plan',
      'max_users', 'max_jobs_per_month', 'features', 'billing_email',
      'billing_address',
    ];

    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Audit
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        user_email: auth.userEmail,
        action: 'update_tenant',
        resource_type: 'tenant',
        resource_id: id,
        details: updates,
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id } = await params;

  try {
    // Soft delete — set status to cancelled
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        user_email: auth.userEmail,
        action: 'delete_tenant',
        resource_type: 'tenant',
        resource_id: id,
        details: { soft_delete: true },
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
