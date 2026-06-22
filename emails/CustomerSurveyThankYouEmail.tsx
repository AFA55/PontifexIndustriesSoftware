/**
 * CustomerSurveyThankYouEmail — "thank you for your feedback" sent after a
 * customer satisfaction survey, echoing back the ratings the customer gave.
 *
 * White-label: company name + colors from the recipient TENANT'S branding.
 *
 * Replaces the near-identical raw inline HTML in:
 *   app/api/job-orders/[id]/customer-survey/route.ts
 *   app/api/public/signature/[token]/route.ts  (survey thank-you branch)
 */

import React from 'react';
import { Section, Text } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';

export interface CustomerSurveyThankYouEmailProps {
  branding: EmailBrandingProps;
  jobNumber: string;
  customerName?: string | null;
  cleanliness?: number | null;
  communication?: number | null;
  likelyAgain?: number | null;
  notes?: string | null;
}

export const PreviewProps: CustomerSurveyThankYouEmailProps = {
  branding: {
    companyName: 'Patriot Concrete Cutting',
    brandColor: '#dc2626',
    accentColor: '#1e3a5f',
    logoUrl: null,
  },
  jobNumber: 'JOB-2026-000123',
  customerName: 'Acme Builders',
  cleanliness: 5,
  communication: 4,
  likelyAgain: 9,
  notes: 'Crew was professional and left the site spotless.',
};

function RatingRow({ label, value, max }: { label: string; value: number | null | undefined; max: number }) {
  if (!value) return null;
  return (
    <tr>
      <td style={{ padding: '10px 0', color: '#64748b', fontSize: '14px', borderTop: '1px solid #e2e8f0' }}>
        {label}
      </td>
      <td
        style={{
          padding: '10px 0',
          color: '#0f172a',
          fontSize: '14px',
          fontWeight: 600,
          textAlign: 'right',
          borderTop: '1px solid #e2e8f0',
        }}
      >
        {value} / {max}
      </td>
    </tr>
  );
}

export default function CustomerSurveyThankYouEmail({
  branding,
  jobNumber,
  customerName,
  cleanliness,
  communication,
  likelyAgain,
  notes,
}: CustomerSurveyThankYouEmailProps) {
  const { brandColor, companyName } = branding;

  return (
    <BrandedEmail
      branding={branding}
      preview={`Thank you from ${companyName}`}
      subtitle={`Thank you for your feedback · Job ${jobNumber}`}
    >
      <Section style={{ padding: '36px 40px 0' }}>
        <Text style={{ margin: '0 0 20px', color: '#475569', fontSize: '16px', lineHeight: '1.6' }}>
          {customerName ? (
            <>
              Hi <strong style={{ color: '#0f172a' }}>{customerName}</strong>,
            </>
          ) : (
            'Hi,'
          )}
        </Text>
        <Text style={{ margin: '0 0 24px', color: '#475569', fontSize: '16px', lineHeight: '1.6' }}>
          We appreciate you taking a moment to share how we did. Here&apos;s a copy of your feedback:
        </Text>
      </Section>

      <Section
        style={{
          margin: '0 40px 24px',
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
          padding: '0 20px',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <RatingRow label="Cleanliness" value={cleanliness} max={5} />
            <RatingRow label="Communication" value={communication} max={5} />
            <RatingRow label="Likely to use us again" value={likelyAgain} max={10} />
          </tbody>
        </table>
      </Section>

      {notes ? (
        <Section
          style={{
            margin: '0 40px 24px',
            backgroundColor: '#f5f3ff',
            borderLeft: `3px solid ${brandColor}`,
            borderRadius: '4px',
            padding: '16px 20px',
          }}
        >
          <Text
            style={{
              margin: '0 0 6px',
              color: '#5b21b6',
              fontSize: '12px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
            }}
          >
            Your notes
          </Text>
          <Text style={{ margin: 0, color: '#312e81', fontSize: '14px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
            {notes}
          </Text>
        </Section>
      ) : null}

      <Section style={{ padding: '0 40px 40px' }}>
        <Text style={{ margin: 0, color: '#475569', fontSize: '15px', lineHeight: '1.6' }}>
          Your comments help us improve every single day. Thank you for trusting {companyName}.
        </Text>
      </Section>
    </BrandedEmail>
  );
}
