export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/contracts/[id]/send — email the customer a signing link.
 * Mints a CSPRNG token (rotated on every send — old links die), stamps
 * sent_at, and sends the tenant-branded email via lib/email.ts.
 */
import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';
import { sendEmail, getTenantEmailBranding, emailHeader, escapeHtml, isEmailConfigured } from '@/lib/email';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireScheduleBoardAccess(request);
  if (!auth.authorized) return auth.response;
  if (!auth.tenantId) return NextResponse.json({ error: 'Tenant scope required' }, { status: 400 });
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: 'Email is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const { data: contract, error } = await supabaseAdmin
    .from('contracts')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle();
  if (error || !contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
  if (contract.status === 'signed') {
    return NextResponse.json({ error: 'Already signed — send a change order instead' }, { status: 409 });
  }
  if (contract.status === 'void') {
    return NextResponse.json({ error: 'This contract was voided' }, { status: 409 });
  }

  const token = randomBytes(32).toString('hex');
  const { error: updateError } = await supabaseAdmin
    .from('contracts')
    .update({ token, status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', auth.tenantId);
  if (updateError) {
    console.error('contract send update error:', updateError);
    return NextResponse.json({ error: 'Failed to prepare signing link' }, { status: 500 });
  }

  const branding = await getTenantEmailBranding(auth.tenantId);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.pontifexindustries.com';
  const signUrl = `${baseUrl}/contract/${token}`;
  const docLabel = contract.doc_type === 'change_order' ? 'change order' : 'contract';

  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
      ${emailHeader(branding, contract.doc_type === 'change_order' ? 'Change order for your signature' : 'Contract for your signature')}
      <tr><td style="padding: 28px 32px; font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1f2937;">
        <p style="margin: 0 0 6px; font-size: 16px;"><strong>${escapeHtml(contract.title)}</strong></p>
        ${contract.amount != null ? `<p style="margin: 0 0 14px; font-size: 14px; color: #4b5563;">Amount: $${Number(contract.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>` : ''}
        <p style="margin: 0 0 20px; font-size: 14px; color: #4b5563;">Hi ${escapeHtml(contract.customer_name)}, review the ${docLabel} below and sign electronically — it takes under a minute. You'll get a signed PDF copy for your records.</p>
        <a href="${signUrl}" style="display: inline-block; padding: 13px 28px; background: ${branding.brandColor}; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 15px;">Review &amp; Sign</a>
        <p style="margin: 22px 0 0; font-size: 12px; color: #9ca3af;">If the button doesn't work, copy this link:<br>${signUrl}</p>
      </td></tr>
    </table>`;

  const sent = await sendEmail({
    to: contract.customer_email,
    subject: `${branding.companyName}: ${contract.doc_type === 'change_order' ? 'Change order' : 'Contract'} ready to sign — ${contract.title}`,
    html,
  });
  if (!sent) return NextResponse.json({ error: 'Email failed to send' }, { status: 502 });

  Promise.resolve(
    supabaseAdmin.from('audit_logs').insert({
      user_id: auth.userId,
      action: 'contract_sent',
      entity_type: 'contract',
      entity_id: id,
      details: { title: contract.title, to: contract.customer_email, doc_type: contract.doc_type },
    })
  ).then(() => {}).catch(() => {});

  return NextResponse.json({ success: true, data: { signUrl } });
}
