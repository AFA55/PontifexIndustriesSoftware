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

/** Race a PromiseLike against a hard deadline (ms). */
function withTimeout<T>(thenable: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(thenable),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('query_timeout')), ms)
    ),
  ]);
}

/**
 * GET /api/admin/branding
 * Public -- no auth required (used by login page before user is authenticated)
 * Fetches the active tenant branding row.
 * Supports optional ?tenant_id= query param for tenant-specific branding.
 *
 * 20s timeout: branding is non-critical so we fail-safe with data: null
 * rather than hanging until Vercel's maxDuration kills the function.
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

    const { data, error } = await withTimeout(query.limit(1).maybeSingle(), 20_000);

    if (error || !data) {
      // Return defaults if no branding row exists or on any error
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
  } catch (err: any) {
    const isTimeout = err?.message === 'query_timeout';
    if (isTimeout) {
      console.error('[branding] GET timed out after 20s — returning null branding');
      // Non-fatal: login page works without branding
      return NextResponse.json(
        { success: true, data: null },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }
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
