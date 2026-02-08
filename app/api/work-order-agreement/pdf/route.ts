/**
 * API Route: POST /api/work-order-agreement/pdf
 * Generate PDF of work order agreement and save to job ticket
 */

import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { renderToBuffer } from '@react-pdf/renderer';
import { WorkOrderAgreementPDF } from '@/components/pdf/WorkOrderAgreementPDF';

export async function POST(request: NextRequest) {
  try {
    console.log('[AGREEMENT PDF] Starting PDF generation...');

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
    const {
      jobId,
      jobNumber,
      jobDate,
      customerName,
      jobLocation,
      poNumber,
      workDescription,
      scopeOfWork,
      signerName,
      signerTitle,
      signedAt,
      cutThroughAuthorized,
      cutThroughSignature
    } = body;

    console.log('[AGREEMENT PDF] Request data:', {
      jobId,
      jobNumber,
      customerName,
      signerName
    });

    // Validate required fields
    if (!jobId || !jobNumber || !customerName || !signerName || !signedAt) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate PDF
    console.log('[AGREEMENT PDF] Generating PDF document...');
    const pdfElement = WorkOrderAgreementPDF({
      jobNumber,
      jobDate: jobDate || new Date().toISOString(),
      customerName,
      jobLocation: jobLocation || 'N/A',
      poNumber,
      workDescription: workDescription || 'Concrete cutting and coring services',
      scopeOfWork,
      signerName,
      signerTitle: signerTitle || '',
      signedAt,
      cutThroughAuthorized: cutThroughAuthorized || false,
      cutThroughSignature
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(pdfElement as any);

    console.log('[AGREEMENT PDF] PDF generated, size:', pdfBuffer.length, 'bytes');

    // Convert buffer to base64 for storage
    const pdfBase64 = pdfBuffer.toString('base64');

    // Store PDF in job order
    const { error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update({
        agreement_pdf: pdfBase64,
        agreement_pdf_generated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('[AGREEMENT PDF] Error storing PDF:', updateError);
      return NextResponse.json(
        { error: 'Failed to store PDF', details: updateError.message },
        { status: 500 }
      );
    }

    console.log('[AGREEMENT PDF] PDF stored in database');

    return NextResponse.json({
      success: true,
      message: 'Work order agreement PDF generated and saved successfully',
      pdfSize: pdfBuffer.length
    }, { status: 200 });

  } catch (error: any) {
    console.error('[AGREEMENT PDF] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
