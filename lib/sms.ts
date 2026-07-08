/**
 * SMS Notification Service
 * Handles sending SMS via Telnyx (preferred) or Twilio (fallback).
 */

// Twilio configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Telnyx configuration (no npm package needed — uses fetch)
const telnyxApiKey = process.env.TELNYX_API_KEY;
const telnyxPhoneNumber = process.env.TELNYX_PHONE_NUMBER;

/**
 * Send SMS via Telnyx or Twilio, whichever is configured.
 * Telnyx is preferred (no npm dependency).
 * Returns { success, messageId?, error? }.
 */
export async function sendSMSAny(options: SMSOptions): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: string;
}> {
  const toNumber = formatPhoneNumber(options.to);
  if (!toNumber) {
    return { success: false, error: 'Invalid phone number format' };
  }

  // 1. Try Telnyx first (pure HTTP, no npm required)
  if (telnyxApiKey && telnyxPhoneNumber) {
    try {
      const res = await fetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${telnyxApiKey}`,
        },
        body: JSON.stringify({
          from: telnyxPhoneNumber,
          to: toNumber,
          text: options.message,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        void meterSms(options, 'telnyx');
        return {
          success: true,
          messageId: data?.data?.id,
          provider: 'telnyx',
        };
      }
      const errData = await res.json().catch(() => ({}));
      console.warn('Telnyx SMS failed, trying Twilio:', errData);
    } catch (err) {
      console.warn('Telnyx fetch error, trying Twilio:', err);
    }
  }

  // 2. Fallback to Twilio
  return sendSMS(options);
}

/**
 * Send a signature-request SMS to a customer.
 * Message is concise — under 160 chars wherever possible.
 */
export async function sendSignatureRequestSMS(options: {
  to: string;
  customerName: string;
  jobNumber: string;
  companyName: string;
  signingUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const shortUrl = options.signingUrl; // Use as-is; future: short.link
  const message =
    `${options.companyName}: Hi ${options.customerName}, please sign your work completion form for ${options.jobNumber}: ${shortUrl}`;
  return sendSMSAny({ to: options.to, message, jobId: options.jobNumber });
}

// Lazily initialize Twilio client (only on server-side, only when needed)
let twilioClient: any = null;

async function getTwilioClient() {
  if (twilioClient) return twilioClient;
  if (typeof window !== 'undefined') return null;
  if (!accountSid || !authToken) return null;

  try {
    // @ts-ignore - twilio is an optional runtime dependency
    const twilio = (await import('twilio')).default;
    twilioClient = twilio(accountSid, authToken);
    return twilioClient;
  } catch {
    console.warn('Twilio package not installed. SMS will be unavailable.');
    return null;
  }
}

export interface SMSOptions {
  to: string; // Phone number to send to (E.164 format: +1234567890)
  message: string; // Message content
  jobId?: string; // Optional job ID for tracking
  /** Usage metering (messaging-margin billing): who to bill + which feature sent it. */
  tenantId?: string;
  source?: string;
}

// ── Usage metering (docs/plans/MESSAGING_BILLING_PLAN.md) ────────────────────
// Raw cost estimate per SMS segment (Twilio US toll-free ~$0.0079; Telnyx
// similar). billed = raw x tenants.messaging_markup (default 2.5x). Fire-and-
// forget: metering must never fail a send.
const SMS_RAW_COST_PER_SEGMENT = 0.0079;
const SMS_SEGMENT_CHARS = 153;

async function meterSms(opts: SMSOptions, provider: string): Promise<void> {
  if (!opts.tenantId) return; // unmetered send (system/test) — adopt per call site
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');
    const segments = Math.max(1, Math.ceil(opts.message.length / SMS_SEGMENT_CHARS));
    const rawCost = segments * SMS_RAW_COST_PER_SEGMENT;
    const { data: tenant } = await supabaseAdmin
      .from('tenants').select('messaging_markup').eq('id', opts.tenantId).maybeSingle();
    const markup = Number(tenant?.messaging_markup) || 2.5;
    await supabaseAdmin.from('message_usage').insert({
      tenant_id: opts.tenantId,
      channel: 'sms',
      provider,
      segments,
      raw_cost: rawCost,
      billed_amount: Math.round(rawCost * markup * 10000) / 10000,
      source: opts.source || 'unknown',
    });
  } catch (err) {
    console.warn('[sms] metering failed (send unaffected):', err instanceof Error ? err.message : err);
  }
}

/**
 * Send an SMS message via Twilio
 */
export async function sendSMS(options: SMSOptions): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  try {
    // Validation
    const client = await getTwilioClient();
    if (!client) {
      console.error('❌ Twilio not configured. Check environment variables.');
      return {
        success: false,
        error: 'SMS service not configured'
      };
    }

    if (!twilioPhoneNumber) {
      console.error('❌ Twilio phone number not set.');
      return {
        success: false,
        error: 'SMS phone number not configured'
      };
    }

    // Format phone number to E.164
    const toNumber = formatPhoneNumber(options.to);
    if (!toNumber) {
      return {
        success: false,
        error: 'Invalid phone number format'
      };
    }

    // Send message
    console.log(`📱 Sending SMS to ${toNumber}...`);
    const message = await client.messages.create({
      body: options.message,
      from: twilioPhoneNumber,
      to: toNumber,
    });

    console.log(`✅ SMS sent! Message ID: ${message.sid}`);
    void meterSms(options, 'twilio');

    return {
      success: true,
      messageId: message.sid,
    };
  } catch (error: any) {
    console.error('❌ Error sending SMS:', error);
    return {
      success: false,
      error: error.message || 'Failed to send SMS'
    };
  }
}

/**
 * Format phone number to E.164 format (+1234567890)
 */
export function formatPhoneNumber(phone: string): string | null {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');

  // Check if it's a valid US/Canada number (10 digits)
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // Check if it already has country code
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Check if it already starts with +
  if (phone.startsWith('+') && digits.length >= 10) {
    return `+${digits}`;
  }

  // Invalid format
  console.error(`Invalid phone number format: ${phone}`);
  return null;
}

/**
 * Send "In Route" notification
 */
export async function sendInRouteNotification(options: {
  to: string;
  operatorName: string;
  eta: string; // e.g., "9:00 AM"
  jobNumber?: string;
}): Promise<{ success: boolean; error?: string }> {
  const message = `
🚗 Patriot Concrete Cutting Update

${options.operatorName} is on the way!

Estimated Arrival: ${options.eta}
${options.jobNumber ? `Job #: ${options.jobNumber}` : ''}

We'll send another update when we're 15 minutes away.
  `.trim();

  return sendSMS({
    to: options.to,
    message,
  });
}

/**
 * Send "15 Minutes Away" notification
 */
export async function send15MinuteNotification(options: {
  to: string;
  operatorName: string;
  jobNumber?: string;
}): Promise<{ success: boolean; error?: string }> {
  const message = `
📍 Patriot Concrete Cutting Update

${options.operatorName} is 15 minutes away!

${options.jobNumber ? `Job #: ${options.jobNumber}` : ''}

Please ensure the work area is ready for our arrival.
  `.trim();

  return sendSMS({
    to: options.to,
    message,
  });
}

/**
 * Send "Standby Time" notification
 */
export async function sendStandbyNotification(options: {
  to: string;
  operatorName: string;
  reason: string;
  hourlyRate: number;
  jobNumber?: string;
}): Promise<{ success: boolean; error?: string }> {
  const message = `
⏱️ Patriot Concrete Cutting - Standby Notice

${options.operatorName} is on-site but unable to proceed.

Reason: ${options.reason}

Standby time is billed at $${options.hourlyRate}/hour as per our policy.

${options.jobNumber ? `Job #: ${options.jobNumber}` : ''}

Please contact us if you have questions.
  `.trim();

  return sendSMS({
    to: options.to,
    message,
  });
}

/**
 * Send "Arrived On Site" notification
 */
export async function sendArrivedNotification(options: {
  to: string;
  operatorName: string;
  jobNumber?: string;
}): Promise<{ success: boolean; error?: string }> {
  const message = `
✅ Patriot Concrete Cutting Update

${options.operatorName} has arrived on-site and is beginning work.

${options.jobNumber ? `Job #: ${options.jobNumber}` : ''}

Thank you for your business!
  `.trim();

  return sendSMS({
    to: options.to,
    message,
  });
}
