/**
 * PasswordResetEmail — password reset link email.
 *
 * Contains the reset link as both a CTA button and an inline URL so the link
 * is always reachable. The test suite (lib/email-links.test.ts) asserts:
 *   • The resetLink appears in at least one <a href>.
 *   • No href contains whitespace.
 *   • Every href is parseable by `new URL()`.
 *   • A 43-char base64url token survives the template intact.
 *
 * Password reset is sent from the platform level (no tenant context), so we
 * use the default platform branding unless a tenant branding is passed in.
 */

import React from 'react';
import { Section, Text, Link } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';
import CTAButton from './components/CTAButton';

export interface PasswordResetEmailProps {
  branding: EmailBrandingProps;
  fullName: string;
  resetLink: string;
}

export const PreviewProps: PasswordResetEmailProps = {
  branding: {
    companyName: 'Patriot Concrete Cutting',
    brandColor: '#dc2626',
    accentColor: '#1e3a5f',
    logoUrl: null,
  },
  fullName: 'Jane Operator',
  resetLink: 'https://www.pontifexindustries.com/update-password?token=k7fQ2zX9mP4rT1wY',
};

export default function PasswordResetEmail({
  branding,
  fullName,
  resetLink,
}: PasswordResetEmailProps) {
  const { brandColor } = branding;

  return (
    <BrandedEmail
      branding={branding}
      preview="Reset your password — link expires in 1 hour"
      subtitle="Concrete Cutting Management System"
    >
      <Section style={{ padding: '40px 0 0' }}>
        <Text
          style={{
            margin: '0 0 8px',
            color: '#0f172a',
            fontSize: '26px',
            fontWeight: '600',
            letterSpacing: '-0.3px',
            lineHeight: '1.2',
          }}
        >
          Password Reset
        </Text>

        <Text
          style={{
            margin: '16px 0 20px',
            color: '#475569',
            fontSize: '16px',
            lineHeight: '1.6',
          }}
        >
          Hi <strong style={{ color: '#0f172a' }}>{fullName}</strong>,
        </Text>

        <Text
          style={{
            margin: '0 0 24px',
            color: '#475569',
            fontSize: '16px',
            lineHeight: '1.6',
          }}
        >
          We received a request to reset your password. Click the button below to create a new
          password for your account.
        </Text>
      </Section>

      {/* Security notice info card */}
      <Section
        style={{
          margin: '0 0 24px',
          backgroundColor: '#fef3c7',
          borderLeft: '3px solid #f59e0b',
          borderRadius: '4px',
          padding: '14px 18px',
        }}
      >
        <Text
          style={{
            margin: '0 0 6px',
            color: '#92400e',
            fontSize: '13px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Security Notice
        </Text>
        <Text style={{ margin: 0, color: '#78350f', fontSize: '14px', lineHeight: '1.6' }}>
          This link expires in <strong>1 hour</strong>. If you didn&apos;t request this reset,
          ignore this email and your password will remain unchanged.
        </Text>
      </Section>

      {/* CTA — must appear as <a href={resetLink}> for the test */}
      <Section style={{ padding: '0 0 20px' }}>
        <CTAButton href={resetLink} label="Reset Password" color={brandColor} />
      </Section>

      {/* Raw fallback link */}
      <Section
        style={{
          margin: '0 0 24px',
          backgroundColor: '#f8fafc',
          borderRadius: '6px',
          padding: '14px 18px',
        }}
      >
        <Text
          style={{
            margin: '0 0 6px',
            color: '#64748b',
            fontSize: '13px',
            fontWeight: '600',
          }}
        >
          Button not working?
        </Text>
        <Text style={{ margin: 0, fontSize: '12px', lineHeight: '1.5', wordBreak: 'break-all' }}>
          <Link href={resetLink} style={{ color: brandColor, textDecoration: 'underline' }}>
            {resetLink}
          </Link>
        </Text>
      </Section>

      <Section
        style={{
          margin: '0 0 40px',
          backgroundColor: '#fef2f2',
          borderLeft: '3px solid #dc2626',
          borderRadius: '4px',
          padding: '14px 18px',
        }}
      >
        <Text style={{ margin: 0, color: '#991b1b', fontSize: '14px', lineHeight: '1.5' }}>
          <strong style={{ color: '#7f1d1d' }}>Didn&apos;t request this?</strong> Someone may be
          attempting to access your account. Contact your administrator immediately.
        </Text>
      </Section>
    </BrandedEmail>
  );
}
