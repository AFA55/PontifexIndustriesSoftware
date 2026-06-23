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
          /* Mobile: shrink the single content gutter so narrow phones don't waste width */
          @media (max-width: 480px) {
            .email-content-wrapper { padding-left: 24px !important; padding-right: 24px !important; }
            /* Header gutter matches the body gutter on narrow phones */
            .email-header { padding-left: 24px !important; padding-right: 24px !important; }
          }
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

            {/* White header band. With a logo: logo + subtitle only (the logo
                carries the wordmark — no duplicate company name). Without a logo:
                a clean wordmark heading + subtitle (white-label fallback). */}
            <Section
              className="email-header"
              style={{
                backgroundColor: '#ffffff',
                padding: '40px 40px 28px',
                textAlign: 'center',
              }}
            >
              {logoUrl ? (
                <>
                  {/* Outlook-safe centering: a 100%-width presentation table with a
                      center-aligned cell. margin:0 auto is ignored by Outlook. */}
                  <table
                    role="presentation"
                    width="100%"
                    cellPadding={0}
                    cellSpacing={0}
                    style={{ borderCollapse: 'collapse' }}
                  >
                    <tbody>
                      <tr>
                        <td align="center" style={{ paddingBottom: subtitle ? '16px' : '0' }}>
                          <Img
                            src={logoUrl}
                            alt={companyName}
                            height={56}
                            style={{
                              height: '56px',
                              width: 'auto',
                              maxWidth: '200px',
                              border: 0,
                              outline: 'none',
                              textDecoration: 'none',
                              display: 'inline-block',
                            }}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
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
                </>
              ) : (
                <>
                  <Heading
                    as="h1"
                    style={{
                      margin: subtitle ? '0 0 8px' : '0',
                      color: '#0f172a',
                      fontSize: '28px',
                      fontWeight: '800',
                      letterSpacing: '-0.6px',
                    }}
                  >
                    {companyName}
                  </Heading>
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
                </>
              )}
            </Section>

            {/* Main content slot — single horizontal gutter owned here so no
                inner <Section> needs its own 40px inset (margin on a 100%-width
                table overflows the container). Templates keep only vertical
                margins/padding; this wrapper supplies the 40px side gutter. */}
            <Section className="email-content-wrapper" style={{ padding: '0 40px' }}>
              {children}
            </Section>

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
