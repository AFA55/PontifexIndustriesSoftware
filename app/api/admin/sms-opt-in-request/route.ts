export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/sms-opt-in-request — ADMIN/STAFF (bearer auth)
 *
 * Sends a contact a friendly "please confirm you'd like text/email updates"
 * message containing a link to the EXISTING public consent page
 * (`/sms-opt-in`), pre-filled with their phone + name so they only have to
 * check the box and confirm. That page records the compliant opt-in into the
 * `sms_consent` table (the Twilio / A2P proof of consent).
 *
 * Body: { name, phone, email?, jobId? }
 *
 * Channels:
 *  - EMAIL via Resend (when an email is present) — white-label tenant branding.
 *  - SMS best-effort via sendSMSAny (dormant until Twilio/Telnyx is configured).
 * Sends are fire-and-forget; the response reports which channels were attempted.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getTenantEmailBranding, generateNotificationEmail, sendEmail } from '@/lib/email';
import { formatPhoneNumber, sendSMSAny } from '@/lib/sms';
import { resolveAppOrigin } from '@/lib/app-url';

// Roles allowed to send an opt-in request (admin + office staff + sales).
const ALLOWED_ROLES = [
  'admin',
  'super_admin',
  'operations_manager',
  'supervisor',
  'salesman',
  'shop_manager',
];

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;
    if (!ALLOWED_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Forbidden. Staff access required.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const name: string = (body.name ?? '').toString().trim();
    const rawPhone: string = (body.phone ?? '').toString().trim();
    const email: string | null = (body.email ?? '').toString().trim() || null;

    const phone = formatPhoneNumber(rawPhone);
    if (!phone) {
      return NextResponse.json({ error: 'A valid US phone number is required.' }, { status: 400 });
    }

    // Build the pre-filled opt-in URL → lands on the existing consent page ready
    // to confirm. Use the contact's local (typed) phone for display friendliness;
    // the page just shows it back and the API re-normalizes on submit.
    const origin = resolveAppOrigin(request.headers.get('origin'));
    const params = new URLSearchParams();
    params.set('phone', rawPhone || phone);
    if (name) params.set('name', name);
    const optInUrl = `${origin}/sms-opt-in?${params.toString()}`;

    // Tenant-scoped white-label branding (super_admin tenantId may be null →
    // platform defaults, which getTenantEmailBranding handles).
    const branding = await getTenantEmailBranding(auth.tenantId);
    const company = branding.companyName;
    const greetingName = name || 'there';

    const channels: string[] = [];

    // ── EMAIL (fire-and-forget) ───────────────────────────────────────────────
    if (email) {
      channels.push('email');
      Promise.resolve()
        .then(async () => {
          const html = await generateNotificationEmail({
            branding,
            title: 'Confirm text updates',
            message:
              `Hi ${greetingName}, ${company} would like to text you job updates — ` +
              `scheduling, arrival notifications, and completion sign-offs. ` +
              `Tap the button below to confirm. Message & data rates may apply; ` +
              `reply STOP anytime to unsubscribe.`,
            actionUrl: optInUrl,
          });
          await sendEmail({
            to: email,
            subject: `${company} — confirm text updates`,
            html,
          });
        })
        .catch((err) => console.error('[sms-opt-in-request] email send failed:', err));
    }

    // ── SMS (best-effort, dormant until a provider is configured) ─────────────
    channels.push('sms');
    Promise.resolve()
      .then(() =>
        sendSMSAny({
          to: phone,
          message:
            `${company}: Hi ${greetingName}, please confirm you'd like to receive ` +
            `text updates: ${optInUrl} Reply STOP to opt out.`,
        })
      )
      .catch((err) => console.error('[sms-opt-in-request] sms send failed:', err));

    return NextResponse.json({
      success: true,
      channels,
      optInUrl,
    });
  } catch (error) {
    console.error('Error in POST /api/admin/sms-opt-in-request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
