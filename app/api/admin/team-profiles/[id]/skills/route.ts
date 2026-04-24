export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/team-profiles/[id]/skills
 *   Returns per-scope skill levels, derived qualifications, and notes for an
 *   operator/apprentice profile within the caller's tenant.
 *
 * PUT  /api/admin/team-profiles/[id]/skills
 *   Body: { skill_levels?: Record<string, number>, notes?: string }
 *   - Validates scope/equipment keys against lib/skills-taxonomy.ts
 *   - Clamps values (scopes 0–10, equipment 0–5, rejects negatives)
 *   - Rejects unknown keys
 *   - Auto-derives tasks_qualified_for + equipment_qualified_for from the
 *     merged skill_levels (entries >= 1 count as qualified)
 *
 * Only `operator` and `apprentice` profiles may be edited via this route.
 * Writes are strictly scoped to the caller's tenant_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin, resolveTenantScope } from '@/lib/api-auth';
import {
  SCOPE_KEYS,
  EQUIPMENT_KEYS,
  SCOPE_MAX,
  EQUIPMENT_MAX,
  isScopeKey,
  isEquipmentKey,
} from '@/lib/skills-taxonomy';

const EDITABLE_ROLES = ['operator', 'apprentice'];

type ProfileShape = {
  id: string;
  full_name: string | null;
  role: string | null;
  skill_levels: Record<string, number> | null;
  tasks_qualified_for: string[] | null;
  equipment_qualified_for: string[] | null;
  notes: string | null;
};

function shapeResponse(p: ProfileShape) {
  return {
    id: p.id,
    full_name: p.full_name,
    role: p.role,
    skill_levels: (p.skill_levels && typeof p.skill_levels === 'object') ? p.skill_levels : {},
    tasks_qualified_for: Array.isArray(p.tasks_qualified_for) ? p.tasks_qualified_for : [],
    equipment_qualified_for: Array.isArray(p.equipment_qualified_for) ? p.equipment_qualified_for : [],
    notes: p.notes ?? '',
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const tenantId = scope.tenantId;

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, skill_levels, tasks_qualified_for, equipment_qualified_for, notes, tenant_id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('skills GET error:', error);
      return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
    }
    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (!profile.role || !EDITABLE_ROLES.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Skills are only editable for operator and apprentice roles.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: shapeResponse(profile as ProfileShape) });
  } catch (err) {
    console.error('Unexpected error in GET skills route:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const tenantId = scope.tenantId;

    // Parse body
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const hasSkills = body && typeof body === 'object' && body.skill_levels !== undefined;
    const hasNotes = body && typeof body === 'object' && body.notes !== undefined;

    if (!hasSkills && !hasNotes) {
      return NextResponse.json(
        { error: 'Provide at least one of: skill_levels, notes' },
        { status: 400 }
      );
    }

    // Validate notes
    let notesValue: string | undefined;
    if (hasNotes) {
      if (body.notes === null) {
        notesValue = '';
      } else if (typeof body.notes !== 'string') {
        return NextResponse.json({ error: 'notes must be a string' }, { status: 400 });
      } else {
        notesValue = body.notes;
      }
    }

    // Validate skill_levels incoming patch
    let incomingSkills: Record<string, number> | undefined;
    if (hasSkills) {
      if (body.skill_levels === null || typeof body.skill_levels !== 'object' || Array.isArray(body.skill_levels)) {
        return NextResponse.json(
          { error: 'skill_levels must be an object mapping keys to numbers' },
          { status: 400 }
        );
      }
      const patch: Record<string, number> = {};
      for (const [rawKey, rawVal] of Object.entries(body.skill_levels)) {
        const key = String(rawKey);
        const isScope = isScopeKey(key);
        const isEquip = isEquipmentKey(key);
        if (!isScope && !isEquip) {
          return NextResponse.json(
            { error: `Unknown skill key: ${key}` },
            { status: 400 }
          );
        }
        const num = typeof rawVal === 'number' ? rawVal : Number(rawVal);
        if (!Number.isFinite(num)) {
          return NextResponse.json(
            { error: `skill_levels.${key} must be a finite number` },
            { status: 400 }
          );
        }
        if (num < 0) {
          return NextResponse.json(
            { error: `skill_levels.${key} cannot be negative` },
            { status: 400 }
          );
        }
        const max = isScope ? SCOPE_MAX : EQUIPMENT_MAX;
        const clamped = Math.min(Math.round(num), max);
        patch[key] = clamped;
      }
      incomingSkills = patch;
    }

    // Load existing profile to validate tenancy, role, and merge skill_levels
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, skill_levels, tasks_qualified_for, equipment_qualified_for, notes, tenant_id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (fetchErr) {
      console.error('skills PUT fetch error:', fetchErr);
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (!existing.role || !EDITABLE_ROLES.includes(existing.role)) {
      return NextResponse.json(
        { error: 'Skills are only editable for operator and apprentice roles.' },
        { status: 400 }
      );
    }

    // Merge skill_levels
    const existingSkills: Record<string, number> =
      existing.skill_levels && typeof existing.skill_levels === 'object' && !Array.isArray(existing.skill_levels)
        ? { ...(existing.skill_levels as Record<string, number>) }
        : {};

    const mergedSkills: Record<string, number> = { ...existingSkills };
    if (incomingSkills) {
      for (const [k, v] of Object.entries(incomingSkills)) {
        mergedSkills[k] = v;
      }
    }

    // Derive qualifications — entries >= 1 count as qualified
    const tasksQualifiedFor = SCOPE_KEYS.filter(
      (k) => typeof mergedSkills[k] === 'number' && mergedSkills[k] >= 1
    );
    const equipmentQualifiedFor = EQUIPMENT_KEYS.filter(
      (k) => typeof mergedSkills[k] === 'number' && mergedSkills[k] >= 1
    );

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (incomingSkills) {
      updatePayload.skill_levels = mergedSkills;
      updatePayload.tasks_qualified_for = tasksQualifiedFor;
      updatePayload.equipment_qualified_for = equipmentQualifiedFor;
    }
    if (notesValue !== undefined) {
      updatePayload.notes = notesValue;
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select('id, full_name, role, skill_levels, tasks_qualified_for, equipment_qualified_for, notes')
      .single();

    if (updateErr || !updated) {
      console.error('skills PUT update error:', updateErr);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: shapeResponse(updated as ProfileShape) });
  } catch (err) {
    console.error('Unexpected error in PUT skills route:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
