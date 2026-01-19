import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from './supabase';

interface PDFGenerationOptions {
  jobId: string;
  documentType: 'work_order_contract' | 'job_ticket' | 'completion_report' | 'equipment_checklist' | 'silica_form' | 'work_performed' | 'pictures_report';
  metadata?: Record<string, any>;
  htmlElement?: HTMLElement;
  customFileName?: string;
}

interface PDFDocumentRecord {
  job_id: string;
  document_type: string;
  document_name: string;
  file_path: string;
  file_url?: string;
  file_size_bytes: number;
  metadata?: Record<string, any>;
}

export class PDFGenerator {
  private supabaseClient = supabase;

  /**
   * Generate PDF from HTML element
   */
  async generateFromHTML(
    element: HTMLElement,
    options: PDFGenerationOptions
  ): Promise<{ success: boolean; pdfBlob?: Blob; error?: string }> {
    try {
      // Capture HTML element as canvas
      const canvas = await html2canvas(element, {
        scale: 2, // Higher quality
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      // Calculate PDF dimensions
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');

      // Add pages if content is longer than one page
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= 297; // A4 height in mm

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= 297;
      }

      // Convert to blob
      const pdfBlob = pdf.output('blob');

      return { success: true, pdfBlob };
    } catch (error) {
      console.error('Error generating PDF from HTML:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Generate Work Order Contract PDF
   */
  async generateWorkOrderContract(
    jobData: any,
    signatureData: any
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPosition = margin;

      // Header - Orange background
      pdf.setFillColor(234, 88, 12); // Orange-600
      pdf.rect(0, 0, pageWidth, 40, 'F');

      // Company name
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(24);
      pdf.setFont('helvetica', 'bold');
      pdf.text('PONTIFEX INDUSTRIES', margin, 20);

      pdf.setFontSize(16);
      pdf.text('Work Order & Service Agreement', margin, 30);

      // Reset text color
      pdf.setTextColor(0, 0, 0);
      yPosition = 50;

      // Work Order Info
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Work Order #: ${jobData.orderId}`, margin, yPosition);
      pdf.text(`Date: ${new Date(jobData.date).toLocaleDateString()}`, pageWidth - margin - 60, yPosition);
      yPosition += 10;

      // Customer Information Section
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Customer Information', margin, yPosition);
      yPosition += 8;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Company: ${jobData.customer}`, margin + 5, yPosition);
      yPosition += 6;
      pdf.text(`Location: ${jobData.jobLocation}`, margin + 5, yPosition);
      yPosition += 6;
      if (jobData.poNumber) {
        pdf.text(`PO Number: ${jobData.poNumber}`, margin + 5, yPosition);
        yPosition += 6;
      }
      yPosition += 5;

      // Scope of Work Section
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Scope of Work', margin, yPosition);
      yPosition += 8;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      const workDescLines = pdf.splitTextToSize(jobData.workDescription, pageWidth - 2 * margin);
      pdf.text(workDescLines, margin + 5, yPosition);
      yPosition += (workDescLines.length * 5) + 8;

      // GPR & Liability Limitations - Critical Section
      if (yPosition > pageHeight - 80) {
        pdf.addPage();
        yPosition = margin;
      }

      pdf.setFillColor(254, 226, 226); // Red-100
      pdf.rect(margin, yPosition, pageWidth - 2 * margin, 60, 'F');
      yPosition += 5;

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(153, 27, 27); // Red-900
      pdf.text('⚠ CRITICAL NOTICE - GPR & LIABILITY LIMITATIONS', margin + 5, yPosition);
      yPosition += 8;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(127, 29, 29); // Red-900

      const limitations = [
        '• Customer is solely responsible for accurate work location layout',
        '• NO responsibility for water damage from wet cutting operations',
        '• GPR does NOT guarantee detection of all obstructions including:',
        '  - Post-tension cables or small rebar (<#4)',
        '  - Non-metallic utilities (PVC, fiber optic)',
        '  - De-energized electrical lines',
        '  - Obstructions in newly poured concrete (<30 days)',
        '  - Items beyond equipment penetration limits',
        '• Customer accepts responsibility for unforeseen conditions',
      ];

      limitations.forEach(limitation => {
        pdf.text(limitation, margin + 8, yPosition);
        yPosition += 5;
      });

      pdf.setTextColor(0, 0, 0);
      yPosition += 10;

      // Cut-Through Authorization if applicable
      if (signatureData.cutThroughAuthorized) {
        if (yPosition > pageHeight - 40) {
          pdf.addPage();
          yPosition = margin;
        }

        pdf.setFillColor(254, 242, 242); // Red-50
        pdf.rect(margin, yPosition, pageWidth - 2 * margin, 30, 'F');
        yPosition += 5;

        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(153, 27, 27);
        pdf.text('⚠ CUT-THROUGH AUTHORIZATION', margin + 5, yPosition);
        yPosition += 7;

        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        pdf.text('Customer has authorized cutting through marked obstructions and', margin + 5, yPosition);
        yPosition += 5;
        pdf.text('accepts 100% liability for all resulting damages.', margin + 5, yPosition);
        yPosition += 7;

        pdf.setFont('helvetica', 'italic');
        pdf.text(`Authorization Signature: ${signatureData.cutThroughSignature}`, margin + 5, yPosition);
        yPosition += 7;

        pdf.setTextColor(0, 0, 0);
        yPosition += 5;
      }

      // Acceptance Section
      if (yPosition > pageHeight - 60) {
        pdf.addPage();
        yPosition = margin;
      }

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Agreement Acceptance', margin, yPosition);
      yPosition += 10;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text('By signing below, the customer acknowledges:', margin + 5, yPosition);
      yPosition += 6;

      const acknowledgments = [
        '✓ I have read and understand all terms and conditions',
        '✓ I have authority to bind Customer to this Agreement',
        '✓ I accept all limitations of liability stated above',
        '✓ I will ensure Customer fulfills all obligations',
      ];

      acknowledgments.forEach(ack => {
        pdf.text(ack, margin + 8, yPosition);
        yPosition += 5;
      });

      yPosition += 8;

      // Signature Section
      pdf.setDrawColor(0, 0, 0);
      pdf.line(margin + 5, yPosition, pageWidth - margin - 5, yPosition);
      yPosition += 6;

      pdf.setFont('helvetica', 'bold');
      pdf.text('Customer Signature:', margin + 5, yPosition);
      pdf.setFont('times', 'italic');
      pdf.setFontSize(16);
      pdf.text(signatureData.signature, margin + 60, yPosition);
      yPosition += 8;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Print Name: ${signatureData.name}`, margin + 5, yPosition);
      if (signatureData.title) {
        pdf.text(`Title: ${signatureData.title}`, pageWidth / 2, yPosition);
      }
      yPosition += 6;
      pdf.text(`Date: ${new Date(signatureData.date).toLocaleString()}`, margin + 5, yPosition);

      // Footer
      yPosition = pageHeight - 15;
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text('Generated with Pontifex Industries Platform', margin, yPosition);
      pdf.text(`Page ${pdf.internal.pages.length - 1}`, pageWidth - margin - 15, yPosition);

      // Upload to Supabase Storage
      return await this.uploadPDF(pdf.output('blob'), {
        jobId: jobData.jobId,
        documentType: 'work_order_contract',
        metadata: {
          signerName: signatureData.name,
          signerTitle: signatureData.title,
          signedAt: signatureData.date,
          cutThroughAuthorized: signatureData.cutThroughAuthorized || false
        }
      });

    } catch (error) {
      console.error('Error generating work order contract PDF:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Generate Job Ticket PDF
   */
  async generateJobTicket(jobData: any): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 15;
      let yPosition = margin;

      // Header
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('PONTIFEX INDUSTRIES', margin, yPosition);
      yPosition += 8;

      pdf.setFontSize(16);
      pdf.text('JOB TICKET', margin, yPosition);
      yPosition += 10;

      // Job Information
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Job #: ${jobData.job_number}`, margin, yPosition);
      pdf.text(`Date: ${new Date(jobData.job_date).toLocaleDateString()}`, pageWidth - margin - 50, yPosition);
      yPosition += 8;

      pdf.text('Customer:', margin, yPosition);
      pdf.setFont('helvetica', 'normal');
      pdf.text(jobData.customer_name, margin + 30, yPosition);
      yPosition += 6;

      pdf.setFont('helvetica', 'bold');
      pdf.text('Location:', margin, yPosition);
      pdf.setFont('helvetica', 'normal');
      const locationLines = pdf.splitTextToSize(jobData.location || jobData.address, pageWidth - margin - 35);
      pdf.text(locationLines, margin + 30, yPosition);
      yPosition += (locationLines.length * 6) + 4;

      // Work Description
      yPosition += 5;
      pdf.setFont('helvetica', 'bold');
      pdf.text('Work Description:', margin, yPosition);
      yPosition += 6;
      pdf.setFont('helvetica', 'normal');
      const descLines = pdf.splitTextToSize(
        jobData.job_description || jobData.scope_of_work || 'Concrete cutting and coring services',
        pageWidth - 2 * margin
      );
      pdf.text(descLines, margin, yPosition);
      yPosition += (descLines.length * 6) + 8;

      // Equipment/Materials if available
      if (jobData.equipment_items && jobData.equipment_items.length > 0) {
        pdf.setFont('helvetica', 'bold');
        pdf.text('Equipment:', margin, yPosition);
        yPosition += 6;
        pdf.setFont('helvetica', 'normal');
        jobData.equipment_items.forEach((item: string) => {
          pdf.text(`• ${item}`, margin + 5, yPosition);
          yPosition += 5;
        });
        yPosition += 5;
      }

      // Worker/Technician Info
      if (jobData.technician_name || jobData.assigned_operator) {
        pdf.setFont('helvetica', 'bold');
        pdf.text('Assigned To:', margin, yPosition);
        pdf.setFont('helvetica', 'normal');
        pdf.text(jobData.technician_name || jobData.assigned_operator || 'TBD', margin + 35, yPosition);
        yPosition += 8;
      }

      // Acknowledgment section
      yPosition += 10;
      pdf.setFillColor(240, 240, 240);
      pdf.rect(margin, yPosition, pageWidth - 2 * margin, 50, 'F');
      yPosition += 6;

      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Acknowledgment', margin + 5, yPosition);
      yPosition += 8;

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Work has been completed satisfactorily and is acceptable.', margin + 5, yPosition);
      yPosition += 10;

      pdf.text('Customer Signature: ____________________________', margin + 5, yPosition);
      yPosition += 8;
      pdf.text('Date: ____________________', margin + 5, yPosition);

      // Upload to storage
      return await this.uploadPDF(pdf.output('blob'), {
        jobId: jobData.id,
        documentType: 'job_ticket',
        metadata: {
          jobNumber: jobData.job_number,
          customerName: jobData.customer_name
        }
      });

    } catch (error) {
      console.error('Error generating job ticket PDF:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Upload PDF to Supabase Storage and track in database
   */
  private async uploadPDF(
    pdfBlob: Blob,
    options: PDFGenerationOptions
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const fileName = options.customFileName ||
        `${options.documentType}_${options.jobId}_${Date.now()}.pdf`;

      const filePath = `${options.jobId}/${fileName}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await this.supabaseClient.storage
        .from('job-documents')
        .upload(filePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return { success: false, error: uploadError.message };
      }

      // Get public URL
      const { data: { publicUrl } } = this.supabaseClient.storage
        .from('job-documents')
        .getPublicUrl(filePath);

      // Save PDF record to database
      const { data: { user } } = await this.supabaseClient.auth.getUser();

      const pdfRecord: PDFDocumentRecord = {
        job_id: options.jobId,
        document_type: options.documentType,
        document_name: fileName,
        file_path: filePath,
        file_url: publicUrl,
        file_size_bytes: pdfBlob.size,
        metadata: options.metadata
      };

      const { error: dbError } = await this.supabaseClient
        .from('pdf_documents')
        .insert({
          ...pdfRecord,
          generated_by: user?.id
        });

      if (dbError) {
        console.error('Database insert error:', dbError);
        // Don't fail if database insert fails - PDF is already uploaded
      }

      return { success: true, url: publicUrl };

    } catch (error) {
      console.error('Error uploading PDF:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get all PDFs for a job
   */
  async getJobPDFs(jobId: string): Promise<any[]> {
    const { data, error } = await this.supabaseClient
      .from('latest_pdf_documents')
      .select('*')
      .eq('job_id', jobId)
      .order('generated_at', { ascending: false });

    if (error) {
      console.error('Error fetching job PDFs:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Download a PDF
   */
  async downloadPDF(filePath: string, fileName: string): Promise<void> {
    const { data, error } = await this.supabaseClient.storage
      .from('job-documents')
      .download(filePath);

    if (error) {
      console.error('Error downloading PDF:', error);
      throw error;
    }

    // Create download link
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }
}

// Export singleton instance
export const pdfGenerator = new PDFGenerator();
