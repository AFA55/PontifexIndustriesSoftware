/**
 * NotificationEmail — generic event notification (job assigned, time-off result, etc.).
 *
 * Used by lib/send-reminder.ts → sendNotification(). Deliberately simple: title,
 * body message, and an optional "View details" CTA. Not marketing, just informational.
 */

import React from 'react';
import { Section, Text, Link } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';
import CTAButton from './components/CTAButton';

export interface NotificationEmailProps {
  branding: EmailBrandingProps;
  title: string;
  message: string;
  actionUrl?: string;
}

export const PreviewProps: NotificationEmailProps = {
  branding: {
    companyName: 'Patriot Concrete Cutting',
    brandColor: '#dc2626',
    accentColor: '#1e3a5f',
    logoUrl: null,
  },
  title: 'You have been assigned to a new job',
  message: 'You have been assigned to Job #JOB-2026-000123 at 123 Main St. Please review the details and confirm your availability.',
  actionUrl: 'https://www.pontifexindustries.com/dashboard/my-jobs',
};

export default function NotificationEmail({
  branding,
  title,
  message,
  actionUrl,
}: NotificationEmailProps) {
  const { brandColor, companyName } = branding;

  return (
    <BrandedEmail
      branding={branding}
      preview={title}
      subtitle={companyName}
    >
      <Section style={{ padding: '36px 0 0' }}>
        <Text
          style={{
            margin: '0 0 16px',
            color: '#0f172a',
            fontSize: '20px',
            fontWeight: '600',
            letterSpacing: '-0.3px',
            lineHeight: '1.3',
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            margin: '0 0 24px',
            color: '#475569',
            fontSize: '16px',
            lineHeight: '1.6',
          }}
        >
          {message}
        </Text>
      </Section>

      {actionUrl && (
        <Section style={{ padding: '0 0 24px' }}>
          <CTAButton href={actionUrl} label="View details" color={brandColor} />
        </Section>
      )}

      <Section
        style={{
          margin: '0 0 40px',
          backgroundColor: '#f8fafc',
          borderRadius: '6px',
          padding: '14px 18px',
          border: '1px solid #e2e8f0',
        }}
      >
        <Text style={{ margin: 0, color: '#94a3b8', fontSize: '12px', lineHeight: '1.5' }}>
          You&apos;re receiving this because email notifications are enabled for your account.
          Manage them in <strong>Settings &rarr; Notifications</strong>.
        </Text>
      </Section>
    </BrandedEmail>
  );
}
