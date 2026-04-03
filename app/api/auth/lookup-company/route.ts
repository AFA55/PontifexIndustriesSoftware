export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/auth/lookup-company?code=PATRIOT
 * Public endpoint for company code lookup -- used on login page.
 * Returns tenant info and branding for the given company code.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.toUpperCase();

  if (!code || code.length < 2) {
    return NextResponse.json({ error: 'Company code required' }, { status: 400 });
  }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, name, slug, company_code, logo_url, primary_color, status')
    .eq('company_code', code)
    .eq('status', 'active')
    .single();

  if (!tenant) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }

  // Also fetch branding for this tenant
  const { data: branding } = await supabaseAdmin
    .from('tenant_branding')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('is_active', true)
    .single();

  return NextResponse.json({
    success: true,
    tenant,
    branding: branding || null,
  });
}
