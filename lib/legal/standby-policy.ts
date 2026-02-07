/**
 * Pontifex Industries Standby Policy
 * Legal document defining standby time billing and terms
 */

export const STANDBY_POLICY_VERSION = 'v1.0';
export const STANDBY_HOURLY_RATE = 189.00;

export const STANDBY_POLICY_SUMMARY = `
When work is delayed due to circumstances beyond our control, standby time is billed at $${STANDBY_HOURLY_RATE}/hour.
Additional charges for extended drive time may apply if delays cause rescheduling.
`.trim();

export const STANDBY_POLICY_FULL = `
# PONTIFEX INDUSTRIES
## STANDBY TIME POLICY AND BILLING TERMS

**Effective Date:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
**Version:** ${STANDBY_POLICY_VERSION}

---

### 1. DEFINITIONS

**1.1 Standby Time** means any period during which Pontifex Industries personnel and equipment are on-site, ready and available to perform contracted work, but are unable to proceed due to circumstances beyond Pontifex Industries' control.

**1.2 Contracted Work** means the concrete cutting, coring, or related services described in the applicable work order, purchase order, or contract.

**1.3 Client** means the general contractor, property owner, or other party who has engaged Pontifex Industries to perform the Contracted Work.

---

### 2. CIRCUMSTANCES CONSTITUTING STANDBY TIME

Standby Time shall be deemed to occur when work cannot proceed due to any of the following circumstances, provided such circumstances are not caused by Pontifex Industries:

**2.1** Lack of access to work area due to other trades, activities, or site conditions
**2.2** Incomplete prerequisite work by other contractors
**2.3** Missing or incorrect building materials required for the Contracted Work
**2.4** Unsafe working conditions not caused by Pontifex Industries
**2.5** Utility shutoffs or complications not scheduled or disclosed
**2.6** Changes to work scope or location not communicated prior to arrival
**2.7** Client personnel unavailable to provide necessary access, approvals, or information
**2.8** Weather conditions that render the work unsafe or impractical, but only after arrival on-site
**2.9** Any other delay outside Pontifex Industries' control that prevents commencement or continuation of work

---

### 3. STANDBY TIME BILLING RATES

**3.1 Standard Hourly Rate**
Standby Time shall be billed at a rate of **$${STANDBY_HOURLY_RATE} per hour** per operator and equipment unit on-site.

**3.2 Minimum Charge**
The minimum billable Standby Time is **one (1) hour**. Time shall be calculated in fifteen (15) minute increments thereafter.

**3.3 Calculation**
Standby Time begins when the operator notifies the Client of the delay and ends when:
- Work resumes, or
- Pontifex Industries personnel depart the site, or
- The Client authorizes demobilization

**3.4 Multiple Operators**
If multiple Pontifex Industries operators and equipment are on-site, Standby Time charges apply to each operator and equipment unit.

---

### 4. ADDITIONAL DRIVE TIME CHARGES

**4.1 Extended Delays**
If Standby Time or repeated delays require Pontifex Industries to return to the site on a different day, additional drive time charges shall apply at **1.5 times** the standard labor rate for the additional travel time incurred.

**4.2 Calculation of Additional Drive Time**
Additional drive time is calculated as the round-trip travel time from Pontifex Industries' shop location to the work site, and shall be billed for each additional trip necessitated by Client-caused delays.

**4.3 Fuel Surcharges**
If multiple trips are required due to delays, a fuel surcharge may apply based on current fuel costs and mileage.

---

### 5. NOTIFICATION AND DOCUMENTATION

**5.1 On-Site Notification**
The Pontifex Industries operator shall notify the Client's on-site representative immediately upon recognizing a condition that will result in Standby Time. Notification may be verbal, via SMS text message, or through the Pontifex Industries mobile application.

**5.2 SMS Notification System**
Pontifex Industries utilizes an automated SMS notification system to keep the Client informed. The Client agrees to receive:
- Notification when operators are en route
- Notification when operators are approximately 15 minutes from arrival
- Notification when Standby Time begins
- Periodic updates during extended Standby Time

**5.3 Documentation**
Standby Time shall be documented by:
- Operator time logs with start and end times
- Photographic evidence of site conditions (when applicable)
- Digital records through Pontifex Industries' dispatch system
- Client acknowledgment through electronic signature (when available)

**5.4 Client Acknowledgment**
Upon notification of Standby Time, the Client's on-site representative will be asked to acknowledge the delay through Pontifex Industries' mobile application. Failure to acknowledge does not waive Standby Time charges if properly documented by the operator.

---

### 6. PAYMENT TERMS

**6.1 Invoicing**
Standby Time charges shall be itemized separately on the invoice for the Contracted Work, showing:
- Date and time of standby period
- Duration in hours and minutes
- Hourly rate applied
- Total standby charges
- Reason for standby (if disclosed)

**6.2 Due Date**
Payment for Standby Time charges is due within the same terms as the underlying Contracted Work, typically Net 30 days from invoice date, unless otherwise agreed in writing.

**6.3 Disputes**
Any disputes regarding Standby Time charges must be raised in writing within ten (10) business days of invoice receipt. Failure to dispute within this period constitutes acceptance of the charges.

---

### 7. LIMITATION OF LIABILITY

**7.1 No Guarantee of Immediate Start**
Pontifex Industries schedules work in good faith based on Client-provided start times. Arrival time estimates are approximate and may be affected by traffic, weather, or other factors beyond our control.

**7.2 No Liability for Delays**
Pontifex Industries shall not be liable for any consequential, indirect, or incidental damages arising from delays, Standby Time, or rescheduling of work, regardless of cause.

**7.3 Client Responsibility**
The Client is solely responsible for ensuring:
- Site readiness and access
- Completion of prerequisite work by other trades
- Availability of required materials and utilities
- Safe working conditions
- Presence of authorized personnel to grant access and approvals

---

### 8. MITIGATION AND CANCELLATION

**8.1 Good Faith Efforts**
Pontifex Industries will make reasonable efforts to minimize Standby Time, including:
- Communicating with the Client about site readiness
- Providing advance notice of arrival times
- Offering to reschedule if conditions suggest extended delays

**8.2 Cancellation Without Penalty**
If the Client determines that conditions will prevent work from proceeding, and provides notice **before** Pontifex Industries dispatches equipment and personnel, no Standby Time charges will apply. However, standard cancellation fees may apply per the contract terms.

**8.3 Early Demobilization**
If Standby Time exceeds **two (2) hours**, Pontifex Industries reserves the right to demobilize and reschedule the work. Standby Time charges shall apply for time on-site prior to demobilization, plus any applicable rescheduling or drive time charges.

---

### 9. ACCEPTANCE OF TERMS

**9.1 Binding Agreement**
By engaging Pontifex Industries to perform the Contracted Work, the Client agrees to these Standby Time Policy and Billing Terms.

**9.2 Electronic Acknowledgment**
The Client's on-site representative may be asked to electronically acknowledge Standby Time through Pontifex Industries' mobile application. Such acknowledgment is binding on the Client.

**9.3 Authority**
The Client represents that its on-site representative has authority to acknowledge delays and bind the Client to these terms.

---

### 10. MODIFICATION AND AMENDMENTS

**10.1 Changes to Policy**
Pontifex Industries reserves the right to modify this Standby Time Policy upon thirty (30) days written notice. The version in effect at the time of service shall govern.

**10.2 Conflicting Terms**
If the underlying contract or purchase order contains terms that conflict with this policy, the parties shall negotiate in good faith to resolve the conflict. In the absence of resolution, the terms most favorable to Pontifex Industries shall control to the extent permitted by law.

---

### 11. GOVERNING LAW

This Standby Time Policy shall be governed by and construed in accordance with the laws of the State of South Carolina, without regard to its conflict of laws principles. Any disputes shall be resolved in the courts of Greenville County, South Carolina.

---

### 12. CONTACT INFORMATION

For questions regarding this policy or Standby Time charges, contact:

**Pontifex Industries**
Email: billing@pontifexindustries.com
Phone: (833) 695-4288
Address: Greenville County, South Carolina

---

**ACKNOWLEDGMENT**

I acknowledge that I have read, understand, and agree to the Pontifex Industries Standby Time Policy and Billing Terms outlined above. I understand that Standby Time may be incurred if work cannot proceed due to circumstances beyond Pontifex Industries' control, and that such time will be billed at $${STANDBY_HOURLY_RATE} per hour.

I further acknowledge that I have authority to bind the Client to these terms.

---

**Client Representative Signature:** _________________________________

**Printed Name:** _________________________________

**Company:** _________________________________

**Date:** _________________________________

**Time:** _________________________________

---

*This document should be reviewed by legal counsel before use. This template is provided for informational purposes and does not constitute legal advice.*
`;

export function getStandbyPolicySummaryHTML(): string {
  return `
    <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 16px; margin: 16px 0; border-radius: 8px;">
      <h3 style="color: #92400E; margin: 0 0 12px 0; font-size: 18px; font-weight: 600;">
        ⏱️ Standby Time Policy
      </h3>
      <p style="color: #78350F; margin: 0 0 12px 0; line-height: 1.6;">
        ${STANDBY_POLICY_SUMMARY}
      </p>
      <a href="/legal/standby-policy" target="_blank" style="color: #D97706; text-decoration: underline; font-weight: 500;">
        Read Full Policy →
      </a>
    </div>
  `;
}

export function calculateStandbyCharge(hours: number): number {
  const minHours = 1.0; // Minimum 1 hour charge
  const billableHours = Math.max(hours, minHours);
  return Math.round(billableHours * STANDBY_HOURLY_RATE * 100) / 100;
}

export function calculateDriveTimeCharge(driveTimeHours: number, standardRate: number): number {
  const multiplier = 1.5;
  return Math.round(driveTimeHours * standardRate * multiplier * 100) / 100;
}

export function getLiabilityReleaseText(): string {
  return `
    <p class="mb-3">
      <strong>Layout Assistance:</strong> Pontifex Industries may provide layout assistance and marking services as a courtesy to the Customer. However, Customer acknowledges and agrees that Pontifex Industries shall not be liable for any errors, omissions, or inaccuracies in layouts or markings provided, regardless of whether such layouts were performed at Customer's request or as a courtesy. Customer is solely responsible for verifying the accuracy and suitability of any layouts prior to the commencement of cutting, coring, or demolition work. Customer agrees to indemnify and hold harmless Pontifex Industries from any claims arising from work performed based on layouts, whether provided by Pontifex Industries or third parties, including but not limited to claims for incorrect placement, dimensional errors, or damage resulting from reliance on such layouts.
    </p>
    <p class="mb-3">
      <strong>Limitation of Liability:</strong> Pontifex Industries' liability for any claim arising out of this agreement shall not exceed the total amount paid for the services rendered. We shall not be liable for any indirect, incidental, special, or consequential damages.
    </p>
    <p class="mb-3">
      <strong>Indemnification:</strong> Customer agrees to indemnify, defend, and hold harmless Pontifex Industries, its officers, employees, and agents from any claims, damages, losses, or expenses (including reasonable attorney fees) arising from: (a) Customer's breach of this agreement; (b) Customer's use of the services or work product; (c) Any third-party claims related to the work performed at Customer's premises.
    </p>
    <p class="mb-3">
      <strong>Underground Utilities:</strong> Customer warrants that all underground utilities have been properly marked and disclosed. Pontifex Industries is not liable for damage to unmarked or incorrectly marked utilities.
    </p>
    <p class="mb-3">
      <strong>Site Conditions:</strong> Customer is responsible for site safety and access. Any unforeseen site conditions that affect the scope of work may result in additional charges.
    </p>
    <p class="mb-3">
      <strong>Operator Acknowledgment:</strong> By signing below, the operator acknowledges that they have read and understand these terms and are authorized to execute this agreement on behalf of Pontifex Industries prior to commencing work.
    </p>
  `;
}
