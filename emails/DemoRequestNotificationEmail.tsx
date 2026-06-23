/**
 * DemoRequestNotificationEmail — INTERNAL alert to Pontifex (the software
 * company) when a new platform-demo lead comes in.
 *
 * This is NOT a tenant-scoped email — it's a Pontifex internal lead alert, so it
 * stays on the DEFAULT (Pontifex purple) branding. Do NOT pass tenant branding.
 *
 * Replaces the raw inline HTML in:
 *   app/api/demo-requests/route.ts
 *   app/api/demo-request/route.ts
 */

import React from 'react';
import { Section, Text, Link } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';
import CTAButton from './components/CTAButton';

export interface DemoRequestNotificationEmailProps {
  branding: EmailBrandingProps;
  name: string;
  company: string;
  email: string;
  phone?: string | null;
  tradeType?: string | null;
  companySize?: string | null;
  message?: string | null;
  /** Optional link to manage the lead in the Platform Hub. */
  manageUrl?: string | null;
}

export const PreviewProps: DemoRequestNotificationEmailProps = {
  branding: {
    companyName: 'Pontifex Industries',
    brandColor: '#7c3aed',
    accentColor: '#4f46e5',
    logoUrl: null,
  },
  name: 'Jordan Lee',
  company: 'Lee Concrete Services',
  email: 'jordan@leeconcrete.com',
  phone: '(555) 012-3456',
  tradeType: 'Concrete cutting',
  companySize: '11-25',
  message: 'Looking to replace our paper job tickets with something mobile.',
  manageUrl: 'https://www.pontifexindustries.com/dashboard/platform/demo-requests',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td
        style={{
          padding: '10px 16px 10px 0',
          color: '#64748b',
          fontSize: '14px',
          verticalAlign: 'top',
          width: '130px',
          borderTop: '1px solid #e2e8f0',
        }}
      >
        {label}
      </td>
      <td
        style={{
          padding: '10px 0',
          color: '#0f172a',
          fontSize: '14px',
          fontWeight: 600,
          verticalAlign: 'top',
          borderTop: '1px solid #e2e8f0',
        }}
      >
        {children}
      </td>
    </tr>
  );
}

export default function DemoRequestNotificationEmail({
  branding,
  name,
  company,
  email,
  phone,
  tradeType,
  companySize,
  message,
  manageUrl,
}: DemoRequestNotificationEmailProps) {
  const { brandColor } = branding;

  return (
    <BrandedEmail
      branding={branding}
      preview={`New demo request: ${company}`}
      subtitle="New Demo Request"
    >
      <Section style={{ padding: '36px 0 0' }}>
        <Text
          style={{ margin: '0 0 8px', color: '#0f172a', fontSize: '22px', fontWeight: '600', letterSpacing: '-0.3px' }}
        >
          New demo request
        </Text>
        <Text style={{ margin: '0 0 24px', color: '#64748b', fontSize: '14px', lineHeight: '1.6' }}>
          A new lead just submitted the demo request form. Details below.
        </Text>
      </Section>

      <Section style={{ margin: '0 0 24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <Row label="Name">{name}</Row>
            <Row label="Company">{company}</Row>
            <Row label="Email">
              <Link href={`mailto:${email}`} style={{ color: brandColor, textDecoration: 'underline' }}>
                {email}
              </Link>
            </Row>
            <Row label="Phone">{phone || '—'}</Row>
            <Row label="Type">{tradeType || '—'}</Row>
            <Row label="Team size">{companySize || '—'}</Row>
          </tbody>
        </table>
      </Section>

      {message ? (
        <Section
          style={{
            margin: '0 0 24px',
            padding: '16px 18px',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            borderLeft: `3px solid ${brandColor}`,
          }}
        >
          <Text
            style={{
              margin: '0 0 6px',
              color: '#64748b',
              fontSize: '12px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
            }}
          >
            Message
          </Text>
          <Text style={{ margin: 0, color: '#334155', fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
            {message}
          </Text>
        </Section>
      ) : null}

      {manageUrl ? (
        <Section style={{ padding: '0 0 40px' }}>
          <CTAButton href={manageUrl} label="View & Manage in Platform Hub" color={brandColor} />
        </Section>
      ) : (
        <Section style={{ padding: '0 0 40px' }} />
      )}
    </BrandedEmail>
  );
}
