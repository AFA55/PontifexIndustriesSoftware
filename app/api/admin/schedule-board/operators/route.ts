export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/schedule-board/operators
 * Crew available to the schedule board dropdowns.
 * Access: admin, super_admin, salesman
 *
 * ── Who can go in the OPERATOR slot ──────────────────────────────────────────
 * Operators, apprentices, supervisors and operations managers.
 *
 * The office role someone holds is not the job they are doing today.
 *
 * WHY (founder, Aug 7): "sometimes we test helpers... I would like ability to
 * make them and assign them as operators, and if I do I would like them to have
 * to do operator workflow since they were assigned as operators." Javier is an
 * apprentice running a job as lead. The dropdown was hard-filtered to
 * `role = 'operator'`, so the office simply could not put him in the slot.
 *
 * WHY (founder, Aug 9): "David is supervisor but sometimes also has jobs of his
 * own that involve scanning, so allow David or supervisors for that matter to be
 * able to be assigned jobs" — and "I'm operations manager but I do go do jobs
 * sometimes." Both now appear in the operator dropdown. They are NOT added to
 * the helper list: nobody asked for a supervisor to be dispatched as somebody
 * else's helper, and putting them there would clutter the pick the office makes
 * every day.
 *
 * The second half of that ask is ALREADY true and must stay true: the operator
 * ticket decides which workflow to show from the SLOT, not the role — see
 * app/dashboard/my-jobs/[id]/page.tsx ("A helper/apprentice put in the
 * assigned_to (operator) slot gets the full operator view"). So an apprentice
 * assigned as operator runs equipment → in route → work performed → completion,
 * exactly like anyone else in that slot. Nothing here needs to grant that; this
 * route only has to stop hiding them.
 *
 * Apprentices stay in the HELPER list too — being able to lead a job today
 * doesn't stop someone helping tomorrow.
 *
 * ── active = true ────────────────────────────────────────────────────────────
 * Both lists are now limited to active people. The board is keyed on NAME
 * throughout (operatorIdMap: name → id), and this tenant has THREE deactivated
 * rows all called "Deleted User" — two operators and one apprentice. Two of them
 * already collided in that map; surfacing apprentices would have made it three.
 * Deactivated people should not be assignable to new work anyway. This does not
 * hide anyone already ON a job: the board builds assigned rows from job data
 * first and only then fills in from this list.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });

    /** Roles that may be dispatched into the OPERATOR slot. */
    const OPERATOR_SLOT_ROLES = ['operator', 'apprentice', 'supervisor', 'operations_manager'];
    /** Roles offered in the HELPER slot. */
    const HELPER_SLOT_ROLES = ['apprentice'];

    // One read — both lists are drawn from it.
    const { data: crew, error: crewError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, avatar_url')
      .eq('tenant_id', tenantId)
      .eq('active', true)
      .in('role', OPERATOR_SLOT_ROLES)
      .order('full_name');

    if (crewError) {
      console.error('Error fetching schedule-board crew:', crewError);
      return NextResponse.json(
        { error: 'Failed to fetch crew' },
        { status: 500 }
      );
    }

    const rows = crew || [];

    /** What to call someone in the operator dropdown who isn't day-to-day an
     *  operator, so the office can see who is stepping into the seat rather
     *  than reading a flat list. */
    const SLOT_NOTE: Record<string, string> = {
      apprentice: 'helper',
      supervisor: 'supervisor',
      operations_manager: 'ops manager',
    };

    const toEntry = (p: { id: string; full_name: string | null; role: string | null; avatar_url: string | null }) => ({
      id: p.id,
      name: p.full_name || 'Unknown',
      avatarUrl: p.avatar_url || null,
      role: p.role || 'operator',
      /** Set when this person's day job is something other than operating.
       *  They are fully assignable and get the operator ticket either way. */
      slotNote: p.role && p.role !== 'operator' ? SLOT_NOTE[p.role] ?? null : null,
      /** Kept for the existing board consumers. */
      isApprentice: p.role === 'apprentice',
    });

    // Operators first — the everyday pick stays at the top of the list.
    const operators = [
      ...rows.filter((p) => p.role === 'operator'),
      ...rows.filter((p) => p.role !== 'operator'),
    ].map(toEntry);

    const helpers = rows.filter((p) => HELPER_SLOT_ROLES.includes(p.role || '')).map(toEntry);

    return NextResponse.json({
      success: true,
      data: { operators, helpers },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/schedule-board/operators:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
