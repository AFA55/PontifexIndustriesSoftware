# Email Previews

Static HTML renders of every Pontifex transactional email template, generated
with sample Patriot-style branding (red `#dc2626` / navy `#1e3a5f`).

## Files

| File | Template | Generator in `lib/email.ts` |
|---|---|---|
| `invite.html` | Team invitation | `generateInviteEmail()` |
| `approval.html` | Access request approved | `generateApprovalEmail()` |
| `access-request-received.html` | Request acknowledgement | `generateAccessRequestReceivedEmail()` |
| `notification.html` | Generic event notification | `generateNotificationEmail()` |
| `password-reset.html` | Password reset link | `generatePasswordResetEmail()` |

## Regenerating

```bash
npx tsx scripts/render-email-previews.mjs
```

Or directly:

```bash
node --import tsx/esm scripts/render-email-previews.mjs
```

## Notes

- All templates force `color-scheme: light only` so dark-mode inversion never
  applies in Apple Mail / Gmail.
- Logo renders at `height: 72px` / max-width `220px` on a white header band.
- These files are NOT committed to git — regenerate as needed for visual review.
