/**
 * API Route: POST /api/operator/complete-job
 * Records operator performance when a job is completed
 * Automatically triggers metric calculations
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { jobId, hoursWorked, customerRating } = body;

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId is required' },
        { status: 400 }
      );
    }

    // Get all work items for this job to calculate total production
    const { data: workItems, error: workItemsError } = await supabaseAdmin
      .from('work_items')
      .select('work_type, linear_feet_cut, core_quantity, core_depth_inches')
      .eq('job_order_id', jobId);

    if (workItemsError) {
      console.error('Error fetching work items:', workItemsError);
      return NextResponse.json(
        { error: 'Failed to fetch work items' },
        { status: 500 }
      );
    }

    // Calculate total linear feet cut
    let totalLinearFeet = 0;
    let primaryWorkType = null;
    const workTypeCounts: { [key: string]: number } = {};

    if (workItems && workItems.length > 0) {
      workItems.forEach(item => {
        // Sum linear feet
        if (item.linear_feet_cut) {
          totalLinearFeet += parseFloat(item.linear_feet_cut);
        }

        // Count work types to determine primary
        if (item.work_type) {
          workTypeCounts[item.work_type] = (workTypeCounts[item.work_type] || 0) + 1;
        }
      });

      // Determine primary work type (most common)
      let maxCount = 0;
      for (const [workType, count] of Object.entries(workTypeCounts)) {
        if (count > maxCount) {
          maxCount = count;
          primaryWorkType = workType;
        }
      }
    }

    // Get job details
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('shop_departure_time, on_site_arrival_time, job_start_time, job_completion_time')
      .eq('id', jobId)
      .single();

    if (jobError) {
      console.error('Error fetching job details:', jobError);
    }

    // Calculate hours if not provided
    let calculatedHours = hoursWorked;
    if (!calculatedHours && job) {
      // Try to calculate from timestamps
      if (job.job_start_time && job.job_completion_time) {
        const start = new Date(job.job_start_time);
        const end = new Date(job.job_completion_time);
        const diffMs = end.getTime() - start.getTime();
        calculatedHours = diffMs / (1000 * 60 * 60); // Convert to hours
      }
    }

    // Default to 8 hours if we can't calculate
    if (!calculatedHours || calculatedHours <= 0) {
      calculatedHours = 8;
    }

    // Calculate productivity rate
    const productivityRate = calculatedHours > 0 ? totalLinearFeet / calculatedHours : 0;

    // Check if record already exists for this operator and job
    const { data: existingRecord } = await supabaseAdmin
      .from('operator_job_history')
      .select('id')
      .eq('operator_id', user.id)
      .eq('job_id', jobId)
      .maybeSingle();

    if (existingRecord) {
      // Update existing record
      const { error: updateError } = await supabaseAdmin
        .from('operator_job_history')
        .update({
          work_type: primaryWorkType,
          linear_feet_cut: totalLinearFeet,
          hours_worked: calculatedHours,
          productivity_rate: productivityRate,
          customer_rating: customerRating,
          job_date: new Date().toISOString()
        })
        .eq('id', existingRecord.id);

      if (updateError) {
        console.error('Error updating operator job history:', updateError);
        return NextResponse.json(
          { error: 'Failed to update performance record' },
          { status: 500 }
        );
      }
    } else {
      // Create new record - this will trigger automatic metric calculations
      const { error: insertError } = await supabaseAdmin
        .from('operator_job_history')
        .insert({
          operator_id: user.id,
          job_id: jobId,
          work_type: primaryWorkType,
          linear_feet_cut: totalLinearFeet,
          hours_worked: calculatedHours,
          productivity_rate: productivityRate,
          customer_rating: customerRating,
          job_date: new Date().toISOString()
        });

      if (insertError) {
        console.error('Error inserting operator job history:', insertError);
        return NextResponse.json(
          { error: 'Failed to save performance record', details: insertError.message },
          { status: 500 }
        );
      }
    }

    console.log(`✅ Operator performance recorded for job ${jobId}:`, {
      operator: user.id,
      linearFeet: totalLinearFeet,
      hours: calculatedHours,
      productivity: productivityRate.toFixed(2),
      workType: primaryWorkType
    });

    return NextResponse.json({
      success: true,
      message: 'Performance recorded successfully',
      data: {
        totalLinearFeet,
        hoursWorked: calculatedHours,
        productivityRate: productivityRate.toFixed(2),
        workType: primaryWorkType
      }
    });
  } catch (error: any) {
    console.error('Error in complete-job route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
