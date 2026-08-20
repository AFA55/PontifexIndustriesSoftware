/**
 * SAVING THE EDIT PANEL MUST NOT RESTATE A CREW NOBODY CHANGED.
 *
 * The panel's Save does two writes: a PATCH for the job's own fields, and — only
 * when a crew seat changed — a full crew write to /assign with scope 'remaining'.
 * That second write restates every seat the caller did not omit, across this date
 * and every remaining day of the job. So "did a seat change?" is not a cosmetic
 * question. Answer it wrongly in the true direction and an edit to a PO number
 * rewrites a day's crew.
 *
 * THE BUG (guardian, Aug 20). The lead's "before" was read off the board ROW
 * while the panel seeded its field from the JOB. The board sets a row's lead to
 * the FIRST NAMED lead among that row's jobs, so:
 *
 *   Job A → helper Axel, lead "Mike Sanchez"
 *   Job B → helper Axel, no lead named
 *   …both land on the same `helper:Axel valverde` row, which reads "Mike Sanchez".
 *
 * Open Job B, change the PO number, Save: `null !== "Mike Sanchez"` → the lead
 * "changed" → the crew write fired with `helperId` omitted → the helper for the
 * anchor date and every remaining date was rewritten from `job_orders.
 * helper_assigned_to`. Axel lost his day on Job B and his timecard stopped
 * landing on it.
 *
 * These tests hold the first half shut: every seat is compared against the source
 * the panel seeded its control from. (The second half — an omitted helper
 * resolving from the ledger rather than the job's seat — is in
 * lib/reassign-helper-preserved.test.ts. Either one alone stops the wipe; both
 * are load-bearing, because the panel is not the only caller.)
 */
import { editCrewChanges } from './helpers';

const AXEL = 'Axel Valverde';
const LEAD = 'Mike Sanchez';

describe('the second job on a helper-only crew', () => {
  it('reports NO crew change when only an unrelated field was edited', () => {
    // Job B: the row says "Mike Sanchez", the job says nobody named a lead.
    const result = editCrewChanges({
      currentOperatorName: null,
      currentHelperName: AXEL,
      // The JOB's per-day lead — what EditJobPanel put in the field, and what it
      // hands back untouched when the office edits the PO number instead.
      currentLeadName: null,
      newOperatorName: null,
      newHelperName: AXEL,
      newLeadName: null,
    });

    expect(result.leadChanged).toBe(false);
    expect(result.operatorChanged).toBe(false);
    expect(result.helperChanged).toBe(false);
    // The whole point: no crew write is sent at all, so nothing can be rewritten.
    expect(result.crewWriteNeeded).toBe(false);
  });

  it('reports NO change on the first job either, where the row and the job agree', () => {
    const result = editCrewChanges({
      currentOperatorName: null,
      currentHelperName: AXEL,
      currentLeadName: LEAD,
      newOperatorName: null,
      newHelperName: AXEL,
      newLeadName: LEAD,
    });
    expect(result.crewWriteNeeded).toBe(false);
  });
});

describe('a real crew change is still sent', () => {
  it('naming the lead for the first time is a change', () => {
    const result = editCrewChanges({
      currentOperatorName: null,
      currentHelperName: AXEL,
      currentLeadName: null,
      newOperatorName: null,
      newHelperName: AXEL,
      newLeadName: LEAD,
    });
    expect(result.leadChanged).toBe(true);
    expect(result.crewWriteNeeded).toBe(true);
  });

  it('clearing a named lead is a change', () => {
    const result = editCrewChanges({
      currentOperatorName: null,
      currentHelperName: AXEL,
      currentLeadName: LEAD,
      newOperatorName: null,
      newHelperName: AXEL,
      newLeadName: null,
    });
    expect(result.leadChanged).toBe(true);
  });

  it('swapping the helper is a change, and the lead is not dragged along', () => {
    const result = editCrewChanges({
      currentOperatorName: null,
      currentHelperName: AXEL,
      currentLeadName: LEAD,
      newOperatorName: null,
      newHelperName: 'Micah Rentz',
      newLeadName: LEAD,
    });
    expect(result.helperChanged).toBe(true);
    expect(result.leadChanged).toBe(false);
  });

  it('putting a Pontifex operator on the crew is a change', () => {
    const result = editCrewChanges({
      currentOperatorName: null,
      currentHelperName: AXEL,
      currentLeadName: LEAD,
      newOperatorName: 'Conrade Richardson (Nate)',
      newHelperName: AXEL,
      // The panel sends null for the lead the moment an operator is picked.
      newLeadName: null,
    });
    expect(result.operatorChanged).toBe(true);
    expect(result.crewWriteNeeded).toBe(true);
  });
});

describe('the shapes that are not answers', () => {
  it('a seat the panel never spoke about is never a change', () => {
    const result = editCrewChanges({
      currentOperatorName: 'Zack Estes',
      currentHelperName: AXEL,
      currentLeadName: null,
      // All three omitted — a caller that only edited job fields.
    });
    expect(result.crewWriteNeeded).toBe(false);
  });

  it('treats a re-typed name with stray whitespace as the same lead', () => {
    // The field holds raw typing; the ledger holds the trimmed form. Firing a
    // crew write over a trailing space is the same wipe with a smaller trigger.
    const result = editCrewChanges({
      currentOperatorName: null,
      currentHelperName: AXEL,
      currentLeadName: LEAD,
      newOperatorName: null,
      newHelperName: AXEL,
      newLeadName: '  Mike   Sanchez ',
    });
    expect(result.leadChanged).toBe(false);
  });

  it('treats an emptied field and a never-set lead as the same answer', () => {
    const result = editCrewChanges({
      currentOperatorName: null,
      currentHelperName: AXEL,
      currentLeadName: null,
      newOperatorName: null,
      newHelperName: AXEL,
      newLeadName: '   ',
    });
    expect(result.leadChanged).toBe(false);
  });

  it('an unassigned job with no lead anywhere stays quiet', () => {
    const result = editCrewChanges({
      currentOperatorName: null,
      currentHelperName: null,
      currentLeadName: null,
      newOperatorName: null,
      newHelperName: null,
      newLeadName: null,
    });
    expect(result.crewWriteNeeded).toBe(false);
  });
});
