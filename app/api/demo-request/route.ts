export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, generateDemoRequestNotificationEmail } from '@/lib/email';

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

    // Send notification email through the sanitized sendEmail() path (inherits the
    // sanitized Resend key + verified domain — no more raw fetch with a raw key).
    // INTERNAL Pontifex alert → stays Pontifex-branded (NOT tenant-scoped).
    try {
      const html = await generateDemoRequestNotificationEmail({
        name,
        company,
        email,
        phone: phone || null,
        tradeType,
        companySize,
        message: message || null,
      });
      await sendEmail({
        // Platform-demo leads belong to Pontifex (the software company), not a tenant.
        to: 'pontifexindustries@gmail.com',
        subject: `New Demo Request: ${name} - ${company}`,
        html,
      });
    } catch (emailErr) {
      console.warn('[demo-request] Email notification failed:', emailErr);
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
