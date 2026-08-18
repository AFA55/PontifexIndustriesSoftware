/**
 * Server half of the card permission gate.
 *
 * A permission the browser honours and the API does not is decoration: hiding a
 * button stops nobody who can type a URL. This is the piece that makes a grant
 * REAL — granting Amanda `timecards: 'full'` grants it for real, and NOT
 * granting it cannot be routed around by calling the endpoint directly.
 *
 * The read is deliberately narrow. `supabaseAdmin` bypasses RLS, so every query
 * here carries both the user id and (when known) the tenant id: a row written
 * with the wrong tenant must not be able to grant anything.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { PermissionLevel } from '@/lib/rbac';
import { cardPermissionDecision, type CardPermissionDecision } from '@/lib/card-permissions';

export interface CardPermissionSubject {
  userId: string;
  role: string;
  /** null only for a tenant-less super_admin, who bypasses anyway. */
  tenantId: string | null;
}

export interface CardPermissionLookup {
  /** null = this user has no override rows → the role preset applies. */
  permissions: Record<string, PermissionLevel> | null;
  /**
   * True when the READ itself failed. Distinct from "no rows": both fall back
   * to the role preset (fail closed is correct), but only one of them means the
   * answer might be wrong. Without this the 403 tells Amanda to "ask an
   * operations manager to grant it" when she already has it and Postgres simply
   * did not answer — sending the office to re-do a grant that already exists.
   */
  lookupFailed: boolean;
}

/**
 * Load this user's explicit per-user overrides, with the reason for an empty
 * answer preserved.
 *
 * `permissions` is null when the user has no rows — the signal
 * `getCardPermission` needs to fall through to the role preset. An empty object
 * would say "I have an opinion about nothing", which is the same answer here but
 * a worse thing to hand a function whose contract is `null | Record`.
 *
 * A DB failure also yields null, and that is the safe direction: the user drops
 * back to their role preset rather than inheriting someone else's grant. It sets
 * `lookupFailed` so the refusal can say what actually happened.
 */
export async function loadUserCardPermissionsResult(
  userId: string,
  tenantId: string | null
): Promise<CardPermissionLookup> {
  try {
    let query = supabaseAdmin
      .from('user_card_permissions')
      .select('card_key, permission_level')
      .eq('user_id', userId);
    // supabaseAdmin bypasses RLS — scope explicitly. Skipped only for a
    // tenant-less caller (super_admin), who never reaches the lookup in
    // practice because BYPASS_ROLES short-circuits first.
    if (tenantId) query = query.eq('tenant_id', tenantId);

    const { data, error } = await query;
    if (error) {
      console.error('[card-permissions] lookup failed, falling back to role preset:', error.message);
      return { permissions: null, lookupFailed: true };
    }
    if (!data || data.length === 0) return { permissions: null, lookupFailed: false };

    const map: Record<string, PermissionLevel> = {};
    for (const row of data as Array<{ card_key: string; permission_level: string }>) {
      map[row.card_key] = row.permission_level as PermissionLevel;
    }
    return { permissions: map, lookupFailed: false };
  } catch (e) {
    console.error('[card-permissions] lookup threw, falling back to role preset:', e);
    return { permissions: null, lookupFailed: true };
  }
}

/**
 * Overrides only. Callers that need to tell a failed read from an empty one
 * should use `loadUserCardPermissionsResult`.
 */
export async function loadUserCardPermissions(
  userId: string,
  tenantId: string | null
): Promise<Record<string, PermissionLevel> | null> {
  return (await loadUserCardPermissionsResult(userId, tenantId)).permissions;
}

export interface ServerCardPermissionDecision extends CardPermissionDecision {
  /** See CardPermissionLookup.lookupFailed. Always false for a bypass role. */
  lookupFailed: boolean;
}

/**
 * Effective permission for one card: bypass role → per-user override → preset.
 * Skips the database entirely for bypass roles, who cannot be affected by it.
 */
export async function resolveCardPermission(
  subject: CardPermissionSubject,
  cardKey: string,
  required: PermissionLevel
): Promise<ServerCardPermissionDecision> {
  const shortCircuit = cardPermissionDecision({
    role: subject.role,
    userPermissions: null,
    cardKey,
    required,
  });
  if (shortCircuit.source === 'bypass_role') return { ...shortCircuit, lookupFailed: false };

  const { permissions, lookupFailed } = await loadUserCardPermissionsResult(
    subject.userId,
    subject.tenantId
  );
  return {
    ...cardPermissionDecision({ role: subject.role, userPermissions: permissions, cardKey, required }),
    lookupFailed,
  };
}

/**
 * Route guard. Returns a 403 `NextResponse` to return, or null to proceed:
 *
 *   const denied = await requireCardLevel(auth, 'timecards', 'full');
 *   if (denied) return denied;
 *
 * Use it AFTER the role guard (`requireAdmin` etc.), never instead of it — the
 * role guard decides who may touch the surface at all, this decides who may
 * change it.
 */
export async function requireCardLevel(
  subject: CardPermissionSubject,
  cardKey: string,
  required: PermissionLevel,
  /** Named in the 403 so the office can say what to ask for. */
  actionLabel: string
): Promise<NextResponse | null> {
  const decision = await resolveCardPermission(subject, cardKey, required);
  if (decision.allowed) return null;

  // When the LOOKUP failed we do not actually know what this person has, we
  // only know we could not read it. Saying "ask an operations manager to grant
  // it" would send Amanda to re-request a permission she already holds, and the
  // office would find the grant already there and conclude the software lies.
  if (decision.lookupFailed) {
    return NextResponse.json(
      {
        error: `${actionLabel} was not attempted: we could not read your permissions just now. Nothing was changed. Try again in a moment — if it keeps happening, this is a fault on our side, not a missing permission.`,
        code: 'card_permission_unavailable',
        required,
      },
      { status: 503 }
    );
  }

  return NextResponse.json(
    {
      error: `Forbidden. ${actionLabel} requires full access to this section. Ask an operations manager to grant it in Team Management.`,
      code: 'card_permission_required',
      required,
      effective: decision.effective,
    },
    { status: 403 }
  );
}
