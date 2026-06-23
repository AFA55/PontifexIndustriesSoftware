/**
 * PortalAccessEmail — customer portal magic-link invitation.
 *
 * White-label: company name + colors from the recipient TENANT'S branding.
 * Contains the portal URL as a CTA + raw fallback link (URL as visible text).
 *
 * Replaces the raw inline HTML in:
 *   app/api/admin/portal-links/route.ts
 */

import React from 'react';
import { Section, Text, Link } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';
import CTAButton from './components/CTAButton';

export interface PortalAccessEmailProps {
  branding: EmailBrandingProps;
  customerName: string;
  portalUrl: string;
  expiryDate: string;
}

export const PreviewProps: PortalAccessEmailProps = {
  branding: {
    companyName: 'Patriot Concrete Cutting',
    brandColor: '#dc2626',
    accentColor: '#1e3a5f',
    logoUrl: null,
  },
  customerName: 'Acme Builders',
  portalUrl: 'https://www.pontifexindustries.com/portal/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
  expiryDate: 'July 22, 2026',
};

export default function PortalAccessEmail({
  branding,
  customerName,
  portalUrl,
  expiryDate,
}: PortalAccessEmailProps) {
  const { brandColor, companyName } = branding;

  return (
    <BrandedEmail
      branding={branding}
      preview={`View your jobs & documents — ${companyName}`}
      subtitle="Customer Job Portal"
    >
      <Section style={{ padding: '36px 0 0' }}>
        <Text style={{ margin: '0 0 20px', color: '#475569', fontSize: '16px', lineHeight: '1.6' }}>
          Hi <strong style={{ color: '#0f172a' }}>{customerName}</strong>,
        </Text>
        <Text style={{ margin: '0 0 24px', color: '#475569', fontSize: '16px', lineHeight: '1.6' }}>
          You can now view your complete job history with {companyName}, including job status,
          completed work, and any documents that need your signature.
        </Text>
      </Section>

      {/* CTA */}
      <Section style={{ padding: '0 0 24px' }}>
        <CTAButton href={portalUrl} label="View Your Jobs & Sign Documents" color={brandColor} />
      </Section>

      {/* Info box */}
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
          Portal access
        </Text>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#475569', fontSize: '14px', lineHeight: '1.8' }}>
          <li>No account or password needed</li>
          <li>View all your past and current jobs</li>
          <li>Sign documents electronically</li>
          <li>Link expires on {expiryDate}</li>
        </ul>
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
