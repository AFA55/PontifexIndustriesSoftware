/**
 * Patriot Concrete Cutting — GPS Location Tracking Consent
 */

export const GPS_CONSENT_VERSION = 'v1.0';

export const GPS_CONSENT_TEXT = `## GPS Location Tracking Disclosure

Patriot Concrete Cutting uses GPS location tracking as part of our operations management platform. By consenting, you acknowledge and agree to the following:

### What We Track
- Your GPS coordinates when you clock in and clock out
- Your location when marking "en route" to a job site
- Your location when arriving at and departing from job sites
- Location data associated with job completion and signatures

### When We Track
- GPS tracking is active **only during your work hours** (from clock-in to clock-out)
- We do **not** track your location outside of work hours
- We do **not** track your location when you are not actively using the Platform

### How We Use Location Data
- To verify clock-in/clock-out at designated work locations
- To confirm arrival at job sites for dispatch purposes
- To calculate drive times for scheduling optimization
- To provide location context for signed documents and job records

### Data Storage & Retention
- Location data is stored securely with encryption at rest and in transit
- GPS records are retained for 3 years per company policy
- You may request a copy of your location data at any time

### Your Rights
- You may **withdraw this consent at any time** by contacting your supervisor or support@patriotconcretecutting.com
- Withdrawing consent may disable certain Platform features (clock-in/out, en-route tracking)
- Withdrawing consent will not affect previously collected data
- Your consent is voluntary, but GPS features are integral to the Platform's time-tracking functionality`;

export function getGpsConsentHTML(): string {
  return `
    <div>
      <p><strong>GPS Location Tracking</strong></p>
      <ul>
        <li>Tracks your location <strong>only during work hours</strong> (clock-in to clock-out)</li>
        <li>Used for time verification, job site arrival, and dispatch</li>
        <li>Data encrypted and retained for 3 years</li>
        <li>You can withdraw consent at any time (may disable clock-in/out features)</li>
      </ul>
    </div>
  `;
}
