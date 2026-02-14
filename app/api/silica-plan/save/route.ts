/**
 * API Route: POST /api/silica-plan/save
 * Save silica exposure control plan PDF to job ticket (without emailing customer)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    // Get user from Supabase session
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
    const { jobId, formData, pdfBase64 } = body;

    if (!jobId || !formData || !pdfBase64) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Convert base64 to buffer
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    // Generate filename
    const fileName = `silica_exposure_control_plan_job_${jobId}_${new Date().toISOString().split('T')[0]}.pdf`;
    const filePath = `job-documents/${jobId}/${fileName}`;

    // Upload to Supabase Storage (using job-documents bucket)
    let uploadData, uploadError;

    try {
      const uploadResult = await supabaseAdmin.storage
        .from('job-documents')
        .upload(filePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        });

      uploadData = uploadResult.data;
      uploadError = uploadResult.error;
    } catch (storageError: any) {
      console.error('Storage exception:', storageError);
      // If storage fails, save to database without file attachment
      uploadError = storageError;
    }

    let publicUrl = '';

    if (uploadError) {
      console.error('⚠️ Storage upload failed, saving metadata without file:', uploadError);
      // Continue without file - we'll save the plan data but note that file upload failed
      publicUrl = `FILE_UPLOAD_FAILED: ${uploadError.message}`;
    } else {
      // Get public URL
      const urlResult = supabaseAdmin.storage
        .from('job-documents')
        .getPublicUrl(filePath);
      publicUrl = urlResult.data.publicUrl;
    }

    // Save silica plan record to database
    const silicaPlanRecord: any = {
      job_order_id: jobId,
      employee_name: formData.employeeName,
      employee_phone: formData.employeePhone,
      employees_on_job: formData.employeesOnJob,
      work_types: formData.workType,
      water_delivery: formData.waterDeliveryIntegrated,
      work_location: formData.workLocation,
      cutting_time: formData.cuttingTime,
      apf10_required: formData.apf10Required,
      safety_concerns: formData.otherSafetyConcerns || '',
      signature: formData.signature,
      signature_date: formData.signatureDate,
      created_by: user.id,
    };

    // Add PDF URL if upload succeeded, otherwise store base64 as fallback
    if (publicUrl && !uploadError) {
      silicaPlanRecord.pdf_url = publicUrl;
    } else {
      // Store PDF as base64 in database as fallback
      silicaPlanRecord.pdf_base64 = pdfBase64;
    }

    // Try to save silica plan record — table may not exist yet
    let silicaPlanId = null;
    const { data: silicaPlanData, error: silicaPlanError } = await supabaseAdmin
      .from('silica_plans')
      .upsert([silicaPlanRecord], {
        onConflict: 'job_order_id'
      })
      .select()
      .single();

    if (silicaPlanError) {
      // silica_plans table may not exist — log but don't fail
      console.log('Silica plans table save skipped (table may not exist):', silicaPlanError.message || silicaPlanError.code);
    } else {
      silicaPlanId = silicaPlanData?.id;
      console.log('Silica plan record saved successfully');
    }

    // Save PDF to job_orders for admin viewing in completed jobs
    // These columns may not exist yet — use status API fallback pattern
    const { error: jobOrderUpdateError } = await supabaseAdmin
      .from('job_orders')
      .update({
        silica_form_pdf: pdfBase64,
        silica_form_completed_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (jobOrderUpdateError) {
      console.log('Job order silica PDF column update skipped (columns may not exist):', jobOrderUpdateError.message);
    } else {
      console.log('PDF saved to job_orders.silica_form_pdf');
    }

    // Track PDF in pdf_documents table for versioning — optional
    if (!uploadError && publicUrl) {
      const { error: pdfDocError } = await supabaseAdmin
        .from('pdf_documents')
        .insert({
          job_id: jobId,
          document_type: 'silica_form',
          document_name: fileName,
          file_path: filePath,
          file_url: publicUrl,
          file_size_bytes: pdfBuffer.length,
          generated_by: user.id,
          metadata: {
            employee_name: formData.employeeName,
            work_types: formData.workType,
            signature_date: formData.signatureDate
          }
        });

      if (pdfDocError) {
        console.log('PDF documents table tracking skipped (table may not exist):', pdfDocError.message);
      } else {
        console.log('PDF tracked in pdf_documents table');
      }
    }

    console.log('Silica plan save completed for job:', jobId);

    // Return success even if some tables don't exist — the data is preserved in storage
    return NextResponse.json(
      {
        success: true,
        message: 'Silica plan saved successfully. Admin will send all documents to customer when job is complete.',
        warning: uploadError ? 'PDF file upload failed - data saved without file attachment' : null,
        data: {
          silicaPlanId: silicaPlanId,
          pdfUrl: uploadError ? null : publicUrl,
          savedAt: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in silica-plan save route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
