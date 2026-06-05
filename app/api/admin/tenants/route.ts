export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTableNotFoundError } from '@/lib/api-auth';
import {
  COMPANY_CODE_RE,
  SLUG_RE,
  PROTECTED_COMPANY_CODES,
  PROTECTED_SLUGS,
  createTenantRow,
  seedBranding,
  createAdminUser,
} from '@/lib/tenant-onboarding';

/** Roles a tenant's first admin may be created with via this route. */
const ALLOWED_FIRST_ADMIN_ROLES = [
  'admin', 'operations_manager', 'salesman', 'shop_manager',
  'inventory_manager', 'operator', 'apprentice',
];

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

    const {
      name,
      slug,
      domain,
      plan,
      max_users,
      max_jobs_per_month,
      billing_email,
      primary_color,
      logo_url,
      features,
      // Login needs a company_code (login = company_code + email + password).
      company_code,
      // Optional one-click first-admin onboarding.
      admin_email,
      admin_name,
      admin_role,
      admin_temp_password,
    } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
    }

    // Validate slug format
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json({ error: 'Slug must be lowercase letters, numbers, and hyphens only' }, { status: 400 });
    }

    // company_code is REQUIRED — without it the tenant can't be logged into.
    if (!company_code || typeof company_code !== 'string') {
      return NextResponse.json({ error: 'company_code is required' }, { status: 400 });
    }
    if (!COMPANY_CODE_RE.test(company_code)) {
      return NextResponse.json(
        { error: 'company_code must be 3–20 chars of A–Z, 0–9, or underscore (^[A-Z0-9_]{3,20}$)' },
        { status: 400 }
      );
    }

    // Refuse protected company codes / slugs (never recreate Patriot).
    if (PROTECTED_COMPANY_CODES.includes(company_code)) {
      return NextResponse.json({ error: `company_code "${company_code}" is reserved` }, { status: 409 });
    }
    if (PROTECTED_SLUGS.includes(slug)) {
      return NextResponse.json({ error: `slug "${slug}" is reserved` }, { status: 409 });
    }

    // Validate optional first-admin block up front.
    let createFirstAdmin = false;
    if (admin_email || admin_name) {
      if (!admin_email || !admin_name) {
        return NextResponse.json(
          { error: 'admin_email and admin_name are both required to create a first admin' },
          { status: 400 }
        );
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(admin_email))) {
        return NextResponse.json({ error: 'admin_email is not a valid email' }, { status: 400 });
      }
      if (admin_role && !ALLOWED_FIRST_ADMIN_ROLES.includes(admin_role)) {
        // super_admin is never granted here — that stays in grant-super-admin.
        return NextResponse.json({ error: `Invalid admin_role "${admin_role}"` }, { status: 400 });
      }
      createFirstAdmin = true;
    }

    // Optionally resolve an existing owner by email (links as tenant owner_id).
    let ownerId: string | null = null;
    if (admin_email) {
      const { data: existingUser } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', String(admin_email).trim().toLowerCase())
        .maybeSingle();
      if (existingUser) ownerId = existingUser.id;
    }

    // Create the tenant row via the shared onboarding logic (handles
    // company_code/slug uniqueness + protected-tenant defense + features map).
    let tenant: { id: string; company_code: string; slug: string; name: string };
    try {
      tenant = await createTenantRow({
        name,
        slug,
        companyCode: company_code,
        domain: domain || null,
        plan: plan || 'professional',
        maxUsers: max_users || 50,
        maxJobsPerMonth: max_jobs_per_month || 500,
        primaryColor: primary_color || undefined,
        logoUrl: logo_url || null,
        billingEmail: billing_email || admin_email || null,
        ownerId,
        enabledModules: features && typeof features === 'object' ? features : undefined,
      });
    } catch (createErr: any) {
      const msg = String(createErr?.message || createErr);
      // Map "already exists" / "reserved" to 409, everything else 500.
      if (/already exists|reserved|PROTECTED/i.test(msg)) {
        return NextResponse.json({ error: msg }, { status: 409 });
      }
      throw createErr;
    }

    // Seed branding so the login page is white-labeled day one (non-fatal).
    await seedBranding(tenant.id, { name, primaryColor: primary_color || undefined });

    // Optionally create + invite the first admin user IN this new tenant.
    let firstAdmin: { userId: string; invited: boolean } | null = null;
    if (createFirstAdmin) {
      try {
        firstAdmin = await createAdminUser(
          tenant.id,
          {
            email: String(admin_email),
            fullName: String(admin_name),
            tempPassword: admin_temp_password || undefined,
            role: admin_role || 'admin',
          },
          { tenantUserRole: 'owner', invitedBy: auth.userId }
        );
      } catch (userErr: any) {
        // Tenant is created; surface the admin-creation failure without rolling back.
        return NextResponse.json(
          {
            success: true,
            data: tenant,
            warning: `Tenant created but first admin failed: ${userErr?.message || userErr}`,
          },
          { status: 201 }
        );
      }
    }

    // Audit log — uses the REAL audit_logs columns (user_id / resource_* / details).
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        user_email: auth.userEmail,
        action: 'create_tenant',
        resource_type: 'tenant',
        resource_id: tenant.id,
        tenant_id: tenant.id,
        details: {
          name,
          slug,
          company_code,
          plan: plan || 'professional',
          first_admin: firstAdmin ? { user_id: firstAdmin.userId, invited: firstAdmin.invited, role: admin_role || 'admin' } : null,
        },
      })
    ).catch(() => {});

    return NextResponse.json(
      { success: true, data: tenant, first_admin: firstAdmin },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
