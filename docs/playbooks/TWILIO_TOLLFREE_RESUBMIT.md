# Twilio Toll-Free Verification — Resubmission Fix

**Rejection:** Error 30530 — "Entity Misclassification (Legal Entity Type Mismatch)" (internal
reason code 1104). Number: `+18336954288`. Deadline to resubmit into the PRIORITY queue: **Jul 9,
2026** (after that it still resubmits, just at normal/non-prioritized turnaround).

## Root cause

Twilio's toll-free `BusinessType` field only accepts one of five values:
`PRIVATE_PROFIT` · `PUBLIC_PROFIT` · `NON_PROFIT` · `SOLE_PROPRIETOR` · `GOVERNMENT`

The Play Console account is registered as **"PontifexIndustriesLLC"** (Organization account) — an
LLC is a private for-profit entity. If the toll-free form was submitted as `SOLE_PROPRIETOR` (or
the legal business name didn't exactly match the EIN registration), that produces exactly this
rejection.

## Exact fix — edit these fields before resubmitting

| Field | Correct value |
|---|---|
| **Legal Business Name** | Exactly as it appears on the EIN confirmation (IRS CP 575 or 147C letter) — including "LLC" if that's how it's registered. Not an abbreviation, not missing the suffix. |
| **Business Type** | `PRIVATE_PROFIT` (assuming standard for-profit LLC — not Sole Proprietor, not Non-Profit) |
| **Business Registration Number** | Your EIN (9 digits) |
| **Business Registration Authority** | IRS |
| **Business Registration Country** | US |

If it's rejected again after this fix, attach the EIN letter (CP575 or 147C) directly in the
**"Additional Information"** field of the resubmission — Twilio's own docs flag this as the
fast-path for a stubborn identity mismatch.

## Where to do this

Twilio Console → **Regulatory Compliance → Toll-Free Verification** →
`console.twilio.com/us1/develop/sms/regulatory-compliance/tollfree-verification` → find the
rejected request for `+18336954288` → Edit → correct the fields above → Resubmit.

(Requires Twilio login — this step is founder-only, Claude does not hold Twilio credentials.)

## After it's approved

No code changes needed — the SMS opt-in flow (`/sms-opt-in` web form) was already built and is the
valid consent proof for this submission; nothing else in the app depends on this number being
live yet.
