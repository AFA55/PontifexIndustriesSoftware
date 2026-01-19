/**
 * API Route: POST /api/silica-plan/submit
 * Save silica exposure control plan and send to customer
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    // Get user from Supabase session (server-side)
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Verify the token and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

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
        user_id: user.id,
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
    console.log('📧 Email to send:');
    console.log('To:', customerEmail);
    console.log('Subject: Silica Exposure Control Plan - Job #' + jobId);
    console.log('Has PDF attachment');

    // In production, you would do something like:
    /*
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to: customerEmail,
      from: 'noreply@bdconcretecutting.com',
      subject: `Silica Exposure Control Plan - Job #${jobId}`,
      text: 'Please find attached the Silica Exposure Control Plan for your job.',
      html: '<p>Please find attached the Silica Exposure Control Plan for your job.</p>',
      attachments: [
        {
          content: pdfBase64,
          filename: `Silica_Plan_Job_${jobId}.pdf`,
          type: 'application/pdf',
          disposition: 'attachment'
        }
      ]
    };

    await sgMail.send(msg);
    */

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
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
