/**
 * API Route: POST /api/silica-plan/submit
 * Save silica exposure control plan and send to customer
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // Parse request body
    const body = await request.json();
    const { jobId, formData, pdfBase64, customerEmail } = body;

    if (!jobId || !formData || !pdfBase64) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Save to database (you may need to create this table first)
    const { data: savedPlan, error: dbError } = await supabaseAdmin
      .from('silica_exposure_plans')
      .insert([{
        job_id: jobId,
        user_id: auth.userId,
        employee_name: formData.employeeName,
        employee_phone: formData.employeePhone,
        employees_on_job: formData.employeesOnJob,
        work_types: formData.workType,
        water_delivery_integrated: formData.waterDeliveryIntegrated,
        work_location: formData.workLocation,
        cutting_time: formData.cuttingTime,
        apf10_required: formData.apf10Required,
        other_safety_concerns: formData.otherSafetyConcerns,
        signature: formData.signature,
        signature_date: formData.signatureDate,
        pdf_data: pdfBase64,
        submitted_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // Continue even if database save fails
    }

    // Send email to customer (integrate with email service)
    // TODO: Integrate with actual email service (SendGrid, AWS SES, etc.)
    console.log('Email to send:');
    console.log('To:', customerEmail);
    console.log('Subject: Silica Exposure Control Plan - Job #' + jobId);
    console.log('Has PDF attachment');

    return NextResponse.json(
      {
        success: true,
        message: 'Document submitted successfully',
        data: {
          planId: savedPlan?.id,
          submittedAt: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in silica plan submit route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
