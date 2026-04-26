export const dynamic = 'force-dynamic';

/**
 * Admin endpoint for ops managers to view and regenerate the daily shop code.
 *
 * GET  /api/admin/daily-code  — fetch today's PIN (creates none if absent, returns null)
 * POST /api/admin/daily-code  — set or regenerate today's code (upserts on tenant_id+valid_date)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

// GET: fetch today's PIN code
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const tenantId = await getTenantId(auth.userId);

  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabaseAdmin
    .from('shop_daily_pins')
    .select('id, pin_code, valid_date, created_by, created_at, expires_at')
    .eq('tenant_id', tenantId)
    .eq('valid_date', today)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Failed to fetch code' }, { status: 500 });

  return NextResponse.json({ success: true, data: data || null });
}

// POST: set or regenerate today's code
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;
  const tenantId = await getTenantId(auth.userId);

  const body = await request.json().catch(() => ({}));
  // Allow caller to provide a code, or generate a random 6-digit one
  const pinCode = body.pin_code || String(Math.floor(100000 + Math.random() * 900000));

  if (!/^\d{4,8}$/.test(pinCode)) {
    return NextResponse.json({ error: 'Code must be 4-8 digits' }, { status: 400 });
  }

  const today = new Date().toISOString().split('T')[0];
  const expiresAt = new Date();
  expiresAt.setHours(23, 59, 59, 999); // expires end of today

  // Upsert — replace existing code for today
  const { data, error } = await supabaseAdmin
    .from('shop_daily_pins')
    .upsert(
      {
        tenant_id: tenantId,
        pin_code: pinCode,
        valid_date: today,
        created_by: auth.userId,
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'tenant_id,valid_date' }
    )
    .select('id, pin_code, valid_date, expires_at')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to set code' }, { status: 500 });

  return NextResponse.json({ success: true, data });
}
