/**
 * Who actually receives a job ticket on dispatch.
 *
 * The founder's question — "If I assign 2 operators… even though I make one a
 * lead, does the other operator still get the ticket?" — is this function.
 * Before Aug 2026 dispatch only ever notified job_orders.assigned_to and
 * job_orders.helper_assigned_to, so anyone in job_crew (the "+ add a person"
 * path) silently received nothing.
 */
import { resolveDispatchRecipients } from './dispatch-recipients';

const LEAD = 'user-lead';
const HELPER_SLOT = 'user-helper-slot';
const CREW_OP = 'user-crew-operator';
const CREW_HELPER = 'user-crew-helper';

describe('resolveDispatchRecipients', () => {
  it('notifies the lead operator', () => {
    expect(resolveDispatchRecipients({ assigned_to: LEAD }, [])).toEqual([
      { userId: LEAD, role: 'operator' },
    ]);
  });

  it('notifies the helper slot as a helper', () => {
    expect(
      resolveDispatchRecipients({ assigned_to: LEAD, helper_assigned_to: HELPER_SLOT }, []),
    ).toEqual([
      { userId: LEAD, role: 'operator' },
      { userId: HELPER_SLOT, role: 'helper' },
    ]);
  });

  // The regression this whole change exists for.
  it('notifies a SECOND operator added via job_crew (not just the lead)', () => {
    const out = resolveDispatchRecipients({ assigned_to: LEAD }, [
      { user_id: CREW_OP, role: 'operator' },
    ]);
    expect(out).toEqual([
      { userId: LEAD, role: 'operator' },
      { userId: CREW_OP, role: 'operator' },
    ]);
  });

  it('notifies a helper added via job_crew', () => {
    const out = resolveDispatchRecipients({ assigned_to: LEAD }, [
      { user_id: CREW_HELPER, role: 'helper' },
    ]);
    expect(out).toContainEqual({ userId: CREW_HELPER, role: 'helper' });
  });

  it('covers a full 4-person crew exactly once each', () => {
    const out = resolveDispatchRecipients(
      { assigned_to: LEAD, helper_assigned_to: HELPER_SLOT },
      [
        { user_id: CREW_OP, role: 'operator' },
        { user_id: CREW_HELPER, role: 'helper' },
      ],
    );
    expect(out).toHaveLength(4);
    expect(out.map((r) => r.userId).sort()).toEqual(
      [LEAD, HELPER_SLOT, CREW_OP, CREW_HELPER].sort(),
    );
  });

  it('does not double-notify someone who is both slotted and crewed', () => {
    const out = resolveDispatchRecipients({ assigned_to: LEAD, helper_assigned_to: HELPER_SLOT }, [
      { user_id: LEAD, role: 'operator' },
      { user_id: HELPER_SLOT, role: 'helper' },
    ]);
    expect(out).toHaveLength(2);
  });

  it('lets the SLOT role win when a slot holder is also crewed under another role', () => {
    // Lead is also (wrongly) listed as a crew helper — they must still be
    // texted as the operator, not told they are the helper.
    const out = resolveDispatchRecipients({ assigned_to: LEAD }, [
      { user_id: LEAD, role: 'helper' },
    ]);
    expect(out).toEqual([{ userId: LEAD, role: 'operator' }]);
  });

  it('treats any non-helper crew role as an operator', () => {
    const out = resolveDispatchRecipients({ assigned_to: LEAD }, [
      { user_id: CREW_OP, role: 'lead' },
    ]);
    expect(out).toContainEqual({ userId: CREW_OP, role: 'operator' });
  });

  it('de-duplicates repeated crew rows for the same person', () => {
    const out = resolveDispatchRecipients({ assigned_to: LEAD }, [
      { user_id: CREW_OP, role: 'operator' },
      { user_id: CREW_OP, role: 'helper' },
    ]);
    expect(out.filter((r) => r.userId === CREW_OP)).toHaveLength(1);
  });

  it('skips null/absent slots and tolerates no crew', () => {
    expect(resolveDispatchRecipients({ assigned_to: null, helper_assigned_to: null })).toEqual([]);
    expect(resolveDispatchRecipients({})).toEqual([]);
  });
});
