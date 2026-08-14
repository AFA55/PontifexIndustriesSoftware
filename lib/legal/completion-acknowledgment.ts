/**
 * WHAT THE CUSTOMER IS ACTUALLY SIGNING WHEN THEY SIGN OFF A COMPLETED JOB.
 *
 * Until now this page said, to real customers, on a real signature form:
 *
 *     "This is where the work completion agreement will go.
 *      [Editable via Form Builder]"
 *
 * A signature collected under placeholder text is worth nothing, and it tells
 * the person signing exactly how much care went into the thing they are being
 * asked to put their name to.
 *
 * ── SCOPE, deliberately narrow ──────────────────────────────────────────────
 * This is an ACKNOWLEDGMENT OF COMPLETION, not a release. It says: the work
 * listed was performed, the site was left in the state described, and the
 * quantities shown are what will be invoiced. It does NOT waive warranty, does
 * NOT release liability for damage, and does NOT say the customer accepts
 * defective work — claiming any of those in an unreviewed template would be
 * both dishonest and unenforceable, and the utility waiver already carries the
 * liability terms that belong to this trade.
 *
 * ⚠️ FOUNDER: this is plain-English drafting, NOT reviewed by a lawyer. It is
 * written to be safe by claiming little. Before it does real commercial work,
 * have counsel read it — the same open item as the utility waiver body. The
 * Form Builder is intended to let each tenant replace this with their own
 * reviewed wording; this is the honest default until they do.
 */

export interface CompletionAcknowledgmentOptions {
  companyName?: string | null;
  jobNumber?: string | null;
  jobAddress?: string | null;
}

/** One line above the checkbox, explaining what this form is for. */
export function completionIntro(companyName?: string | null): string {
  const co = companyName || 'the Contractor';
  return (
    `Please review the work listed above before signing. Your signature confirms what ` +
    `${co} performed on site and the quantities that will be invoiced.`
  );
}

export interface CompletionSection {
  heading: string;
  body: string;
}

/** The acknowledgment itself, as sections so the page and the PDF agree. */
export function completionSections(
  opts: CompletionAcknowledgmentOptions = {}
): CompletionSection[] {
  const co = opts.companyName || 'the Contractor';
  return [
    {
      heading: 'The work was performed',
      body:
        `I confirm that ${co} carried out the work described above at this site, and ` +
        `that I have had the opportunity to look at it.`,
    },
    {
      heading: 'The measurements are what gets invoiced',
      body:
        `The quantities shown above — footage cut, holes drilled, depths and sizes — are ` +
        `the measurements ${co} recorded on site. They are what the invoice for this job ` +
        `will be based on. If anything here does not match what you saw, say so now ` +
        `rather than signing; it is far easier to correct before it becomes a bill.`,
    },
    {
      heading: 'What this signature does not do',
      body:
        `Signing confirms the work was done and the quantities are right. It does not ` +
        `waive any warranty ${co} gives on the work, and it does not release ${co} from ` +
        `responsibility for damage caused by the work. Anything you notice later can ` +
        `still be raised.`,
    },
    {
      heading: 'A record is kept',
      body:
        `Your name, your signature, and the date and time you signed are stored with this ` +
        `job, and a copy is available to you on request.`,
    },
  ];
}

/** Plain-text rendering, for the PDF copy and the emailed record. */
export function completionAcknowledgmentPlainText(
  opts: CompletionAcknowledgmentOptions = {}
): string {
  const header = [
    'WORK COMPLETION ACKNOWLEDGMENT',
    opts.jobNumber ? `Job: ${opts.jobNumber}` : null,
    opts.jobAddress ? `Site: ${opts.jobAddress}` : null,
    '',
    completionIntro(opts.companyName),
    '',
  ]
    .filter(Boolean)
    .join('\n');

  const body = completionSections(opts)
    .map((s) => `${s.heading.toUpperCase()}\n${s.body}`)
    .join('\n\n');

  return `${header}${body}\n`;
}
