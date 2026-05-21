export const dynamic = 'force-dynamic';

/**
 * GET /api/public/tenant-by-code?code=PATRIOT
 * No auth required — used by the company-login page before any session exists.
 * Uses direct Supabase REST fetch (no client lib) to avoid cold-start hangs.
 */

import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function supabaseFetch(path: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      signal: controller.signal,
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
    });
    clearTimeout(timer);
    return res;
  } catch (err: any) {
    clearTimeout(timer);
    throw err;
  }
}

export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.get('code') ?? '';
    const code = raw.trim().toUpperCase().replace(/\s+/g, '');

    if (!code || code.length < 2) {
      return NextResponse.json({ error: 'Company code is required' }, { status: 400 });
    }

    // Validate format: alphanumeric only, 2–20 chars.
    // Rejects SQL special chars, slashes, spaces — defense-in-depth beyond encodeURIComponent.
    if (!/^[A-Z0-9]{2,20}$/.test(code)) {
      return NextResponse.json({ error: 'Invalid company code format' }, { status: 400 });
    }

    // Direct REST call — 8 second hard cap, no client-lib cold-start overhead
    const tenantRes = await supabaseFetch(
      `tenants?company_code=eq.${encodeURIComponent(code)}&select=id,name,slug,company_code,logo_url,primary_color&limit=1`,
      8000
    );

    if (!tenantRes.ok) {
      console.error('[tenant-by-code] tenant query failed:', tenantRes.status);
      return NextResponse.json({ error: 'Company lookup failed. Please try again.' }, { status: 502 });
    }

    const tenants: any[] = await tenantRes.json();
    const tenant = tenants[0] ?? null;

    if (!tenant) {
      return NextResponse.json({ error: 'Company not found. Please check your company code.' }, { status: 404 });
    }

    // Branding — non-fatal, separate timeout
    let branding: any = null;
    try {
      const brandRes = await supabaseFetch(
        `tenant_branding?tenant_id=eq.${tenant.id}&is_active=eq.true&select=company_name,logo_url,primary_color,secondary_color,login_bg_gradient_from,login_bg_gradient_to,login_welcome_text,tagline&limit=1`,
        5000
      );
      if (brandRes.ok) {
        const rows: any[] = await brandRes.json();
        branding = rows[0] ?? null;
      }
    } catch {
      // branding is optional — proceed without it
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
    const isTimeout = err?.name === 'AbortError';
    console.error('[tenant-by-code]', isTimeout ? 'timed out' : err?.message);
    return NextResponse.json(
      { error: isTimeout ? 'Lookup timed out — please try again.' : 'Service unavailable. Please try again.' },
      { status: 503 }
    );
  }
}
