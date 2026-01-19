/**
 * Email Service
 * Handles sending emails using Resend
 */

import { Resend } from 'resend';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

// Initialize Resend with API key from environment variables
// Use a dummy key if not set to prevent build errors (checked before use)
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build');

export async function sendEmail({ to, subject, html }: EmailOptions): Promise<boolean> {
  try {
    console.log(`📧 Sending email to: ${to}`);
    console.log(`📧 Subject: ${subject}`);

    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY not configured. Email will not be sent.');
      console.log('📧 Email HTML (for development):');
      console.log(html);
      return false;
    }

    // Send email using Resend
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Pontifex Industries <onboarding@resend.dev>',
      to: [to],
      subject: subject,
      html: html,
    });

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
  <title>Access Approved - Pontifex Industries</title>
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
                Pontifex Industries
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
                <strong style="color: #475569;">Pontifex Industries</strong><br>
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
  <title>Access Request Received - Pontifex Industries</title>
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
                Pontifex Industries
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
                Thank you for requesting access to the Pontifex Industries platform. We've received your request and our team will review it shortly.
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
                <strong style="color: #475569;">Pontifex Industries</strong><br>
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
  <title>Password Reset - Pontifex Industries</title>
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
                Pontifex Industries
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
                <strong style="color: #475569;">Pontifex Industries</strong><br>
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
