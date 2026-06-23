/**
 * InvoiceEmail — customer-facing invoice email with three variants:
 *
 *   • 'send'    — the invoice itself (line items table, totals, payment instructions)
 *   • 'remind'  — payment reminder / overdue notice (conditional urgency styling)
 *   • 'receipt' — payment-received receipt (paid-in-full confirmation)
 *
 * White-label: the company name + colors come from the recipient TENANT'S
 * branding (never a hardcoded "Patriot"). The billing/reply contact is the
 * tenant's billing email when known, otherwise omitted — we never hardcode a
 * tenant billing address.
 *
 * Replaces the raw inline HTML in:
 *   app/api/admin/invoices/[id]/send/route.ts
 *   app/api/admin/invoices/[id]/remind/route.ts
 *   app/api/admin/invoices/[id]/payment/route.ts
 */

import React from 'react';
import { Section, Text } from '@react-email/components';
import BrandedEmail, { EmailBrandingProps } from './components/BrandedEmail';
import { parseYMDLocal, toLocalYMD } from '../lib/dates';

export type InvoiceVariant = 'send' | 'remind' | 'receipt';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unit?: string | null;
  unitRate: number;
  amount: number;
}

export interface InvoiceEmailProps {
  branding: EmailBrandingProps;
  variant: InvoiceVariant;
  customerName: string;
  invoiceNumber: string;
  invoiceDate?: string | null;
  dueDate?: string | null;
  poNumber?: string | null;
  /** Line items — only rendered for the 'send' variant. */
  lineItems?: InvoiceLineItem[];
  subtotal?: number;
  taxAmount?: number;
  discountAmount?: number;
  totalAmount?: number;
  balanceDue?: number;
  status?: string;
  notes?: string | null;
  /** 'remind' variant only. */
  isOverdue?: boolean;
  daysOverdue?: number;
  /** 'receipt' variant only. */
  amountPaid?: number;
  paymentDate?: string | null;
  paymentMethod?: string | null;
  referenceNumber?: string | null;
  /** Tenant billing/reply email — shown in payment instructions when present. */
  billingEmail?: string | null;
  /** Tenant phone — shown in payment instructions when present. */
  companyPhone?: string | null;
}

const fmt$ = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

/**
 * Format a date for display as "Jun 15, 2026". Inputs come from the DB as a bare
 * 'YYYY-MM-DD' string (a Postgres `date`). We MUST parse it as LOCAL midnight —
 * `new Date('2026-06-15')` is UTC and renders the previous day in US timezones
 * (CLAUDE.md date rule). Non-bare-date strings (already-formatted, or a full
 * timestamp) are passed through untouched.
 */
function fmtDate(value?: string | null): string | null {
  if (!value) return null;
  const ymd = /^\d{4}-\d{2}-\d{2}$/.exec(value)?.[0];
  if (!ymd) return value;
  return parseYMDLocal(ymd).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** True when a bare 'YYYY-MM-DD' due date is strictly before today (local). */
function isPastDue(dueDate?: string | null): boolean {
  if (!dueDate) return false;
  const ymd = /^\d{4}-\d{2}-\d{2}$/.exec(dueDate)?.[0];
  if (!ymd) return false;
  return ymd < toLocalYMD();
}

export const PreviewProps: InvoiceEmailProps = {
  branding: {
    companyName: 'Patriot Concrete Cutting',
    brandColor: '#dc2626',
    accentColor: '#1e3a5f',
    logoUrl: null,
  },
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
  billingEmail: 'billing@patriotconcretecutting.com',
  companyPhone: '(833) 695-4288',
};

const labelStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '11px',
  fontWeight: '700',
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const valueStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: '14px',
  fontWeight: '600',
  color: '#1e293b',
};

export default function InvoiceEmail(props: InvoiceEmailProps) {
  const { branding, variant } = props;
  const { brandColor } = branding;

  if (variant === 'receipt') return <ReceiptBody {...props} />;
  if (variant === 'remind') return <RemindBody {...props} />;
  return <SendBody {...props} brandColor={brandColor} />;
}

/* ── 'send' — the invoice ──────────────────────────────────────────────── */
function SendBody({
  branding,
  customerName,
  invoiceNumber,
  invoiceDate,
  dueDate,
  poNumber,
  lineItems = [],
  subtotal = 0,
  taxAmount = 0,
  discountAmount = 0,
  totalAmount = 0,
  balanceDue = 0,
  status,
  notes,
  billingEmail,
  brandColor,
}: InvoiceEmailProps & { brandColor: string }) {
  const { companyName } = branding;

  return (
    <BrandedEmail
      branding={branding}
      preview={`Invoice ${invoiceNumber} from ${companyName}`}
      subtitle={`Invoice ${invoiceNumber}`}
    >
      <Section style={{ padding: '32px 0 0' }}>
        <Text style={{ margin: '0 0 16px', fontSize: '15px', color: '#334155' }}>
          Dear <strong style={{ color: '#0f172a' }}>{customerName}</strong>,
        </Text>
        <Text style={{ margin: '0 0 24px', fontSize: '14px', color: '#64748b', lineHeight: '1.6' }}>
          Please find your invoice details below. Payment is due by the date listed. We appreciate
          your prompt attention and thank you for choosing {companyName}.
        </Text>
      </Section>

      {/* Invoice meta */}
      <Section
        style={{
          margin: '0 0 24px',
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
          padding: '16px 20px',
          border: '1px solid #e2e8f0',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ width: '50%', verticalAlign: 'top', paddingBottom: poNumber ? '12px' : 0 }}>
                <p style={labelStyle}>Invoice Date</p>
                <p style={valueStyle}>{fmtDate(invoiceDate) || 'N/A'}</p>
              </td>
              <td style={{ width: '50%', verticalAlign: 'top', paddingBottom: poNumber ? '12px' : 0 }}>
                <p style={labelStyle}>Due Date</p>
                {/* Only color the due date red when it's actually overdue. */}
                <p style={{ ...valueStyle, color: isPastDue(dueDate) ? '#dc2626' : '#1e293b' }}>
                  {fmtDate(dueDate) || 'Upon Receipt'}
                </p>
              </td>
            </tr>
            {poNumber ? (
              <tr>
                <td colSpan={2} style={{ verticalAlign: 'top' }}>
                  <p style={labelStyle}>PO Number</p>
                  <p style={valueStyle}>{poNumber}</p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Section>

      {/* Amount due banner */}
      <Section style={{ margin: '0 0 24px' }}>
        <p style={labelStyle}>Amount Due</p>
        <p style={{ margin: '4px 0 0', fontSize: '28px', fontWeight: '800', color: brandColor }}>
          {fmt$(totalAmount)}
        </p>
      </Section>

      {/* Line items */}
      <Section style={{ margin: '0 0 24px' }}>
        <p style={{ ...labelStyle, marginBottom: '10px', letterSpacing: '0.1em' }}>Line Items</p>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
          }}
        >
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              <th style={thStyle('left')}>Description</th>
              <th style={thStyle('right')}>Qty</th>
              <th style={thStyle('right')}>Rate</th>
              <th style={thStyle('right')}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}
                >
                  No line items
                </td>
              </tr>
            ) : (
              lineItems.map((item, i) => (
                <tr key={i}>
                  <td style={tdStyle('left', '#1e293b')}>{item.description}</td>
                  <td style={tdStyle('right', '#64748b')}>
                    {item.quantity} {item.unit || ''}
                  </td>
                  <td style={tdStyle('right', '#64748b')}>{fmt$(item.unitRate)}</td>
                  <td style={{ ...tdStyle('right', '#1e293b'), fontWeight: 600 }}>
                    {fmt$(item.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={footTd('#64748b')}>
                Subtotal
              </td>
              <td style={footTd('#1e293b')}>{fmt$(subtotal)}</td>
            </tr>
            {taxAmount > 0 ? (
              <tr>
                <td colSpan={3} style={footTd('#64748b', false)}>
                  Tax
                </td>
                <td style={footTd('#1e293b', false)}>{fmt$(taxAmount)}</td>
              </tr>
            ) : null}
            {discountAmount > 0 ? (
              <tr>
                <td colSpan={3} style={footTd('#64748b', false)}>
                  Discount
                </td>
                <td style={footTd('#16a34a', false)}>-{fmt$(discountAmount)}</td>
              </tr>
            ) : null}
            <tr>
              <td colSpan={3} style={{ ...footTd('#1e293b'), fontSize: '16px', fontWeight: 800 }}>
                Total
              </td>
              <td style={{ ...footTd('#1e293b'), fontSize: '16px', fontWeight: 800 }}>
                {fmt$(totalAmount)}
              </td>
            </tr>
            {balanceDue > 0 && status !== 'paid' ? (
              <tr>
                <td colSpan={3} style={{ ...footTd('#d97706', false), fontWeight: 600 }}>
                  Balance Due
                </td>
                <td style={{ ...footTd('#d97706', false), fontWeight: 700 }}>{fmt$(balanceDue)}</td>
              </tr>
            ) : null}
          </tfoot>
        </table>
      </Section>

      {notes ? (
        <Section
          style={{
            margin: '0 0 24px',
            padding: '16px',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            borderLeft: `3px solid ${brandColor}`,
          }}
        >
          <p style={{ ...labelStyle, marginBottom: '4px' }}>Notes</p>
          <p style={{ margin: 0, fontSize: '14px', color: '#334155', whiteSpace: 'pre-line' }}>
            {notes}
          </p>
        </Section>
      ) : null}

      {/* Payment instructions */}
      <Section
        style={{
          margin: '0 0 40px',
          padding: '20px',
          backgroundColor: '#f1f5f9',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
        }}
      >
        <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
          Payment Instructions
        </p>
        <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
          Please remit payment by the due date listed above. We accept check, ACH, and credit card.
          {billingEmail ? (
            <>
              {' '}
              If you have any questions regarding this invoice, contact us at{' '}
              <strong style={{ color: brandColor }}>{billingEmail}</strong>.
            </>
          ) : (
            <> If you have any questions regarding this invoice, please reach out to {companyName}.</>
          )}
        </p>
      </Section>
    </BrandedEmail>
  );
}

/* ── 'remind' — reminder / overdue ─────────────────────────────────────── */
function RemindBody({
  branding,
  customerName,
  invoiceNumber,
  invoiceDate,
  dueDate,
  poNumber,
  balanceDue = 0,
  isOverdue = false,
  daysOverdue = 0,
  billingEmail,
  companyPhone,
}: InvoiceEmailProps) {
  const { companyName } = branding;
  const headerColor = isOverdue ? '#dc2626' : '#d97706';
  const urgencyLabel = isOverdue ? 'Overdue Notice' : 'Payment Reminder';
  const dayWord = daysOverdue === 1 ? 'day' : 'days';

  return (
    <BrandedEmail
      branding={branding}
      preview={`${urgencyLabel} — Invoice ${invoiceNumber}`}
      subtitle={`${urgencyLabel} — Invoice ${invoiceNumber}`}
    >
      <Section style={{ padding: '32px 0 0' }}>
        <Text style={{ margin: '0 0 16px', fontSize: '15px', color: '#334155' }}>
          Dear <strong style={{ color: '#0f172a' }}>{customerName}</strong>,
        </Text>
        <Text style={{ margin: '0 0 24px', fontSize: '14px', color: '#64748b', lineHeight: '1.6' }}>
          {isOverdue ? (
            <>
              This invoice is{' '}
              <strong>
                {daysOverdue} {dayWord} overdue
              </strong>
              . Please remit payment immediately to avoid service interruption.
            </>
          ) : (
            <>
              This is a friendly reminder that your invoice is due on{' '}
              <strong>{fmtDate(dueDate)}</strong>. Please remit payment at your earliest convenience.
            </>
          )}
        </Text>
      </Section>

      {/* Amount due box */}
      <Section
        style={{
          margin: '0 0 24px',
          padding: '20px',
          backgroundColor: '#fef2f2',
          border: `2px solid ${headerColor}`,
          borderRadius: '12px',
          textAlign: 'center',
        }}
      >
        <p style={labelStyle}>Amount Due</p>
        <p style={{ margin: '4px 0 0', fontSize: '36px', fontWeight: '900', color: headerColor }}>
          {fmt$(balanceDue)}
        </p>
        {dueDate ? (
          <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#64748b' }}>
            Due: <strong>{fmtDate(dueDate)}</strong>
            {isOverdue ? (
              <span style={{ color: headerColor, fontWeight: 700 }}>
                {' '}
                — {daysOverdue} {dayWord} overdue
              </span>
            ) : null}
          </p>
        ) : null}
      </Section>

      {/* Invoice reference */}
      <Section
        style={{
          margin: '0 0 24px',
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
          padding: '16px 20px',
          border: '1px solid #e2e8f0',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ width: '50%', verticalAlign: 'top', paddingBottom: poNumber ? '12px' : 0 }}>
                <p style={labelStyle}>Invoice #</p>
                <p style={valueStyle}>{invoiceNumber}</p>
              </td>
              <td style={{ width: '50%', verticalAlign: 'top', paddingBottom: poNumber ? '12px' : 0 }}>
                <p style={labelStyle}>Invoice Date</p>
                <p style={valueStyle}>{fmtDate(invoiceDate) || 'N/A'}</p>
              </td>
            </tr>
            {poNumber ? (
              <tr>
                <td colSpan={2} style={{ verticalAlign: 'top' }}>
                  <p style={labelStyle}>PO Number</p>
                  <p style={valueStyle}>{poNumber}</p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Section>

      {/* Payment instructions */}
      <Section
        style={{
          margin: '0 0 40px',
          padding: '20px',
          backgroundColor: '#fff7ed',
          borderRadius: '10px',
          border: '1px solid #fed7aa',
        }}
      >
        <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: '700', color: '#9a3412' }}>
          Payment Instructions
        </p>
        <p style={{ margin: 0, fontSize: '13px', color: '#7c2d12', lineHeight: '1.6' }}>
          Please remit payment by check, ACH, or credit card. For questions or to arrange payment,
          contact {companyName}
          {billingEmail ? (
            <>
              {' '}
              at <strong>{billingEmail}</strong>
            </>
          ) : null}
          {companyPhone ? (
            <>
              {' '}
              or call <strong>{companyPhone}</strong>
            </>
          ) : null}
          .
        </p>
      </Section>
    </BrandedEmail>
  );
}

/* ── 'receipt' — payment received ──────────────────────────────────────── */
function ReceiptBody({
  branding,
  customerName,
  invoiceNumber,
  amountPaid = 0,
  paymentDate,
  paymentMethod,
  referenceNumber,
}: InvoiceEmailProps) {
  const { companyName } = branding;

  return (
    <BrandedEmail
      branding={branding}
      preview={`Payment received — Invoice ${invoiceNumber}`}
      subtitle={`Payment Receipt — Invoice ${invoiceNumber}`}
    >
      {/* Success banner — solid fallback BEFORE the gradient so Outlook (which
          strips linear-gradient) still shows a green band, not white-on-white. */}
      <Section
        style={{
          margin: '32px 0 24px',
          padding: '20px 24px',
          backgroundColor: '#059669',
          background: 'linear-gradient(135deg, #10b981, #059669)',
          borderRadius: '12px',
        }}
      >
        <Text style={{ margin: 0, color: '#ffffff', fontSize: '22px', fontWeight: '800' }}>
          Payment Received
        </Text>
        <Text style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.92)', fontSize: '14px' }}>
          Thank you for your payment
        </Text>
      </Section>

      <Section style={{ padding: '0' }}>
        <Text style={{ margin: '0 0 16px', fontSize: '15px', color: '#334155' }}>
          Hi <strong style={{ color: '#0f172a' }}>{customerName || 'Valued Customer'}</strong>,
        </Text>
        <Text style={{ margin: '0 0 20px', fontSize: '15px', color: '#475569', lineHeight: '1.6' }}>
          We&apos;ve received your payment and your account is now paid in full.
        </Text>
      </Section>

      <Section
        style={{
          margin: '0 0 24px',
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '16px',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <tbody>
            <tr>
              <td style={{ padding: '6px 0', color: '#64748b' }}>Invoice</td>
              <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                {invoiceNumber}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '6px 0', color: '#64748b' }}>Payment Date</td>
              <td style={{ padding: '6px 0', textAlign: 'right', color: '#0f172a' }}>
                {fmtDate(paymentDate) || 'N/A'}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '6px 0', color: '#64748b' }}>Payment Method</td>
              <td
                style={{
                  padding: '6px 0',
                  textAlign: 'right',
                  textTransform: 'capitalize',
                  color: '#0f172a',
                }}
              >
                {paymentMethod || 'N/A'}
                {referenceNumber ? ` · #${referenceNumber}` : ''}
              </td>
            </tr>
            <tr style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={{ padding: '10px 0 4px', fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>
                Amount Paid
              </td>
              <td
                style={{
                  padding: '10px 0 4px',
                  textAlign: 'right',
                  fontWeight: 700,
                  fontSize: '15px',
                  color: '#059669',
                }}
              >
                {fmt$(amountPaid)}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '4px 0', color: '#64748b' }}>Remaining Balance</td>
              <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                $0.00 — Paid in Full
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section style={{ padding: '0 0 40px' }}>
        <Text style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: '1.6' }}>
          Thank you for choosing {companyName}. We look forward to working with you again.
        </Text>
      </Section>
    </BrandedEmail>
  );
}

/* ── shared cell styles ────────────────────────────────────────────────── */
function thStyle(align: 'left' | 'right'): React.CSSProperties {
  return {
    padding: '10px 12px',
    textAlign: align,
    fontSize: '11px',
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #e2e8f0',
  };
}

function tdStyle(align: 'left' | 'right', color: string): React.CSSProperties {
  return {
    padding: '10px 12px',
    textAlign: align,
    fontSize: '14px',
    color,
    borderBottom: '1px solid #f1f5f9',
  };
}

function footTd(color: string, topBorder = true): React.CSSProperties {
  return {
    padding: '10px 12px',
    textAlign: 'right',
    fontSize: '14px',
    color,
    ...(topBorder ? { borderTop: '2px solid #e2e8f0' } : {}),
  };
}
