/**
 * Pontifex Industries — Privacy Policy
 */

export const PRIVACY_POLICY_VERSION = 'v1.1';

export const PRIVACY_POLICY_FULL = `
# Privacy Policy

**Effective Date:** May 25, 2026
**Version:** ${PRIVACY_POLICY_VERSION}

Pontifex Industries ("Company," "we," "us," or "our") operates a multi-tenant field operations management platform (the "Platform") used by field-services and construction companies. This Privacy Policy explains how we collect, use, store, and protect personal information across our web application and iOS mobile app.

---

## 1. Information We Collect

### 1.1 Account Information
- Full name, email address, phone number
- Job title, role, and employment status
- Account credentials (passwords are hashed using bcrypt and never stored in plaintext)
- Company code (used to identify which tenant account you belong to)

### 1.2 Location Data — iOS App
Your precise GPS location is accessed **only once at the moment you clock in** to verify that you are physically at the job site. This is the sole purpose for which location data is collected.

- We do **not** track your location continuously or in the background
- We do **not** collect location data when the app is closed
- We do **not** share your location with third parties
- Location data is stored only as part of your timecard record for that clock-in event

The iOS app requests "When In Use" location permission. The "Always On" permission description is included in the app to satisfy Apple's App Store technical requirements when any location SDK is linked — it does not reflect continuous tracking behavior.

### 1.3 NFC Badge Data
- NFC is used to read employee badge IDs for clock-in verification
- Badge scan data is stored as part of the timecard record
- No NFC data is shared with third parties

### 1.4 Camera & Photos
- Photos captured through the app are used to document completed work at job sites
- Images are stored securely and accessible only to authorized personnel within your organization
- Photos are not used for facial recognition or any biometric purpose

### 1.5 Microphone & Voice Data
- The microphone is used for voice-activated equipment checkout (speaking equipment names to log checkouts)
- Voice recordings may be stored temporarily for the purpose of equipment identification
- Voice data is not shared with third parties

### 1.6 Job & Work Data
- Work performed, hours logged, equipment used, and job site notes
- Customer signatures captured electronically upon job completion
- Change orders, job scope, and daily progress logs
- Supervisor visit reports and field observations

### 1.7 Timecard & Payroll Data
- Clock-in/clock-out timestamps with GPS verification point
- Break deductions, overtime, PTO, and sick time
- Payroll export data (used internally; never transmitted to third parties without your employer's direction)

### 1.8 Device & Usage Data
- Browser type, operating system, device model
- IP address (used for security and fraud prevention)
- App usage patterns and error logs for quality improvement

---

## 2. How We Use Your Information

We use collected information to:
- Operate and maintain the Platform for your employer's account
- Verify job site attendance at clock-in using GPS (one-time check per clock-in)
- Track job progress, schedules, equipment, and operator assignments
- Generate timecards, payroll exports, and invoices
- Comply with OSHA recordkeeping requirements
- Send job-related notifications with your consent
- Improve Platform performance and resolve technical issues
- Prevent fraud and ensure account security

---

## 3. Data Storage & Security

- All data is stored on Supabase (backed by AWS infrastructure) with AES-256 encryption at rest and TLS encryption in transit
- Database access is enforced through Row Level Security (RLS) policies — each tenant's data is strictly isolated
- All API endpoints require authenticated JWT tokens
- Regular automated backups with point-in-time recovery capability
- No data is stored unencrypted on your device

---

## 4. Data Retention

| Record Type | Retention Period | Authority |
|---|---|---|
| Silica exposure records | 30 years | OSHA 29 CFR 1910.1020 |
| Safety/JHA forms | 30 years | OSHA 29 CFR 1910.1020 |
| Payroll & timecard records | 7 years | FLSA + IRS |
| Invoice & billing records | 7 years | IRS |
| GPS clock-in location points | 3 years | Company policy |
| Job site photos | Duration of account + 3 years | Company policy |
| Voice recordings | 90 days | Company policy |
| Account information | Duration of account + 1 year | Company policy |

---

## 5. Information Sharing

We do **not** sell your personal information. We may share information with:
- **Your employer's authorized administrators** within the Platform (role-based access controls limit visibility)
- **Infrastructure providers** (Supabase/AWS for hosting, Resend for email delivery)
- **Government authorities** when required by law (e.g., OSHA recordkeeping requests, court orders)
- **Professional advisors** (attorneys, accountants) under confidentiality obligations

---

## 6. Your Rights

Depending on your jurisdiction, you may have the right to:
- **Access** the personal information we hold about you
- **Correct** inaccurate personal information
- **Delete** your personal information (subject to legal retention requirements such as OSHA and IRS)
- **Opt out** of non-essential communications
- **Withdraw consent** for location access (this will prevent the GPS clock-in verification feature from working)
- **Data portability** — receive your data in a machine-readable format

You can delete your account and personal data at any time directly in the app: sign in, then go to **My Profile → Delete My Account**. This permanently removes your account record and personal profile data (subject to legal retention requirements such as OSHA and IRS for certain work records). To exercise any other right, contact your employer's account administrator or contact us directly at the information below.

---

## 7. California Residents (CCPA)

If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA): the right to know what personal information is collected about you, the right to delete personal information, and the right to opt out of the sale of personal information. **We do not sell personal information.**

---

## 8. Children's Privacy

The Platform is intended for use by adults in a professional employment context. We do not knowingly collect personal information from individuals under the age of 18.

---

## 9. iOS App — Apple App Store

This Platform is available as an iOS app distributed through the Apple App Store. The app operates as a wrapper around our web-based Platform and does not collect any data beyond what is described in this policy. The app requests access to:
- **Location (When In Use):** One-time GPS check at clock-in
- **Camera:** Job site photo documentation
- **Microphone:** Voice-activated equipment checkout
- **NFC:** Employee badge scanning for clock-in
- **Photo Library:** Attaching images to job reports

---

## 10. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify users of material changes by posting the updated policy on the Platform and updating the "Effective Date" above.

---

## 11. Contact Us

If you have questions about this Privacy Policy or wish to exercise your rights, contact us at:

**Pontifex Industries**
Email: pontifexindustries@gmail.com
Website: https://www.pontifexindustries.com/privacy
`;

export function getPrivacyPolicySummaryHTML(): string {
  return `
    <p><strong>Privacy Policy Summary</strong></p>
    <ul>
      <li>GPS location is accessed <strong>once at clock-in only</strong> to verify job site attendance — never in the background</li>
      <li>We collect account info, work data, job photos, and timecard records</li>
      <li>Data is encrypted and stored securely on Supabase (AWS infrastructure)</li>
      <li>OSHA records retained for 30 years as required by law; payroll records 7 years</li>
      <li>We do not sell your personal information</li>
      <li>You can request access, correction, or deletion of your data</li>
    </ul>
    <p>Read the full <a href="/privacy" target="_blank" style="color: #7c3aed; text-decoration: underline;">Privacy Policy</a>.</p>
  `;
}
