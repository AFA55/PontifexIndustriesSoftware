import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// SECURITY: Sanitize user input before inserting into HTML emails
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, company, email, phone, tradeType, companySize, message } = body;

    if (!name || !company || !email || !tradeType || !companySize) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Basic input validation
    if (typeof name !== 'string' || name.length > 200) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
    }
    if (typeof company !== 'string' || company.length > 200) {
      return NextResponse.json({ error: 'Invalid company' }, { status: 400 });
    }
    if (typeof email !== 'string' || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }
    if (message && (typeof message !== 'string' || message.length > 2000)) {
      return NextResponse.json({ error: 'Message too long' }, { status: 400 });
    }

    // Sanitize all inputs for HTML email
    const safeName = escapeHtml(name);
    const safeCompany = escapeHtml(company);
    const safeEmail = escapeHtml(email);
    const safePhone = escapeHtml(phone || 'Not provided');
    const safeTradeType = escapeHtml(tradeType);
    const safeCompanySize = escapeHtml(companySize);
    const safeMessage = message ? escapeHtml(message) : '';

    // Try to save to Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('placeholder')) {
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error } = await supabase.from('demo_requests').insert({
        name,
        company,
        email,
        phone: phone || null,
        trade_type: tradeType,
        company_size: companySize,
        message: message || null,
        created_at: new Date().toISOString(),
      });

      // If table doesn't exist, that's okay — we'll still send the email
      if (error && !error.message?.includes('does not exist') && !error.message?.includes('42P01')) {
        console.warn('[demo-request] DB insert warning:', error.message);
      }
    }

    // Try to send notification email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Patriot Concrete Cutting <noreply@admin.patriotconcretecutting.com>';

    if (resendKey) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: ['patriotconcretecutting@gmail.com'],
            subject: `New Demo Request: ${safeName} - ${safeCompany}`,
            html: `
              <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #3b82f6;">New Demo Request</h2>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 8px 0; color: #666; width: 120px;">Name</td><td style="padding: 8px 0; font-weight: 600;">${safeName}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Company</td><td style="padding: 8px 0; font-weight: 600;">${safeCompany}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Email</td><td style="padding: 8px 0;"><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Phone</td><td style="padding: 8px 0;">${safePhone}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Trade</td><td style="padding: 8px 0;">${safeTradeType}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Company Size</td><td style="padding: 8px 0;">${safeCompanySize}</td></tr>
                </table>
                ${safeMessage ? `<div style="margin-top: 16px; padding: 16px; background: #f3f4f6; border-radius: 8px;"><strong>Message:</strong><br/>${safeMessage}</div>` : ''}
                <p style="color: #999; font-size: 12px; margin-top: 24px;">Sent from the Patriot Concrete Cutting landing page</p>
              </div>
            `,
          }),
        });
      } catch (emailErr) {
        console.warn('[demo-request] Email notification failed:', emailErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[demo-request] Error:', err);
    return NextResponse.json(
      { error: 'Failed to submit demo request' },
      { status: 500 }
    );
  }
}
