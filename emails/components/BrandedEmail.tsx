/**
 * BrandedEmail — shared white-label layout for every Pontifex transactional email.
 *
 * Forces light-mode only (`color-scheme: light only`) so Apple Mail / Gmail
 * dark mode never inverts the email into an unreadable mess — ~42% support for
 * prefers-color-scheme with dark-mode inversion being the #1 email complaint.
 * All colors are explicit; nothing relies on client defaults.
 */

import React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Img,
  Heading,
  Text,
  Hr,
} from '@react-email/components';

export interface EmailBrandingProps {
  companyName: string;
  brandColor: string;
  accentColor: string;
  logoUrl: string | null;
}

interface BrandedEmailProps {
  branding: EmailBrandingProps;
  preview: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function BrandedEmail({
  branding,
  preview,
  subtitle,
  children,
}: BrandedEmailProps) {
  const { companyName, brandColor, accentColor, logoUrl } = branding;
  const year = new Date().getFullYear();

  return (
    <Html lang="en">
      <Head>
        {/* Force light mode — prevents dark-mode inversion in Apple Mail / Gmail */}
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light only" />
        <style>{`
          :root { color-scheme: light only; supported-color-schemes: light only; }
          * { box-sizing: border-box; }
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
        <Body
          style={{
            margin: 0,
            padding: 0,
            backgroundColor: '#f1f5f9',
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          }}
        >
          <Container
            style={{
              maxWidth: '600px',
              margin: '40px auto',
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              overflow: 'hidden',
              boxSizing: 'border-box',
            }}
          >
            {/* Glossy gradient accent bar */}
            <Section
              style={{
                height: '8px',
                background: `linear-gradient(90deg, ${brandColor} 0%, ${accentColor} 100%)`,
                lineHeight: '8px',
                fontSize: '0',
              }}
            >
              &nbsp;
            </Section>

            {/* White header band: logo + company name + subtitle */}
            <Section
              style={{
                backgroundColor: '#ffffff',
                padding: '32px 40px 24px',
                textAlign: 'center',
              }}
            >
              {logoUrl ? (
                <Img
                  src={logoUrl}
                  alt={companyName}
                  height={72}
                  style={{
                    maxHeight: '72px',
                    maxWidth: '220px',
                    margin: '0 auto 16px',
                    display: 'block',
                  }}
                />
              ) : (
                <Heading
                  as="h1"
                  style={{
                    margin: '0 0 8px',
                    color: '#0f172a',
                    fontSize: '26px',
                    fontWeight: '800',
                    letterSpacing: '-0.5px',
                  }}
                >
                  {companyName}
                </Heading>
              )}
              {logoUrl && (
                <Heading
                  as="h1"
                  style={{
                    margin: '0 0 4px',
                    color: '#0f172a',
                    fontSize: '22px',
                    fontWeight: '700',
                    letterSpacing: '-0.3px',
                  }}
                >
                  {companyName}
                </Heading>
              )}
              {subtitle && (
                <Text
                  style={{
                    margin: 0,
                    color: '#64748b',
                    fontSize: '13px',
                    fontWeight: '500',
                  }}
                >
                  {subtitle}
                </Text>
              )}
            </Section>

            {/* Main content slot */}
            {children}

            {/* Footer */}
            <Hr style={{ borderColor: '#e2e8f0', margin: 0 }} />
            <Section
              style={{
                backgroundColor: '#f8fafc',
                padding: '24px 40px',
                textAlign: 'center',
              }}
            >
              <Text
                style={{
                  margin: '0 0 6px',
                  color: '#64748b',
                  fontSize: '13px',
                  lineHeight: '1.5',
                }}
              >
                <strong style={{ color: '#475569' }}>{companyName}</strong> &copy; {year}
              </Text>
              <Text
                style={{
                  margin: 0,
                  color: '#94a3b8',
                  fontSize: '12px',
                  lineHeight: '1.5',
                }}
              >
                This is an automated message from {companyName}. Please do not reply.
              </Text>
            </Section>
          </Container>
        </Body>
    </Html>
  );
}
