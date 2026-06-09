export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/config-status
 * Returns which optional integrations are configured in this deployment.
 * SECURITY: Requires admin-level auth — operators should not see this.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { isEmailConfigured } from '@/lib/email';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  // SMS can be delivered via Telnyx (newer) or Twilio (older lib/sms.ts path).
  // Both paths are in use: Telnyx for /api/send-sms, Twilio for lib/sms.ts dispatch.
  const telnyxConfigured = !!(
    process.env.TELNYX_API_KEY && process.env.TELNYX_PHONE_NUMBER
  );
  const twilioConfigured = !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
  const sms_configured = telnyxConfigured || twilioConfigured;

  return NextResponse.json({
    success: true,
    data: {
      sms_configured,
      telnyx_configured: telnyxConfigured,
      twilio_configured: twilioConfigured,
      email_configured:
        isEmailConfigured() || !!process.env.SENDGRID_API_KEY,
    },
  });
}
