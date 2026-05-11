export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/equipment/[id]/alias-suggestions
 *
 * After voice checkouts persist corrections (see POST /equipment-checkouts
 * `voice_corrections`), spoken phrases accumulate per equipment row. When
 * a phrase has been used 3+ times to refer to the same equipment AND it
 * isn't already in the equipment's aliases array, surface it as a suggested
 * alias to permanently save.
 *
 * Threshold: 3 (configurable below). Tuned low for trial — bigger fleets
 * will want to bump it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const SUGGESTION_THRESHOLD = 3;
const READ_ROLES = new Set(['shop_manager','admin','super_admin','operations_manager','supervisor']);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!READ_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  // Verify equipment is in tenant + grab existing aliases.
  let lookup = supabaseAdmin.from('equipment').select('id, tenant_id, aliases').eq('id', id);
  if (auth.role !== 'super_admin' && auth.tenantId) lookup = lookup.eq('tenant_id', auth.tenantId);
  const { data: eq, error: eqErr } = await lookup.single();
  if (eqErr || !eq) return NextResponse.json({ error: 'Equipment not found' }, { status: 404 });

  const existingAliases: string[] = Array.isArray(eq.aliases) ? eq.aliases.map((s: any) => String(s).toLowerCase()) : [];

  // Group corrections by normalized_phrase for this equipment.
  // RLS already scopes us to the tenant, so no extra tenant filter needed.
  const { data: corrections, error: cErr } = await supabaseAdmin
    .from('voice_recognition_corrections')
    .select('normalized_phrase, spoken_text')
    .eq('resolved_kind', 'equipment')
    .eq('resolved_id', id);
  if (cErr) {
    console.error('alias-suggestions query error:', cErr);
    return NextResponse.json({ error: 'Failed to query corrections' }, { status: 500 });
  }

  const counts = new Map<string, { count: number; example_spoken: string }>();
  for (const row of corrections ?? []) {
    const norm = String(row.normalized_phrase || '').trim();
    if (!norm) continue;
    // Skip phrases that are already aliases.
    if (existingAliases.includes(norm)) continue;
    const cur = counts.get(norm);
    if (cur) cur.count += 1;
    else counts.set(norm, { count: 1, example_spoken: row.spoken_text });
  }

  const suggestions = Array.from(counts.entries())
    .filter(([, v]) => v.count >= SUGGESTION_THRESHOLD)
    .map(([normalized, v]) => ({ normalized_phrase: normalized, count: v.count, example_spoken: v.example_spoken }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    success: true,
    suggestions,
    threshold: SUGGESTION_THRESHOLD,
  });
}
