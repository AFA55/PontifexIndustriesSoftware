/**
 * Render all 5 react-email templates with Patriot-style branding and write
 * the resulting HTML files to docs/reference/email-previews/.
 *
 * Run with tsx (handles TypeScript/JSX .tsx imports automatically):
 *   npx tsx scripts/render-email-previews.mjs
 *
 * Or with ts-node:
 *   npx ts-node --esm scripts/render-email-previews.mjs
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'reference', 'email-previews');

fs.mkdirSync(OUT_DIR, { recursive: true });

const DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

function renderEmailToHtml(element) {
  const html = renderToStaticMarkup(element);
  return `${DOCTYPE}${html.replace(/<!DOCTYPE[^>]*>/i, '')}`;
}

// ── Sample Patriot-style branding ──────────────────────────────────────────
const BRANDING = {
  companyName: 'Patriot Concrete Cutting',
  brandColor: '#dc2626',
  accentColor: '#1e3a5f',
  logoUrl: null, // set to a real URL to preview with logo
};

const TOKEN = 'k7fQ2zX9mP4rT1wY8sLbV3nJ6hD5gC0aE_uIoZqRx-N';

// ── Dynamic imports of .tsx templates ──────────────────────────────────────
// tsx runner handles the .tsx extension resolution automatically
const { default: InviteEmail } = await import('../emails/InviteEmail.tsx');
const { default: ApprovalEmail } = await import('../emails/ApprovalEmail.tsx');
const { default: AccessRequestReceivedEmail } = await import(
  '../emails/AccessRequestReceivedEmail.tsx'
);
const { default: NotificationEmail } = await import('../emails/NotificationEmail.tsx');
const { default: PasswordResetEmail } = await import('../emails/PasswordResetEmail.tsx');

// ── Render each template ────────────────────────────────────────────────────
const previews = [
  {
    name: 'invite',
    html: renderEmailToHtml(
      React.createElement(InviteEmail, {
        branding: BRANDING,
        inviteeName: 'Jane Operator',
        inviterName: 'Andres Altamirano',
        tenantName: 'Patriot Concrete Cutting',
        roleLabel: 'Operator',
        companyCode: 'PATRIOT',
        setupUrl: `https://www.pontifexindustries.com/setup-account?token=${TOKEN}`,
      })
    ),
  },
  {
    name: 'approval',
    html: renderEmailToHtml(
      React.createElement(ApprovalEmail, {
        branding: BRANDING,
        fullName: 'Jane Operator',
        email: 'jane@example.com',
        role: 'Operator',
        loginUrl: 'https://www.pontifexindustries.com/login',
      })
    ),
  },
  {
    name: 'access-request-received',
    html: renderEmailToHtml(
      React.createElement(AccessRequestReceivedEmail, {
        branding: BRANDING,
        fullName: 'John Applicant',
        email: 'john@example.com',
      })
    ),
  },
  {
    name: 'notification',
    html: renderEmailToHtml(
      React.createElement(NotificationEmail, {
        branding: BRANDING,
        title: 'You have been assigned to a new job',
        message:
          'You have been assigned to Job #JOB-2026-000123 at 4800 Oak Grove Drive, Burbank CA. The job starts Monday, June 23 at 7:00 AM. Please review the details and confirm your availability.',
        actionUrl: 'https://www.pontifexindustries.com/dashboard/my-jobs',
      })
    ),
  },
  {
    name: 'password-reset',
    html: renderEmailToHtml(
      React.createElement(PasswordResetEmail, {
        branding: BRANDING,
        fullName: 'Jane Operator',
        resetLink: `https://www.pontifexindustries.com/update-password?token=${TOKEN}`,
      })
    ),
  },
];

for (const { name, html } of previews) {
  const filePath = path.join(OUT_DIR, `${name}.html`);
  fs.writeFileSync(filePath, html, 'utf-8');
  console.log(`Wrote ${filePath} (${(html.length / 1024).toFixed(1)} KB)`);
}

console.log(`\nAll ${previews.length} previews written to ${OUT_DIR}`);
