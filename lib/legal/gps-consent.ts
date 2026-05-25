/**
 * Pontifex Industries — GPS Location Consent (iOS Clock-In Verification)
 */

export const GPS_CONSENT_VERSION = 'v1.1';

export const GPS_CONSENT_TEXT = `## Location Access Disclosure

Pontifex Industries requests access to your device location **only at the moment you clock in** to verify that you are physically present at the assigned job site. By consenting, you acknowledge and agree to the following:

### What We Access
- Your GPS coordinates at the exact moment you tap "Clock In"
- One location point per clock-in event — no continuous monitoring

### What We Do NOT Do
- We do **not** track your location continuously or in the background
- We do **not** access your location when the app is closed
- We do **not** access your location outside of the single clock-in verification check
- We do **not** share your location with third parties

### How We Use This Data
- To verify you are within the required radius of your assigned job site at clock-in
- To attach a location record to your timecard for that shift
- To support dispute resolution for attendance records

### Data Storage & Retention
- Location data is stored securely with encryption at rest and in transit
- GPS clock-in records are retained for 3 years per company policy
- You may request a copy of your location records at any time

### Your Rights
- You may **withdraw this consent at any time** by disabling location access in your iPhone Settings → Privacy & Security → Location Services
- Withdrawing location access will prevent the GPS clock-in verification feature from working; you may be able to use a PIN-based alternative if your employer has enabled it
- Withdrawing consent will not affect previously collected data`;

export function getGpsConsentHTML(): string {
  return `
    <div>
      <p><strong>Location Access</strong></p>
      <ul>
        <li>Location is accessed <strong>once at clock-in only</strong> to verify job site presence</li>
        <li>No continuous or background tracking — ever</li>
        <li>One GPS point stored per clock-in event, encrypted, retained 3 years</li>
        <li>You can disable location in iPhone Settings at any time</li>
      </ul>
    </div>
  `;
}
