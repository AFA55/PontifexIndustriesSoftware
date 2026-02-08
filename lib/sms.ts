/**
 * SMS Notification Service
 * Handles sending SMS via Twilio for job notifications
 */

// Twilio configuration
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

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
🚗 Pontifex Industries Update

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
📍 Pontifex Industries Update

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
⏱️ Pontifex Industries - Standby Notice

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
✅ Pontifex Industries Update

${options.operatorName} has arrived on-site and is beginning work.

${options.jobNumber ? `Job #: ${options.jobNumber}` : ''}

Thank you for your business!
  `.trim();

  return sendSMS({
    to: options.to,
    message,
  });
}
