/**
 * API Route: POST /api/silica-plan/submit
 * Save silica exposure control plan and send to customer
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { Resend } from 'resend';

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

    // Send email to customer via Resend
    if (customerEmail && pdfBase64) {
      const fromAddress = process.env.RESEND_FROM_EMAIL || 'Patriot Concrete Cutting <noreply@resend.dev>';
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: fromAddress,
          to: customerEmail,
          subject: `Silica Exposure Control Plan — Job #${jobId}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
              <h2 style="color: #0f172a;">Silica Exposure Control Plan</h2>
              <p>Please find attached the Silica Exposure Control Plan for your job.</p>
              <p>This document outlines the safety measures and dust control procedures in place to protect workers and comply with OSHA silica regulations.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="color: #64748b; font-size: 13px;">Patriot Concrete Cutting<br/>Questions? Contact us at your project manager's number.</p>
            </div>
          `,
          attachments: [
            {
              filename: `Silica_Plan_Job_${jobId}.pdf`,
              content: Buffer.from(pdfBase64, 'base64'),
            },
          ],
        });
      } catch (emailErr) {
        console.error('[SILICA PLAN] Failed to send email:', emailErr);
        // Don't fail the whole request if email fails
      }
    }

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
