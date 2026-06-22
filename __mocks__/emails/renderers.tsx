/**
 * Jest manual mock for emails/renderers.tsx.
 *
 * Uses react-dom/server's renderToStaticMarkup (sync, no dynamic import) instead
 * of @react-email/render, which uses `await import("react-dom/server")` internally
 * and requires --experimental-vm-modules in Jest's CJS transform environment.
 *
 * The output is functionally identical for HTML email content testing purposes.
 *
 * Activated automatically by Jest's moduleNameMapper for @/emails/renderers —
 * see jest.config.js where the alias maps to this file, OR via the manual-mock
 * convention: this file lives at __mocks__/emails/renderers.tsx which is
 * Jest's automock location relative to the module at emails/renderers.tsx.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import InviteEmail, { InviteEmailProps } from '../../emails/InviteEmail';
import ApprovalEmail, { ApprovalEmailProps } from '../../emails/ApprovalEmail';
import AccessRequestReceivedEmail, {
  AccessRequestReceivedEmailProps,
} from '../../emails/AccessRequestReceivedEmail';
import NotificationEmail, { NotificationEmailProps } from '../../emails/NotificationEmail';
import PasswordResetEmail, { PasswordResetEmailProps } from '../../emails/PasswordResetEmail';
import InvoiceEmail, { InvoiceEmailProps } from '../../emails/InvoiceEmail';
import SignatureRequestEmail, {
  SignatureRequestEmailProps,
} from '../../emails/SignatureRequestEmail';
import CompletionThankYouEmail, {
  CompletionThankYouEmailProps,
} from '../../emails/CompletionThankYouEmail';
import CustomerSurveyThankYouEmail, {
  CustomerSurveyThankYouEmailProps,
} from '../../emails/CustomerSurveyThankYouEmail';
import PortalAccessEmail, { PortalAccessEmailProps } from '../../emails/PortalAccessEmail';
import SilicaPlanDeliveryEmail, {
  SilicaPlanDeliveryEmailProps,
} from '../../emails/SilicaPlanDeliveryEmail';
import OperatorScheduleEmail, {
  OperatorScheduleEmailProps,
} from '../../emails/OperatorScheduleEmail';
import ClockInReminderEmail, {
  ClockInReminderEmailProps,
} from '../../emails/ClockInReminderEmail';
import SalespersonNotificationEmail, {
  SalespersonNotificationEmailProps,
} from '../../emails/SalespersonNotificationEmail';
import DemoRequestNotificationEmail, {
  DemoRequestNotificationEmailProps,
} from '../../emails/DemoRequestNotificationEmail';

const DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

function renderEmailToHtml(element: React.ReactElement): string {
  const html = renderToStaticMarkup(element);
  return `${DOCTYPE}${html.replace(/<!DOCTYPE[^>]*>/i, '')}`;
}

export async function renderInviteEmail(props: InviteEmailProps): Promise<string> {
  return renderEmailToHtml(<InviteEmail {...props} />);
}

export async function renderApprovalEmail(props: ApprovalEmailProps): Promise<string> {
  return renderEmailToHtml(<ApprovalEmail {...props} />);
}

export async function renderAccessRequestReceivedEmail(
  props: AccessRequestReceivedEmailProps
): Promise<string> {
  return renderEmailToHtml(<AccessRequestReceivedEmail {...props} />);
}

export async function renderNotificationEmail(props: NotificationEmailProps): Promise<string> {
  return renderEmailToHtml(<NotificationEmail {...props} />);
}

export async function renderPasswordResetEmail(props: PasswordResetEmailProps): Promise<string> {
  return renderEmailToHtml(<PasswordResetEmail {...props} />);
}

export async function renderInvoiceEmail(props: InvoiceEmailProps): Promise<string> {
  return renderEmailToHtml(<InvoiceEmail {...props} />);
}

export async function renderSignatureRequestEmail(
  props: SignatureRequestEmailProps
): Promise<string> {
  return renderEmailToHtml(<SignatureRequestEmail {...props} />);
}

export async function renderCompletionThankYouEmail(
  props: CompletionThankYouEmailProps
): Promise<string> {
  return renderEmailToHtml(<CompletionThankYouEmail {...props} />);
}

export async function renderCustomerSurveyThankYouEmail(
  props: CustomerSurveyThankYouEmailProps
): Promise<string> {
  return renderEmailToHtml(<CustomerSurveyThankYouEmail {...props} />);
}

export async function renderPortalAccessEmail(props: PortalAccessEmailProps): Promise<string> {
  return renderEmailToHtml(<PortalAccessEmail {...props} />);
}

export async function renderSilicaPlanDeliveryEmail(
  props: SilicaPlanDeliveryEmailProps
): Promise<string> {
  return renderEmailToHtml(<SilicaPlanDeliveryEmail {...props} />);
}

export async function renderOperatorScheduleEmail(
  props: OperatorScheduleEmailProps
): Promise<string> {
  return renderEmailToHtml(<OperatorScheduleEmail {...props} />);
}

export async function renderClockInReminderEmail(
  props: ClockInReminderEmailProps
): Promise<string> {
  return renderEmailToHtml(<ClockInReminderEmail {...props} />);
}

export async function renderSalespersonNotificationEmail(
  props: SalespersonNotificationEmailProps
): Promise<string> {
  return renderEmailToHtml(<SalespersonNotificationEmail {...props} />);
}

export async function renderDemoRequestNotificationEmail(
  props: DemoRequestNotificationEmailProps
): Promise<string> {
  return renderEmailToHtml(<DemoRequestNotificationEmail {...props} />);
}
