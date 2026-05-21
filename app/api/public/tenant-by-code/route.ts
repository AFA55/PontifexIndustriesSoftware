export const dynamic = 'force-dynamic';

/**
 * GET /api/public/tenant-by-code?code=PATRIOT
 * No auth required — used by the company-login page before any session exists.
 * Returns tenant_id + branding info so the login page can display the right brand.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: 'Company code is required' }, { status: 400 });
  }

  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, company_code, logo_url, primary_color')
    .eq('company_code', code)
    .maybeSingle();

  if (error || !tenant) {
    return NextResponse.json({ error: 'Company not found. Please check your company code.' }, { status: 404 });
  }

  // Also fetch tenant branding for the login page
  const { data: branding } = await supabaseAdmin
    .from('tenant_branding')
    .select('company_name, logo_url, primary_color, secondary_color, login_bg_gradient_from, login_bg_gradient_to, login_welcome_text, tagline')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    success: true,
    data: {
      tenant_id: tenant.id,
      company_name: branding?.company_name || tenant.name,
      company_code: tenant.company_code,
      branding: branding || null,
    },
  });
}
