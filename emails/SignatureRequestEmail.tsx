/**
 * SignatureRequestEmail — asks a customer to e-sign the work completion form.
 *
 * White-label: company name + colors from the recipient TENANT'S branding.
 * Contains the signing URL as a CTA + a raw fallback link (URL as visible text).
 *
 * Replaces the raw inline HTML in:
 *   app/api/admin/jobs/[id]/send-signature-request/route.ts
 */

import React from 'react';
import { Section, Text, Link } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';
import CTAButton from './components/CTAButton';

export interface SignatureRequestEmailProps {
  branding: EmailBrandingProps;
  customerName: string;
  jobNumber: string;
  jobLabel: string;
  jobDate?: string | null;
  jobLocation?: string | null;
  signingUrl: string;
}

export const PreviewProps: SignatureRequestEmailProps = {
  branding: {
    companyName: 'Patriot Concrete Cutting',
    brandColor: '#dc2626',
    accentColor: '#1e3a5f',
    logoUrl: null,
  },
  customerName: 'Acme Builders',
  jobNumber: 'JOB-2026-000123',
  jobLabel: 'Burbank Garage Slab',
  jobDate: 'June 23, 2026',
  jobLocation: '4800 Oak Grove Dr, Burbank CA',
  signingUrl: 'https://www.pontifexindustries.com/sign/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
};

const rowLabel: React.CSSProperties = {
  padding: '8px 0',
  color: '#64748b',
  fontSize: '14px',
  borderTop: '1px solid #e2e8f0',
  width: '40%',
};
const rowValue: React.CSSProperties = {
  padding: '8px 0',
  color: '#0f172a',
  fontSize: '14px',
  fontWeight: 600,
  textAlign: 'right',
  borderTop: '1px solid #e2e8f0',
};

export default function SignatureRequestEmail({
  branding,
  customerName,
  jobNumber,
  jobLabel,
  jobDate,
  jobLocation,
  signingUrl,
}: SignatureRequestEmailProps) {
  const { brandColor, accentColor, companyName } = branding;

  return (
    <BrandedEmail
      branding={branding}
      preview={`Please sign your work completion form — ${jobNumber}`}
      subtitle="Work Completion Sign-Off"
    >
      <Section style={{ padding: '36px 0 0' }}>
        <Text
          style={{ margin: '0 0 8px', color: '#0f172a', fontSize: '24px', fontWeight: '600', letterSpacing: '-0.3px' }}
        >
          Your Signature is Requested
        </Text>
        <Text style={{ margin: '0 0 28px', color: '#64748b', fontSize: '15px', lineHeight: '1.6' }}>
          Hi {customerName}, please review and sign the work completion form for your recent job
          with {companyName}.
        </Text>
      </Section>

      {/* Job details card */}
      <Section
        style={{
          margin: '0 0 28px',
          backgroundColor: '#f1f5f9',
          borderRadius: '8px',
          padding: '20px 24px',
        }}
      >
        <Text
          style={{
            margin: '0 0 12px',
            color: '#64748b',
            fontSize: '11px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
          }}
        >
          Job Details
        </Text>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ ...rowLabel, borderTop: 'none' }}>Job Number</td>
              <td style={{ ...rowValue, borderTop: 'none' }}>{jobNumber}</td>
            </tr>
            {jobLabel !== jobNumber ? (
              <tr>
                <td style={rowLabel}>Project</td>
                <td style={rowValue}>{jobLabel}</td>
              </tr>
            ) : null}
            {jobDate ? (
              <tr>
                <td style={rowLabel}>Date</td>
                <td style={rowValue}>{jobDate}</td>
              </tr>
            ) : null}
            {jobLocation ? (
              <tr>
                <td style={rowLabel}>Location</td>
                <td style={rowValue}>{jobLocation}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Section>

      {/* CTA */}
      <Section style={{ padding: '0 0 24px' }}>
        <CTAButton href={signingUrl} label="Sign Now →" color={accentColor || brandColor} />
      </Section>

      {/* Fallback link — URL as visible text */}
      <Section
        style={{
          margin: '0 0 24px',
          backgroundColor: '#f8fafc',
          borderRadius: '6px',
          padding: '14px 18px',
        }}
      >
        <Text style={{ margin: '0 0 6px', color: '#64748b', fontSize: '12px', fontWeight: '600' }}>
          Button not working? Copy this link:
        </Text>
        <Text style={{ margin: 0, fontSize: '12px', lineHeight: '1.5', wordBreak: 'break-all' }}>
          <Link href={signingUrl} style={{ color: accentColor || brandColor, textDecoration: 'underline' }}>
            {signingUrl}
          </Link>
        </Text>
      </Section>

      {/* Notice */}
      <Section
        style={{
          margin: '0 0 40px',
          backgroundColor: '#fffbeb',
          borderLeft: '3px solid #f59e0b',
          borderRadius: '4px',
          padding: '14px 18px',
        }}
      >
        <Text style={{ margin: 0, color: '#78350f', fontSize: '13px', lineHeight: '1.5' }}>
          This link expires in <strong>7 days</strong>. You do not need an account to sign.
        </Text>
      </Section>
    </BrandedEmail>
  );
}
