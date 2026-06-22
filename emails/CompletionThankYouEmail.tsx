/**
 * CompletionThankYouEmail — thank-you sent with a signed PDF attachment.
 *
 * Two variants:
 *   • 'completion' — job sign-off PDF (job meta, scope of work, optional site photos)
 *   • 'liability'  — liability release & indemnification confirmation (job meta + contact)
 *
 * White-label: company name + colors from the recipient TENANT'S branding.
 * The PDF itself is attached by the route — this template is just the body.
 *
 * Replaces the raw inline HTML in:
 *   app/api/job-orders/[id]/generate-completion-pdf/route.ts
 *   app/api/liability-release/pdf/route.ts
 */

import React from 'react';
import { Section, Text, Img } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';

export type CompletionVariant = 'completion' | 'liability';

export interface CompletionThankYouEmailProps {
  branding: EmailBrandingProps;
  variant: CompletionVariant;
  jobNumber: string;
  customerName?: string | null;
  location?: string | null;
  scopeOfWork?: string | null;
  operatorName?: string | null;
  companyPhone?: string | null;
  /** liability variant only. */
  supportEmail?: string | null;
  signedDate?: string | null;
  /** completion variant only — up to 6 site photo URLs. */
  referencePhotos?: string[];
}

export const PreviewProps: CompletionThankYouEmailProps = {
  branding: {
    companyName: 'Patriot Concrete Cutting',
    brandColor: '#dc2626',
    accentColor: '#1e3a5f',
    logoUrl: null,
  },
  variant: 'completion',
  jobNumber: 'JOB-2026-000123',
  customerName: 'Acme Builders',
  location: '4800 Oak Grove Dr, Burbank CA',
  scopeOfWork: 'Slab sawing and core drilling for new garage foundation.',
  operatorName: 'Mike Rivera',
  companyPhone: '(833) 695-4288',
  referencePhotos: [],
};

const metaLabel: React.CSSProperties = {
  padding: '14px 18px',
  color: '#64748b',
  fontSize: '13px',
  borderBottom: '1px solid #e2e8f0',
};
const metaValue: React.CSSProperties = {
  padding: '14px 18px',
  color: '#0f172a',
  fontSize: '14px',
  fontWeight: 600,
  textAlign: 'right',
  borderBottom: '1px solid #e2e8f0',
};

export default function CompletionThankYouEmail(props: CompletionThankYouEmailProps) {
  if (props.variant === 'liability') return <LiabilityBody {...props} />;
  return <CompletionBody {...props} />;
}

/* ── 'completion' — job sign-off ───────────────────────────────────────── */
function CompletionBody({
  branding,
  jobNumber,
  customerName,
  location,
  scopeOfWork,
  operatorName,
  companyPhone,
  referencePhotos = [],
}: CompletionThankYouEmailProps) {
  const { brandColor, companyName } = branding;
  const photos = (referencePhotos || []).slice(0, 6);
  const photoRows: string[][] = [];
  for (let i = 0; i < photos.length; i += 3) photoRows.push(photos.slice(i, i + 3));

  return (
    <BrandedEmail
      branding={branding}
      preview={`Thank you from ${companyName} — Job ${jobNumber} sign-off`}
      subtitle="Your job is complete — sign-off attached"
    >
      <Section style={{ padding: '36px 40px 0' }}>
        <Text
          style={{ margin: '0 0 16px', color: '#0f172a', fontSize: '22px', fontWeight: '700', lineHeight: '1.3' }}
        >
          Thank you for choosing {companyName}
        </Text>
        {customerName ? (
          <Text style={{ margin: '0 0 16px', color: '#475569', fontSize: '16px', lineHeight: '1.6' }}>
            Hi <strong style={{ color: '#0f172a' }}>{customerName}</strong>,
          </Text>
        ) : null}
        <Text style={{ margin: '0 0 24px', color: '#475569', fontSize: '15px', lineHeight: '1.6' }}>
          Thank you for trusting us with your work. We&apos;ve attached a PDF copy of your signed
          completion record for your files.
        </Text>
      </Section>

      {/* Job meta */}
      <Section style={{ margin: '0 40px 24px' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
          }}
        >
          <tbody>
            <tr>
              <td style={metaLabel}>Job #</td>
              <td style={metaValue}>{jobNumber}</td>
            </tr>
            {location ? (
              <tr>
                <td style={metaLabel}>Location</td>
                <td style={metaValue}>{location}</td>
              </tr>
            ) : null}
            {operatorName ? (
              <tr>
                <td style={{ ...metaLabel, borderBottom: 'none' }}>Lead operator</td>
                <td style={{ ...metaValue, borderBottom: 'none' }}>{operatorName}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Section>

      {scopeOfWork ? (
        <Section
          style={{
            margin: '0 40px 24px',
            padding: '18px 20px',
            backgroundColor: '#f1f5f9',
            borderLeft: `3px solid ${brandColor}`,
            borderRadius: '6px',
          }}
        >
          <Text
            style={{
              margin: '0 0 6px',
              color: '#0f172a',
              fontSize: '13px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
            }}
          >
            Scope of work
          </Text>
          <Text style={{ margin: 0, color: '#475569', fontSize: '14px', lineHeight: '1.6' }}>
            {scopeOfWork}
          </Text>
        </Section>
      ) : null}

      {photoRows.length ? (
        <Section style={{ margin: '0 40px 24px' }}>
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
            Site photos
          </Text>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {photoRows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((url, ci) => (
                    <td key={ci} style={{ padding: '4px', width: '33.33%', verticalAlign: 'top' }}>
                      <Img
                        src={url}
                        alt="Job photo"
                        style={{
                          display: 'block',
                          width: '100%',
                          height: 'auto',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      <Section style={{ padding: '0 40px 40px' }}>
        <Text style={{ margin: '0 0 8px', color: '#475569', fontSize: '14px', lineHeight: '1.6' }}>
          If you have any questions about this job or need additional services, please don&apos;t
          hesitate to reach out
          {companyPhone ? (
            <>
              {' '}
              at <strong style={{ color: '#0f172a' }}>{companyPhone}</strong>
            </>
          ) : null}
          .
        </Text>
        <Text style={{ margin: '24px 0 0', color: '#0f172a', fontSize: '14px', lineHeight: '1.6' }}>
          With appreciation,
          <br />
          <strong>The {companyName} Team</strong>
        </Text>
      </Section>
    </BrandedEmail>
  );
}

/* ── 'liability' — liability release confirmation ──────────────────────── */
function LiabilityBody({
  branding,
  jobNumber,
  customerName,
  location,
  operatorName,
  companyPhone,
  supportEmail,
  signedDate,
}: CompletionThankYouEmailProps) {
  const { companyName } = branding;

  return (
    <BrandedEmail
      branding={branding}
      preview={`Liability Release — Job ${jobNumber}`}
      subtitle="Liability Release & Indemnification"
    >
      <Section style={{ padding: '36px 40px 0' }}>
        {customerName ? (
          <Text style={{ margin: '0 0 16px', color: '#475569', fontSize: '16px', lineHeight: '1.6' }}>
            Dear <strong style={{ color: '#0f172a' }}>{customerName}</strong>,
          </Text>
        ) : null}
        <Text style={{ margin: '0 0 24px', color: '#475569', fontSize: '15px', lineHeight: '1.6' }}>
          Thank you for working with {companyName}. This email confirms that the Liability Release &amp;
          Indemnification agreement has been signed for the job below.
        </Text>
      </Section>

      <Section style={{ margin: '0 40px 24px' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
          }}
        >
          <tbody>
            <tr>
              <td style={metaLabel}>Job Number</td>
              <td style={metaValue}>{jobNumber}</td>
            </tr>
            <tr>
              <td style={metaLabel}>Location</td>
              <td style={metaValue}>{location || 'N/A'}</td>
            </tr>
            <tr>
              <td style={metaLabel}>Operator</td>
              <td style={metaValue}>{operatorName || 'N/A'}</td>
            </tr>
            <tr>
              <td style={{ ...metaLabel, borderBottom: 'none' }}>Date</td>
              <td style={{ ...metaValue, borderBottom: 'none' }}>{signedDate || 'N/A'}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section style={{ padding: '0 40px 16px' }}>
        <Text style={{ margin: '0 0 16px', color: '#475569', fontSize: '14px', lineHeight: '1.6' }}>
          Please find the signed liability release document attached to this email for your records.
        </Text>
        {companyPhone || supportEmail ? (
          <Text style={{ margin: 0, color: '#475569', fontSize: '14px', lineHeight: '1.6' }}>
            If you have any questions or concerns, please don&apos;t hesitate to contact us
            {companyPhone ? (
              <>
                {' '}
                by phone at <strong style={{ color: '#0f172a' }}>{companyPhone}</strong>
              </>
            ) : null}
            {supportEmail ? (
              <>
                {' '}
                {companyPhone ? 'or' : 'at'} <strong style={{ color: '#0f172a' }}>{supportEmail}</strong>
              </>
            ) : null}
            .
          </Text>
        ) : null}
      </Section>

      <Section style={{ padding: '0 40px 40px' }}>
        <Text style={{ margin: 0, color: '#0f172a', fontSize: '14px', lineHeight: '1.6' }}>
          Thank you for choosing {companyName}.
        </Text>
      </Section>
    </BrandedEmail>
  );
}
