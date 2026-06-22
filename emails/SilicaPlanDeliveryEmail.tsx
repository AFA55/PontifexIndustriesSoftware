/**
 * SilicaPlanDeliveryEmail — delivers the OSHA silica exposure control plan PDF.
 *
 * White-label: company name + colors from the recipient TENANT'S branding.
 * The PDF is attached by the route — this template is just the body.
 *
 * Replaces the raw inline HTML in:
 *   app/api/silica-plan/submit/route.ts
 */

import React from 'react';
import { Section, Text } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';

export interface SilicaPlanDeliveryEmailProps {
  branding: EmailBrandingProps;
  jobNumber: string;
}

export const PreviewProps: SilicaPlanDeliveryEmailProps = {
  branding: {
    companyName: 'Patriot Concrete Cutting',
    brandColor: '#dc2626',
    accentColor: '#1e3a5f',
    logoUrl: null,
  },
  jobNumber: 'JOB-2026-000123',
};

export default function SilicaPlanDeliveryEmail({
  branding,
  jobNumber,
}: SilicaPlanDeliveryEmailProps) {
  const { companyName } = branding;

  return (
    <BrandedEmail
      branding={branding}
      preview={`Silica Exposure Control Plan — Job ${jobNumber}`}
      subtitle={`Silica Exposure Control Plan · Job ${jobNumber}`}
    >
      <Section style={{ padding: '36px 40px 0' }}>
        <Text
          style={{ margin: '0 0 16px', color: '#0f172a', fontSize: '20px', fontWeight: '700', lineHeight: '1.3' }}
        >
          Silica Exposure Control Plan
        </Text>
        <Text style={{ margin: '0 0 16px', color: '#475569', fontSize: '15px', lineHeight: '1.6' }}>
          Please find attached the Silica Exposure Control Plan for your job.
        </Text>
        <Text style={{ margin: '0 0 24px', color: '#475569', fontSize: '15px', lineHeight: '1.6' }}>
          This document outlines the safety measures and dust control procedures in place to protect
          workers and comply with OSHA silica regulations.
        </Text>
      </Section>

      <Section style={{ padding: '0 40px 40px' }}>
        <Text style={{ margin: 0, color: '#64748b', fontSize: '13px', lineHeight: '1.6' }}>
          Questions? Contact {companyName} or your project manager.
        </Text>
      </Section>
    </BrandedEmail>
  );
}
