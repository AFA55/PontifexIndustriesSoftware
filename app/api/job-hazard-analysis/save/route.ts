/**
 * API Route: POST /api/job-hazard-analysis/save
 * Save Job Hazard Analysis PDF to job documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import jsPDF from 'jspdf';

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
    const { jobId, formData } = body;

    if (!jobId || !formData) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate PDF
    const pdf = new jsPDF();
    let yPos = 20;

    // Header
    pdf.setFontSize(18);
    pdf.text('JOB HAZARD ANALYSIS (JHA)', 105, yPos, { align: 'center' });
    yPos += 10;

    pdf.setFontSize(12);
    pdf.text('Pontifex Industries', 105, yPos, { align: 'center' });
    yPos += 15;

    // Job Information
    pdf.setFontSize(14);
    pdf.text('Job Information', 20, yPos);
    yPos += 8;

    pdf.setFontSize(10);
    pdf.text(`Job Number: ${formData.jobNumber}`, 25, yPos);
    yPos += 6;
    pdf.text(`Customer: ${formData.customer}`, 25, yPos);
    yPos += 6;
    pdf.text(`Location: ${formData.jobLocation}`, 25, yPos);
    yPos += 6;
    pdf.text(`Date: ${formData.datePerformed}`, 25, yPos);
    yPos += 10;

    // Crew Information
    pdf.setFontSize(14);
    pdf.text('Crew Information', 20, yPos);
    yPos += 8;

    pdf.setFontSize(10);
    pdf.text(`Crew Leader: ${formData.crewLeader}`, 25, yPos);
    yPos += 6;

    pdf.text('Crew Members:', 25, yPos);
    yPos += 6;
    formData.crewMembers.filter((m: string) => m).forEach((member: string) => {
      pdf.text(`  • ${member}`, 30, yPos);
      yPos += 5;
    });
    yPos += 5;

    // Tasks and Hazards
    pdf.setFontSize(14);
    pdf.text('Hazard Analysis', 20, yPos);
    yPos += 8;

    formData.tasks.forEach((task: any, index: number) => {
      // Check if we need a new page
      if (yPos > 250) {
        pdf.addPage();
        yPos = 20;
      }

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Task ${index + 1}: ${task.taskDescription}`, 20, yPos);
      yPos += 7;
      pdf.setFont('helvetica', 'normal');

      pdf.setFontSize(10);

      // Potential Hazards
      if (task.potentialHazards && task.potentialHazards.length > 0) {
        pdf.text('Potential Hazards:', 25, yPos);
        yPos += 5;
        task.potentialHazards.forEach((hazard: string) => {
          if (yPos > 280) {
            pdf.addPage();
            yPos = 20;
          }
          const lines = pdf.splitTextToSize(`• ${hazard}`, 160);
          pdf.text(lines, 30, yPos);
          yPos += 5 * lines.length;
        });
        yPos += 3;
      }

      // Hazard Controls
      if (task.hazardControls && task.hazardControls.length > 0) {
        if (yPos > 270) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.text('Hazard Controls:', 25, yPos);
        yPos += 5;
        task.hazardControls.forEach((control: string) => {
          if (yPos > 280) {
            pdf.addPage();
            yPos = 20;
          }
          const lines = pdf.splitTextToSize(`• ${control}`, 160);
          pdf.text(lines, 30, yPos);
          yPos += 5 * lines.length;
        });
        yPos += 3;
      }

      // PPE Required
      if (task.ppeRequired && task.ppeRequired.length > 0) {
        if (yPos > 270) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.text('PPE Required:', 25, yPos);
        yPos += 5;
        const ppeText = task.ppeRequired.join(', ');
        const ppeLines = pdf.splitTextToSize(`  ${ppeText}`, 160);
        pdf.text(ppeLines, 30, yPos);
        yPos += 5 * ppeLines.length;
      }

      yPos += 8;
    });

    // Additional Controls
    if (formData.additionalControls) {
      if (yPos > 250) {
        pdf.addPage();
        yPos = 20;
      }
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Additional Controls:', 20, yPos);
      yPos += 7;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      const controlLines = pdf.splitTextToSize(formData.additionalControls, 170);
      pdf.text(controlLines, 25, yPos);
      yPos += 5 * controlLines.length + 10;
    }

    // Signature
    if (yPos > 250) {
      pdf.addPage();
      yPos = 20;
    }
    pdf.setFontSize(12);
    pdf.text('Acknowledgment:', 20, yPos);
    yPos += 8;
    pdf.setFontSize(10);
    pdf.text('I have reviewed this Job Hazard Analysis and understand the hazards and controls.', 25, yPos);
    yPos += 10;

    pdf.line(25, yPos, 100, yPos);
    pdf.text(formData.signature, 25, yPos - 2);
    pdf.text(`Date: ${formData.signatureDate}`, 120, yPos - 2);

    // Convert to buffer
    const pdfBase64 = pdf.output('dataurlstring').split(',')[1];
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    // Generate filename and path
    const fileName = `job_hazard_analysis_job_${jobId}_${new Date().toISOString().split('T')[0]}.pdf`;
    const filePath = `job-documents/${jobId}/${fileName}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('job-documents')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload failed:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload PDF to storage', details: uploadError.message },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('job-documents')
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    // Track PDF in pdf_documents table
    const { error: pdfDocError } = await supabaseAdmin
      .from('pdf_documents')
      .insert({
        job_id: jobId,
        document_type: 'job_hazard_analysis',
        document_name: fileName,
        file_path: filePath,
        file_url: publicUrl,
        file_size_bytes: pdfBuffer.length,
        generated_by: user.id,
        metadata: {
          crew_leader: formData.crewLeader,
          crew_size: formData.crewMembers.filter((m: string) => m).length,
          tasks_analyzed: formData.tasks.length,
          date_performed: formData.datePerformed
        }
      });

    if (pdfDocError) {
      console.error('⚠️ Failed to track PDF in pdf_documents table:', pdfDocError);
    } else {
      console.log('✅ JHA PDF tracked in pdf_documents table');
    }

    console.log('✅ JHA saved successfully for job:', jobId);

    return NextResponse.json(
      {
        success: true,
        message: 'Job Hazard Analysis saved successfully',
        data: {
          pdfUrl: publicUrl,
          fileName: fileName,
          savedAt: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in JHA save route:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
