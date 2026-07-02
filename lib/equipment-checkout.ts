import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * checkoutEquipmentItem() — the single reusable "check this item out to an
 * operator/truck" primitive.
 *
 * This is intentionally transport-agnostic: it takes plain data + an actor
 * context and returns a typed result object (never throws for expected
 * business-rule failures, never touches NextRequest/NextResponse). That's
 * what lets BOTH the manual tap-to-checkout UI (via
 * POST /api/admin/equipment-checkouts, see app/api/admin/equipment-checkouts/route.ts)
 * AND the voice-checkout builder call the exact same code path and get the
 * exact same invariants (tenant scoping, truck-derives-operator, status
 * flips, rollback-on-failure) — no duplicated business logic between the two
 * entry points.
 *
 * Truck-as-custodian model: pass EITHER `truckEquipmentId` (operator is
 * derived from the truck's current driver, unless the truck has no driver —
 * in which case `custodianId` is required) OR `custodianId` directly for a
 * handheld checkout straight to a person.
 *
 * Voice-checkout integration contract:
 *   import { checkoutEquipmentItem } from '@/lib/equipment-checkout';
 *   const result = await checkoutEquipmentItem({
 *     tenantId, actorUserId,
 *     equipmentId, truckEquipmentId, custodianId, jobOrderId,
 *     hourMeterOut, notes, voiceNoteUrl, voiceCorrections,
 *   });
 *   if (!result.ok) { // surface result.error / result.status to the user }
 *
 * Blade-specific fields (bladeSerialNumber, bladeSize, bladeSpec, photoUrl)
 * are optional and only meaningful when the equipment's kind/category is
 * 'blade' — see BladeCheckoutDetails below. They're stored on
 * equipment_checkouts as a jsonb blob (blade_details) so this function stays
 * the ONE checkout path regardless of equipment type.
 */

export interface VoiceCorrectionInput {
  phrase: string;
  normalized: string;
  kind: 'equipment' | 'truck' | 'operator';
  resolved_id: string;
  confidence: number;
  was_corrected?: boolean;
}

export interface BladeCheckoutDetails {
  serial_number?: string | null;
  size?: string | null;
  spec?: string | null;
  /** Signed URL (or storage path) for the sticker photo. See lib/signed-urls.ts. */
  photo_url?: string | null;
}

export interface CheckoutEquipmentItemInput {
  /** Tenant performing the checkout. Required — every checkout is tenant-scoped. */
  tenantId: string;
  /** The authenticated actor recording this checkout (checked_out_by). */
  actorUserId: string;
  /** Caller's role — 'super_admin' may cross tenants; everyone else is tenant-locked. */
  actorRole: string;

  equipmentId: string;
  /** Vehicle equipment id. When set, custodian is derived from the truck's current driver
   *  unless truckHasNoDriverOverride (custodianId) is supplied. */
  truckEquipmentId?: string | null;
  /** Direct custodian for handheld checkouts, OR the required override when
   *  the selected truck has no current driver. */
  custodianId?: string | null;

  jobOrderId?: string | null;
  hourMeterOut?: number | null;
  notes?: string | null;
  voiceNoteUrl?: string | null;
  voiceCorrections?: VoiceCorrectionInput[];

  /** Blade-only manual-entry fields (v1 — no OCR). Ignored for non-blade equipment. */
  bladeDetails?: BladeCheckoutDetails | null;
}

export type CheckoutEquipmentItemResult =
  | { ok: true; checkout: Record<string, unknown> }
  | { ok: false; status: number; error: string; details?: string };

export async function checkoutEquipmentItem(
  input: CheckoutEquipmentItemInput
): Promise<CheckoutEquipmentItemResult> {
  const {
    tenantId, actorUserId, actorRole,
    equipmentId, jobOrderId = null, hourMeterOut = null, notes = null,
    voiceNoteUrl = null, voiceCorrections = [], bladeDetails = null,
  } = input;
  let { truckEquipmentId = null, custodianId = null } = input;

  if (!tenantId) return { ok: false, status: 400, error: 'Tenant required' };
  if (!equipmentId) return { ok: false, status: 400, error: 'equipment_id is required' };
  if (!truckEquipmentId && !custodianId) {
    return {
      ok: false, status: 400,
      error: 'Either truck_equipment_id or custodian_id is required',
      details: 'Pick a truck (operator is derived from its current driver), or pass an explicit custodian_id for handheld checkouts.',
    };
  }

  // ── Resolve truck → derive custodian if not explicitly overridden ─────────
  if (truckEquipmentId) {
    const { data: truck, error: truckErr } = await supabaseAdmin
      .from('equipment')
      .select('id, tenant_id, kind, status, name, short_name, unit_number, current_custodian_id')
      .eq('id', truckEquipmentId)
      .single();
    if (truckErr || !truck) return { ok: false, status: 404, error: 'Truck not found' };
    if (truck.kind !== 'vehicle') return { ok: false, status: 400, error: 'truck_equipment_id must point to a vehicle' };
    if (actorRole !== 'super_admin' && truck.tenant_id !== tenantId) {
      return { ok: false, status: 403, error: 'Truck not in your tenant' };
    }
    if (!custodianId) {
      if (!truck.current_custodian_id) {
        return {
          ok: false, status: 400,
          error: 'Truck has no operator assigned',
          details: `${truck.short_name && truck.unit_number ? `${truck.short_name} #${truck.unit_number}` : truck.name} has no current driver. Either assign a driver to the truck first, or pass custodian_id explicitly.`,
        };
      }
      custodianId = truck.current_custodian_id;
    }
  }

  // ── Verify equipment: tenant ownership + availability ──────────────────────
  const { data: equipment, error: eqError } = await supabaseAdmin
    .from('equipment')
    .select('id, tenant_id, status, name, short_name, unit_number, kind, category')
    .eq('id', equipmentId)
    .single();
  if (eqError || !equipment) return { ok: false, status: 404, error: 'Equipment not found' };
  if (actorRole !== 'super_admin' && equipment.tenant_id !== tenantId) {
    return { ok: false, status: 403, error: 'Equipment not in your tenant' };
  }
  if (equipment.status === 'in_use') {
    return {
      ok: false, status: 409,
      error: 'Equipment already checked out',
      details: 'This piece of equipment is currently in use. Check it back in first.',
    };
  }
  if (equipment.status === 'retired' || equipment.status === 'out_of_service') {
    return { ok: false, status: 409, error: `Equipment is ${equipment.status.replace(/_/g, ' ')} — cannot be checked out.` };
  }

  // Blade details only make sense for blade/bit equipment — silently ignore
  // otherwise rather than erroring, so voice-checkout callers don't need to
  // pre-check equipment kind before passing them through.
  const isBladeLike = equipment.kind === 'blade' || equipment.category === 'blade' || equipment.category === 'bit';
  const bladeDetailsToStore = isBladeLike && bladeDetails ? bladeDetails : null;

  // ── Insert checkout row ─────────────────────────────────────────────────────
  const { data: checkout, error: coError } = await supabaseAdmin
    .from('equipment_checkouts')
    .insert({
      tenant_id: tenantId,
      equipment_id: equipmentId,
      custodian_id: custodianId,
      job_order_id: jobOrderId,
      truck_equipment_id: truckEquipmentId,
      checked_out_by: actorUserId,
      hour_meter_out: typeof hourMeterOut === 'number' ? hourMeterOut : null,
      notes: notes?.trim() || null,
      voice_note_url: voiceNoteUrl || null,
      blade_details: bladeDetailsToStore,
    })
    .select('*')
    .single();

  if (coError) {
    console.error('checkoutEquipmentItem insert error:', coError);
    return { ok: false, status: 500, error: 'Failed to create checkout', details: coError.message };
  }

  // ── Flip equipment.status + custodian/job pointers ──────────────────────────
  const { error: updateError } = await supabaseAdmin
    .from('equipment')
    .update({
      status: 'in_use',
      current_custodian_id: custodianId,
      current_job_order_id: jobOrderId,
    })
    .eq('id', equipmentId);

  if (updateError) {
    console.error('checkoutEquipmentItem status flip error:', updateError);
    // Roll back the checkout to keep invariants.
    await supabaseAdmin.from('equipment_checkouts').delete().eq('id', checkout.id);
    return { ok: false, status: 500, error: 'Failed to update equipment status', details: updateError.message };
  }

  // ── Learning loop: persist voice corrections (fire-and-forget) ──────────────
  const validCorrections = (voiceCorrections || []).filter(
    (c): c is Required<VoiceCorrectionInput> =>
      !!c && typeof c.phrase === 'string' && typeof c.normalized === 'string'
      && ['equipment', 'truck', 'operator'].includes(c.kind)
      && typeof c.resolved_id === 'string'
      && typeof c.confidence === 'number'
  );
  if (validCorrections.length > 0) {
    const correctionRows = validCorrections.map((c) => ({
      tenant_id: tenantId,
      spoken_text: String(c.phrase).slice(0, 500),
      normalized_phrase: String(c.normalized).slice(0, 500),
      resolved_kind: c.kind,
      resolved_id: c.resolved_id,
      confidence: Math.max(0, Math.min(1, c.confidence)),
      was_corrected: !!c.was_corrected,
      created_by: actorUserId,
    }));
    supabaseAdmin.from('voice_recognition_corrections').insert(correctionRows)
      .then(({ error }) => { if (error) console.error('voice_recognition_corrections insert error:', error); });
  }

  return { ok: true, checkout };
}
