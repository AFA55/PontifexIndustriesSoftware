/**
 * InviteEmail — team invitation transactional email.
 *
 * Sent when an admin invites a new user. Contains the setup URL as both a
 * bulletproof CTA button and a raw fallback link so the invitation is always
 * actionable. The test suite (lib/email-links.test.ts) asserts:
 *   • The setupUrl appears in at least one <a href>.
 *   • The setupUrl appears in at least TWO anchors (CTA + fallback).
 *   • One of those anchors has the URL as its visible inner text.
 *   • No href contains whitespace.
 *   • Every href is parseable by `new URL()`.
 *   • A 43-char base64url token survives intact.
 */

import React from 'react';
import { Section, Text, Link, Hr } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';
import CTAButton from './components/CTAButton';

export interface InviteEmailProps {
  branding: EmailBrandingProps;
  inviteeName: string;
  inviterName: string;
  tenantName: string;
  roleLabel: string;
  companyCode?: string;
  setupUrl: string;
}

export const PreviewProps: InviteEmailProps = {
  branding: {
    companyName: 'Patriot Concrete Cutting',
    brandColor: '#dc2626',
    accentColor: '#1e3a5f',
    logoUrl: null,
  },
  inviteeName: 'Jane Operator',
  inviterName: 'Andres Altamirano',
  tenantName: 'Patriot Concrete Cutting',
  roleLabel: 'Operator',
  companyCode: 'PATRIOT',
  setupUrl: 'https://www.pontifexindustries.com/setup-account?token=k7fQ2zX9mP4rT1wY',
};

export default function InviteEmail({
  branding,
  inviteeName,
  inviterName,
  tenantName,
  roleLabel,
  companyCode,
  setupUrl,
}: InviteEmailProps) {
  const { brandColor } = branding;

  const steps: Array<{ n: string; label: string }> = [
    { n: '1', label: 'Tap the "Set Up My Account" button below' },
    { n: '2', label: 'Add your photo and create a password' },
    { n: '3', label: "You're in — your dashboard is ready" },
  ];

  return (
    <BrandedEmail
      branding={branding}
      preview={`${inviterName} invited you to join ${tenantName}`}
      subtitle="You're invited to join the team"
    >
      <Section style={{ padding: '40px 40px 0' }}>
        <Text
          style={{
            margin: '0 0 20px',
            color: '#475569',
            fontSize: '16px',
            lineHeight: '1.6',
          }}
        >
          Hi <strong style={{ color: '#0f172a' }}>{inviteeName}</strong>,
        </Text>
        <Text
          style={{
            margin: '0 0 28px',
            color: '#475569',
            fontSize: '16px',
            lineHeight: '1.6',
          }}
        >
          <strong style={{ color: '#0f172a' }}>{inviterName}</strong> set up an account for you on
          the {tenantName} platform as{' '}
          <strong style={{ color: brandColor }}>{roleLabel}</strong>. Finish setup in about 2
          minutes.
        </Text>
      </Section>

      {/* CTA — the primary action link (also tested by email-links.test.ts) */}
      <Section style={{ padding: '0 40px 20px' }}>
        <CTAButton href={setupUrl} label="Set Up My Account" color={brandColor} />
      </Section>

      {/* Fallback raw link — must appear as an <a> with the URL as visible text */}
      <Section
        style={{
          margin: '0 40px 28px',
          backgroundColor: '#f8fafc',
          borderRadius: '6px',
          padding: '14px 18px',
        }}
      >
        <Text
          style={{
            margin: '0 0 6px',
            color: '#64748b',
            fontSize: '13px',
            fontWeight: '600',
          }}
        >
          Button not working?
        </Text>
        <Text style={{ margin: 0, fontSize: '12px', lineHeight: '1.5', wordBreak: 'break-all' }}>
          {/* This anchor MUST have setupUrl as both href and inner text for the test */}
          <Link href={setupUrl} style={{ color: brandColor, textDecoration: 'underline' }}>
            {setupUrl}
          </Link>
        </Text>
      </Section>

      {/* What happens next steps */}
      <Section style={{ padding: '0 40px 24px' }}>
        <Text
          style={{
            margin: '0 0 12px',
            color: '#0f172a',
            fontSize: '13px',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          What happens next
        </Text>
        {steps.map(({ n, label }) => (
          <div
            key={n}
            style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '10px' }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '26px',
                height: '26px',
                minWidth: '26px',
                borderRadius: '50%',
                backgroundColor: '#ede9fe',
                color: brandColor,
                fontSize: '13px',
                fontWeight: '700',
                textAlign: 'center',
                lineHeight: '26px',
                marginRight: '10px',
                verticalAlign: 'middle',
              }}
            >
              {n}
            </span>
            <Text style={{ margin: 0, color: '#334155', fontSize: '15px', lineHeight: '26px' }}>
              {label}
            </Text>
          </div>
        ))}
      </Section>

      {/* Info card: expiry + company code */}
      <Section
        style={{
          margin: '0 40px 16px',
          backgroundColor: '#fffbeb',
          borderLeft: '3px solid #f59e0b',
          borderRadius: '4px',
          padding: '14px 18px',
        }}
      >
        <Text style={{ margin: 0, color: '#78350f', fontSize: '14px', lineHeight: '1.6' }}>
          This invitation expires in <strong>7 days</strong>.
          {companyCode ? (
            <>
              {' '}
              Your company code is <strong>{companyCode}</strong> — you&apos;ll use it to log in.
            </>
          ) : null}
        </Text>
      </Section>

      <Section
        style={{
          margin: '0 40px 40px',
          backgroundColor: '#f1f5f9',
          borderLeft: '3px solid #94a3b8',
          borderRadius: '4px',
          padding: '14px 18px',
        }}
      >
        <Text style={{ margin: 0, color: '#475569', fontSize: '14px', lineHeight: '1.5' }}>
          <strong style={{ color: '#334155' }}>Need help?</strong> Contact {inviterName} or your
          administrator. If you weren&apos;t expecting this invitation, you can safely ignore this
          email.
        </Text>
      </Section>

      <Hr style={{ borderColor: '#e2e8f0', margin: '0 40px' }} />

      <Section style={{ padding: '16px 40px', textAlign: 'center' }}>
        <Text style={{ margin: 0, color: '#64748b', fontSize: '13px', lineHeight: '1.5' }}>
          <strong style={{ color: '#475569' }}>{tenantName}</strong>
          <br />
          Powered by Pontifex Industries
        </Text>
      </Section>
    </BrandedEmail>
  );
}
