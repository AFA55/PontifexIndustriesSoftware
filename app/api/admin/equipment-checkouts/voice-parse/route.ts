export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/equipment-checkouts/voice-parse
 *
 * Resolves a spoken phrase into { equipment, truck, operator } matches with
 * confidence scores. Used by the Inventory Control voice mic flow to
 * pre-fill the checkout form.
 *
 * Body: { phrase: string }
 *
 * Returns:
 *   {
 *     normalized: string,
 *     equipment: Match | null,
 *     truck: Match | null,
 *     operator: Match | null,
 *     alternatives: { equipment: Match[], truck: Match[], operator: Match[] }
 *   }
 *
 * Match shape: { id, display, score: 0-1, exact_match: boolean, source: '...' }
 *
 * Confidence tiers (consumed by client):
 *   ≥ 0.85 → green, auto-fill
 *   0.60-0.84 → amber, show top-3 picker
 *   < 0.60 → red, free-text fallback
 *
 * Resolution algorithm per phrase segment:
 *   1. voice_recognition_corrections cache hit (exact normalized_phrase) → 0.98
 *   2. equipment.aliases jsonb contains (case-insensitive) → 1.0 (alias exact)
 *   3. asset_tag exact (lowercase) → 0.95
 *   4. "{short_name} #{unit_number}" or "{short_name} {unit_number}" exact → 0.90
 *   5. short_name + unit_number BOTH match in phrase → 0.85
 *   6. Postgres trigram similarity on name + short_name → variable (0-1)
 *
 * Phrase segmentation (split before scoring):
 *   - "to truck N" / "to F-450 #5" / "into truck X" → segment after "to" / "into" is truck
 *   - "going with X" / "with X" → segment after is operator
 *   - rest is equipment (default)
 *
 * Fall-through: if no segmentation keyword found, treat entire phrase as
 * equipment. User picks truck/operator manually.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const VOICE_ROLES = new Set(['shop_manager','admin','super_admin','operations_manager','supervisor']);

interface Match {
  id: string;
  display: string;
  score: number;
  exact_match: boolean;
  source: 'cache' | 'alias' | 'asset_tag' | 'short_name_unit' | 'partial' | 'trigram';
}

interface ParsedSegments {
  equipment_phrase: string;
  truck_phrase: string | null;
  operator_phrase: string | null;
}

// ── Phrase normalization + segmentation ─────────────────────────────────────

function normalize(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[^\w\s#-]/g, ' ')         // strip punctuation except # and -
    .replace(/\bnumber\b/g, '#')         // "number 5" → "# 5"
    .replace(/\bno\.\s*/g, '#')          // "no. 5" → "# 5"
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSegments(normalizedPhrase: string): ParsedSegments {
  // Operator delimiter: "going with X" or "with X" (when "with" appears after a noun)
  const operatorMatch = normalizedPhrase.match(/\b(?:going with|with operator|with)\s+(.+?)$/);
  let remaining = normalizedPhrase;
  let operator_phrase: string | null = null;
  if (operatorMatch) {
    operator_phrase = operatorMatch[1].trim();
    remaining = remaining.slice(0, operatorMatch.index).trim();
  }

  // Truck delimiter: "to truck N", "to F-450", "into X"
  const truckMatch = remaining.match(/\b(?:to truck|to|into)\s+(.+?)$/);
  let truck_phrase: string | null = null;
  if (truckMatch) {
    let candidate = truckMatch[1].trim();
    // Strip leading "truck" if "to truck N" matched the longer form
    candidate = candidate.replace(/^truck\s+/, '');
    truck_phrase = candidate;
    remaining = remaining.slice(0, truckMatch.index).trim();
  }

  return { equipment_phrase: remaining, truck_phrase, operator_phrase };
}

// ── Scoring helpers ─────────────────────────────────────────────────────────

function fmtEquipmentDisplay(eq: any): string {
  if (eq.short_name && eq.unit_number) return `${eq.short_name} #${eq.unit_number}`;
  return eq.name;
}
function fmtPersonDisplay(p: any): string {
  return p.full_name || p.email || '—';
}

/**
 * Score a phrase against a single equipment row using all available signals.
 * Returns the highest-scoring source.
 */
function scoreEquipment(phrase: string, eq: any): { score: number; source: Match['source'] } {
  if (!phrase) return { score: 0, source: 'trigram' };
  const p = normalize(phrase);

  // 1. Alias exact (case-insensitive contains)
  const aliases: string[] = Array.isArray(eq.aliases) ? eq.aliases.map((s: string) => normalize(String(s))) : [];
  if (aliases.some(a => a === p || a.includes(p) || p.includes(a))) {
    return { score: 1.0, source: 'alias' };
  }

  // 2. Asset tag exact
  if (eq.asset_tag && normalize(eq.asset_tag) === p) {
    return { score: 0.95, source: 'asset_tag' };
  }

  // 3. short_name + unit_number combo
  if (eq.short_name && eq.unit_number) {
    const variants = [
      `${eq.short_name} #${eq.unit_number}`,
      `${eq.short_name} ${eq.unit_number}`,
      `${eq.short_name}#${eq.unit_number}`,
    ].map(normalize);
    if (variants.some(v => v === p || p.includes(v) || v.includes(p))) {
      return { score: 0.9, source: 'short_name_unit' };
    }
    // Both short_name + unit_number tokens present in phrase (any order)
    const sn = normalize(eq.short_name);
    const un = normalize(eq.unit_number);
    if (p.includes(sn) && p.includes(un)) {
      return { score: 0.85, source: 'short_name_unit' };
    }
  }

  // 4. Partial — short_name in phrase OR phrase in short_name
  if (eq.short_name) {
    const sn = normalize(eq.short_name);
    if (p === sn) return { score: 0.85, source: 'partial' };
    if (p.includes(sn) || sn.includes(p)) return { score: 0.7, source: 'partial' };
  }
  // Or partial against name
  const name = normalize(eq.name || '');
  if (name && (p === name || (p.length >= 3 && (name.includes(p) || p.includes(name))))) {
    return { score: 0.65, source: 'partial' };
  }

  return { score: 0, source: 'trigram' };
}

function scorePerson(phrase: string, person: any): number {
  if (!phrase) return 0;
  const p = normalize(phrase);
  const fullName = normalize(person.full_name || '');
  if (!fullName) return 0;
  if (fullName === p) return 1.0;
  // First-name match (e.g. "carlos" matches "Carlos Santos")
  const firstName = fullName.split(' ')[0];
  if (firstName === p) return 0.92;
  if (fullName.includes(p) || p.includes(fullName)) return 0.85;
  if (firstName.includes(p) || p.includes(firstName)) return 0.7;
  return 0;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;
  if (!VOICE_ROLES.has(auth.role)) {
    return NextResponse.json({ error: 'Forbidden. Voice checkout requires shop_manager / supervisor / admin.' }, { status: 403 });
  }
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant required' }, { status: 400 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const phrase = String(body.phrase || '').trim();
  if (!phrase) return NextResponse.json({ error: 'phrase is required' }, { status: 400 });

  const normalized = normalize(phrase);
  const segments = splitSegments(normalized);

  // Cache check — has this exact phrase been resolved before?
  const { data: cacheHits } = await supabaseAdmin
    .from('voice_recognition_corrections')
    .select('resolved_kind, resolved_id, confidence')
    .eq('tenant_id', auth.tenantId)
    .eq('normalized_phrase', normalized)
    .order('created_at', { ascending: false })
    .limit(20);

  // Fetch all candidate equipment + trucks + operators in tenant. Limit to
  // active so retired/out-of-service don't pollute matches.
  const { data: allEquipment } = await supabaseAdmin
    .from('equipment')
    .select('id, name, short_name, unit_number, aliases, asset_tag, kind, status')
    .eq('tenant_id', auth.tenantId)
    .not('status', 'in', '("retired","out_of_service")')
    .limit(500);

  const { data: allOperators } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('tenant_id', auth.tenantId)
    .in('role', ['operator', 'apprentice'])
    .eq('active', true);

  const equipmentList = (allEquipment ?? []).filter((e: any) => e.kind !== 'vehicle');
  const truckList = (allEquipment ?? []).filter((e: any) => e.kind === 'vehicle');
  const operatorList = allOperators ?? [];

  // Score equipment against the equipment_phrase (post-segmentation)
  const equipmentMatches: Match[] = equipmentList
    .map((eq: any) => {
      const { score, source } = scoreEquipment(segments.equipment_phrase || normalized, eq);
      return { id: eq.id, display: fmtEquipmentDisplay(eq), score, exact_match: score >= 0.95, source };
    })
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score);

  // Score trucks against the truck_phrase. Fall back to equipment_phrase if no
  // truck delimiter was used (sometimes "FS5000 number 5 to truck 3" has truck
  // segment "3"; other times user just says "FS5000 to truck 3 carlos" and
  // segmentation picks up the whole tail).
  const truckMatches: Match[] = segments.truck_phrase
    ? truckList
        .map((t: any) => {
          const { score, source } = scoreEquipment(segments.truck_phrase!, t);
          return { id: t.id, display: fmtEquipmentDisplay(t), score, exact_match: score >= 0.95, source };
        })
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score)
    : [];

  // Score operators against operator_phrase
  const operatorMatches: Match[] = segments.operator_phrase
    ? operatorList
        .map((p: any) => {
          const score = scorePerson(segments.operator_phrase!, p);
          return { id: p.id, display: fmtPersonDisplay(p), score, exact_match: score >= 0.95, source: 'partial' as const };
        })
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score)
    : [];

  // Apply cache boost: if a prior correction exists for this phrase + entity,
  // bump that entity's score so the learning loop pays off.
  for (const hit of cacheHits ?? []) {
    const list = hit.resolved_kind === 'equipment' ? equipmentMatches
      : hit.resolved_kind === 'truck' ? truckMatches
      : hit.resolved_kind === 'operator' ? operatorMatches
      : null;
    if (!list) continue;
    const m = list.find(x => x.id === hit.resolved_id);
    if (m) {
      m.score = Math.max(m.score, 0.98);
      m.source = 'cache';
    }
  }

  // Re-sort after cache boost
  equipmentMatches.sort((a, b) => b.score - a.score);
  truckMatches.sort((a, b) => b.score - a.score);
  operatorMatches.sort((a, b) => b.score - a.score);

  return NextResponse.json({
    success: true,
    phrase,
    normalized,
    segments,
    equipment: equipmentMatches[0] || null,
    truck: truckMatches[0] || null,
    operator: operatorMatches[0] || null,
    alternatives: {
      equipment: equipmentMatches.slice(0, 5),
      truck: truckMatches.slice(0, 5),
      operator: operatorMatches.slice(0, 5),
    },
  });
}
