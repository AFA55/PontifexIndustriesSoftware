export const dynamic = 'force-dynamic';

/**
 * GET /api/public/tenant-by-code?code=PATRIOT
 * No auth required — used by the company-login page before any session exists.
 *
 * Uses the anon key + a SECURITY DEFINER RPC (`lookup_tenant_by_code`) so the
 * service role key is never exposed on a public endpoint.
 * Migration 20260521_public_tenant_lookup_fn created the RPC.
 */

import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Fetch from Supabase REST API with a hard timeout covering both
 * the network round-trip and the response body read.
 */
async function supabaseFetch<T = any>(path: string, options: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) {
      clearTimeout(timer);
      throw Object.assign(new Error(`HTTP ${res.status}`), { httpStatus: res.status });
    }
    const data = await res.json();
    clearTimeout(timer);
    return data as T;
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
    if (!/^[A-Z0-9]{2,20}$/.test(code)) {
      return NextResponse.json({ error: 'Invalid company code format' }, { status: 400 });
    }

    // Call SECURITY DEFINER RPC with anon key — returns only {id, name, company_code}
    // RLS is bypassed safely inside the function which only exposes non-sensitive fields.
    let tenant: { id: string; name: string; company_code: string } | null = null;
    try {
      tenant = await supabaseFetch<{ id: string; name: string; company_code: string }>(
        'rpc/lookup_tenant_by_code',
        {
          method: 'POST',
          body: JSON.stringify({ p_code: code }),
        },
        8000
      );
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError';
      console.error('[tenant-by-code] tenant RPC failed:', err?.message);
      return NextResponse.json(
        { error: isAbort ? 'Lookup timed out — please try again.' : 'Company lookup failed. Please try again.' },
        { status: isAbort ? 503 : 502 }
      );
    }

    if (!tenant || !tenant.id) {
      return NextResponse.json({ error: 'Company not found. Please check your company code.' }, { status: 404 });
    }

    // Branding — non-fatal, separate 5s timeout, anon key subject to RLS
    let branding: any = null;
    try {
      const rows = await supabaseFetch<any[]>(
        `tenant_branding?tenant_id=eq.${tenant.id}&is_active=eq.true&select=company_name,logo_url,primary_color,secondary_color,login_bg_gradient_from,login_bg_gradient_to,login_welcome_text,tagline&limit=1`,
        { method: 'GET' },
        5000
      );
      branding = Array.isArray(rows) ? (rows[0] ?? null) : null;
    } catch {
      // branding is optional — login page works without it
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
    console.error('[tenant-by-code] unexpected error:', err?.message);
    return NextResponse.json(
      { error: 'Service unavailable. Please try again.' },
      { status: 503 }
    );
  }
}
