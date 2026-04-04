export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const ALLOWED_FIELDS = [
  'company_name', 'company_short_name', 'tagline',
  'logo_url', 'logo_dark_url', 'favicon_url', 'logo_icon_url',
  'primary_color', 'primary_color_dark', 'secondary_color', 'accent_color',
  'header_bg_color', 'sidebar_bg_color',
  'login_bg_gradient_from', 'login_bg_gradient_to',
  'font_family', 'heading_font_family',
  'support_email', 'support_phone', 'company_website',
  'company_address', 'company_city', 'company_state', 'company_zip',
  'pdf_header_text', 'pdf_footer_text', 'pdf_show_logo',
  'login_welcome_text', 'login_subtitle',
  'show_demo_accounts', 'show_billing_module', 'show_analytics_module',
  'show_inventory_module', 'show_nfc_module', 'show_customer_crm',
];

/**
 * GET /api/admin/branding
 * Public -- no auth required (used by login page before user is authenticated)
 * Fetches the active tenant branding row.
 * Supports optional ?tenant_id= query param for tenant-specific branding.
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.nextUrl.searchParams.get('tenant_id');

    let query = supabaseAdmin
      .from('tenant_branding')
      .select('*')
      .eq('is_active', true);

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query.limit(1).single();

    if (error || !data) {
      // Return defaults if no branding row exists
      return NextResponse.json(
        { success: true, data: null },
        {
          status: 200,
          headers: { 'Cache-Control': 'public, max-age=300' },
        }
      );
    }

    return NextResponse.json(
      { success: true, data },
      {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=300' },
      }
    );
  } catch (err) {
    console.error('Branding GET error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch branding' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/branding
 * Super admin only -- update the active branding row.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (!auth.authorized) return auth.response;

  try {
    const body = await request.json();

    // Filter to only allowed fields
    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields provided' },
        { status: 400 }
      );
    }

    updates.updated_at = new Date().toISOString();
    updates.updated_by = auth.userId;

    // Find the active row (scoped to tenant if available)
    let findQuery = supabaseAdmin
      .from('tenant_branding')
      .select('id')
      .eq('is_active', true);

    if (auth.tenantId) {
      findQuery = findQuery.eq('tenant_id', auth.tenantId);
    }

    const { data: existing } = await findQuery.limit(1).single();

    if (!existing) {
      return NextResponse.json(
        { error: 'No active branding configuration found' },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('tenant_branding')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('Branding PATCH error:', error);
      return NextResponse.json(
        { error: 'Failed to update branding' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Branding PATCH error:', err);
    return NextResponse.json(
      { error: 'Failed to update branding' },
      { status: 500 }
    );
  }
}
