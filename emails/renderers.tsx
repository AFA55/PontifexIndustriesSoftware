/**
 * Email renderers — thin wrappers that instantiate each React email component
 * and pass it to @react-email/render to produce an HTML string.
 *
 * Kept in a .tsx file (not lib/email.ts) because JSX is required. The plain
 * lib/email.ts imports these functions and calls them.
 *
 * Testing note: Jest mocks this module via __mocks__/emails/renderers.tsx,
 * which uses renderToStaticMarkup (sync, no dynamic import) to avoid the
 * --experimental-vm-modules requirement.
 */

import React from 'react';
import { render } from '@react-email/render';

import InviteEmail, { InviteEmailProps } from './InviteEmail';
import ApprovalEmail, { ApprovalEmailProps } from './ApprovalEmail';
import AccessRequestReceivedEmail, {
  AccessRequestReceivedEmailProps,
} from './AccessRequestReceivedEmail';
import NotificationEmail, { NotificationEmailProps } from './NotificationEmail';
import PasswordResetEmail, { PasswordResetEmailProps } from './PasswordResetEmail';
import InvoiceEmail, { InvoiceEmailProps } from './InvoiceEmail';
import SignatureRequestEmail, { SignatureRequestEmailProps } from './SignatureRequestEmail';
import CompletionThankYouEmail, {
  CompletionThankYouEmailProps,
} from './CompletionThankYouEmail';
import CustomerSurveyThankYouEmail, {
  CustomerSurveyThankYouEmailProps,
} from './CustomerSurveyThankYouEmail';
import PortalAccessEmail, { PortalAccessEmailProps } from './PortalAccessEmail';
import SilicaPlanDeliveryEmail, {
  SilicaPlanDeliveryEmailProps,
} from './SilicaPlanDeliveryEmail';
import OperatorScheduleEmail, { OperatorScheduleEmailProps } from './OperatorScheduleEmail';
import ClockInReminderEmail, { ClockInReminderEmailProps } from './ClockInReminderEmail';
import SalespersonNotificationEmail, {
  SalespersonNotificationEmailProps,
} from './SalespersonNotificationEmail';
import DemoRequestNotificationEmail, {
  DemoRequestNotificationEmailProps,
} from './DemoRequestNotificationEmail';

export async function renderInviteEmail(props: InviteEmailProps): Promise<string> {
  return render(<InviteEmail {...props} />);
}

export async function renderApprovalEmail(props: ApprovalEmailProps): Promise<string> {
  return render(<ApprovalEmail {...props} />);
}

export async function renderAccessRequestReceivedEmail(
  props: AccessRequestReceivedEmailProps
): Promise<string> {
  return render(<AccessRequestReceivedEmail {...props} />);
}

export async function renderNotificationEmail(props: NotificationEmailProps): Promise<string> {
  return render(<NotificationEmail {...props} />);
}

export async function renderPasswordResetEmail(props: PasswordResetEmailProps): Promise<string> {
  return render(<PasswordResetEmail {...props} />);
}

export async function renderInvoiceEmail(props: InvoiceEmailProps): Promise<string> {
  return render(<InvoiceEmail {...props} />);
}

export async function renderSignatureRequestEmail(
  props: SignatureRequestEmailProps
): Promise<string> {
  return render(<SignatureRequestEmail {...props} />);
}

export async function renderCompletionThankYouEmail(
  props: CompletionThankYouEmailProps
): Promise<string> {
  return render(<CompletionThankYouEmail {...props} />);
}

export async function renderCustomerSurveyThankYouEmail(
  props: CustomerSurveyThankYouEmailProps
): Promise<string> {
  return render(<CustomerSurveyThankYouEmail {...props} />);
}

export async function renderPortalAccessEmail(props: PortalAccessEmailProps): Promise<string> {
  return render(<PortalAccessEmail {...props} />);
}

export async function renderSilicaPlanDeliveryEmail(
  props: SilicaPlanDeliveryEmailProps
): Promise<string> {
  return render(<SilicaPlanDeliveryEmail {...props} />);
}

export async function renderOperatorScheduleEmail(
  props: OperatorScheduleEmailProps
): Promise<string> {
  return render(<OperatorScheduleEmail {...props} />);
}

export async function renderClockInReminderEmail(
  props: ClockInReminderEmailProps
): Promise<string> {
  return render(<ClockInReminderEmail {...props} />);
}

export async function renderSalespersonNotificationEmail(
  props: SalespersonNotificationEmailProps
): Promise<string> {
  return render(<SalespersonNotificationEmail {...props} />);
}

export async function renderDemoRequestNotificationEmail(
  props: DemoRequestNotificationEmailProps
): Promise<string> {
  return render(<DemoRequestNotificationEmail {...props} />);
}
