/**
 * CustomerJobCompleteEmail — "Your job is complete".
 *
 * Sent to the job's site contact when the job is marked completed.
 * White-label: company name + colors from the recipient TENANT'S branding.
 * CTA opens the customer's portal magic-link so they can review documents
 * and sign anything outstanding.
 */

import React from 'react';
import { Section, Text, Link } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';
import CTAButton from './components/CTAButton';

export interface CustomerJobCompleteEmailProps {
  branding: EmailBrandingProps;
  customerName: string;
  /** Job site address (free-text). Optional. */
  jobAddress?: string | null;
  /** Job number, e.g. "JOB-2026-000123". Optional. */
  jobNumber?: string | null;
  portalUrl: string;
}

export const PreviewProps: CustomerJobCompleteEmailProps = {
  branding: {
    companyName: 'Patriot Concrete Cutting',
    brandColor: '#dc2626',
    accentColor: '#1e3a5f',
    logoUrl: null,
  },
  customerName: 'Acme Builders',
  jobAddress: '1450 Industrial Pkwy, Denver, CO 80216',
  jobNumber: 'JOB-2026-000123',
  portalUrl: 'https://www.pontifexindustries.com/portal/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
};

export default function CustomerJobCompleteEmail({
  branding,
  customerName,
  jobAddress,
  jobNumber,
  portalUrl,
}: CustomerJobCompleteEmailProps) {
  const { brandColor, companyName } = branding;

  return (
    <BrandedEmail
      branding={branding}
      preview={`Your job is complete — ${companyName}`}
      subtitle="Job Complete"
    >
      <Section style={{ padding: '36px 0 0' }}>
        <Text style={{ margin: '0 0 20px', color: '#475569', fontSize: '16px', lineHeight: '1.6' }}>
          Hi <strong style={{ color: '#0f172a' }}>{customerName}</strong>,
        </Text>
        <Text style={{ margin: '0 0 24px', color: '#475569', fontSize: '16px', lineHeight: '1.6' }}>
          Your job with {companyName} is complete. Thank you for your business! You can review the
          work, view your documents, and sign anything outstanding using the link below.
        </Text>
      </Section>

      {/* Job details */}
      {(jobAddress || jobNumber) && (
        <Section
          style={{
            margin: '0 0 24px',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            padding: '20px 24px',
          }}
        >
          <Text
            style={{
              margin: '0 0 8px',
              color: '#0f172a',
              fontSize: '13px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
            }}
          >
            Job details
          </Text>
          {jobNumber && (
            <Text style={{ margin: '0 0 4px', color: '#475569', fontSize: '14px', lineHeight: '1.6' }}>
              <strong style={{ color: '#0f172a' }}>Job:</strong> {jobNumber}
            </Text>
          )}
          {jobAddress && (
            <Text style={{ margin: 0, color: '#475569', fontSize: '14px', lineHeight: '1.6' }}>
              <strong style={{ color: '#0f172a' }}>Location:</strong> {jobAddress}
            </Text>
          )}
        </Section>
      )}

      {/* CTA */}
      <Section style={{ padding: '0 0 24px' }}>
        <CTAButton href={portalUrl} label="View Documents & Sign" color={brandColor} />
      </Section>

      {/* Fallback link */}
      <Section
        style={{
          margin: '0 0 40px',
          backgroundColor: '#f1f5f9',
          borderRadius: '6px',
          padding: '14px 18px',
        }}
      >
        <Text style={{ margin: '0 0 6px', color: '#64748b', fontSize: '12px', fontWeight: '600' }}>
          Button not working? Copy this link:
        </Text>
        <Text style={{ margin: 0, fontSize: '12px', lineHeight: '1.5', wordBreak: 'break-all' }}>
          <Link href={portalUrl} style={{ color: brandColor, textDecoration: 'underline' }}>
            {portalUrl}
          </Link>
        </Text>
      </Section>
    </BrandedEmail>
  );
}
