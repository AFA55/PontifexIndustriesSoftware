/**
 * PRE-WORK UNDERSTANDINGS / CUSTOMER AGREEMENT — the boxed legal block that
 * sits above the work description on the printed work ticket.
 *
 * This reproduces the block on the customer's existing carbon-copy field
 * ticket. It is WHITE-LABEL: the company name is interpolated from the tenant's
 * branding (never hardcoded to one tenant).
 *
 * ⚠️ BILLING TERMS ARE NOT RE-AUTHORED HERE.
 * The same customer can end up holding two signed documents from us (this
 * ticket and the standby release in `lib/legal/standby-policy.ts`), so every
 * number and unit that appears on both MUST come from one place:
 *   - rate           → `standby_policies.hourly_rate`, falling back to
 *                      STANDBY_HOURLY_RATE (what /api/standby actually bills)
 *   - minimum charge → `standby_policies.minimum_charge_hours`, falling back
 *                      to STANDBY_MINIMUM_HOURS (what calculateStandbyCharge
 *                      actually applies)
 *   - unit           → PER HOUR. `calculateStandbyCharge` is `hours × rate`
 *                      with NO headcount multiplier, and the release the
 *                      customer signs says "per hour" — so this sheet must
 *                      never say "per man hour" (that would state DOUBLE the
 *                      billed amount on a 2-man crew).
 * There is deliberately no rate or price literal anywhere in this file.
 *
 * Pure strings — no React, no DB. Rendered by
 * app/dashboard/admin/jobs/[id]/work-ticket/page.tsx.
 */

import { STANDBY_HOURLY_RATE, STANDBY_MINIMUM_HOURS } from './standby-policy';

export interface PreWorkUnderstandingsOptions {
  /** Tenant company name, e.g. from branding.company_name. */
  companyName: string;
  /** $/hour from the tenant's active standby policy. Falls back to the billed rate. */
  standbyRate?: number | null;
  /** Minimum billable standby hours. Falls back to the applied minimum. */
  standbyMinimumHours?: number | null;
}

/** `$189` / `$60.50` — no trailing `.00`, so the printed sheet reads like the paper one. */
function money(n: number): string {
  return `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
}

const positive = (v: unknown, fallback: number): number =>
  v != null && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback;

/**
 * The agreement clauses, in the order they appear on the paper form.
 * Returned as separate paragraphs so the print layout can space them.
 */
export function preWorkUnderstandings({
  companyName,
  standbyRate,
  standbyMinimumHours,
}: PreWorkUnderstandingsOptions): string[] {
  const co = (companyName || 'The Company').trim();
  const rate = positive(standbyRate, STANDBY_HOURLY_RATE);
  const minHours = positive(standbyMinimumHours, STANDBY_MINIMUM_HOURS);
  const minText = `${minHours} hour${minHours === 1 ? '' : 's'} minimum`;

  return [
    `Standby time — any time our crew and equipment are on site, ready to work, but unable to proceed for reasons outside our control — is billed at ${money(rate)} per hour (${minText}). All standby time is listed on this ticket and initialed by the customer's representative.`,
    `The customer is responsible for locating and marking all conduit, post-tension cable, rebar, plumbing, electrical and other embedded or buried utilities prior to the start of work. ${co} is not responsible for damage to items that were not identified and marked before work began.`,
    `The customer agrees to indemnify and hold ${co} harmless from any claim, damage or loss arising out of undisclosed or unmarked embedded items, unsafe site conditions, or work performed at the customer's direction.`,
    `${co.toUpperCase()} SHALL NOT BE RESPONSIBLE FOR LAYOUT OR ENGINEERING. All cut locations, dimensions and structural clearances are provided and verified by the customer.`,
    `Signature below acknowledges the customer has read and accepted these understandings prior to the start of work.`,
  ];
}

/**
 * The numbered field checklist, VERBATIM from the paper ticket. The crew fills
 * these in by hand — the print surface renders them as blank ruled lines /
 * circle-one Yes / No, exactly as on the carbon form.
 */
export interface TicketChecklistItem {
  n: number;
  text: string;
  /** 'yesno' → circle-one Yes / No · 'blank' → ruled write-in line · 'none' → instruction only. */
  answer: 'yesno' | 'blank' | 'none';
}

export interface TicketChecklistOptions {
  /**
   * $/barrel for slurry disposal. The platform has NO tenant-level slurry price
   * today, so this is normally undefined and the price is left OFF the printed
   * line — the crew records the barrel count (item 10) and the office prices it.
   * Printing one tenant's rate on another tenant's signed sheet would be the
   * same class of bug as a hardcoded standby rate.
   */
  slurryBarrelPrice?: number | null;
}

export function ticketChecklist({
  slurryBarrelPrice,
}: TicketChecklistOptions = {}): TicketChecklistItem[] {
  const price =
    slurryBarrelPrice != null &&
    Number.isFinite(Number(slurryBarrelPrice)) &&
    Number(slurryBarrelPrice) > 0
      ? Number(slurryBarrelPrice)
      : null;
  const slurry = price
    ? `Did you remove slurry & from site?  Yes ${money(price)} per barrel / No`
    : 'Did you remove slurry & from site?  Yes / No';

  return [
    { n: 1, text: 'Have contractor sign understandings prior to working and sign when complete.', answer: 'none' },
    { n: 2, text: 'List all standby time with contractors initials.', answer: 'blank' },
    { n: 3, text: 'Did you have temp/labor?', answer: 'yesno' },
    { n: 4, text: 'If yes, list all days/dates', answer: 'blank' },
    { n: 5, text: 'Remove concrete?', answer: 'yesno' },
    { n: 6, text: 'Disposal - how many loads?', answer: 'blank' },
    { n: 7, text: 'Removal list lengths & widths on ticket', answer: 'blank' },
    { n: 8, text: 'List total footage cut (include cross cuts)', answer: 'blank' },
    // The Yes/No is inside the verbatim text on this one — don't append a second pair.
    { n: 9, text: slurry, answer: 'none' },
    { n: 10, text: 'If yes, how many barrels?', answer: 'blank' },
  ];
}

/** The three-copy carbon footer line printed at the bottom of every ticket. */
export const TICKET_COPY_FOOTER =
  'WHITE - ORIGINAL/PAYROLL COPY     YELLOW - INVOICE/RECORDS COPY     PINK - CUSTOMER COPY';
