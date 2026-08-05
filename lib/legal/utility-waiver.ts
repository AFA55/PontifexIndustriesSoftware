/**
 * UTILITY & LIABILITY WAIVER — the document the site contact signs before the
 * crew starts cutting.
 *
 * ⚠️ ATTORNEY REVIEW REQUIRED BEFORE THIS IS USED ON A LIVE JOB.
 * This is a researched draft, not legal advice, and it has not been reviewed by
 * a South Carolina attorney. It is written to be defensible under the SC
 * authorities cited below, but only a licensed lawyer can tell you it is.
 *
 * ── Why it is worded the way it is ───────────────────────────────────────────
 *
 * 1. SC STRICTLY CONSTRUES RELEASES AGAINST THE DRAFTER. South Carolina
 *    disfavors exculpatory clauses "since such provisions tend to induce a
 *    want of care" and construes them against the party relying on them. A
 *    vague "customer releases us from all claims" is the version that loses.
 *    So the release NAMES NEGLIGENCE EXPLICITLY and states precisely which
 *    risks are being allocated, rather than gesturing at everything.
 *
 * 2. S.C. CODE § 32-2-10 VOIDS SOLE-NEGLIGENCE INDEMNITY. In a construction
 *    contract, a promise to indemnify the promisee against damages proximately
 *    caused by the promisee's OWN SOLE NEGLIGENCE is against public policy and
 *    unenforceable. The prior ticket language ("indemnify and hold harmless
 *    from any claim ... or work performed at the customer's direction") reached
 *    that far. §5 below carries an express savings clause instead, so an
 *    overreach can't take the whole indemnity down with it.
 *
 * 3. GROSS NEGLIGENCE CANNOT BE WAIVED. SC will not enforce a release of gross
 *    negligence, recklessness or willful misconduct. Claiming it anyway invites
 *    a court to strike the clause; §6 concedes it up front.
 *
 * 4. THE SC811 DUTY IS STATUTORY AND IS NOT THE CUSTOMER'S TO WAIVE.
 *    The Underground Facility Damage Prevention Act (S.C. Code Title 58,
 *    Chapter 36) puts the notification duty on the EXCAVATOR. **Effective
 *    22 May 2026 the definition of "excavation" was broadened** to cover
 *    "displacement, movement, or removal of soil, earth, rock, or other
 *    materials in or on the ground", expressly including boring, "drilling to
 *    include directional, horizontal, and vertical", and "partial- and
 *    full-depth patching" — language that reaches core drilling and slab
 *    sawing. "Demolition" is broader still: "any operation by which a structure
 *    or mass of material is wrecked, razed, rendered, moved, or removed by
 *    means of any tools".
 *    A signature from a customer does not discharge that duty, and §4 says so
 *    plainly rather than implying the paperwork replaces the locate.
 *
 * Sources (retrieved Aug 2026): S.C. Code § 32-2-10; S.C. Code §§ 58-36-20,
 * 58-36-60; SC811 excavator guidance.
 *
 * WHITE-LABEL: every company reference is interpolated. Never hardcode a tenant.
 * Pure strings — no React, no DB.
 */

export interface UtilityWaiverOptions {
  /** Tenant company name, e.g. from branding.company_name. */
  companyName: string;
  /** Job number, shown so the signature is tied to a specific job. */
  jobNumber?: string | null;
  /** Jobsite address, for the same reason. */
  jobAddress?: string | null;
}

export interface WaiverSection {
  heading: string;
  /** Paragraphs, in order. */
  body: string[];
}

/**
 * The acknowledgment checkboxes. Each must be ticked before signing.
 * Kept separate from the prose because SC's "specific and explicit" standard is
 * better served by a signer affirming discrete propositions than by one blanket
 * "I agree" against a wall of text.
 */
export function waiverAcknowledgments(companyName: string): string[] {
  const co = companyName || 'the Contractor';
  return [
    `I have identified and marked, or have caused to be identified and marked, all conduit, post-tension cable, rebar, plumbing, electrical, fiber and other embedded or buried items known to me in the areas to be cut.`,
    `I understand that ${co} cuts where I direct, and that anything embedded and unmarked may be struck.`,
    `I have authority to sign this on behalf of the property owner or general contractor.`,
  ];
}

/** The full waiver text, in the order it is presented to the signer. */
export function utilityWaiverSections(opts: UtilityWaiverOptions): WaiverSection[] {
  const co = opts.companyName || 'the Contractor';

  return [
    {
      heading: '1. What this document covers',
      body: [
        `This waiver applies to the concrete cutting, coring, sawing, breaking and related work to be performed by ${co} at the location identified above. It is signed before work begins and forms part of the agreement between us.`,
        `It allocates responsibility for one specific risk: items that are embedded in, buried beneath, or concealed within the material to be cut, which cannot be seen from the surface.`,
      ],
    },
    {
      heading: '2. Your responsibility to locate and mark',
      body: [
        `You are responsible for identifying and marking, or arranging for the marking of, all embedded and buried items in the work area before cutting begins. This includes post-tension cable, conduit, rebar, plumbing, electrical, gas, fiber, data and drainage.`,
        `You confirm that the markings, drawings and cut locations you have provided are accurate and complete to the best of your knowledge, and that ${co} may rely on them.`,
        `If you are unsure what is inside the slab or wall, tell us before we start. Scanning can be arranged as a separate service. Proceeding without it is a decision to accept the risk described in section 3.`,
      ],
    },
    {
      heading: '3. Acknowledgment of risk, and release',
      body: [
        `Concrete cutting is destructive by nature. Even with reasonable care, an item that was not disclosed, not marked, or marked inaccurately may be struck.`,
        `Knowing this, you release ${co}, and its officers, employees and agents, from liability for property damage, service interruption, delay and consequential loss arising out of contact with an embedded or buried item that was not disclosed or not accurately marked before the work began — INCLUDING WHERE SUCH DAMAGE IS CAUSED IN WHOLE OR IN PART BY THE ORDINARY NEGLIGENCE OF ${co.toUpperCase()}.`,
        `This release does not extend to the matters described in section 6.`,
      ],
    },
    {
      heading: '4. Underground utilities — the law still applies',
      body: [
        `Nothing in this document waives, limits or transfers any duty imposed by the South Carolina Underground Facility Damage Prevention Act (S.C. Code Title 58, Chapter 36), including the requirement that the excavator notify the South Carolina notification center (SC811) before commencing excavation or demolition, and observe the statutory tolerance zone around a marked facility.`,
        `${co} remains responsible for its own compliance with that Act. You remain responsible for disclosing private, customer-owned lines, which the utility locate service does not mark.`,
      ],
    },
    {
      heading: '5. Indemnity',
      body: [
        `You agree to indemnify and hold ${co} harmless from third-party claims arising out of an embedded or buried item that you failed to disclose or mark, or that you marked inaccurately.`,
        `SAVINGS CLAUSE. Consistent with S.C. Code § 32-2-10, this indemnity does not apply, and is not intended to apply, to any liability for damages arising out of bodily injury to persons or damage to property proximately caused by or resulting from the sole negligence of ${co}. To the extent any part of this section would otherwise be unenforceable under § 32-2-10, that part is limited to the maximum extent permitted by law and the remainder continues in force.`,
      ],
    },
    {
      heading: '6. What is not waived',
      body: [
        `This document does not release or limit liability for gross negligence, recklessness, willful or wanton misconduct, or bodily injury or death caused by ${co}'s negligence. It does not waive any right that cannot be waived under South Carolina law.`,
      ],
    },
    {
      heading: '7. General',
      body: [
        `If any provision of this waiver is held unenforceable, the remaining provisions continue in full force. This waiver is governed by the laws of the State of South Carolina.`,
        `You confirm that you have read this document, that you have had the opportunity to ask questions about it, and that you are authorized to sign it on behalf of the party engaging ${co}.`,
      ],
    },
  ];
}

/** One-line intro shown above the sections on the signing screen. */
export function waiverIntro(companyName: string): string {
  const co = companyName || 'the Contractor';
  return `Please read this before ${co} begins cutting. It explains who is responsible for locating what is inside the concrete, and what happens if something unmarked is struck.`;
}

/** Plain-text rendering, for the PDF copy and the emailed record. */
export function utilityWaiverPlainText(opts: UtilityWaiverOptions): string {
  const header = [
    'UTILITY & LIABILITY WAIVER',
    opts.jobNumber ? `Job: ${opts.jobNumber}` : null,
    opts.jobAddress ? `Site: ${opts.jobAddress}` : null,
    '',
    waiverIntro(opts.companyName),
    '',
  ]
    .filter(Boolean)
    .join('\n');

  const body = utilityWaiverSections(opts)
    .map((s) => `${s.heading}\n${s.body.join('\n\n')}`)
    .join('\n\n');

  const acks = waiverAcknowledgments(opts.companyName)
    .map((a) => `  [ ] ${a}`)
    .join('\n');

  return `${header}\n${body}\n\nACKNOWLEDGMENTS\n${acks}\n`;
}
