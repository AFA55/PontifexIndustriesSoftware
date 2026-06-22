/**
 * ClockInReminderEmail — nudges an operator who hasn't clocked in yet today.
 *
 * White-label: company name + colors from the recipient TENANT'S branding.
 * Contains a "Clock In Now" CTA (remote/GPS clock-in bypass link).
 *
 * Replaces the raw inline HTML in:
 *   app/api/admin/notifications/send-reminder/route.ts
 */

import React from 'react';
import { Section, Text } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';
import CTAButton from './components/CTAButton';

export interface ClockInReminderEmailProps {
  branding: EmailBrandingProps;
  name: string;
  actionUrl: string;
}

export const PreviewProps: ClockInReminderEmailProps = {
  branding: {
    companyName: 'Patriot Concrete Cutting',
    brandColor: '#dc2626',
    accentColor: '#1e3a5f',
    logoUrl: null,
  },
  name: 'Mike Rivera',
  actionUrl: 'https://www.pontifexindustries.com/dashboard/timecard?bypass_nfc=true',
};

export default function ClockInReminderEmail({
  branding,
  name,
  actionUrl,
}: ClockInReminderEmailProps) {
  const { brandColor } = branding;

  return (
    <BrandedEmail
      branding={branding}
      preview="Clock-In Reminder — you have not clocked in yet today"
      subtitle="Clock-In Reminder"
    >
      <Section style={{ padding: '36px 40px 0' }}>
        <Text style={{ margin: '0 0 16px', color: '#475569', fontSize: '16px' }}>
          Hi <strong style={{ color: '#0f172a' }}>{name}</strong>,
        </Text>
        <Text style={{ margin: '0 0 24px', color: '#475569', fontSize: '16px', lineHeight: '1.6' }}>
          Our records show you have not clocked in yet today. Please clock in as soon as possible to
          ensure your hours are accurately recorded.
        </Text>
      </Section>

      <Section
        style={{
          margin: '0 40px 24px',
          backgroundColor: '#fef3c7',
          borderLeft: '3px solid #f59e0b',
          borderRadius: '4px',
          padding: '16px 20px',
        }}
      >
        <Text style={{ margin: 0, color: '#92400e', fontSize: '14px', lineHeight: '1.5' }}>
          <strong>Can&apos;t use NFC?</strong> Use the button below to clock in remotely. GPS location
          will still be captured.
        </Text>
      </Section>

      <Section style={{ padding: '0 40px 40px' }}>
        <CTAButton href={actionUrl} label="Clock In Now" color={brandColor} />
      </Section>
    </BrandedEmail>
  );
}
