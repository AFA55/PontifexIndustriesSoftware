import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/equipment/repair-tracking
 * Get repair tracking records (admin sees all, operators see for their equipment)
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const equipmentId = searchParams.get('equipmentId');
    const damageReportId = searchParams.get('damageReportId');
    const status = searchParams.get('status');

    let query = supabaseAdmin
      .from('equipment_repair_tracking')
      .select(`
        *,
        equipment:equipment_id (
          id,
          name,
          brand,
          model,
          serial_number
        ),
        damage_report:damage_report_id (
          id,
          damage_title,
          severity
        )
      `)
      .order('created_at', { ascending: false });

    if (equipmentId) {
      query = query.eq('equipment_id', equipmentId);
    }

    if (damageReportId) {
      query = query.eq('damage_report_id', damageReportId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: repairs, error } = await query;

    if (error) {
      console.error('Error fetching repair tracking:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ repairs });
  } catch (error: any) {
    console.error('Repair tracking API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/equipment/repair-tracking
 * Create a new repair tracking record (admin only)
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const {
      equipmentId,
      damageReportId,
      repairTitle,
      repairDescription,
      repairType,
      repairPriority,
      scheduledStartDate,
      scheduledCompletionDate,
      assignedTo,
      vendorName,
      vendorContact,
      vendorInvoiceNumber
    } = body;

    if (!equipmentId || !repairTitle || !repairDescription || !repairType) {
      return NextResponse.json(
        { error: 'Missing required fields: equipmentId, repairTitle, repairDescription, repairType' },
        { status: 400 }
      );
    }

    const repairData = {
      equipment_id: equipmentId,
      damage_report_id: damageReportId,
      repair_title: repairTitle,
      repair_description: repairDescription,
      repair_type: repairType,
      repair_priority: repairPriority || 'normal',
      scheduled_start_date: scheduledStartDate,
      scheduled_completion_date: scheduledCompletionDate,
      assigned_to: assignedTo,
      vendor_name: vendorName,
      vendor_contact: vendorContact,
      vendor_invoice_number: vendorInvoiceNumber,
      created_by: user.id,
      status: 'pending'
    };

    const { data: repair, error } = await supabaseAdmin
      .from('equipment_repair_tracking')
      .insert(repairData)
      .select()
      .single();

    if (error) {
      console.error('Error creating repair tracking:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update damage report status if linked
    if (damageReportId) {
      await supabaseAdmin
        .from('equipment_damage_reports')
        .update({ status: 'repair_in_progress' })
        .eq('id', damageReportId);
    }

    return NextResponse.json({ repair, message: 'Repair tracking created successfully' });
  } catch (error: any) {
    console.error('Create repair tracking API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/equipment/repair-tracking
 * Update repair tracking (admin only)
 */
export async function PATCH(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const {
      repairId,
      status,
      actualStartDate,
      actualCompletionDate,
      workPerformed,
      partsReplaced,
      partsSerialNumbers,
      laborHours,
      laborCost,
      partsCost,
      vendorCost,
      otherCosts,
      beforeRepairPhotos,
      afterRepairPhotos,
      invoiceUrls,
      warrantyInfo,
      warrantyExpirationDate,
      qualityCheckPassed,
      qualityCheckNotes,
      returnedToServiceDate,
      returnedToOperator
    } = body;

    if (!repairId) {
      return NextResponse.json({ error: 'Missing repairId' }, { status: 400 });
    }

    const updateData: any = {};

    if (status) updateData.status = status;
    if (actualStartDate) updateData.actual_start_date = actualStartDate;
    if (actualCompletionDate) updateData.actual_completion_date = actualCompletionDate;
    if (workPerformed) updateData.work_performed = workPerformed;
    if (partsReplaced) updateData.parts_replaced = partsReplaced;
    if (partsSerialNumbers) updateData.parts_serial_numbers = partsSerialNumbers;
    if (laborHours !== undefined) updateData.labor_hours = laborHours;
    if (laborCost !== undefined) updateData.labor_cost = laborCost;
    if (partsCost !== undefined) updateData.parts_cost = partsCost;
    if (vendorCost !== undefined) updateData.vendor_cost = vendorCost;
    if (otherCosts !== undefined) updateData.other_costs = otherCosts;
    if (beforeRepairPhotos) updateData.before_repair_photos = beforeRepairPhotos;
    if (afterRepairPhotos) updateData.after_repair_photos = afterRepairPhotos;
    if (invoiceUrls) updateData.invoice_urls = invoiceUrls;
    if (warrantyInfo) updateData.warranty_info = warrantyInfo;
    if (warrantyExpirationDate) updateData.warranty_expiration_date = warrantyExpirationDate;
    if (qualityCheckPassed !== undefined) {
      updateData.quality_check_passed = qualityCheckPassed;
      updateData.quality_check_by = user.id;
      updateData.quality_check_by_name = profile?.full_name || user.email;
      updateData.quality_check_date = new Date().toISOString();
      if (qualityCheckNotes) updateData.quality_check_notes = qualityCheckNotes;
    }
    if (returnedToServiceDate) updateData.returned_to_service_date = returnedToServiceDate;
    if (returnedToOperator) {
      updateData.returned_to_operator = returnedToOperator;
      // Get operator name
      const { data: operatorProfile } = await supabaseAdmin
        .from('user_profiles')
        .select('full_name')
        .eq('id', returnedToOperator)
        .single();
      updateData.returned_to_operator_name = operatorProfile?.full_name;
    }

    const { data: repair, error } = await supabaseAdmin
      .from('equipment_repair_tracking')
      .update(updateData)
      .eq('id', repairId)
      .select()
      .single();

    if (error) {
      console.error('Error updating repair tracking:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If repair completed, update equipment and damage report
    if (status === 'completed') {
      const { data: repairData } = await supabaseAdmin
        .from('equipment_repair_tracking')
        .select('equipment_id, damage_report_id')
        .eq('id', repairId)
        .single();

      if (repairData) {
        // Update equipment status to available
        await supabaseAdmin
          .from('equipment')
          .update({ status: 'available' })
          .eq('id', repairData.equipment_id);

        // Update damage report status if linked
        if (repairData.damage_report_id) {
          await supabaseAdmin
            .from('equipment_damage_reports')
            .update({ status: 'repair_completed' })
            .eq('id', repairData.damage_report_id);
        }
      }
    }

    return NextResponse.json({ repair, message: 'Repair tracking updated successfully' });
  } catch (error: any) {
    console.error('Update repair tracking API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
