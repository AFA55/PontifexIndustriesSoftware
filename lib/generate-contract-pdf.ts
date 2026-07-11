/**
 * lib/generate-contract-pdf.ts
 *
 * Renders a signed contract / change order to PDF and uploads it to the
 * `contracts` Supabase Storage bucket. Mirrors generate-completion-pdf.ts.
 * Called by POST /api/public/contract/[token] (the signing moment).
 */
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { supabaseAdmin } from '@/lib/supabase-admin';
import ContractPDF, { type ContractPDFData } from '@/components/pdf/ContractPDF';

export interface GenerateContractPdfOptions {
  contract: {
    id: string;
    tenant_id: string;
    job_id: string | null;
    parent_contract_id: string | null;
    doc_type: 'contract' | 'change_order';
    title: string;
    work_description: string | null;
    terms: string | null;
    amount: number | null;
    customer_name: string;
    customer_email: string;
  };
  signerName: string;
  signatureDataUrl: string;
}

export async function generateAndUploadContractPdf(
  opts: GenerateContractPdfOptions
): Promise<{ pdfUrl: string; storagePath: string }> {
  const { contract, signerName, signatureDataUrl } = opts;

  // Tenant branding (same source as emails + completion PDFs).
  let companyName = 'Pontifex Industries';
  let companyAddress = '';
  let companyPhone = '';
  let brandColor: string | undefined;
  try {
    const { data: branding } = await supabaseAdmin
      .from('tenant_branding')
      .select('company_name, support_phone, company_address, company_city, company_state, company_zip, primary_color')
      .eq('tenant_id', contract.tenant_id)
      .limit(1)
      .maybeSingle();
    if (branding) {
      companyName = branding.company_name || companyName;
      companyAddress = [branding.company_address, branding.company_city, branding.company_state, branding.company_zip]
        .filter(Boolean)
        .join(', ');
      companyPhone = branding.support_phone || '';
      brandColor = branding.primary_color || undefined;
    }
  } catch {
    // defaults
  }

  // Job number + parent contract title for context lines.
  let jobNumber: string | null = null;
  if (contract.job_id) {
    const { data: job } = await supabaseAdmin
      .from('job_orders')
      .select('job_number')
      .eq('id', contract.job_id)
      .maybeSingle();
    jobNumber = job?.job_number ?? null;
  }
  let parentTitle: string | null = null;
  if (contract.parent_contract_id) {
    const { data: parent } = await supabaseAdmin
      .from('contracts')
      .select('title')
      .eq('id', contract.parent_contract_id)
      .maybeSingle();
    parentTitle = parent?.title ?? null;
  }

  const pdfData: ContractPDFData = {
    doc_type: contract.doc_type,
    title: contract.title,
    work_description: contract.work_description,
    terms: contract.terms,
    amount: contract.amount,
    customer_name: contract.customer_name,
    customer_email: contract.customer_email,
    job_number: jobNumber,
    parent_title: parentTitle,
    signer_name: signerName,
    signature_data_url: signatureDataUrl,
    signed_at: new Date().toISOString(),
    company_name: companyName,
    company_address: companyAddress,
    company_phone: companyPhone,
    brand_color: brandColor,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(React.createElement(ContractPDF, { data: pdfData }) as any);

  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === 'contracts')) {
    const { error: bucketError } = await supabaseAdmin.storage.createBucket('contracts', { public: true });
    if (bucketError && !/already exists/i.test(bucketError.message)) {
      throw new Error(`contracts bucket creation failed: ${bucketError.message}`);
    }
  }

  const storagePath = `${contract.tenant_id}/${contract.id}/${contract.doc_type}-${Date.now()}.pdf`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from('contracts')
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw new Error(`Contract PDF upload failed: ${uploadError.message}`);

  const { data: urlData } = supabaseAdmin.storage.from('contracts').getPublicUrl(storagePath);
  return { pdfUrl: urlData?.publicUrl || '', storagePath };
}
