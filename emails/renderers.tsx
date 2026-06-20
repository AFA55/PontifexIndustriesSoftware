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
