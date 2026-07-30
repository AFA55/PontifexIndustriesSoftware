/**
 * Pontifex Industries — GPS Location Consent.
 *
 * v2.0 (Jul 2026): adds on-the-clock BACKGROUND location for jobsite auto-arrival
 * + a back-at-shop clock-out reminder (Phase C). The version bump is intentional
 * so the app re-prompts for consent — background tracking must not be enabled for
 * a user who only ever consented to the v1 (clock-in-only) terms.
 */

export const GPS_CONSENT_VERSION = 'v2.0';

export const GPS_CONSENT_TEXT = `## Location Access Disclosure

Pontifex Industries uses your device location for two things: to verify you're at the job site when you clock in, and — **only while you're clocked in or have an assigned job** — to run background features that save you time. By consenting, you acknowledge and agree to the following:

### What We Access
- Your GPS coordinates when you tap "Clock In" (to verify job-site presence)
- While you are **clocked in or have an assigned job**, your location in the **background — even when the app is closed or not in use** — to automatically record when you arrive at a job site and to remind you to clock out when you return to the shop

### Scope & Limits
- Background location is active **only while you are on the clock**. It stops when you clock out.
- We use your location **solely for timekeeping**. We do **not** use it for any other purpose.
- We do **not** sell your location or share it with third parties or advertisers.
- We do **not** use your location to track you across other apps or companies.

### How We Use This Data
- To verify you are within the required radius of your assigned job site at clock-in
- To automatically log your arrival at a job site so you don't have to
- To remind you to clock out when you return to the shop
- To attach location records to your timecard and support attendance dispute resolution

### Data Storage & Retention
- Location data is stored securely with encryption at rest and in transit
- Location records are kept **with your timecard record** and retained for 3 years per company/payroll policy, then deleted
- You may request a copy of your location records at any time

### Your Rights
- You may **withdraw this consent at any time** by disabling location access in your device Settings → Privacy → Location Services (or by declining the in-app prompt)
- Turning off background location will stop the auto-arrival and clock-out reminder features; **clock-in verification will still work**
- Withdrawing consent will not affect previously collected data`;

export function getGpsConsentHTML(): string {
  return `
    <div>
      <p><strong>Location Access</strong></p>
      <ul>
        <li>Location verifies job-site presence at <strong>clock-in</strong></li>
        <li>While you're <strong>on the clock</strong>, background location — even when the app is closed — auto-logs arrival and reminds you to clock out; it <strong>stops when you clock out</strong></li>
        <li>Used <strong>only for timekeeping</strong> — never sold or shared</li>
        <li>Kept with your timecard record (encrypted, 3 years), then deleted</li>
        <li>You can turn it off anytime in Settings; clock-in still works</li>
      </ul>
    </div>
  `;
}
