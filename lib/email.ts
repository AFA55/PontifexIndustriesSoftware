/**
 * Email Service
 * Handles sending emails using Resend
 */

import { Resend } from 'resend';

// VERIFIED Resend domain — do not use RESEND_FROM_EMAIL (was misconfigured to the unverified root).
// `admin.pontifexindustries.com` is the ONLY verified Resend domain. The root
// `pontifexindustries.com` is NOT verified (Resend returns 403 "domain is not verified").
// These are the single source of truth for outbound sender addresses — import them everywhere.
export const VERIFIED_EMAIL_DOMAIN = 'admin.pontifexindustries.com';
export const DEFAULT_EMAIL_FROM = 'Pontifex Industries <noreply@admin.pontifexindustries.com>';

/**
 * Returns the Resend API key, defensively sanitized.
 *
 * Guards against a real production footgun we hit: the Vercel env var value was
 * pasted as `RESEND_API_KEY=re_xxx` (the variable NAME glued onto the front of
 * the value), so `process.env.RESEND_API_KEY` came back as the whole string and
 * Resend rejected it → every outbound email silently 502'd. We also strip stray
 * surrounding quotes / whitespace. Returns '' when unset.
 *
 * Resend keys always start with `re_`, which makes the malformation recoverable:
 * if the value contains `re_` but doesn't start with it, we extract from there.
 */
export function getResendApiKey(): string {
  let k = (process.env.RESEND_API_KEY || '').trim();
  if (!k) return '';
  // Strip surrounding single/double quotes some dashboards add.
  k = k.replace(/^['"]+|['"]+$/g, '').trim();
  // Strip a self-referential `RESEND_API_KEY=` (or any `…=`) prefix.
  const eq = k.indexOf('=');
  if (eq !== -1 && !k.startsWith('re_')) {
    k = k.slice(eq + 1).trim();
  }
  // Final safety net: if the real key is embedded anywhere, recover it.
  if (!k.startsWith('re_') && k.includes('re_')) {
    k = k.slice(k.indexOf('re_')).trim();
  }
  return k;
}

/** True when a usable (sanitized) Resend key is present. */
export function isEmailConfigured(): boolean {
  return getResendApiKey().startsWith('re_');
}

export interface EmailAttachment {
  filename: string;
  /** base64-encoded string OR Buffer; passed through to Resend's `content` field. */
  content: string | Buffer;
  contentType?: string;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

// Initialize Resend with the SANITIZED API key (see getResendApiKey above).
// Use a dummy key if not set to prevent build errors (checked before use).
const resend = new Resend(getResendApiKey() || 're_dummy_key_for_build');

export async function sendEmail({ to, subject, html, attachments }: EmailOptions): Promise<boolean> {
  try {
    console.log(`📧 Sending email to: ${to}`);
    console.log(`📧 Subject: ${subject}`);
    if (attachments?.length) {
      console.log(`📧 Attachments: ${attachments.map((a) => a.filename).join(', ')}`);
    }

    // Check if Resend API key is configured (sanitized)
    if (!isEmailConfigured()) {
      console.warn('⚠️ RESEND_API_KEY not configured. Email will not be sent.');
      console.log('📧 Email HTML (for development):');
      console.log(html);
      return false;
    }

    // Send email using Resend
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = {
      // VERIFIED Resend sender — `admin.pontifexindustries.com` is the verified domain;
      // the root `pontifexindustries.com` is NOT verified (Resend 403). Hardcoded
      // because the RESEND_FROM_EMAIL env var was misconfigured to the unverified root,
      // which silently broke every outbound email (invites, password resets, etc.).
      from: 'Pontifex Industries <noreply@admin.pontifexindustries.com>',
      to: [to],
      subject: subject,
      html: html,
    };
    if (attachments?.length) {
      payload.attachments = attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        ...(a.contentType ? { contentType: a.contentType } : {}),
      }));
    }
    const { data, error } = await resend.emails.send(payload);

    if (error) {
      console.error('❌ Error sending email via Resend:', error);
      return false;
    }

    console.log('✅ Email sent successfully via Resend!');
    console.log('📧 Email ID:', data?.id);
    return true;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return false;
  }
}

/** Escape user-supplied values interpolated into email HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate team invite email HTML (used by POST + PUT /api/admin/invite).
 *
 * Light-theme, table-based, inline-styled — same family as the other templates
 * in this file. `color-scheme: light only` hints keep Apple Mail / Gmail dark
 * mode from inverting it into mud. The CTA is a bulletproof table-wrapped <a>
 * with a raw-link fallback below it (same pattern as the password-reset email).
 *
 * White-label: the header carries the TENANT'S name (never hardcoded Patriot /
 * Pontifex); Pontifex appears only as "Powered by" in the footer.
 */
export function generateInviteEmail(opts: {
  inviteeName: string;
  inviterName: string;
  tenantName: string;
  /** Human-readable role label, e.g. "Operator" — already mapped from the role key. */
  roleLabel: string;
  companyCode?: string;
  setupUrl: string;
}): string {
  const inviteeName = escapeHtml(opts.inviteeName);
  const inviterName = escapeHtml(opts.inviterName);
  const tenantName = escapeHtml(opts.tenantName);
  const roleLabel = escapeHtml(opts.roleLabel);
  const companyCode = opts.companyCode ? escapeHtml(opts.companyCode) : '';
  // setupUrl is built server-side from APP_URL + token (never user input), but
  // escape anyway so a stray ampersand in future params can't break markup.
  const setupUrl = escapeHtml(opts.setupUrl);

  const steps: Array<[string, string]> = [
    ['1', 'Tap the &ldquo;Set Up My Account&rdquo; button'],
    ['2', 'Add your photo and create a password'],
    ['3', "You're in — your dashboard is ready"],
  ];

  const stepsRows = steps
    .map(
      ([n, label]) => `
                <tr>
                  <td style="padding: 6px 0; vertical-align: top; width: 36px;">
                    <table role="presentation" style="border-collapse: collapse;">
                      <tr>
                        <td bgcolor="#ede9fe" style="background-color: #ede9fe; border-radius: 50%; width: 26px; height: 26px; text-align: center; vertical-align: middle; color: #7c3aed; font-size: 13px; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">${n}</td>
                      </tr>
                    </table>
                  </td>
                  <td style="padding: 6px 0 6px 4px; color: #334155; font-size: 15px; line-height: 26px; vertical-align: middle;">${label}</td>
                </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>You're invited to join ${tenantName}</title>
  <style>
    :root { color-scheme: light only; supported-color-schemes: light only; }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;" bgcolor="#f8fafc">
    <tr>
      <td style="padding: 48px 20px;">
        <!-- Main Container -->
        <table role="presentation" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); overflow: hidden;" bgcolor="#ffffff">

          <!-- Header -->
          <tr>
            <td bgcolor="#7c3aed" style="background-color: #7c3aed; background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); padding: 44px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                ${tenantName}
              </h1>
              <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 500;">
                You're invited to join the team
              </p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 44px 40px;">
              <!-- Greeting -->
              <p style="margin: 0 0 20px; color: #475569; font-size: 16px; line-height: 1.6;">
                Hi <strong style="color: #0f172a; font-weight: 600;">${inviteeName}</strong>,
              </p>

              <!-- Main Message -->
              <p style="margin: 0 0 28px; color: #475569; font-size: 16px; line-height: 1.6;">
                <strong style="color: #0f172a; font-weight: 600;">${inviterName}</strong> set up an account for you on the ${tenantName} platform as <strong style="color: #7c3aed; font-weight: 600;">${roleLabel}</strong>. Finish setup in about 2 minutes.
              </p>

              <!-- CTA Button (bulletproof: table-wrapped, inline-styled) -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 20px;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${setupUrl}" style="display: inline-block; padding: 16px 48px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.3px; line-height: 1.2;">
                      Set Up My Account
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Alternative Link -->
              <div style="background-color: #f8fafc; border-radius: 6px; padding: 16px 20px; margin-bottom: 28px;">
                <p style="margin: 0 0 8px; color: #64748b; font-size: 13px; font-weight: 600;">
                  Button not working?
                </p>
                <p style="margin: 0; font-size: 12px; word-break: break-all; line-height: 1.5;">
                  <a href="${setupUrl}" style="color: #7c3aed; text-decoration: underline;">${setupUrl}</a>
                </p>
              </div>

              <!-- What Happens Next -->
              <p style="margin: 0 0 12px; color: #0f172a; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                What happens next
              </p>
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 28px;">${stepsRows}
              </table>

              <!-- Expiry Notice -->
              <div style="background-color: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 4px; padding: 14px 18px; margin-bottom: 24px;">
                <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">
                  This invitation expires in <strong>7 days</strong>.${companyCode ? ` Your company code is <strong>${companyCode}</strong> &mdash; you'll use it to log in.` : ''}
                </p>
              </div>

              <!-- Help Notice -->
              <div style="background-color: #f1f5f9; border-left: 3px solid #94a3b8; border-radius: 4px; padding: 14px 18px;">
                <p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.5;">
                  <strong style="color: #334155;">Need help?</strong> Contact ${inviterName} or your administrator. If you weren't expecting this invitation, you can safely ignore this email.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#f8fafc" style="background-color: #f8fafc; padding: 28px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px; color: #64748b; font-size: 13px; line-height: 1.5;">
                <strong style="color: #475569;">${tenantName}</strong><br>
                Powered by Pontifex Industries
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                This is an automated message. Please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Generate approval confirmation email HTML
 */
export function generateApprovalEmail(fullName: string, email: string, role: string): string {
  const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Access Approved - Patriot Concrete Cutting</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;">
    <tr>
      <td style="padding: 48px 20px;">
        <!-- Main Container -->
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2563eb 0%, #dc2626 100%); padding: 48px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                Patriot Concrete Cutting
              </h1>
              <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 500;">
                Concrete Cutting Management System
              </p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 48px 40px;">
              <!-- Title -->
              <h2 style="margin: 0 0 32px; color: #0f172a; font-size: 32px; font-weight: 700; letter-spacing: -1px; line-height: 1.2;">
                Access Approved
              </h2>

              <!-- Greeting -->
              <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
                Hi <strong style="color: #0f172a; font-weight: 600;">${fullName}</strong>,
              </p>

              <!-- Main Message -->
              <p style="margin: 0 0 32px; color: #475569; font-size: 16px; line-height: 1.6;">
                Your access request has been approved. You now have <strong style="color: #2563eb; font-weight: 600;">${role}</strong> access to the platform.
              </p>

              <!-- Account Details -->
              <table style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                <tr>
                  <td style="padding: 0 24px 24px;">
                    <p style="margin: 0 0 16px; color: #0f172a; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                      Account Details
                    </p>
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 10px 0; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0;">Email</td>
                        <td style="padding: 10px 0; color: #0f172a; font-size: 14px; font-weight: 600; text-align: right; border-top: 1px solid #e2e8f0;">${email}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0;">Role</td>
                        <td style="padding: 10px 0; color: #2563eb; font-size: 14px; font-weight: 600; text-align: right; text-transform: capitalize; border-top: 1px solid #e2e8f0;">${role}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Instructions -->
              <p style="margin: 0 0 32px; color: #475569; font-size: 15px; line-height: 1.6;">
                Your account is now active! Use the password you provided during registration to log in using the button below.
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 32px;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${loginUrl}" style="display: inline-block; padding: 16px 48px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600; letter-spacing: 0.3px;">
                      Login to Your Account
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Help Notice -->
              <div style="background-color: #f1f5f9; border-left: 3px solid #94a3b8; border-radius: 4px; padding: 16px 20px; margin-top: 32px;">
                <p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.5;">
                  <strong style="color: #334155;">Need assistance?</strong> If you have questions or didn't request this access, contact your administrator.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 32px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px; color: #64748b; font-size: 13px; line-height: 1.5;">
                <strong style="color: #475569;">Patriot Concrete Cutting</strong><br>
                Concrete Cutting Management System
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                This is an automated message. Please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Generate access request received confirmation email HTML
 */
export function generateAccessRequestReceivedEmail(fullName: string, email: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Access Request Received - Patriot Concrete Cutting</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;">
    <tr>
      <td style="padding: 48px 20px;">
        <!-- Main Container -->
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2563eb 0%, #dc2626 100%); padding: 48px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                Patriot Concrete Cutting
              </h1>
              <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 500;">
                Concrete Cutting Management System
              </p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 48px 40px;">
              <!-- Title -->
              <h2 style="margin: 0 0 32px; color: #0f172a; font-size: 32px; font-weight: 700; letter-spacing: -1px; line-height: 1.2;">
                Request Received
              </h2>

              <!-- Greeting -->
              <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
                Hi <strong style="color: #0f172a; font-weight: 600;">${fullName}</strong>,
              </p>

              <!-- Main Message -->
              <p style="margin: 0 0 32px; color: #475569; font-size: 16px; line-height: 1.6;">
                Thank you for requesting access to the Patriot Concrete Cutting platform. We've received your request and our team will review it shortly.
              </p>

              <!-- Request Details -->
              <table style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                <tr>
                  <td style="padding: 0 24px 24px;">
                    <p style="margin: 0 0 16px; color: #0f172a; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                      Request Details
                    </p>
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 10px 0; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0;">Email</td>
                        <td style="padding: 10px 0; color: #0f172a; font-size: 14px; font-weight: 600; text-align: right; border-top: 1px solid #e2e8f0;">${email}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0;">Status</td>
                        <td style="padding: 10px 0; color: #f59e0b; font-size: 14px; font-weight: 600; text-align: right; border-top: 1px solid #e2e8f0;">Under Review</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Next Steps -->
              <div style="background-color: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 4px; padding: 20px 24px; margin-bottom: 32px;">
                <p style="margin: 0 0 12px; color: #92400e; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                  What Happens Next
                </p>
                <ul style="margin: 0; padding-left: 20px; color: #78350f; font-size: 14px; line-height: 1.7;">
                  <li style="margin-bottom: 8px;">Administrator will review your request</li>
                  <li style="margin-bottom: 8px;">You'll receive email notification when processed</li>
                  <li style="margin-bottom: 8px;">If approved, you'll get login credentials</li>
                  <li>Typical review time: 1-2 business days</li>
                </ul>
              </div>

              <!-- Help Notice -->
              <div style="background-color: #f1f5f9; border-left: 3px solid #94a3b8; border-radius: 4px; padding: 16px 20px;">
                <p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.5;">
                  <strong style="color: #334155;">Questions or concerns?</strong> If you didn't submit this request, contact your administrator.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 32px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px; color: #64748b; font-size: 13px; line-height: 1.5;">
                <strong style="color: #475569;">Patriot Concrete Cutting</strong><br>
                Concrete Cutting Management System
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                This is an automated message. Please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Generate password reset email HTML
 */
export function generatePasswordResetEmail(fullName: string, resetLink: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Password Reset - Patriot Concrete Cutting</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;">
    <tr>
      <td style="padding: 48px 20px;">
        <!-- Main Container -->
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); overflow: hidden;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2563eb 0%, #dc2626 100%); padding: 48px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                Patriot Concrete Cutting
              </h1>
              <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 500;">
                Concrete Cutting Management System
              </p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 48px 40px;">
              <!-- Title -->
              <h2 style="margin: 0 0 32px; color: #0f172a; font-size: 32px; font-weight: 700; letter-spacing: -1px; line-height: 1.2;">
                Password Reset
              </h2>

              <!-- Greeting -->
              <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
                Hi <strong style="color: #0f172a; font-weight: 600;">${fullName}</strong>,
              </p>

              <!-- Main Message -->
              <p style="margin: 0 0 32px; color: #475569; font-size: 16px; line-height: 1.6;">
                We received a request to reset your password. Click the button below to create a new password for your account.
              </p>

              <!-- Security Notice -->
              <div style="background-color: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 4px; padding: 20px 24px; margin-bottom: 32px;">
                <p style="margin: 0 0 8px; color: #92400e; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                  Security Notice
                </p>
                <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">
                  This link expires in <strong>1 hour</strong>. If you didn't request this reset, ignore this email and your password will remain unchanged.
                </p>
              </div>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 32px;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${resetLink}" style="display: inline-block; padding: 16px 48px; background-color: #dc2626; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600; letter-spacing: 0.3px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Alternative Link -->
              <div style="background-color: #f8fafc; border-radius: 4px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 12px; color: #64748b; font-size: 13px; font-weight: 600;">
                  Button not working?
                </p>
                <p style="margin: 0; color: #2563eb; font-size: 12px; word-break: break-all; line-height: 1.5;">
                  ${resetLink}
                </p>
              </div>

              <!-- Warning Notice -->
              <div style="background-color: #fef2f2; border-left: 3px solid #dc2626; border-radius: 4px; padding: 16px 20px;">
                <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.5;">
                  <strong style="color: #7f1d1d;">Didn't request this?</strong> Someone may be attempting to access your account. Contact your administrator immediately.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 32px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px; color: #64748b; font-size: 13px; line-height: 1.5;">
                <strong style="color: #475569;">Patriot Concrete Cutting</strong><br>
                Concrete Cutting Management System
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                This is an automated message. Please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
