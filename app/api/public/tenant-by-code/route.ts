export const dynamic = 'force-dynamic';

/**
 * GET /api/public/tenant-by-code?code=PATRIOT
 * No auth required — used by the company-login page before any session exists.
 * Returns tenant_id + branding info so the login page can display the right brand.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// Race a thenable against a timeout so the serverless function never hangs
function withTimeout<T>(thenable: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(thenable),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')?.trim().toUpperCase();

    if (!code || code.length < 2) {
      return NextResponse.json({ error: 'Company code is required' }, { status: 400 });
    }

    // Tenant lookup — 8 second hard timeout so Vercel never gets a hung function
    const { data: tenant, error: tenantError } = await withTimeout(
      supabaseAdmin
        .from('tenants')
        .select('id, name, slug, company_code, logo_url, primary_color')
        .eq('company_code', code)
        .maybeSingle(),
      8000,
      'tenant lookup'
    );

    if (tenantError) {
      console.error('[tenant-by-code] DB error:', tenantError.message);
      return NextResponse.json({ error: 'Company lookup failed. Please try again.' }, { status: 500 });
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Company not found. Please check your company code.' }, { status: 404 });
    }

    // Branding lookup — separate timeout, non-fatal if it fails
    let branding = null;
    try {
      const { data: brandingData } = await withTimeout(
        supabaseAdmin
          .from('tenant_branding')
          .select('company_name, logo_url, primary_color, secondary_color, login_bg_gradient_from, login_bg_gradient_to, login_welcome_text, tagline')
          .eq('tenant_id', tenant.id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle(),
        5000,
        'branding lookup'
      );
      branding = brandingData || null;
    } catch (brandingErr) {
      // Branding is optional — log but don't fail the whole request
      console.warn('[tenant-by-code] Branding lookup failed (non-fatal):', String(brandingErr));
    }

    return NextResponse.json({
      success: true,
      data: {
        tenant_id: tenant.id,
        company_name: branding?.company_name || tenant.name,
        company_code: tenant.company_code,
        branding: branding || null,
      },
    });
  } catch (err: any) {
    console.error('[tenant-by-code] Unhandled error:', err?.message || String(err));
    return NextResponse.json(
      { error: 'Service temporarily unavailable. Please try again.' },
      { status: 503 }
    );
  }
}
