/**
 * AccessRequestReceivedEmail — acknowledgement sent immediately after a user
 * submits an access request. Tells them it's under review + what happens next.
 */

import React from 'react';
import { Section, Text } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';

export interface AccessRequestReceivedEmailProps {
  branding: EmailBrandingProps;
  fullName: string;
  email: string;
}

export const PreviewProps: AccessRequestReceivedEmailProps = {
  branding: {
    companyName: 'Patriot Concrete Cutting',
    brandColor: '#dc2626',
    accentColor: '#1e3a5f',
    logoUrl: null,
  },
  fullName: 'Jane Operator',
  email: 'jane@example.com',
};

export default function AccessRequestReceivedEmail({
  branding,
  fullName,
  email,
}: AccessRequestReceivedEmailProps) {
  const { companyName } = branding;

  const nextSteps = [
    'Administrator will review your request',
    "You'll receive an email notification when it's processed",
    "If approved, you'll receive a setup link to create your account",
    'Typical review time: 1–2 business days',
  ];

  return (
    <BrandedEmail
      branding={branding}
      preview={`We received your access request for ${companyName}`}
      subtitle="Concrete Cutting Management System"
    >
      <Section style={{ padding: '40px 40px 0' }}>
        <Text
          style={{
            margin: '0 0 8px',
            color: '#0f172a',
            fontSize: '28px',
            fontWeight: '700',
            letterSpacing: '-0.5px',
            lineHeight: '1.2',
          }}
        >
          Request Received
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
          Thank you for requesting access to the {companyName} platform. We&apos;ve received your
          request and our team will review it shortly.
        </Text>
      </Section>

      {/* Request details info card */}
      <Section
        style={{
          margin: '0 40px 28px',
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
          Request Details
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
                Status
              </td>
              <td
                style={{
                  padding: '10px 0',
                  color: '#d97706',
                  fontSize: '14px',
                  fontWeight: '600',
                  textAlign: 'right',
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                Under Review
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* What happens next card */}
      <Section
        style={{
          margin: '0 40px 24px',
          backgroundColor: '#fffbeb',
          borderLeft: '3px solid #f59e0b',
          borderRadius: '4px',
          padding: '16px 20px',
        }}
      >
        <Text
          style={{
            margin: '0 0 10px',
            color: '#92400e',
            fontSize: '13px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          What Happens Next
        </Text>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#78350f' }}>
          {nextSteps.map((step, i) => (
            <li key={i} style={{ fontSize: '14px', lineHeight: '1.7', marginBottom: '4px' }}>
              {step}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        style={{
          margin: '0 40px 40px',
          backgroundColor: '#f1f5f9',
          borderLeft: '3px solid #94a3b8',
          borderRadius: '4px',
          padding: '14px 18px',
        }}
      >
        <Text style={{ margin: 0, color: '#475569', fontSize: '14px', lineHeight: '1.5' }}>
          <strong style={{ color: '#334155' }}>Questions or concerns?</strong> If you didn&apos;t
          submit this request, contact your administrator immediately.
        </Text>
      </Section>
    </BrandedEmail>
  );
}
