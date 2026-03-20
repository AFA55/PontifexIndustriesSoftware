import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';

/**
 * GET /api/admin/tenants — List all tenants (super_admin only)
 * POST /api/admin/tenants — Create a new tenant (super_admin only)
 */
export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('*, tenant_users(count)')
      .order('created_at', { ascending: false });

    if (error) {
      if (isTableNotFoundError(error)) {
        return NextResponse.json({
          success: true,
          data: [],
          message: 'Tenants table not yet created. Run migration first.',
        });
      }
      throw error;
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();

    const { name, slug, domain, plan, max_users, max_jobs_per_month, owner_email, billing_email } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return NextResponse.json({ error: 'Slug must be lowercase letters, numbers, and hyphens only' }, { status: 400 });
    }

    // Check slug uniqueness
    const { data: existing } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'A tenant with this slug already exists' }, { status: 409 });
    }

    // If owner_email provided, look up or create the owner user
    let ownerId = null;
    if (owner_email) {
      const { data: existingUser } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', owner_email)
        .single();

      if (existingUser) {
        ownerId = existingUser.id;
      }
      // If user doesn't exist, they'll be invited later
    }

    const tenantData: any = {
      name,
      slug,
      domain: domain || null,
      plan: plan || 'professional',
      max_users: max_users || 50,
      max_jobs_per_month: max_jobs_per_month || 500,
      owner_id: ownerId,
      billing_email: billing_email || owner_email || null,
      status: 'active',
    };

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .insert(tenantData)
      .select()
      .single();

    if (error) throw error;

    // If owner exists, add them as tenant user
    if (ownerId && tenant) {
      await supabaseAdmin.from('tenant_users').insert({
        tenant_id: tenant.id,
        user_id: ownerId,
        role: 'owner',
        invited_by: auth.userId,
      });
    }

    // Audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        user_email: auth.userEmail,
        action: 'create_tenant',
        resource_type: 'tenant',
        resource_id: tenant?.id,
        details: { name, slug, plan: tenantData.plan },
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data: tenant }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
