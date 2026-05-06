export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/equipment        — list (paginated, filterable)
 * POST /api/admin/equipment        — create (auto-generates asset_tag)
 *
 * Asset tag format: `{PREFIX}-{NNNN}` per-tenant. Prefix derives from
 * `tenants.company_code` with vowels removed (PATRIOT → PTRT). Number is
 * the next available 4-digit padded integer for that tenant.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const READ_ROLES = new Set(['shop_manager','admin','super_admin','operations_manager','supervisor','salesman']);
const WRITE_ROLES = new Set(['shop_manager','admin','super_admin','operations_manager']);

const VALID_KIND = ['powered','hand_tool','accessory','vehicle','trailer'];
const VALID_POWER_SOURCE = ['diesel','gas','hydraulic','electric','pneumatic'];
const VALID_STATUS = ['available','assigned','reserved','in_use','pending_putaway','maintenance','in_maintenance','out_of_service','retired'];

// ── helpers ─────────────────────────────────────────────────────────────────
function deriveAssetPrefix(companyCode: string | null | undefined): string {
  if (!companyCode) return 'CO';
  const upper = companyCode.toUpperCase().replace(/[^A-Z]/g, '');
  const noVowels = upper.replace(/[AEIOU]/g, '');
  if (noVowels.length >= 4) return noVowels.slice(0, 4);
  if (upper.length >= 4) return upper.slice(0, 4);
  return upper.padEnd(2, 'X').slice(0, 4) || 'CO';
}

async function nextAssetTag(tenantId: string): Promise<string> {
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('company_code')
    .eq('id', tenantId)
    .single();
  const prefix = deriveAssetPrefix(tenant?.company_code);
  const { data: existing } = await supabaseAdmin
    .from('equipment')
    .select('asset_tag')
    .eq('tenant_id', tenantId)
    .like('asset_tag', `${prefix}-%`);
  let max = 0;
  for (const row of existing ?? []) {
    const m = String(row.asset_tag || '').match(/-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  const next = max + 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

function sanitizeAliases(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((s) => s.trim());
  if (typeof raw === 'string') return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

// ── GET /api/admin/equipment ────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!READ_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind');
  const power_source = searchParams.get('power_source');
  const category = searchParams.get('category');
  const status = searchParams.get('status');
  const search = searchParams.get('search')?.trim() || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(200, Math.max(10, parseInt(searchParams.get('limit') || '50', 10)));
  const excludeVehicles = searchParams.get('exclude_vehicles') === 'true';

  let query = supabaseAdmin
    .from('equipment')
    .select('id, tenant_id, asset_tag, kind, category, name, short_name, unit_number, aliases, make, model, serial_number, power_source, requires_maintenance_schedule, status, current_custodian_id, current_job_order_id, reserved_for_job_id, reserved_until, location, hour_meter, photo_url, notes, purchase_date, purchase_cost, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (auth.role !== 'super_admin' && auth.tenantId) {
    query = query.eq('tenant_id', auth.tenantId);
  }
  if (kind) query = query.eq('kind', kind);
  if (excludeVehicles) query = query.neq('kind', 'vehicle');
  if (power_source) query = query.eq('power_source', power_source);
  if (category) query = query.eq('category', category);
  if (status) query = query.eq('status', status);
  if (search) {
    const s = search.replace(/[%]/g, '');
    query = query.or(`name.ilike.%${s}%,short_name.ilike.%${s}%,asset_tag.ilike.%${s}%,unit_number.ilike.%${s}%,model.ilike.%${s}%,serial_number.ilike.%${s}%`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error('equipment GET error:', error);
    return NextResponse.json({ error: 'Failed to load equipment', details: error.message }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    data: data ?? [],
    pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) || 1 },
  });
}

// ── POST /api/admin/equipment ───────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!WRITE_ROLES.has(auth.role)) return NextResponse.json({ error: 'Forbidden. Shop manager or admin required.' }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const name = String(body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const unit_number = body.unit_number ? String(body.unit_number).trim() : null;
  if (!unit_number) return NextResponse.json({ error: 'unit_number is required' }, { status: 400 });

  const kind = body.kind || null;
  if (kind && !VALID_KIND.includes(kind)) return NextResponse.json({ error: `Invalid kind. Allowed: ${VALID_KIND.join(', ')}` }, { status: 400 });

  const power_source = body.power_source || null;
  if (power_source && !VALID_POWER_SOURCE.includes(power_source)) return NextResponse.json({ error: `Invalid power_source. Allowed: ${VALID_POWER_SOURCE.join(', ')}` }, { status: 400 });

  const status = body.status && VALID_STATUS.includes(body.status) ? body.status : 'available';

  // Resolve tenant + auto asset_tag
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 });
  const asset_tag = body.asset_tag?.trim() || (await nextAssetTag(auth.tenantId));

  // Auto-seed aliases from short_name + asset_tag (so voice matchers find them).
  const userAliases = sanitizeAliases(body.aliases);
  const seeded = new Set<string>(userAliases);
  if (body.short_name) seeded.add(String(body.short_name).trim());
  if (asset_tag) seeded.add(asset_tag);
  if (body.short_name && unit_number) {
    seeded.add(`${String(body.short_name).trim()} #${unit_number}`);
    seeded.add(`${String(body.short_name).trim()} ${unit_number}`);
  }
  const aliases = Array.from(seeded).filter(Boolean);

  const insert: Record<string, unknown> = {
    tenant_id: auth.tenantId,
    name,
    short_name: body.short_name?.trim() || null,
    unit_number,
    aliases,
    asset_tag,
    kind,
    category: body.category?.trim() || null,
    make: body.make?.trim() || null,
    model: body.model?.trim() || null,
    serial_number: body.serial_number?.trim() || null,
    power_source,
    requires_maintenance_schedule: !!body.requires_maintenance_schedule,
    status,
    location: body.home_location?.trim() || body.location?.trim() || null,
    notes: body.notes?.trim() || null,
    purchase_date: body.purchase_date || null,
    purchase_cost: typeof body.purchase_cost === 'number' ? body.purchase_cost : null,
    photo_url: body.photo_url?.trim() || null,
    created_by: auth.userId,
    // Legacy columns the existing schema still requires:
    type: kind === 'powered' ? 'tool' : kind === 'hand_tool' ? 'tool' : kind === 'accessory' ? 'other' : kind === 'vehicle' ? 'vehicle' : 'other',
  };

  const { data, error } = await supabaseAdmin
    .from('equipment')
    .insert(insert)
    .select('*')
    .single();

  if (error) {
    console.error('equipment POST error:', error);
    return NextResponse.json({ error: 'Failed to create equipment', details: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}
