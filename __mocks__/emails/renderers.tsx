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
