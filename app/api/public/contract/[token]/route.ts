export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Public contract signing (no auth — the CSPRNG token IS the credential).
 *   GET  /api/public/contract/[token]  — fetch the contract for display (marks viewed)
 *   POST /api/public/contract/[token]  — sign: saves signature, renders + stores the
 *        PDF in the 'contracts' bucket, marks signed, emails the signed copy plus a
 *        customer-portal login link (customer_portal_tokens).
 * Token is single-use for signing; a signed/voided contract can't be re-signed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { generateAndUploadContractPdf } from '@/lib/generate-contract-pdf';
import { sendEmail, getTenantEmailBranding, emailHeader, escapeHtml, isEmailConfigured } from '@/lib/email';

async function fetchByToken(token: string) {
  if (!token || token.length < 32) return null;
  const { data } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  return data;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const contract = await fetchByToken(token);
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (contract.status === 'void') return NextResponse.json({ error: 'This document is no longer active' }, { status: 410 });

  // First open → viewed (fire-and-forget; display isn't blocked on it).
  if (contract.status === 'sent') {
    Promise.resolve(
      supabaseAdmin
        .from('contracts')
        .update({ status: 'viewed', viewed_at: new Date().toISOString() })
        .eq('id', contract.id)
        .eq('status', 'sent')
    ).then(() => {}).catch(() => {});
  }

  // Branding for the public page (name + color + logo only).
  const branding = await getTenantEmailBranding(contract.tenant_id);
  let jobNumber: string | null = null;
  if (contract.job_id) {
    const { data: job } = await supabaseAdmin
      .from('job_orders')
      .select('job_number')
      .eq('id', contract.job_id)
      .maybeSingle();
    jobNumber = job?.job_number ?? null;
  }

  // The contracts bucket is private (security F1). The valid token already
  // authorized this customer for THIS contract — hand back a short-lived
  // SIGNED url instead of a permanent public one.
  const { signStoredUrl } = await import('@/lib/storage-url-server');
  const signedPdfUrl = contract.status === 'signed' ? await signStoredUrl(contract.pdf_url) : null;

  // Explicit pick list — never spread the row to a public caller.
  return NextResponse.json({
    success: true,
    data: {
      doc_type: contract.doc_type,
      title: contract.title,
      work_description: contract.work_description,
      terms: contract.terms,
      amount: contract.amount,
      customer_name: contract.customer_name,
      status: contract.status,
      signed_at: contract.signed_at,
      pdf_url: signedPdfUrl,
      job_number: jobNumber,
      company: { name: branding.companyName, color: branding.brandColor, logo: branding.logoUrl },
    },
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const contract = await fetchByToken(token);
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (contract.status === 'signed') return NextResponse.json({ error: 'Already signed' }, { status: 409 });
  if (contract.status === 'void') return NextResponse.json({ error: 'This document is no longer active' }, { status: 410 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const signerName = String(body?.signerName ?? '').trim();
  const signatureDataUrl = String(body?.signatureDataUrl ?? '');
  if (!signerName) return NextResponse.json({ error: 'Please type your full name' }, { status: 400 });
  if (!signatureDataUrl.startsWith('data:image/') || signatureDataUrl.length < 200 || signatureDataUrl.length > 500_000) {
    return NextResponse.json({ error: 'Please draw your signature' }, { status: 400 });
  }

  // CAS claim: only one signing wins even on double-submit.
  const { data: claimed } = await supabaseAdmin
    .from('contracts')
    .update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      signer_name: signerName,
      signature_data: signatureDataUrl,
    })
    .eq('id', contract.id)
    .in('status', ['sent', 'viewed'])
    .select('id')
    .maybeSingle();
  if (!claimed) return NextResponse.json({ error: 'Already signed' }, { status: 409 });

  // Render + store the signed PDF. If this fails the signature is still
  // recorded — we surface pdf_url null and the office can regenerate later.
  let pdfUrl: string | null = null;
  try {
    const result = await generateAndUploadContractPdf({
      contract: {
        id: contract.id,
        tenant_id: contract.tenant_id,
        job_id: contract.job_id,
        parent_contract_id: contract.parent_contract_id,
        doc_type: contract.doc_type,
        title: contract.title,
        work_description: contract.work_description,
        terms: contract.terms,
        amount: contract.amount,
        customer_name: contract.customer_name,
        customer_email: contract.customer_email,
      },
      signerName,
      signatureDataUrl,
    });
    pdfUrl = result.pdfUrl;
    await supabaseAdmin.from('contracts').update({ pdf_url: pdfUrl }).eq('id', contract.id);
  } catch (err) {
    console.error('[contract-sign] PDF generation failed:', err instanceof Error ? err.message : err);
  }

  // Customer portal login link ("sign into our app") — reuse the existing
  // customer_portal_tokens magic-link system.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.pontifexindustries.com';
  let portalUrl: string | null = null;
  try {
    const { data: portalToken } = await supabaseAdmin
      .from('customer_portal_tokens')
      .insert({
        tenant_id: contract.tenant_id,
        customer_name: contract.customer_name,
        customer_email: contract.customer_email,
        job_order_id: contract.job_id,
      })
      .select('token')
      .single();
    if (portalToken?.token) portalUrl = `${baseUrl}/portal/${portalToken.token}`;
  } catch {
    // portal link is a bonus, not a blocker
  }

  // Email the signed copy (fire-and-forget).
  if (isEmailConfigured()) {
    Promise.resolve(
      (async () => {
        const branding = await getTenantEmailBranding(contract.tenant_id);
        const docLabel = contract.doc_type === 'change_order' ? 'change order' : 'contract';
        const html = `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
            ${emailHeader(branding, 'Signed copy for your records')}
            <tr><td style="padding: 28px 32px; font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1f2937;">
              <p style="margin: 0 0 14px; font-size: 15px;">Thanks ${escapeHtml(signerName)} — your ${docLabel} <strong>${escapeHtml(contract.title)}</strong> is signed.</p>
              ${pdfUrl ? `<a href="${pdfUrl}" style="display: inline-block; padding: 12px 24px; background: ${branding.brandColor}; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">Download signed PDF</a>` : ''}
              ${portalUrl ? `<p style="margin: 22px 0 0; font-size: 14px; color: #4b5563;">Track your project anytime:<br><a href="${portalUrl}" style="color: ${branding.brandColor}; font-weight: 600;">Open your customer portal</a></p>` : ''}
            </td></tr>
          </table>`;
        await sendEmail({
          to: contract.customer_email,
          subject: `Signed: ${contract.title} — ${branding.companyName}`,
          html,
        });
      })()
    ).then(() => {}).catch(() => {});
  }

  // Notify the office (fire-and-forget, established pattern).
  Promise.resolve(
    supabaseAdmin.from('audit_logs').insert({
      user_id: contract.created_by,
      action: 'contract_signed',
      entity_type: 'contract',
      entity_id: contract.id,
      details: { title: contract.title, signer: signerName, doc_type: contract.doc_type },
    })
  ).then(() => {}).catch(() => {});

  return NextResponse.json({ success: true, data: { pdfUrl, portalUrl } });
}
