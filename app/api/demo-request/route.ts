import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
        console.warn('Demo request DB insert warning:', error.message);
      }
    }

    // Try to send notification email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'Pontifex Industries <noreply@admin.pontifexindustries.com>';

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
            to: ['pontifexindustries@gmail.com'],
            subject: `🚀 New Demo Request: ${company} (${tradeType})`,
            html: `
              <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #3b82f6;">New Demo Request</h2>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr><td style="padding: 8px 0; color: #666; width: 120px;">Name</td><td style="padding: 8px 0; font-weight: 600;">${name}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Company</td><td style="padding: 8px 0; font-weight: 600;">${company}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Email</td><td style="padding: 8px 0;"><a href="mailto:${email}">${email}</a></td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Phone</td><td style="padding: 8px 0;">${phone || 'Not provided'}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Trade</td><td style="padding: 8px 0;">${tradeType}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Company Size</td><td style="padding: 8px 0;">${companySize}</td></tr>
                </table>
                ${message ? `<div style="margin-top: 16px; padding: 16px; background: #f3f4f6; border-radius: 8px;"><strong>Message:</strong><br/>${message}</div>` : ''}
                <p style="color: #999; font-size: 12px; margin-top: 24px;">Sent from the Pontifex Industries landing page</p>
              </div>
            `,
          }),
        });
      } catch (emailErr) {
        console.warn('Email notification failed:', emailErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Demo request error:', err);
    return NextResponse.json(
      { error: 'Failed to submit demo request' },
      { status: 500 }
    );
  }
}
