export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/lookup-company?code=PATRIOT
 * Public endpoint for company code lookup -- used on login page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

function withTimeout<T>(thenable: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(thenable),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Query timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')?.trim().toUpperCase();

    if (!code || code.length < 2) {
      return NextResponse.json({ error: 'Company code required' }, { status: 400 });
    }

    const { data: tenant, error: tenantError } = await withTimeout(
      supabaseAdmin
        .from('tenants')
        .select('id, name, slug, company_code, logo_url, primary_color, status')
        .eq('company_code', code)
        .eq('status', 'active')
        .maybeSingle(),
      8000
    );

    if (tenantError) {
      console.error('[lookup-company] DB error:', tenantError.message);
      return NextResponse.json({ error: 'Company lookup failed' }, { status: 500 });
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    let branding = null;
    try {
      const { data } = await withTimeout(
        supabaseAdmin
          .from('tenant_branding')
          .select('company_name, logo_url, primary_color, secondary_color, login_bg_gradient_from, login_bg_gradient_to, login_welcome_text, tagline')
          .eq('tenant_id', tenant.id)
          .eq('is_active', true)
          .maybeSingle(),
        5000
      );
      branding = data || null;
    } catch {
      // non-fatal
    }

    return NextResponse.json({ success: true, tenant, branding });
  } catch (err: any) {
    console.error('[lookup-company] Unhandled error:', err?.message || String(err));
    return NextResponse.json({ error: 'Service temporarily unavailable. Please try again.' }, { status: 503 });
  }
}
