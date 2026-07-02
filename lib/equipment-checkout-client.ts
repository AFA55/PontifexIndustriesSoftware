/**
 * checkoutEquipmentItem — INTERIM shim over the existing equipment-checkout
 * REST endpoints, built so the native voice-checkout UI (NativeVoiceCheckout,
 * lib/native-speech.ts) has ONE clearly-named primitive to call instead of
 * hand-rolling its own fetch/data path.
 *
 * ⚠️ WIRING NOTE FOR WHOEVER MERGES THE MANUAL/NON-VOICE CHECKOUT WORK ⚠️
 * Another team is building the reusable manual equipment-checkout foundation
 * in parallel (same "checkoutEquipmentItem"-style primitive). This file was
 * written WITHOUT sight of their final function signature. Today it just
 * calls the existing routes directly:
 *   - POST /api/admin/equipment-checkouts        (open a checkout)
 *   - PATCH /api/admin/equipment-checkouts/[id]   (check something back in)
 * When the other team's real implementation lands, replace the bodies of
 * `checkoutEquipmentItem` / `checkinEquipmentItem` below with calls into
 * THEIRS (or re-export theirs under these names) so there is exactly ONE
 * checkout code path and voice stays a pure alternate INPUT method. Do not
 * let this shim become a second, divergent write path — grep the repo for
 * `checkoutEquipmentItem` before deleting this file to catch all call sites.
 *
 * Auth: like the rest of the client codebase, calls must carry
 * `Authorization: Bearer <access_token>` — requireAuth() reads the bearer
 * token, not cookies (see CLAUDE.md conventions).
 */

import { supabase } from '@/lib/supabase';

export interface CheckoutEquipmentItemParams {
  /** Resolved equipment.id (required — the parser/confirm step must resolve a name to an id first). */
  itemId: string;
  /** Display name, for confirm-screen text / error messages only — not sent as the source of truth. */
  itemName?: string;
  /** Resolved profiles/auth.users id of the operator taking custody. Optional if truckId is given. */
  operatorId?: string;
  /** Display name, for confirm-screen text only. */
  operatorName?: string;
  /** Optional: check the item out onto a truck (equipment.kind === 'vehicle'); operator is derived from the truck's driver if operatorId is omitted. */
  truckId?: string;
  /** Optional job to associate the checkout with. */
  jobOrderId?: string;
  /**
   * Quantity is NOT modeled by equipment_checkouts today (one row = one
   * physical asset in custody). For multi-quantity spoken items ("2 chains
   * and binders") the caller is expected to resolve that to `quantity`
   * separate equipment rows (or a single consumable-tracking row, once that
   * exists) — this shim checks out ONE row per call. Kept on the interface
   * so the parsing layer has somewhere to put the number; the other team's
   * real primitive may model quantity differently.
   */
  quantity?: number;
  /** Free-text notes, e.g. the original spoken phrase, for audit trail. */
  notes?: string;
  /** Signed URL of the recorded voice audio, if any (forensic replay). */
  voiceNoteUrl?: string;
  /** Learning-loop correction entries, same shape the existing voice-parse UI posts. */
  voiceCorrections?: Array<{
    phrase: string;
    normalized: string;
    kind: 'equipment' | 'truck' | 'operator';
    resolved_id: string;
    confidence: number;
    was_corrected: boolean;
  }>;
}

export interface CheckoutEquipmentItemResult {
  success: boolean;
  data?: any;
  error?: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Session expired — please sign in again.');
  return { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
}

/**
 * Open a checkout for one equipment item. Interim implementation — see the
 * file-level note above. Calls the existing POST /api/admin/equipment-checkouts.
 */
export async function checkoutEquipmentItem(
  params: CheckoutEquipmentItemParams
): Promise<CheckoutEquipmentItemResult> {
  try {
    const headers = await authHeaders();
    const res = await fetch('/api/admin/equipment-checkouts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        equipment_id: params.itemId,
        custodian_id: params.operatorId || null,
        truck_equipment_id: params.truckId || null,
        job_order_id: params.jobOrderId || null,
        notes: params.notes || null,
        voice_note_url: params.voiceNoteUrl || null,
        voice_corrections: params.voiceCorrections || [],
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: json.error || `Checkout failed (${res.status})` };
    return { success: true, data: json.data };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Checkout failed' };
  }
}

/**
 * Check an item back in. Interim implementation over the existing
 * PATCH /api/admin/equipment-checkouts/[id]. Needs the OPEN checkout id, not
 * the equipment id — callers resolving from voice ("checkin all") must first
 * look up open checkouts (GET .../equipment-checkouts?open=true) to get ids.
 */
export async function checkinEquipmentItem(
  checkoutId: string,
  opts?: { hourMeterIn?: number; notes?: string; statusAfterCheckin?: 'available' | 'pending_putaway' }
): Promise<CheckoutEquipmentItemResult> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`/api/admin/equipment-checkouts/${checkoutId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        hour_meter_in: opts?.hourMeterIn,
        notes: opts?.notes,
        status_after_checkin: opts?.statusAfterCheckin || 'pending_putaway',
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: json.error || `Check-in failed (${res.status})` };
    return { success: true, data: json.data };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Check-in failed' };
  }
}

/** List currently-open checkouts (used to resolve "checkin all" / checkin-by-name from voice). */
export async function listOpenCheckouts(): Promise<{ success: boolean; data?: any[]; error?: string }> {
  try {
    const headers = await authHeaders();
    const res = await fetch('/api/admin/equipment-checkouts?open=true&limit=200', { headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false, error: json.error || `Failed to load open checkouts (${res.status})` };
    return { success: true, data: json.data || [] };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to load open checkouts' };
  }
}
