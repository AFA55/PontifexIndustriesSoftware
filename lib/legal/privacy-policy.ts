/**
 * Patriot Concrete Cutting — Privacy Policy
 */

export const PRIVACY_POLICY_VERSION = 'v1.0';

export const PRIVACY_POLICY_FULL = `
# Privacy Policy

**Effective Date:** March 22, 2026
**Version:** ${PRIVACY_POLICY_VERSION}

Patriot Concrete Cutting ("Company," "we," "us," or "our") is committed to protecting your privacy. This Privacy Policy describes how we collect, use, store, and share personal information through our web-based operations management platform (the "Platform").

---

## 1. Information We Collect

### 1.1 Account Information
- Full name, email address, phone number
- Job title, role, and employment status
- Date of birth (for age verification)
- Account credentials (passwords are hashed and never stored in plaintext)

### 1.2 Location Data
- GPS coordinates during clock-in and clock-out
- Real-time location during en-route tracking to job sites
- Geolocation data for job site verification
- Location data is collected **only during active work hours** and only with your explicit consent

### 1.3 Job & Work Data
- Work performed, hours logged, equipment used
- Job site photos and completion documentation
- Customer signatures captured electronically
- Job hazard analysis (JHA) forms and safety documentation

### 1.4 Health & Safety Data
- Silica exposure tracking records (as required by OSHA 29 CFR 1926.1153)
- Safety compliance documentation
- Note: We do not collect medical examination results. Medical surveillance is handled by your healthcare provider.

### 1.5 Device & Usage Data
- Browser type, operating system, device information
- IP address and approximate location derived from IP
- Pages visited, features used, and interaction patterns
- Error logs for debugging and quality improvement

---

## 2. How We Use Your Information

We use collected information to:
- Operate and maintain the Platform
- Track job progress, schedules, and operator assignments
- Generate invoices, timecards, and payroll exports
- Comply with OSHA recordkeeping requirements
- Send job-related SMS and email notifications (with your consent)
- Improve Platform performance and user experience
- Prevent fraud and ensure security

---

## 3. Data Storage & Security

- All data is stored on Supabase (backed by AWS infrastructure) with encryption at rest and in transit
- Database access is controlled through Row Level Security (RLS) policies
- API endpoints require authentication via JWT tokens
- Passwords are hashed using bcrypt
- Regular automated backups with point-in-time recovery

---

## 4. Data Retention

| Record Type | Retention Period | Authority |
|---|---|---|
| Silica exposure records | 30 years | OSHA 29 CFR 1910.1020 |
| Safety/JHA forms | 30 years | OSHA 29 CFR 1910.1020 |
| Payroll & timecard records | 7 years | FLSA + IRS |
| Invoice & billing records | 7 years | IRS |
| GPS location data | 3 years | Company policy |
| Account information | Duration of account + 1 year | Company policy |
| Consent records | Duration of account + 5 years | Company policy |

---

## 5. Information Sharing

We do **not** sell your personal information. We may share information with:
- **Your employer** (if you are an employee using the Platform through your employer's account)
- **Service providers** who assist in operating the Platform (e.g., Supabase for hosting, Resend for email, Telnyx for SMS)
- **Government authorities** when required by law (e.g., OSHA recordkeeping requests)
- **Professional advisors** (attorneys, accountants) as needed

---

## 6. Your Rights

Depending on your jurisdiction, you may have the right to:
- **Access** the personal information we hold about you
- **Correct** inaccurate personal information
- **Delete** your personal information (subject to legal retention requirements)
- **Opt out** of SMS and email marketing communications
- **Withdraw consent** for GPS tracking (understanding this may affect your ability to use certain features)
- **Data portability** — receive your data in a machine-readable format

To exercise any of these rights, contact us at the information below.

---

## 7. California Residents (CCPA)

If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA), including the right to know what personal information is collected, the right to delete personal information, and the right to opt out of the sale of personal information. We do not sell personal information.

---

## 8. Children's Privacy

The Platform is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children.

---

## 9. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on the Platform and updating the "Effective Date" above.

---

## 10. Contact Us

If you have questions about this Privacy Policy or wish to exercise your rights, contact us at:

**Patriot Concrete Cutting**
Email: support@patriotconcretecutting.com
Website: https://patriotconcretecutting.com
`;

export function getPrivacyPolicySummaryHTML(): string {
  return `
    <p><strong>Privacy Policy Summary</strong></p>
    <ul>
      <li>We collect account info, GPS data (with consent), work data, and safety records</li>
      <li>Data is encrypted and stored securely on cloud infrastructure</li>
      <li>OSHA records retained for 30 years as required by law</li>
      <li>We do not sell your personal information</li>
      <li>You can request access, correction, or deletion of your data</li>
    </ul>
    <p>Read the full <a href="/privacy" target="_blank" style="color: #7c3aed; text-decoration: underline;">Privacy Policy</a>.</p>
  `;
}
