/**
 * API Route: POST /api/service-completion-agreement/save
 * Generates PDF of signed Service Completion Agreement and saves to storage
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import jsPDF from 'jspdf';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      jobId,
      jobData,
      signatureData,
      workPerformedDetails
    } = body;

    if (!jobId || !jobData || !signatureData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create PDF
    const pdf = new jsPDF();
    let yPos = 20;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - (2 * margin);

    // Header
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text('SERVICE COMPLETION AGREEMENT', pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Pontifex Industries (formerly B&D Concrete Cutting)', pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    // Job Information
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text('JOB INFORMATION', margin, yPos);
    yPos += 10;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Job Order #: ${jobData.orderId}`, margin, yPos);
    yPos += 7;
    pdf.text(`Customer: ${jobData.customer}`, margin, yPos);
    yPos += 7;
    pdf.text(`Location: ${jobData.jobLocation}`, margin, yPos);
    yPos += 7;
    pdf.text(`Original Scope: ${jobData.workDescription}`, margin, yPos);
    yPos += 15;

    // Work Completed Section
    if (workPerformedDetails && workPerformedDetails.length > 0) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('WORK COMPLETED', margin, yPos);
      yPos += 10;

      pdf.setFont('helvetica', 'normal');
      workPerformedDetails.forEach((item: any, index: number) => {
        if (yPos > 250) {
          pdf.addPage();
          yPos = 20;
        }

        pdf.setFont('helvetica', 'bold');
        pdf.text(`${index + 1}. ${item.name}`, margin, yPos);
        yPos += 7;

        pdf.setFont('helvetica', 'normal');
        if (item.quantity > 1) {
          pdf.text(`   Quantity: ${item.quantity}`, margin, yPos);
          yPos += 6;
        }

        // Core Drilling Details
        if (item.details?.holes) {
          item.details.holes.forEach((hole: any) => {
            pdf.text(`   • Bit Size: ${hole.bitSize}", Depth: ${hole.depthInches}", Holes: ${hole.quantity}`, margin, yPos);
            yPos += 6;
            if (hole.cutSteel) {
              pdf.text(`     Steel Cut: Yes`, margin, yPos);
              yPos += 6;
            }
          });
        }

        // Sawing Details
        if (item.details?.cuts) {
          item.details.cuts.forEach((cut: any) => {
            pdf.text(`   • Linear Feet: ${cut.linearFeet} LF, Cut Depth: ${cut.cutDepth}"`, margin, yPos);
            yPos += 6;
            if (cut.bladesUsed && cut.bladesUsed.length > 0) {
              pdf.text(`     Blades: ${cut.bladesUsed.join(', ')}`, margin, yPos);
              yPos += 6;
            }
          });
        }

        if (item.notes) {
          pdf.text(`   Notes: ${item.notes}`, margin, yPos);
          yPos += 6;
        }

        yPos += 5;
      });

      yPos += 10;
    }

    // Customer Feedback Survey (if provided)
    if (signatureData.cleanlinessRating || signatureData.communicationRating || signatureData.overallRating) {
      if (yPos > 230) {
        pdf.addPage();
        yPos = 20;
      }

      pdf.setFont('helvetica', 'bold');
      pdf.text('CUSTOMER FEEDBACK SURVEY', margin, yPos);
      yPos += 10;

      pdf.setFont('helvetica', 'normal');
      if (signatureData.cleanlinessRating) {
        pdf.text(`Site Cleanliness: ${signatureData.cleanlinessRating}/10`, margin, yPos);
        yPos += 7;
      }
      if (signatureData.communicationRating) {
        pdf.text(`Operator Communication: ${signatureData.communicationRating}/10`, margin, yPos);
        yPos += 7;
      }
      if (signatureData.overallRating) {
        pdf.text(`Overall Experience: ${signatureData.overallRating}/10`, margin, yPos);
        yPos += 7;
      }
      if (signatureData.feedbackComments) {
        pdf.text(`Comments: ${signatureData.feedbackComments}`, margin, yPos);
        yPos += 10;
      }

      yPos += 10;
    }

    // Completion Acknowledgment
    if (yPos > 200) {
      pdf.addPage();
      yPos = 20;
    }

    pdf.setFont('helvetica', 'bold');
    pdf.text('WORK COMPLETION ACKNOWLEDGMENT', margin, yPos);
    yPos += 10;

    pdf.setFont('helvetica', 'normal');
    const ackText = `I acknowledge that Pontifex Industries (formerly B&D Concrete Cutting) has ${signatureData.workSatisfactory ? 'satisfactorily completed' : 'completed'} the contracted services at the above location as described.`;
    const ackLines = pdf.splitTextToSize(ackText, contentWidth);
    pdf.text(ackLines, margin, yPos);
    yPos += (ackLines.length * 7) + 10;

    if (signatureData.additionalNotes) {
      pdf.text(`Notes: ${signatureData.additionalNotes}`, margin, yPos);
      yPos += 10;
    }

    // Signature Section
    if (yPos > 220) {
      pdf.addPage();
      yPos = 20;
    }

    pdf.setFont('helvetica', 'bold');
    pdf.text('SIGNATURE', margin, yPos);
    yPos += 10;

    pdf.setFont('helvetica', 'normal');
    pdf.text(`Customer Name: ${signatureData.customerName}`, margin, yPos);
    yPos += 7;
    if (signatureData.customerTitle) {
      pdf.text(`Title: ${signatureData.customerTitle}`, margin, yPos);
      yPos += 7;
    }

    pdf.setFont('helvetica', 'italic');
    pdf.text(`Signature: ${signatureData.signature}`, margin, yPos);
    yPos += 7;

    pdf.setFont('helvetica', 'normal');
    pdf.text(`Date/Time: ${new Date().toLocaleString()}`, margin, yPos);

    // Footer
    const footerY = pdf.internal.pageSize.getHeight() - 20;
    pdf.setFontSize(8);
    pdf.setTextColor(128, 128, 128);
    pdf.text('Generated with Claude Code - Pontifex Platform', pageWidth / 2, footerY, { align: 'center' });

    // Convert PDF to buffer
    const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));

    // Upload to Supabase Storage
    const fileName = `service-completion-agreement-${jobId}-${Date.now()}.pdf`;
    const filePath = `job-${jobId}/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('JobDocuments')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      // Don't block job completion if PDF upload fails
      console.log('PDF upload failed, continuing without PDF storage');
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('JobDocuments')
      .getPublicUrl(filePath);

    // Track in pdf_documents table
    const { error: pdfDocError } = await supabaseAdmin
      .from('pdf_documents')
      .insert({
        job_id: jobId,
        document_type: 'service_completion_agreement',
        document_name: fileName,
        file_path: filePath,
        file_url: publicUrl,
        file_size_bytes: pdfBuffer.length,
        generated_by: user.id,
        metadata: {
          customer_name: signatureData.customerName,
          customer_title: signatureData.customerTitle,
          signature: signatureData.signature,
          work_satisfactory: signatureData.workSatisfactory,
          cleanliness_rating: signatureData.cleanlinessRating,
          communication_rating: signatureData.communicationRating,
          overall_rating: signatureData.overallRating,
          signed_at: new Date().toISOString()
        }
      });

    if (pdfDocError) {
      console.error('PDF doc tracking error:', pdfDocError);
    }

    // Send email notifications
    try {
      // Get job details for email
      const { data: job } = await supabaseAdmin
        .from('job_orders')
        .select('customer_email, salesperson_email, customer')
        .eq('id', jobId)
        .single();

      if (job) {
        // Send email to customer with PDF
        if (job.customer_email) {
          await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: job.customer_email,
              subject: `Service Completion Agreement - Job #${jobId}`,
              html: `
                <h2>Service Completion Agreement</h2>
                <p>Dear ${job.customer},</p>
                <p>Thank you for choosing Pontifex Industries (formerly B&D Concrete Cutting)!</p>
                <p>Your signed Service Completion Agreement is attached to this email for your records.</p>
                <p><strong>Job ID:</strong> ${jobId}</p>
                <p><strong>Signed by:</strong> ${signatureData.customerName}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                <p>You can also view the document here: <a href="${publicUrl}">View PDF</a></p>
                <p>If you have any questions, please don't hesitate to contact us.</p>
                <p>Best regards,<br>Pontifex Industries Team</p>
              `,
              pdfUrl: publicUrl,
              pdfName: fileName
            })
          });
          console.log('Customer email sent successfully');
        }

        // Send notification to salesperson
        if (job.salesperson_email) {
          await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: job.salesperson_email,
              subject: `Job Completed & Signed - ${job.customer} (Job #${jobId})`,
              html: `
                <h2>Job Completion Notification</h2>
                <p>A job has been completed and signed by the customer.</p>
                <p><strong>Customer:</strong> ${job.customer}</p>
                <p><strong>Job ID:</strong> ${jobId}</p>
                <p><strong>Signed by:</strong> ${signatureData.customerName}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                ${signatureData.overallRating ? `<p><strong>Customer Rating:</strong> ${signatureData.overallRating}/10</p>` : ''}
                ${signatureData.feedbackComments ? `<p><strong>Customer Feedback:</strong> ${signatureData.feedbackComments}</p>` : ''}
                <p>View the signed agreement: <a href="${publicUrl}">View PDF</a></p>
                <p>Thank you!</p>
              `
            })
          });
          console.log('Salesperson notification sent successfully');
        }
      }
    } catch (emailError) {
      console.error('Email notification error:', emailError);
      // Don't fail the request if email fails
    }

    return NextResponse.json({
      success: true,
      fileUrl: publicUrl,
      fileName: fileName
    });

  } catch (error: any) {
    console.error('Error generating PDF:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
