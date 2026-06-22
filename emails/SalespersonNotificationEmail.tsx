/**
 * SalespersonNotificationEmail — internal milestone alerts to the salesperson
 * who owns a job order or invoice (job active/completed, invoice ready/paid/overdue).
 *
 * White-label: company name + colors from the recipient TENANT'S branding.
 * The title / message / action_url are already computed by lib/notify-salesperson.ts;
 * this template just presents them with an "Open in Dashboard" CTA.
 *
 * Replaces the raw inline HTML in:
 *   lib/notify-salesperson.ts
 */

import React from 'react';
import { Section, Text } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';
import CTAButton from './components/CTAButton';

export interface SalespersonNotificationEmailProps {
  branding: EmailBrandingProps;
  title: string;
  message: string;
  actionUrl?: string;
}

export const PreviewProps: SalespersonNotificationEmailProps = {
  branding: {
    companyName: 'Patriot Concrete Cutting',
    brandColor: '#dc2626',
    accentColor: '#1e3a5f',
    logoUrl: null,
  },
  title: 'Your job is now active 🟢',
  message: 'JOB JOB-2026-000123 for Acme Builders has been started by the operator.',
  actionUrl: 'https://www.pontifexindustries.com/dashboard/admin/jobs/abc123',
};

export default function SalespersonNotificationEmail({
  branding,
  title,
  message,
  actionUrl,
}: SalespersonNotificationEmailProps) {
  const { brandColor, companyName } = branding;

  return (
    <BrandedEmail branding={branding} preview={title} subtitle={companyName}>
      <Section style={{ padding: '36px 40px 0' }}>
        <Text
          style={{
            margin: '0 0 16px',
            color: '#0f172a',
            fontSize: '20px',
            fontWeight: '700',
            lineHeight: '1.3',
          }}
        >
          {title}
        </Text>
        <Text style={{ margin: '0 0 24px', color: '#475569', fontSize: '16px', lineHeight: '1.6' }}>
          {message}
        </Text>
      </Section>

      {actionUrl ? (
        <Section style={{ padding: '0 40px 24px' }}>
          <CTAButton href={actionUrl} label="Open in Dashboard" color={brandColor} />
        </Section>
      ) : null}

      <Section
        style={{
          margin: '0 40px 40px',
          backgroundColor: '#f8fafc',
          borderRadius: '6px',
          padding: '14px 18px',
          border: '1px solid #e2e8f0',
        }}
      >
        <Text style={{ margin: 0, color: '#94a3b8', fontSize: '12px', lineHeight: '1.5' }}>
          Automated salesperson notification. Please do not reply.
        </Text>
      </Section>
    </BrandedEmail>
  );
}
