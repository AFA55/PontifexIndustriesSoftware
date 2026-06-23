/**
 * ApprovalEmail — access request approved notification.
 *
 * Sent when an admin approves a user's access request.
 * Shows account details (email + role) and a login CTA.
 */

import React from 'react';
import { Section, Text, Link } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';
import CTAButton from './components/CTAButton';

export interface ApprovalEmailProps {
  branding: EmailBrandingProps;
  fullName: string;
  email: string;
  role: string;
  loginUrl: string;
}

export const PreviewProps: ApprovalEmailProps = {
  branding: {
    companyName: 'Patriot Concrete Cutting',
    brandColor: '#dc2626',
    accentColor: '#1e3a5f',
    logoUrl: null,
  },
  fullName: 'Jane Operator',
  email: 'jane@example.com',
  role: 'Operator',
  loginUrl: 'https://www.pontifexindustries.com/login',
};

export default function ApprovalEmail({
  branding,
  fullName,
  email,
  role,
  loginUrl,
}: ApprovalEmailProps) {
  const { brandColor, companyName } = branding;

  return (
    <BrandedEmail
      branding={branding}
      preview={`Your access to ${companyName} has been approved`}
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
          Access Approved
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
            margin: '0 0 28px',
            color: '#475569',
            fontSize: '16px',
            lineHeight: '1.6',
          }}
        >
          Your access request has been approved. You now have{' '}
          <strong style={{ color: brandColor }}>{role}</strong> access to the platform.
        </Text>
      </Section>

      {/* Account details info card */}
      <Section
        style={{
          margin: '0 0 28px',
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
          padding: '20px 24px',
          border: '1px solid #e2e8f0',
        }}
      >
        <Text
          style={{
            margin: '0 0 14px',
            color: '#0f172a',
            fontSize: '13px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Account Details
        </Text>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td
                style={{
                  padding: '10px 0',
                  color: '#64748b',
                  fontSize: '14px',
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                Email
              </td>
              <td
                style={{
                  padding: '10px 0',
                  color: '#0f172a',
                  fontSize: '14px',
                  fontWeight: '600',
                  textAlign: 'right',
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                {email}
              </td>
            </tr>
            <tr>
              <td
                style={{
                  padding: '10px 0',
                  color: '#64748b',
                  fontSize: '14px',
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                Role
              </td>
              <td
                style={{
                  padding: '10px 0',
                  color: brandColor,
                  fontSize: '14px',
                  fontWeight: '600',
                  textAlign: 'right',
                  textTransform: 'capitalize',
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                {role}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section style={{ padding: '0 0 24px' }}>
        <Text
          style={{
            margin: '0 0 24px',
            color: '#475569',
            fontSize: '15px',
            lineHeight: '1.6',
          }}
        >
          Your account is now active! Use the password you provided during registration to log in
          using the button below.
        </Text>

        <CTAButton href={loginUrl} label="Login to Your Account" color={brandColor} />
      </Section>

      <Section
        style={{
          margin: '0 0 40px',
          backgroundColor: '#f1f5f9',
          borderLeft: '3px solid #94a3b8',
          borderRadius: '4px',
          padding: '14px 18px',
        }}
      >
        <Text style={{ margin: 0, color: '#475569', fontSize: '14px', lineHeight: '1.5' }}>
          <strong style={{ color: '#334155' }}>Need assistance?</strong> If you have questions or
          didn&apos;t request this access, contact your administrator.
        </Text>
      </Section>
    </BrandedEmail>
  );
}
