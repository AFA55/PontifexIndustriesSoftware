export const dynamic = 'force-dynamic';

/**
 * POST /api/sms-opt-in  — PUBLIC (no auth)
 * Records a person's consent to receive SMS. Backs the /sms-opt-in page that
 * serves as the Twilio toll-free / A2P opt-in proof.
 *
 * Body: { phone, contact_name?, company?, consent: true, consent_text }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { formatPhoneNumber } from '@/lib/sms';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const consent = body.consent === true;
    if (!consent) {
      return NextResponse.json({ error: 'You must check the consent box to opt in.' }, { status: 400 });
    }

    const phone = formatPhoneNumber(String(body.phone ?? ''));
    if (!phone) {
      return NextResponse.json({ error: 'Please enter a valid US phone number.' }, { status: 400 });
    }

    const contactName: string | null = (body.contact_name ?? '').toString().trim() || null;
    const company: string | null = (body.company ?? '').toString().trim() || null;
    const consentText: string | null = (body.consent_text ?? '').toString().slice(0, 2000) || null;

    // Capture source for the compliance record
    const sourceIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;
    const userAgent = request.headers.get('user-agent') || null;

    const { error } = await supabaseAdmin.from('sms_consent').insert({
      phone,
      contact_name: contactName,
      company,
      consented: true,
      consent_method: 'web_form',
      consent_text: consentText,
      source_ip: sourceIp,
      user_agent: userAgent,
    });

    if (error) {
      console.error('sms-opt-in insert error:', error);
      return NextResponse.json({ error: 'Could not record your consent. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /sms-opt-in:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
