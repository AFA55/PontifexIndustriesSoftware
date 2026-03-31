/**
 * Patriot Concrete Cutting — Electronic Signature Consent (ESIGN Act / UETA)
 */

export const ESIGN_CONSENT_VERSION = 'v1.0';

export const ESIGN_CONSENT_TEXT = `By checking this box, I consent to use electronic signatures for this transaction pursuant to the Electronic Signatures in Global and National Commerce Act (ESIGN Act) and the Uniform Electronic Transactions Act (UETA). I understand that:

1. My electronic signature is legally binding and has the same legal effect as a handwritten signature.
2. I have the right to withdraw this consent at any time by contacting support@patriotconcretecutting.com.
3. I may request a paper copy of any electronically signed document.
4. A record of this signature, including timestamp, device information, and location data, will be stored for audit purposes.`;

export function getEsignConsentHTML(): string {
  return `
    <p><strong>Electronic Signature Consent</strong></p>
    <p>By signing electronically, you agree that your electronic signature is legally binding under the ESIGN Act and UETA.
    A record of this signature (timestamp, device info, location) will be stored for audit purposes.</p>
    <p>You may withdraw consent or request paper copies at any time by contacting
    <a href="mailto:support@patriotconcretecutting.com" style="color: #7c3aed;">support@patriotconcretecutting.com</a>.</p>
  `;
}
