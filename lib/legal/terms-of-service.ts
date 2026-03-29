/**
 * Patriot Concrete Cutting — Terms of Service
 */

export const TERMS_OF_SERVICE_VERSION = 'v1.0';

export const TERMS_OF_SERVICE_FULL = `
# Terms of Service

**Effective Date:** March 22, 2026
**Version:** ${TERMS_OF_SERVICE_VERSION}

These Terms of Service ("Terms") govern your use of the Patriot Concrete Cutting operations management platform (the "Platform"). By accessing or using the Platform, you agree to be bound by these Terms.

---

## 1. Service Description

The Platform is a web-based operations management system designed for concrete cutting contractors. It provides job scheduling, dispatch, time tracking, invoicing, safety compliance, and related business management tools.

---

## 2. User Accounts

- You must provide accurate and complete information when creating an account
- You are responsible for maintaining the confidentiality of your account credentials
- You must notify us immediately of any unauthorized use of your account
- One person per account; account sharing is not permitted
- We reserve the right to suspend or terminate accounts that violate these Terms

---

## 3. Acceptable Use

You agree not to:
- Use the Platform for any unlawful purpose
- Attempt to gain unauthorized access to the Platform or its systems
- Interfere with or disrupt the Platform's infrastructure
- Upload malicious code, viruses, or harmful content
- Impersonate another user or provide false information
- Use the Platform to harass, abuse, or harm others
- Reverse engineer, decompile, or disassemble the Platform

---

## 4. Data Ownership

- **Your Data:** You retain ownership of all data you enter into the Platform (job records, customer information, employee data, photos, signatures, etc.)
- **Our Platform:** We retain ownership of the Platform's code, design, features, and intellectual property
- **License:** You grant us a limited license to process your data solely to provide the Platform services
- **Export:** You may export your data at any time through the Platform's export features

---

## 5. Electronic Signatures

The Platform enables electronic signature capture for work orders, liability releases, service completion agreements, and other documents. By using these features, you acknowledge and agree that:
- Electronic signatures captured through the Platform are legally binding under the ESIGN Act and UETA
- You consent to conducting transactions electronically
- You are responsible for verifying the identity of signers
- Signed documents are stored with audit trail metadata (timestamp, IP address, GPS coordinates)

---

## 6. GPS Location Tracking

The Platform includes GPS-based features for time tracking and job verification. GPS tracking:
- Requires explicit employee consent before activation
- Operates only during active work hours
- Can be revoked at any time (which may disable certain features)
- Is governed by our Privacy Policy and applicable state laws

---

## 7. SMS & Email Communications

By providing your phone number or email address, and with your explicit opt-in consent, you agree to receive:
- Job assignment and status notifications
- Schedule updates and reminders
- System alerts and security notifications

You may opt out of non-essential communications at any time by replying STOP to any SMS or using the unsubscribe link in emails.

---

## 8. Payment & Billing

- The Platform's billing terms are as agreed in your subscription or service agreement
- Invoices generated through the Platform are your responsibility to review for accuracy
- Default billing rates in the Platform are estimates; actual rates should be verified by the account administrator

---

## 9. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW:
- The Platform is provided "AS IS" without warranties of any kind
- We are not liable for indirect, incidental, special, or consequential damages
- Our total liability shall not exceed the amount paid by you in the twelve (12) months preceding the claim
- We are not liable for losses caused by inaccurate data entry, GPS inaccuracies, or third-party service outages

---

## 10. Indemnification

You agree to indemnify, defend, and hold harmless Patriot Concrete Cutting and its officers, employees, and agents from any claims, damages, or expenses arising from your use of the Platform or violation of these Terms.

---

## 11. Modifications

We may modify these Terms at any time by posting updated Terms on the Platform. Your continued use of the Platform after changes constitutes acceptance of the modified Terms. Material changes will be communicated via email or in-app notification.

---

## 12. Termination

Either party may terminate the service relationship at any time. Upon termination:
- You may export your data for 30 days following termination
- We will retain data as required by law (see Privacy Policy for retention periods)
- Provisions that by their nature should survive termination will survive

---

## 13. Governing Law

These Terms are governed by the laws of the State of South Carolina, without regard to conflict of law principles. Any disputes shall be resolved in the state or federal courts located in South Carolina.

---

## 14. Contact Us

**Patriot Concrete Cutting**
Email: support@patriotconcretecutting.com
Website: https://patriotconcretecutting.com
`;

export function getTermsOfServiceSummaryHTML(): string {
  return `
    <p><strong>Terms of Service Summary</strong></p>
    <ul>
      <li>You own your data; we process it to provide the Platform</li>
      <li>Electronic signatures are legally binding under the ESIGN Act</li>
      <li>GPS tracking requires your consent and operates only during work hours</li>
      <li>The Platform is provided "as is" with limitations on liability</li>
      <li>South Carolina law governs these Terms</li>
    </ul>
    <p>Read the full <a href="/terms" target="_blank" style="color: #7c3aed; text-decoration: underline;">Terms of Service</a>.</p>
  `;
}
