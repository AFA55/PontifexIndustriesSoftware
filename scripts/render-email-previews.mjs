/**
 * Render every react-email template with Patriot-style branding (and the
 * Pontifex default for the internal demo-lead alert) and write the resulting
 * HTML files to docs/reference/email-previews/.
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
const { default: InvoiceEmail } = await import('../emails/InvoiceEmail.tsx');
const { default: SignatureRequestEmail } = await import('../emails/SignatureRequestEmail.tsx');
const { default: CompletionThankYouEmail } = await import('../emails/CompletionThankYouEmail.tsx');
const { default: CustomerSurveyThankYouEmail } = await import(
  '../emails/CustomerSurveyThankYouEmail.tsx'
);
const { default: PortalAccessEmail } = await import('../emails/PortalAccessEmail.tsx');
const { default: SilicaPlanDeliveryEmail } = await import('../emails/SilicaPlanDeliveryEmail.tsx');
const { default: OperatorScheduleEmail } = await import('../emails/OperatorScheduleEmail.tsx');
const { default: ClockInReminderEmail } = await import('../emails/ClockInReminderEmail.tsx');
const { default: SalespersonNotificationEmail } = await import(
  '../emails/SalespersonNotificationEmail.tsx'
);
const { default: DemoRequestNotificationEmail } = await import(
  '../emails/DemoRequestNotificationEmail.tsx'
);

// Default (Pontifex purple) branding — for the internal demo-lead alert.
const PONTIFEX_BRANDING = {
  companyName: 'Pontifex Industries',
  brandColor: '#7c3aed',
  accentColor: '#4f46e5',
  logoUrl: null,
};

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
  {
    name: 'invoice-send',
    html: renderEmailToHtml(
      React.createElement(InvoiceEmail, {
        branding: BRANDING,
        variant: 'send',
        customerName: 'Acme Builders',
        invoiceNumber: 'INV-2026-000042',
        invoiceDate: '2026-06-15',
        dueDate: '2026-07-15',
        poNumber: 'PO-88231',
        lineItems: [
          { description: 'Slab sawing — 6" reinforced', quantity: 120, unit: 'LF', unitRate: 9.5, amount: 1140 },
          { description: 'Core drilling — 4" cores', quantity: 8, unit: 'ea', unitRate: 65, amount: 520 },
        ],
        subtotal: 1660,
        taxAmount: 132.8,
        discountAmount: 0,
        totalAmount: 1792.8,
        balanceDue: 1792.8,
        status: 'sent',
        notes: 'Thank you for your business. Net 30 terms apply.',
        billingEmail: 'billing@acme-example.com',
      })
    ),
  },
  {
    name: 'invoice-remind',
    html: renderEmailToHtml(
      React.createElement(InvoiceEmail, {
        branding: BRANDING,
        variant: 'remind',
        customerName: 'Acme Builders',
        invoiceNumber: 'INV-2026-000042',
        invoiceDate: '2026-05-15',
        dueDate: '2026-06-15',
        poNumber: 'PO-88231',
        balanceDue: 1792.8,
        isOverdue: true,
        daysOverdue: 7,
        billingEmail: 'billing@acme-example.com',
        companyPhone: '(833) 695-4288',
      })
    ),
  },
  {
    name: 'invoice-receipt',
    html: renderEmailToHtml(
      React.createElement(InvoiceEmail, {
        branding: BRANDING,
        variant: 'receipt',
        customerName: 'Acme Builders',
        invoiceNumber: 'INV-2026-000042',
        amountPaid: 1792.8,
        paymentDate: '2026-06-20',
        paymentMethod: 'ach',
        referenceNumber: 'TXN-55021',
      })
    ),
  },
  {
    name: 'signature-request',
    html: renderEmailToHtml(
      React.createElement(SignatureRequestEmail, {
        branding: BRANDING,
        customerName: 'Acme Builders',
        jobNumber: 'JOB-2026-000123',
        jobLabel: 'Burbank Garage Slab',
        jobDate: 'June 23, 2026',
        jobLocation: '4800 Oak Grove Dr, Burbank CA',
        signingUrl: `https://www.pontifexindustries.com/sign/${TOKEN}`,
      })
    ),
  },
  {
    name: 'completion-thank-you',
    html: renderEmailToHtml(
      React.createElement(CompletionThankYouEmail, {
        branding: BRANDING,
        variant: 'completion',
        jobNumber: 'JOB-2026-000123',
        customerName: 'Acme Builders',
        location: '4800 Oak Grove Dr, Burbank CA',
        scopeOfWork: 'Slab sawing and core drilling for new garage foundation.',
        operatorName: 'Mike Rivera',
        companyPhone: '(833) 695-4288',
        referencePhotos: [],
      })
    ),
  },
  {
    name: 'liability-release',
    html: renderEmailToHtml(
      React.createElement(CompletionThankYouEmail, {
        branding: BRANDING,
        variant: 'liability',
        jobNumber: 'JOB-2026-000123',
        customerName: 'Acme Builders',
        location: '4800 Oak Grove Dr, Burbank CA',
        operatorName: 'Mike Rivera',
        companyPhone: '(833) 695-4288',
        supportEmail: 'support@acme-example.com',
        signedDate: '6/22/2026',
      })
    ),
  },
  {
    name: 'customer-survey-thank-you',
    html: renderEmailToHtml(
      React.createElement(CustomerSurveyThankYouEmail, {
        branding: BRANDING,
        jobNumber: 'JOB-2026-000123',
        customerName: 'Acme Builders',
        cleanliness: 5,
        communication: 4,
        likelyAgain: 9,
        notes: 'Crew was professional and left the site spotless.',
      })
    ),
  },
  {
    name: 'portal-access',
    html: renderEmailToHtml(
      React.createElement(PortalAccessEmail, {
        branding: BRANDING,
        customerName: 'Acme Builders',
        portalUrl: `https://www.pontifexindustries.com/portal/${TOKEN}`,
        expiryDate: 'July 22, 2026',
      })
    ),
  },
  {
    name: 'silica-plan-delivery',
    html: renderEmailToHtml(
      React.createElement(SilicaPlanDeliveryEmail, {
        branding: BRANDING,
        jobNumber: 'JOB-2026-000123',
      })
    ),
  },
  {
    name: 'operator-schedule',
    html: renderEmailToHtml(
      React.createElement(OperatorScheduleEmail, {
        branding: BRANDING,
        operatorName: 'Mike Rivera',
        scheduleDateLabel: 'Monday, June 23, 2026',
        earliestShopTimeLabel: '6:00 AM',
        scheduleUrl: 'https://www.pontifexindustries.com/dashboard/job-schedule',
        jobs: [
          {
            jobNumber: 'JOB-2026-000123',
            title: 'Burbank Garage Slab',
            customerName: 'Acme Builders',
            location: 'Burbank',
            address: '4800 Oak Grove Dr, Burbank CA',
            shopArrivalTime: '6:00 AM',
            arrivalTime: '7:30 AM',
            foremanName: 'Dan Cole',
            foremanPhone: '(818) 555-0142',
            description: 'Slab sawing for new garage foundation.',
            equipmentNeeded: ['Flat saw', 'Slurry vac', '6" blade'],
          },
          {
            jobNumber: 'JOB-2026-000124',
            title: 'Downtown Core Drilling',
            customerName: 'Metro Plumbing',
            location: 'Los Angeles',
            address: '700 S Flower St, Los Angeles CA',
            shopArrivalTime: '6:00 AM',
            arrivalTime: '11:00 AM',
            description: 'Six 4-inch cores through a 10-inch slab.',
            equipmentNeeded: ['Core rig', '4" bit'],
          },
        ],
      })
    ),
  },
  {
    name: 'clock-in-reminder',
    html: renderEmailToHtml(
      React.createElement(ClockInReminderEmail, {
        branding: BRANDING,
        name: 'Mike Rivera',
        actionUrl: 'https://www.pontifexindustries.com/dashboard/timecard?bypass_nfc=true',
      })
    ),
  },
  {
    name: 'salesperson-notification',
    html: renderEmailToHtml(
      React.createElement(SalespersonNotificationEmail, {
        branding: BRANDING,
        title: 'Your job is now active 🟢',
        message: 'JOB JOB-2026-000123 for Acme Builders has been started by the operator.',
        actionUrl: 'https://www.pontifexindustries.com/dashboard/admin/jobs/abc123',
      })
    ),
  },
  {
    name: 'demo-request-notification',
    html: renderEmailToHtml(
      React.createElement(DemoRequestNotificationEmail, {
        branding: PONTIFEX_BRANDING,
        name: 'Jordan Lee',
        company: 'Lee Concrete Services',
        email: 'jordan@leeconcrete.com',
        phone: '(555) 012-3456',
        tradeType: 'Concrete cutting',
        companySize: '11-25',
        message: 'Looking to replace our paper job tickets with something mobile.',
        manageUrl: 'https://www.pontifexindustries.com/dashboard/platform/demo-requests',
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
