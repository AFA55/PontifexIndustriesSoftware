export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/shop/equipment-needs?date=YYYY-MM-DD
 *
 * Shop Manager "Daily Equipment Needs" view. Read-only.
 * Returns the jobs active on the given date (default: today in tenant tz) with
 * the equipment each one needs, so the shop can stage gear in the morning.
 *
 * Active-on-date rule (mirrors schedule board): a job appears when
 *   scheduled_date <= date  AND  (end_date IS NULL OR end_date >= date)
 *
 * Access: shop_manager, shop_help, admin, super_admin, operations_manager.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import {
  deriveEquipmentLines,
  parseServiceCodes,
  serviceTypeLabel,
  type EquipmentLine,
} from '@/lib/equipment-needs';

const ALLOWED_ROLES = new Set([
  'shop_manager',
  'shop_help',
  'admin',
  'super_admin',
  'operations_manager',
]);

interface JobRow {
  id: string;
  job_number: string | null;
  customer_name: string | null;
  location: string | null;
  address: string | null;
  project_name: string | null;
  job_type: string | null;
  arrival_time: string | null;
  scheduled_date: string | null;
  end_date: string | null;
  status: string | null;
  equipment_needed: string[] | null;
  mandatory_equipment: string[] | null;
  equipment_selections: Record<string, Record<string, unknown>> | null;
  special_equipment: string | null;
  assigned_to: string | null;
  helper_assigned_to: string | null;
  operator_name: string | null;
  helper_name: string | null;
}

export interface EquipmentNeedJob {
  id: string;
  job_number: string | null;
  customer_name: string | null;
  location: string | null;
  arrival_time: string | null;
  operators: string[];
  service_types: { code: string; label: string }[];
  equipment: EquipmentLine[];
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    if (!ALLOWED_ROLES.has(auth.role)) {
      return NextResponse.json(
        { error: 'Forbidden. Shop access required.' },
        { status: 403 }
      );
    }

    const tenantId = await getTenantId(auth.userId);
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Tenant scope required. super_admin must pass ?tenantId=' },
        { status: 400 }
      );
    }

    // Resolve tenant timezone so the "today" fallback uses local date, not UTC.
    let tenantTz = 'America/New_York';
    try {
      const { data: tenantRow } = await supabaseAdmin
        .from('tenants')
        .select('timezone')
        .eq('id', tenantId)
        .maybeSingle();
      if (tenantRow?.timezone) tenantTz = tenantRow.timezone;
    } catch {
      /* non-critical */
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const date =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? dateParam
        : new Date().toLocaleDateString('en-CA', { timeZone: tenantTz });

    // Jobs active on `date`: starts on/before date AND (no end_date OR ends on/after date).
    const { data: jobs, error } = await supabaseAdmin
      .from('schedule_board_view')
      .select(
        'id, job_number, customer_name, location, address, project_name, job_type, ' +
          'arrival_time, scheduled_date, end_date, status, ' +
          'equipment_needed, mandatory_equipment, equipment_selections, special_equipment, ' +
          'assigned_to, helper_assigned_to, operator_name, helper_name'
      )
      .eq('tenant_id', tenantId)
      .neq('status', 'pending_approval')
      .lte('scheduled_date', date)
      .or(`end_date.is.null,end_date.gte.${date}`)
      .order('arrival_time', { ascending: true, nullsFirst: false });

    if (error) {
      console.error('[equipment-needs] query failed:', error);
      return NextResponse.json(
        { error: 'Failed to fetch equipment needs' },
        { status: 500 }
      );
    }

    // Overlay per-day operator assignments (multi-day jobs show that day's operator).
    const assignmentByJob = new Map<
      string,
      { operator_name: string | null; helper_name: string | null }
    >();
    if (jobs && jobs.length > 0) {
      const { data: daily } = await supabaseAdmin
        .from('job_daily_assignments')
        .select('job_order_id, operator_name, helper_name')
        .eq('tenant_id', tenantId)
        .eq('assignment_date', date);
      for (const a of daily ?? []) {
        assignmentByJob.set(a.job_order_id, {
          operator_name: a.operator_name ?? null,
          helper_name: a.helper_name ?? null,
        });
      }
    }

    const rows = (jobs ?? []) as unknown as JobRow[];
    const result: EquipmentNeedJob[] = rows.map((j) => {
      const override = assignmentByJob.get(j.id);
      const operatorName = override?.operator_name ?? j.operator_name ?? null;
      const helperName = override?.helper_name ?? j.helper_name ?? null;
      const operators = [operatorName, helperName].filter(
        (n): n is string => !!n && n.trim().length > 0
      );

      const codes = parseServiceCodes(null, j.job_type);

      return {
        id: j.id,
        job_number: j.job_number ?? null,
        customer_name: j.customer_name ?? j.project_name ?? null,
        location: j.location ?? j.address ?? null,
        arrival_time: j.arrival_time ?? null,
        operators,
        service_types: codes.map((code) => ({ code, label: serviceTypeLabel(code) })),
        equipment: deriveEquipmentLines({
          mandatory_equipment: j.mandatory_equipment,
          equipment_needed: j.equipment_needed,
          equipment_selections: j.equipment_selections,
          special_equipment: j.special_equipment,
        }),
      };
    });

    return NextResponse.json({ success: true, data: { date, jobs: result } });
  } catch (err) {
    console.error('[equipment-needs] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
